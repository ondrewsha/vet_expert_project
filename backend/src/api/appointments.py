from datetime import datetime, timedelta, date, time
from typing import List, Optional
from zoneinfo import ZoneInfo
from urllib.parse import quote
from bson import ObjectId

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update, delete, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from src.services.telegram_service import send_telegram_message
from src.database import get_db, redis_client, fs
from src.models import User, Appointment, DoctorProfile, AppointmentFile
from src.schemas.schemas import AppointmentResponse, DoctorResponse
from src.core.security import get_current_user
from src.services.yookassa_service import create_payment_url
from src.services.yandex_calendar_service import get_busy_slots_yandex, delete_yandex_event, create_yandex_event
from src.services.pdf_service import generate_protocol_pdf
from src.config import settings

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])

WORK_START_HOUR = 10
WORK_END_HOUR = 18
CONSULTATION_DURATION_MINUTES = 30

class RatingUpdate(BaseModel):
    rating: int

class ManageBlocksRequest(BaseModel):
    date: str
    to_block: List[str]
    to_unblock: List[str]

class DoctorDayScheduleResponse(BaseModel):
    time: str
    state: str 
    appt_id: Optional[int] = None

class ProtocolRequest(BaseModel):
    diagnosis: str
    recommendations: str


# --- 1. ЭНДПОИНТЫ ДЛЯ ВРАЧЕЙ И РАСПИСАНИЯ ---

@router.get("/doctors", response_model=List[DoctorResponse])
async def get_doctors(target_date: date, db: AsyncSession = Depends(get_db)):
    """Получить список врачей, работающих в этот день"""
    day_index = str(target_date.weekday()) 

    result = await db.execute(
        select(User)
        .options(selectinload(User.doctor_profile))
        .where(User.role.in_(["doctor", "superadmin"]))
    )
    all_doctors = result.scalars().all()
    
    # Фильтруем: оставляем только тех, у кого day_index есть в work_days, и кто is_active
    working_doctors = []
    for doc in all_doctors:
        prof = doc.doctor_profile
        # Если профиля нет или is_active False - пропускаем
        if not prof or not prof.is_active: 
            continue
            
        # Проверяем рабочие дни ("0,1,2,3,4,5,6")
        if prof.work_days and day_index in prof.work_days.split(','):
            rating_res = await db.execute(
                select(func.avg(Appointment.rating))
                .where(Appointment.doctor_id == doc.id)
                .where(Appointment.rating.isnot(None))
            )
            doc.average_rating = rating_res.scalar()
            working_doctors.append(doc)
            
    return working_doctors

@router.get("/available")
async def get_available_slots(target_date: date, doctor_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    all_slots = []
    moscow_tz = ZoneInfo("Europe/Moscow")
    current_time = datetime.combine(target_date, time(WORK_START_HOUR, 0))
    end_time = datetime.combine(target_date, time(WORK_END_HOUR, 0))
    now = datetime.now(moscow_tz).replace(tzinfo=None) 
    
    while current_time < end_time:
        if target_date == now.date() and current_time <= now + timedelta(minutes=10):
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
        return {"date": target_date, "available_slots": []}

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
                    Appointment.status.in_(["scheduled", "completed", "blocked"])
                )
            )
        )
        db_slots = [row[0].astimezone(moscow_tz).replace(tzinfo=None) if row[0].tzinfo else row[0].replace(tzinfo=None) for row in db_res.all()]
        
        # Яндекс
        yandex_slots = []
        if doc.doctor_profile and doc.doctor_profile.yandex_email:
            yandex_slots = get_busy_slots_yandex(
                start_of_day, end_of_day, 
                doc.doctor_profile.yandex_email, doc.doctor_profile.yandex_password
            )
        
        doctors_busy_data[doc.id] = {"db": db_slots, "yandex": yandex_slots}

    # 3. Проверяем слоты. Слот доступен, если ХОТЯ БЫ ОДИН запрошенный врач свободен
    available_slots = []
    for slot in all_slots:
        slot_end = slot + timedelta(minutes=CONSULTATION_DURATION_MINUTES)
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
                break
                
        if is_slot_available:
            available_slots.append(slot)

    return {"date": target_date, "available_slots": available_slots}

