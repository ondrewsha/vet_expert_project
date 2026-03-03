from datetime import datetime, timedelta, date, time
from typing import List, Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from src.services.telegram_service import send_telegram_message
from src.database import get_db, redis_client
from src.models import User, Appointment, DoctorProfile
from src.schemas.schemas import AppointmentCreate, AppointmentResponse, DoctorResponse
from src.core.security import get_current_user
from src.services.yookassa_service import create_payment_url
from src.services.yandex_calendar_service import get_busy_slots_yandex, delete_yandex_event, create_yandex_event
from src.config import settings

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])

WORK_START_HOUR = 10
WORK_END_HOUR = 18
CONSULTATION_DURATION_MINUTES = 60

class RatingUpdate(BaseModel):
    rating: int

class BlockSlotRequest(BaseModel):
    start_time: datetime
    duration_minutes: int = 60

@router.get("/doctors", response_model=List[DoctorResponse])
async def get_doctors(db: AsyncSession = Depends(get_db)):
    """Получить список всех врачей для отображения на странице записи"""
    result = await db.execute(
        select(User).options(selectinload(User.doctor_profile)).where(User.role.in_(["doctor", "superadmin"]))
    )
    return result.scalars().all()

@router.get("/available")
async def get_available_slots(target_date: date, doctor_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    all_slots =[]
    moscow_tz = ZoneInfo("Europe/Moscow")
    current_time = datetime.combine(target_date, time(WORK_START_HOUR, 0))
    end_time = datetime.combine(target_date, time(WORK_END_HOUR, 0))
    now = datetime.now(moscow_tz).replace(tzinfo=None) 
    
    while current_time < end_time:
        if target_date == now.date() and current_time <= now + timedelta(minutes=15):
            current_time += timedelta(minutes=CONSULTATION_DURATION_MINUTES)
            continue
        all_slots.append(current_time)
        current_time += timedelta(minutes=CONSULTATION_DURATION_MINUTES)
        
    start_of_day = datetime.combine(target_date, time.min).replace(tzinfo=moscow_tz)
    end_of_day = datetime.combine(target_date, time.max).replace(tzinfo=moscow_tz)

    # 1. Получаем список врачей (одного или всех)
    query = select(User).options(selectinload(User.doctor_profile)).where(User.role.in_(["doctor", "superadmin"]))
    if doctor_id:
        query = query.where(User.id == doctor_id)
    result = await db.execute(query)
    doctors = result.scalars().all()

    if not doctors:
        return {"date": target_date, "available_slots":[]}

    # 2. Собираем занятые слоты для каждого врача
    doctors_busy_data = {}
    for doc in doctors:
        # БД
        db_res = await db.execute(
            select(Appointment.start_time).where(
                and_(
                    Appointment.doctor_id == doc.id,
                    Appointment.start_time >= start_of_day,
                    Appointment.start_time <= end_of_day,
                    Appointment.status.in_(["scheduled", "completed"])
                )
            )
        )
        db_slots = [row[0].astimezone(moscow_tz).replace(tzinfo=None) if row[0].tzinfo else row[0].replace(tzinfo=None) for row in db_res.all()]
        
        # Яндекс
        yandex_slots =[]
        if doc.doctor_profile and doc.doctor_profile.yandex_email:
            yandex_slots = get_busy_slots_yandex(
                start_of_day, end_of_day, 
                doc.doctor_profile.yandex_email, doc.doctor_profile.yandex_password
            )
        
        doctors_busy_data[doc.id] = {"db": db_slots, "yandex": yandex_slots}

    # 3. Проверяем слоты. Слот доступен, если ХОТЯ БЫ ОДИН запрошенный врач свободен
    available_slots =[]
    for slot in all_slots:
        slot_end = slot + timedelta(minutes=60)
        is_slot_available = False

        for doc in doctors:
            doc_data = doctors_busy_data[doc.id]
            is_busy = False
            
            if slot in doc_data["db"]:
                is_busy = True
            else:
                for b_start, b_end in doc_data["yandex"]:
                    if not (slot_end <= b_start or slot >= b_end):
                        is_busy = True
                        break
            
            # Проверяем Redis (вдруг кто-то прямо сейчас оплачивает этого врача)
            if not is_busy:
                is_locked = await redis_client.get(f"slot_lock:{doc.id}:{slot.isoformat()}")
                if is_locked:
                    is_busy = True

            if not is_busy:
                is_slot_available = True
                break # Нашли свободного врача для этого слота!
                
        if is_slot_available:
            available_slots.append(slot)

    return {"date": target_date, "available_slots": available_slots}

@router.post("/book")
async def book_appointment(appt_in: AppointmentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    slot_time = appt_in.start_time.replace(tzinfo=None)
    moscow_tz = ZoneInfo("Europe/Moscow")
    
    # Ищем всех подходящих врачей
    query = select(User).options(selectinload(User.doctor_profile)).where(User.role.in_(["doctor", "superadmin"]))
    if appt_in.doctor_id:
        query = query.where(User.id == appt_in.doctor_id)
    result = await db.execute(query)
    doctors = result.scalars().all()

    if not doctors:
        raise HTTPException(status_code=400, detail="Врачи не найдены")

    # Ищем ПЕРВОГО СВОБОДНОГО врача на этот слот
    assigned_doctor = None
    for doc in doctors:
        is_locked = await redis_client.get(f"slot_lock:{doc.id}:{slot_time.isoformat()}")
        if is_locked: continue
        
        # Легкая проверка БД, чтобы точно не наложилось
        overlap = await db.execute(
            select(Appointment).where(
                Appointment.doctor_id == doc.id,
                Appointment.start_time == slot_time.replace(tzinfo=moscow_tz),
                Appointment.status.in_(["scheduled", "completed"])
            )
        )
        if overlap.scalars().first(): continue
        
        assigned_doctor = doc
        break

    if not assigned_doctor:
        raise HTTPException(status_code=409, detail="К сожалению, это время только что заняли. Выберите другое.")

    # Лочим слот конкретного врача
    redis_key = f"slot_lock:{assigned_doctor.id}:{slot_time.isoformat()}"
    lock_data = f"{current_user.id}|{appt_in.pet_info or ''}"
    await redis_client.set(redis_key, lock_data, ex=900)

    # Достаем Телемост врача (или дефолтный)
    meet_link = assigned_doctor.doctor_profile.telemost_link if assigned_doctor.doctor_profile and assigned_doctor.doctor_profile.telemost_link else settings.YANDEX_TELEMOST_LINK

    # --- ЗАПИСЬ С БАЛАНСА ---
    if current_user.unused_consultations > 0:
        current_user.unused_consultations -= 1
        start_time_tz = slot_time.replace(tzinfo=moscow_tz)
        
        new_appt = Appointment(
            user_id=current_user.id,
            doctor_id=assigned_doctor.id,
            start_time=start_time_tz,
            end_time=start_time_tz + timedelta(minutes=60),
            status="scheduled",
            pet_info=appt_in.pet_info,
            meet_link=meet_link
        )
        db.add(new_appt)
        await db.commit()

        yandex_url = None
        doc_prof = assigned_doctor.doctor_profile
        
        if doc_prof and doc_prof.yandex_email and doc_prof.yandex_password:
            user_name = current_user.full_name or "Без имени"
            user_phone = current_user.phone or ""
            
            yandex_url = create_yandex_event(
                start_time=start_time_tz,
                summary=f"🩺 Пациент: {appt_in.pet_info}",
                description=f"Оплата с баланса.\nКлиент: {user_name}\nТелефон: {user_phone}",
                email=doc_prof.yandex_email,
                password=doc_prof.yandex_password
            )
            
            # Если событие создалось, сохраняем ссылку в БД
            if yandex_url:
                await db.execute(
                    update(Appointment)
                    .where(Appointment.id == new_appt.id)
                    .values(google_event_id=yandex_url)
                )
                await db.commit()
                
        await redis_client.delete(redis_key)
        
        # --- УВЕДОМЛЕНИЯ ПРИ ОПЛАТЕ С БАЛАНСА ---
        time_str = start_time_tz.strftime('%d.%m.%Y %H:%M')
        
        # 1. Суперадмину
        await send_telegram_message(settings.TG_SUPER_ADMIN_CHAT_ID, f"💰 <b>Запись с баланса!</b>\n📅 {time_str}\nВрач: {assigned_doctor.full_name}\n🐶 {appt_in.pet_info}")
        
        # 2. Врачу
        if assigned_doctor.telegram_id:
            await send_telegram_message(assigned_doctor.telegram_id, f"🩺 <b>Новая запись!</b>\n📅 {time_str}\n🐶 {appt_in.pet_info}")
        
        # 3. Клиенту
        if current_user.telegram_id:
            await send_telegram_message(current_user.telegram_id, f"✅ <b>Запись подтверждена!</b>\n📅 {time_str}\nВрач: {assigned_doctor.full_name or 'Специалист'}\n🔗 <a href='{meet_link}'>Ссылка на звонок</a>")

        return {"message": "Оплачено с баланса", "payment_url": None, "slot": slot_time}

    # --- ЗАПИСЬ ЧЕРЕЗ ЮКАССУ ---
    metadata = {
        "type": "appointment",
        "user_id": str(current_user.id),
        "doctor_id": str(assigned_doctor.id), # <--- Точно знаем, к кому
        "start_time": slot_time.isoformat(),
        "pet_info": appt_in.pet_info or "Не указано"
    }
    
    payment_url = await create_payment_url(
        amount=2000.00,
        description=f"Консультация: {assigned_doctor.full_name or 'Врач'} ({slot_time.strftime('%d.%m.%Y %H:%M')})",
        metadata=metadata,
        return_url="https://твой-сайт.ru/profile"
    )
    return {"message": "Забронировано", "payment_url": payment_url, "slot": slot_time}

@router.get("/me", response_model=List[AppointmentResponse])
async def get_my_appointments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.doctor))
        .where(Appointment.user_id == current_user.id)
        .order_by(Appointment.start_time.desc())
    )
    appts = result.scalars().all()
    
    moscow_tz = ZoneInfo("Europe/Moscow")
    now = datetime.now(moscow_tz)
    changed = False
    
    # АВТОМАТИЧЕСКИ ПЕРЕНОСИМ В ИСТОРИЮ ЧЕРЕЗ 30 МИН ПОСЛЕ НАЧАЛА
    for appt in appts:
        appt_time = appt.start_time if appt.start_time.tzinfo else appt.start_time.replace(tzinfo=moscow_tz)
        if appt.status == "scheduled" and now >= appt_time + timedelta(minutes=30):
            appt.status = "completed"
            changed = True
            
    if changed:
        await db.commit()
        
    return appts

