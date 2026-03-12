from zoneinfo import ZoneInfo
from sqlalchemy import select, update

from fastapi import APIRouter, Request, Depends, BackgroundTasks, HTTPException
from yookassa.domain.notification import WebhookNotificationFactory
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta

from src.database import get_db, redis_client
from src.models import Appointment, Guide, User, DoctorProfile, AppointmentFile, Purchase
from src.core.security import get_current_user
from src.services.telegram_service import send_telegram_message
from src.services.yookassa_service import create_payment_url
from src.services.yandex_calendar_service import create_yandex_event
from src.config import settings

router = APIRouter(prefix="/api/payments", tags=["Payments"])

@router.post("/webhook/yookassa")
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Сюда стучится ЮKassa при любом изменении статуса платежа.
    """
    # Получаем JSON от ЮKassa
    event_json = await request.json()
    
    try:
        # Парсим событие встроенным инструментом библиотеки
        notification = WebhookNotificationFactory().create(event_json)
        
        # Нас интересует только успешная оплата
        if notification.event == "payment.succeeded":
            payment = notification.object
            metadata = payment.metadata
            
            # Проверяем, за что была оплата (консультация или гайд)
            if metadata.get("type") == "appointment":
                user_id = int(metadata.get("user_id"))
                doctor_id = int(metadata.get("doctor_id"))
                pet_info = metadata.get("pet_info")
                pet_name = metadata.get("pet_name")
                pet_details = metadata.get("pet_details")
                
                moscow_tz = ZoneInfo("Europe/Moscow")
                start_time_naive = datetime.fromisoformat(metadata.get("start_time"))
                start_time = start_time_naive.replace(tzinfo=moscow_tz)
                
                # Достаем врача, чтобы взять его ссылку и ТГ
                doctor = await db.get(User, doctor_id)
                # Нужно подгрузить профиль врача, так как мы берем его по ID
                doc_profile_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == doctor_id))
                doc_profile = doc_profile_res.scalars().first()

                meet_link = doc_profile.telemost_link if doc_profile and doc_profile.telemost_link else settings.YANDEX_TELEMOST_LINK
                
                new_appt = Appointment(
                    user_id=user_id, doctor_id=doctor_id, start_time=start_time,
                    end_time=start_time + timedelta(minutes=30), status="scheduled",
                    pet_info=pet_info, pet_name=pet_name, pet_details=pet_details, meet_link=meet_link
                )
                db.add(new_appt)
                await db.commit() # Получаем ID записи

                # --- ЛОГИКА ФАЙЛОВ ---
                files_str = metadata.get("files_data")
                file_names_list = [] # Список имен для Телеграма
                
                if files_str:
                    file_pairs = files_str.split(",")
                    for pair in file_pairs:
                        if "|" in pair:
                            fid, fname = pair.split("|")
                            af = AppointmentFile(appointment_id=new_appt.id, mongo_file_id=fid, filename=fname)
                            db.add(af)
                            file_names_list.append(fname)
                    await db.commit()
                # ---------------------
                
                user = await db.get(User, user_id)
                client_name = user.full_name if user and user.full_name else "Без имени"

                # Яндекс Календарь
                if doc_profile and doc_profile.yandex_email:
                    file_desc = f"\nФайлов прикреплено: {len(file_names_list)}" if file_names_list else ""
                    yandex_event_url = create_yandex_event(
                        start_time=start_time,
                        summary=f"🩺 Пациент: {pet_name}, {pet_details}",
                        description=f"Клиент: {client_name}\nТелефон: {user.phone if user else ''}{file_desc}",
                        email=doc_profile.yandex_email,
                        password=doc_profile.yandex_password
                    )
                    if yandex_event_url:
                        await db.execute(
                            update(Appointment).where(Appointment.id == new_appt.id).values(google_event_id=yandex_event_url)
                        )
                        await db.commit()
                
                await redis_client.delete(f"slot_lock:{doctor_id}:{start_time_naive.isoformat()}")
                
                time_str = start_time.strftime('%d.%m.%Y %H:%M')
                doc_name = doctor.full_name if doctor else 'Специалист'
                
                # Формируем текст про файлы для ТГ
                files_msg_part = ""
                if file_names_list:
                    files_msg_part = "\n📎 <b>Прикрепленные файлы:</b>\n" + "\n".join([f"- {name}" for name in file_names_list])

                # 1. Суперадмину
                await send_telegram_message(settings.TG_SUPER_ADMIN_CHAT_ID, 
                    f"💰 <b>Оплачена запись!</b>\n📅 {time_str}\nВрач: {doc_name}\n🐶 {pet_name}, {pet_details}\n👤 {client_name}{files_msg_part}"
                )
                # 2. Врачу
                if doctor and doctor.telegram_id:
                    await send_telegram_message(doctor.telegram_id, 
                        f"🩺 <b>У вас новая запись!</b>\n📅 {time_str}\n🐶 {pet_name}, {pet_details}\n🔗 <a href='{meet_link}'>Ссылка на звонок</a>{files_msg_part}"
                    )
                # 3. Клиенту
                if user and user.telegram_id:
                    await send_telegram_message(user.telegram_id, 
                        f"✅ <b>Оплата прошла успешно!</b>\nВы записаны к врачу: {doc_name}\n📅 {time_str}\n🔗 <a href='{meet_link}'>Ссылка на видеозвонок</a>"
                    )
            
            elif metadata.get("type") == "guide":
                user_id = int(metadata.get("user_id"))
                user_name = metadata.get("user_name")
                guide_id = int(metadata.get("guide_id"))
                guide_price = float(metadata.get("guide_price"))
                guide_title = metadata.get("guide_title")
                
                # Создаем запись о покупке
                new_purchase = Purchase(
                    user_id=user_id,
                    guide_id=guide_id,
                    yookassa_payment_id=payment.id,
                    amount=float(payment.amount.value),
                    status="succeeded"
                )
                db.add(new_purchase)
                await db.commit()
                
                # Шлем уведомление врачу (чтобы он порадовался)
                await send_telegram_message(
                    settings.TG_SUPER_ADMIN_CHAT_ID, 
                    f"📚 <b>Куплен гайд!</b>\nПользователь {user_id} ({user_name}) купил гайд #{guide_id} ({guide_title}, {guide_price})."
                )
                
    except Exception as e:
        print(f"❌ Ошибка обработки вебхука: {e}")
        
    # Мы ОБЯЗАНЫ вернуть 200 OK, иначе ЮKassa будет долбить нас этим запросом сутки
    return {"status": "ok"}

@router.post("/buy-guide/{guide_id}")
async def buy_guide(
    guide_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Генерация ссылки на покупку гайда.
    """
    # 1. Ищем гайд и его цену
    guide = await db.get(Guide, guide_id)
    if not guide:
        raise HTTPException(status_code=404, detail="Гайд не найден")
    
    # Проверяем покупку
    purchase = await db.execute(
        select(Purchase).where(
            Purchase.user_id == current_user.id,
            Purchase.guide_id == guide_id,
            Purchase.status == "succeeded"
        )
    )
    if purchase.scalars().first():
        return {"message": "Вы уже купили этот гайд! Он доступен в вашем профиле."}
    
    # ЕСЛИ ГАЙД БЕСПЛАТНЫЙ
    if guide.price == 0:
        new_purchase = Purchase(
            user_id=current_user.id,
            guide_id=guide_id,
            amount=0,
            status="succeeded" # Сразу успех
        )
        db.add(new_purchase)
        await db.commit()
        return {"message": "Гайд добавлен в вашу библиотеку", "free": True}
        
    # 2. Формируем метаданные для вебхука (тип = guide)
    metadata = {
        "type": "guide",
        "user_id": str(current_user.id),
        "user_name": current_user.full_name or "Без имени",
        "guide_id": str(guide.id),
        "guide_title": guide.title,
        "guide_price": str(guide.price)
    }
    
    # 3. Создаем платеж
    payment_url = await create_payment_url(
        amount=float(guide.price),
        description=f"Гайд: {guide.title}",
        metadata=metadata,
        return_url="https://zoo-medica.ru/profile"
    )
    
    return {"payment_url": payment_url}