# --- 2. РАБОТА С ФАЙЛАМИ ---

@router.get("/files/{file_id}")
async def get_appointment_file(file_id: str, db: AsyncSession = Depends(get_db)):
    """Скачивание файлов (анализов и протоколов)"""
    try:
        # Открываем поток GridFS
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        
        # Получаем имя и тип файла из метаданных Mongo
        filename = grid_out.filename or "file"
        content_type = grid_out.metadata.get("content_type") if grid_out.metadata else None
        
        # Если тип не определен, ставим дефолтный
        if not content_type:
             content_type = "application/octet-stream"

        # Кодируем имя файла для заголовка (чтобы кириллица не ломалась)
        encoded_filename = quote(filename)

        return StreamingResponse(
            grid_out, 
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}"
            }
        )
    except Exception as e:
        print(f"Error downloading file: {e}")
        raise HTTPException(status_code=404, detail="Файл не найден")

@router.post("/{appt_id}/protocol")
async def upload_protocol(
    appt_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Загрузка заключения врачом"""
    appt = await db.get(Appointment, appt_id)
    if not appt: raise HTTPException(404)
    
    if current_user.role != "superadmin" and appt.doctor_id != current_user.id:
        raise HTTPException(403)
        
    file_id = await fs.upload_from_stream(
        filename=file.filename, source=file.file, metadata={"content_type": file.content_type}
    )
    
    appt.protocol_file_id = str(file_id)
    appt.status = "completed"
    await db.commit()
    
    # Уведомляем клиента
    user_query = await db.execute(select(User).where(User.id == appt.user_id))
    user = user_query.scalars().first()
    if user and user.telegram_id:
        await send_telegram_message(user.telegram_id, "📄 <b>Врач прикрепил заключение!</b>\nПосмотреть его можно в личном кабинете.")
            
    return {"status": "ok"}


# --- 3. БРОНИРОВАНИЕ (С ФАЙЛАМИ И БАЛАНСОМ) ---

@router.post("/book")
async def book_appointment(
    start_time: str = Form(...),
    pet_info: str = Form(""),
    pet_name: str = Form(""),
    pet_details: str = Form(""),
    doctor_id: int = Form(...),
    files: List[UploadFile] = File(None),
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    # 1. Парсим время и таймзону
    moscow_tz = ZoneInfo("Europe/Moscow")
    try:
        start_dt = datetime.fromisoformat(start_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат времени")
    
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=moscow_tz)
    
    slot_time = start_dt.replace(tzinfo=None) # Для Redis
    
    # 2. Проверяем блокировку Redis
    redis_key = f"slot_lock:{doctor_id}:{slot_time.isoformat()}"
    if await redis_client.get(redis_key):
        raise HTTPException(status_code=409, detail="Слот занят.")
    
    # Лочим слот
    lock_data = f"{current_user.id}|{pet_info}"
    await redis_client.set(redis_key, lock_data, ex=900)

    # 3. Ищем врача
    doctor = await db.get(User, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Врач не найден")
    
    prof_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == doctor_id))
    doc_prof = prof_res.scalars().first()
    meet_link = doc_prof.telemost_link if doc_prof and doc_prof.telemost_link else settings.YANDEX_TELEMOST_LINK

    # 4. ЗАГРУЖАЕМ ФАЙЛЫ В MONGO
    uploaded_file_ids = []
    if files:
        for file in files:
            file_id = await fs.upload_from_stream(
                filename=file.filename, 
                source=file.file, 
                metadata={"content_type": file.content_type}
            )
            uploaded_file_ids.append({"id": str(file_id), "name": file.filename})

    # --- ВАРИАНТ А: ОПЛАТА БАЛЛАМИ ---
    if current_user.unused_consultations > 0:
        current_user.unused_consultations -= 1
        
        # Создаем запись
        new_appt = Appointment(
            user_id=current_user.id,
            doctor_id=doctor_id,
            start_time=start_dt,
            end_time=start_dt + timedelta(minutes=30),
            status="scheduled",
            pet_info=pet_info,
            pet_name=pet_name,
            pet_details=pet_details,
            meet_link=meet_link
        )
        db.add(new_appt)
        await db.commit()
        
        # Привязываем файлы
        for f_data in uploaded_file_ids:
            af = AppointmentFile(
                appointment_id=new_appt.id, 
                mongo_file_id=f_data["id"], 
                filename=f_data["name"]
            )
            db.add(af)
        
        # Яндекс Календарь
        if doc_prof and doc_prof.yandex_email and doc_prof.yandex_password:
            files_desc = f"\nФайлов прикреплено: {len(uploaded_file_ids)}" if uploaded_file_ids else ""
            yandex_url = create_yandex_event(
                start_time=start_dt,
                summary=f"🩺 Пациент: {pet_name}, {pet_details}",
                description=f"Оплата балансом.\nКлиент: {current_user.full_name}\nТелефон: {current_user.phone}{files_desc}",
                email=doc_prof.yandex_email,
                password=doc_prof.yandex_password
            )
            if yandex_url:
                await db.execute(update(Appointment).where(Appointment.id == new_appt.id).values(google_event_id=yandex_url))
        
        await db.commit()
        await redis_client.delete(redis_key)
        
        # Уведомления
        files_msg = "\n".join([f"📎 {f['name']}" for f in uploaded_file_ids])
        time_str = start_dt.strftime('%d.%m.%Y %H:%M')
        
        # Суперадмину
        await send_telegram_message(settings.TG_SUPER_ADMIN_CHAT_ID, f"💰 <b>Запись с баланса!</b>\n📅 {time_str}\nВрач: {doctor.full_name}\n🐶 {pet_name}, {pet_details}")

        # Врачу
        if doctor.telegram_id:
            await send_telegram_message(doctor.telegram_id, f"🩺 <b>Новая запись (баланс)!</b>\n📅 {time_str}\n🐶 {pet_name}, {pet_details}\n🔗 {meet_link}\n{files_msg}")
        
        # 3. Клиенту
        if current_user.telegram_id:
            await send_telegram_message(current_user.telegram_id, f"✅ <b>Запись подтверждена!</b>\n📅 {time_str}\nВрач: {doctor.full_name or 'Специалист'}\n🔗 <a href='{meet_link}'>Ссылка на звонок</a>")

        return {"message": "Оплачено с баланса", "payment_url": None, "slot": slot_time}

    # --- ВАРИАНТ Б: ЮКАССА ---
    # Передаем файлы в метаданных (ID|NAME,ID|NAME)
    files_meta_str = ",".join([f"{f['id']}|{f['name']}" for f in uploaded_file_ids])

    metadata = {
        "type": "appointment",
        "user_id": str(current_user.id),
        "doctor_id": str(doctor_id),
        "start_time": slot_time.isoformat(),
        "pet_info": pet_info[:200],
        "pet_name": pet_name[:50],
        "pet_details": pet_details[:50],
        "files_data": files_meta_str[:450] # Лимит юкассы 500
    }
    
    payment_url = await create_payment_url(
        amount=2000.00,
        description=f"Консультация: {doctor.full_name}",
        metadata=metadata,
        return_url="https://твой-сайт.ru/profile"
    )
    
    return {"message": "Забронировано", "payment_url": payment_url, "slot": slot_time}


# --- 4. УПРАВЛЕНИЕ ЗАПИСЯМИ ---

@router.get("/me", response_model=List[AppointmentResponse])
async def get_my_appointments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Если юзер - врач, он должен видеть записи, где он DOCTOR_ID
    if current_user.role == "doctor":
        query = select(Appointment).where(Appointment.doctor_id == current_user.id)
    else:
        # Обычный юзер видит свои записи
        query = select(Appointment).where(Appointment.user_id == current_user.id)
    
    # Подгружаем доктора и файлы
    query = query.options(selectinload(Appointment.doctor), selectinload(Appointment.files))
    query = query.order_by(Appointment.start_time.desc())
    
    result = await db.execute(query)
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
    query = select(Appointment).options(selectinload(Appointment.doctor).selectinload(User.doctor_profile)).where(Appointment.id == appt_id)
    res = await db.execute(query)
    appt = res.scalars().first()

    if not appt or (appt.user_id != current_user.id and appt.doctor_id != current_user.id):
        raise HTTPException(status_code=404)
        
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
    query = select(Appointment).options(selectinload(Appointment.doctor).selectinload(User.doctor_profile)).where(Appointment.id == appt_id)
    res = await db.execute(query)
    appt = res.scalars().first()

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
    # ПРАВИЛО 4 ЧАСОВ
    moscow_tz = ZoneInfo("Europe/Moscow")
    now = datetime.now(moscow_tz)
    
    # Приводим время встречи к МСК
    appt_start = appt.start_time.astimezone(moscow_tz) if appt.start_time.tzinfo else appt.start_time.replace(tzinfo=moscow_tz)
    
    time_diff = appt_start - now
    # Если до приема больше 4 часов - возвращаем баланс
    is_refunded = False
    if time_diff.total_seconds() >= 4 * 3600:
        current_user.unused_consultations += 1
        is_refunded = True
    
    await db.commit()
    
    # 4. Уведомление
    refund_text = "Средства возвращены на баланс." if is_refunded else "Поздняя отмена (менее 4ч), средства не возвращены."
    msg = f"⚠️ <b>Отмена записи!</b>\nКлиент отменил запись на {appt_start.strftime('%d.%m %H:%M')}.\n{refund_text}\nВрач: {appt.doctor.full_name}"
    await send_telegram_message(settings.TG_SUPER_ADMIN_CHAT_ID, msg)
    
    return {"status": "ok", "message": f"Запись отменена. {refund_text}"}


# --- 5. УПРАВЛЕНИЕ РАСПИСАНИЕМ (ДЛЯ ВРАЧА) ---

@router.get("/doctor/schedule", response_model=List[DoctorDayScheduleResponse])
async def get_doctor_schedule(target_date: date, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Отдает врачу картину его дня для управления слотами"""
    if current_user.role not in ["doctor", "superadmin"]:
        raise HTTPException(status_code=403)
        
    res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == current_user.id))
    doc_prof = res.scalars().first()
    
    start_h = WORK_START_HOUR
    end_h = WORK_END_HOUR
    duration = CONSULTATION_DURATION_MINUTES

    moscow_tz = ZoneInfo("Europe/Moscow")
    start_of_day = datetime.combine(target_date, time.min).replace(tzinfo=moscow_tz)
    end_of_day = datetime.combine(target_date, time.max).replace(tzinfo=moscow_tz)
    
    current_time = datetime.combine(target_date, time(start_h, 0))
    end_time = datetime.combine(target_date, time(end_h, 0))
    all_slots = []
    while current_time < end_time:
        all_slots.append(current_time)
        current_time += timedelta(minutes=duration)

    # Достаем записи из БД
    db_res = await db.execute(
        select(Appointment).where(
            and_(
                Appointment.doctor_id == current_user.id,
                Appointment.start_time >= start_of_day,
                Appointment.start_time <= end_of_day,
                Appointment.status.in_(["scheduled", "completed", "blocked"])
            )
        )
    )
    appointments = db_res.scalars().all()

    yandex_slots = []
    if doc_prof and doc_prof.yandex_email:
        yandex_slots = get_busy_slots_yandex(start_of_day, end_of_day, doc_prof.yandex_email, doc_prof.yandex_password)

    schedule = []
    for slot in all_slots:
        slot_end = slot + timedelta(minutes=duration)
        state = "free"
        appt_id = None
        
        for appt in appointments:
            appt_start = appt.start_time.astimezone(moscow_tz).replace(tzinfo=None) if appt.start_time.tzinfo else appt.start_time.replace(tzinfo=None)
            if appt_start == slot:
                state = "blocked" if appt.status == "blocked" else "booked"
                appt_id = appt.id
                break
                
        if state == "free":
            for b_start, b_end in yandex_slots:
                if not (slot_end <= b_start or slot >= b_end):
                    state = "yandex"
                    break
                    
        schedule.append(DoctorDayScheduleResponse(time=slot.strftime('%H:%M'), state=state, appt_id=appt_id))
        
    return schedule