@router.patch("/{appt_id}/refresh-link", response_model=AppointmentResponse)
async def refresh_appointment_link(appt_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Подгружаем врача и его профиль
    appt_query = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.doctor).selectinload(User.doctor_profile))
        .where(Appointment.id == appt_id)
    )
    appt = appt_query.scalars().first()

    if not appt or appt.user_id != current_user.id:
        raise HTTPException(status_code=404)
        
    # Берем ссылку ИЗ ПРОФИЛЯ ВРАЧА
    doc_profile = appt.doctor.doctor_profile
    new_link = doc_profile.telemost_link if doc_profile and doc_profile.telemost_link else settings.YANDEX_TELEMOST_LINK
    
    appt.meet_link = new_link
    await db.commit()
        
    return appt

@router.patch("/{appt_id}/rating")
async def rate_appointment(appt_id: int, payload: RatingUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сохранение оценки приема"""
    appt = await db.get(Appointment, appt_id)
    if not appt or appt.user_id != current_user.id:
        raise HTTPException(status_code=404)
        
    appt.rating = payload.rating
    await db.commit()
    return {"status": "ok"}

@router.post("/{appt_id}/cancel")
async def cancel_appointment(appt_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Подгружаем врача с профилем (нужны креды Яндекса)
    appt_query = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.doctor).selectinload(User.doctor_profile))
        .where(Appointment.id == appt_id)
    )
    appt = appt_query.scalars().first()

    if not appt or appt.user_id != current_user.id:
        raise HTTPException(status_code=404)
        
    if appt.status != "scheduled":
        raise HTTPException(status_code=400, detail="Можно отменить только активную запись")
        
    # 1. Отменяем в БД
    appt.status = "canceled"
    
    # 2. Удаляем из Яндекса (если есть ссылка и креды)
    if appt.google_event_id and appt.doctor.doctor_profile:
        prof = appt.doctor.doctor_profile
        if prof.yandex_email and prof.yandex_password:
            delete_yandex_event(appt.google_event_id, prof.yandex_email, prof.yandex_password)

    # 3. Возврат средств
    current_user.unused_consultations += 1
    await db.commit()
    
    # 4. Уведомление
    moscow_tz = ZoneInfo("Europe/Moscow")
    dt = appt.start_time.astimezone(moscow_tz) if appt.start_time.tzinfo else appt.start_time
    msg = f"⚠️ <b>Отмена записи!</b>\nКлиент отменил запись на {dt.strftime('%d.%m %H:%M')}.\nВрач: {appt.doctor.full_name}"
    await send_telegram_message(settings.TG_SUPER_ADMIN_CHAT_ID, msg)
    
    return {"status": "ok", "message": "Запись отменена, средства вернулись на баланс."}

@router.post("/block-slot")
async def block_slot(
    req: BlockSlotRequest, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    """Врач блокирует слот (создает техническую запись)"""
    if current_user.role not in["doctor", "superadmin"]:
        raise HTTPException(status_code=403, detail="Только для врачей")

    moscow_tz = ZoneInfo("Europe/Moscow")
    start_time_tz = req.start_time.replace(tzinfo=None).replace(tzinfo=moscow_tz)
    end_time = start_time_tz + timedelta(minutes=req.duration_minutes)

    # 1. Создаем запись
    new_appt = Appointment(
        user_id=current_user.id, 
        doctor_id=current_user.id,
        start_time=start_time_tz,
        end_time=end_time,
        status="completed", 
        pet_info="🔒 ТЕХНИЧЕСКИЙ ПЕРЕРЫВ (Заблокировано врачом)",
        meet_link=None
    )
    db.add(new_appt)
    await db.commit()

    # 2. ИСПРАВЛЕНИЕ: Явно достаем профиль врача из БД асинхронно
    prof_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == current_user.id))
    doc_prof = prof_res.scalars().first()

    # 3. Отправляем в Яндекс, если есть профиль и креды
    if doc_prof and doc_prof.yandex_email:
        # У нас уже импортирована create_yandex_event
        from src.services.yandex_calendar_service import create_yandex_event
        yandex_url = create_yandex_event(
            start_time=start_time_tz,
            summary="⛔ НЕ ЗАПИСЫВАТЬ (Блок)",
            description="Слот заблокирован через сайт ВетЭксперт",
            email=doc_prof.yandex_email,
            password=doc_prof.yandex_password
        )
        
        # Если у нас есть функция удаления (и мы сохраняем URL), то сохраним URL
        if yandex_url:
            from sqlalchemy import update
            await db.execute(
                update(Appointment)
                .where(Appointment.id == new_appt.id)
                .values(google_event_id=yandex_url)
            )
            await db.commit()

    return {"status": "ok", "message": "Время заблокировано"}