@router.post("/doctor/manage-blocks")
async def manage_doctor_blocks(req: ManageBlocksRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Блокировка и разблокировка массива слотов"""
    if current_user.role not in ["doctor", "superadmin"]:
        raise HTTPException(status_code=403)
        
    prof_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == current_user.id))
    doc_prof = prof_res.scalars().first()
    duration = CONSULTATION_DURATION_MINUTES
    moscow_tz = ZoneInfo("Europe/Moscow")

    # 1. РАЗБЛОКИРОВКА
    for time_str in req.to_unblock:
        slot_time = datetime.strptime(f"{req.date} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=moscow_tz)
        res = await db.execute(select(Appointment).where(
            Appointment.doctor_id == current_user.id,
            Appointment.start_time == slot_time,
            Appointment.status == "blocked"
        ))
        appt = res.scalars().first()
        if appt:
            if appt.google_event_id and doc_prof and doc_prof.yandex_email:
                delete_yandex_event(appt.google_event_id, doc_prof.yandex_email, doc_prof.yandex_password)
            await db.execute(delete(Appointment).where(Appointment.id == appt.id))

    # 2. БЛОКИРОВКА
    for time_str in req.to_block:
        slot_time = datetime.strptime(f"{req.date} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=moscow_tz)
        res = await db.execute(select(Appointment).where(
            Appointment.doctor_id == current_user.id,
            Appointment.start_time == slot_time,
            Appointment.status.in_(["scheduled", "completed", "blocked"])
        ))
        if res.scalars().first(): continue
            
        new_appt = Appointment(
            user_id=current_user.id, 
            doctor_id=current_user.id,
            start_time=slot_time,
            end_time=slot_time + timedelta(minutes=duration),
            status="blocked", 
            pet_info="🔒 Заблокировано врачом"
        )
        db.add(new_appt)
        await db.commit()
        
        if doc_prof and doc_prof.yandex_email:
            yandex_url = create_yandex_event(
                start_time=slot_time, summary="⛔ НЕ ЗАПИСЫВАТЬ", description="Заблокировано",
                email=doc_prof.yandex_email, password=doc_prof.yandex_password
            )
            if yandex_url:
                await db.execute(update(Appointment).where(Appointment.id == new_appt.id).values(google_event_id=yandex_url))
                await db.commit()

    await db.commit()
    return {"status": "ok"}

@router.get("/me/history", response_model=List[AppointmentResponse])
async def get_my_appointments_history(
    limit: int = 5,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить историю записей (завершенные/отмененные) с пагинацией"""
    
    # Базовый запрос
    query = select(Appointment).options(
        selectinload(Appointment.doctor), 
        selectinload(Appointment.files)
    )

    # Фильтр по роли
    if current_user.role == "doctor":
        query = query.where(Appointment.doctor_id == current_user.id)
    else:
        query = query.where(Appointment.user_id == current_user.id)
        
    # Фильтр по статусу (только завершенные)
    query = query.where(Appointment.status.in_(["completed", "canceled"]))
    
    # Сортировка и лимит
    query = query.order_by(Appointment.start_time.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/{appt_id}/generate-protocol")
async def generate_protocol(
    appt_id: int,
    req: ProtocolRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    appt = await db.get(Appointment, appt_id)
    if not appt: raise HTTPException(404)
    
    if current_user.role != "superadmin" and appt.doctor_id != current_user.id:
        raise HTTPException(403)
        
    # Ищем данные
    user = await db.get(User, appt.user_id)
    doctor = await db.get(User, appt.doctor_id)
    
    # Генерируем PDF
    pdf_buffer = generate_protocol_pdf(
        doctor_name=doctor.full_name or "Doctor",
        client_name=user.full_name or "Client",
        date_str=appt.start_time.strftime("%d.%m.%Y"),
        pet_name=appt.pet_name or "Unknown",
        pet_details=appt.pet_details or "",
        complaints=appt.pet_info or "",
        diagnosis=req.diagnosis,
        recommendations=req.recommendations
    )
    
    # Сохраняем в Mongo
    file_id = await fs.upload_from_stream(
        filename=f"Protocol_{appt.id}.pdf",
        source=pdf_buffer,
        metadata={"content_type": "application/pdf"}
    )
    
    appt.protocol_file_id = str(file_id)
    appt.status = "completed"
    await db.commit()
    
    return {"status": "ok", "message": "Протокол создан"}
