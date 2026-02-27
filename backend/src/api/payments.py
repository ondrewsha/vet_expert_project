from fastapi import APIRouter, Request, Depends, BackgroundTasks
from yookassa.domain.notification import WebhookNotificationFactory
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta

from src.database import get_db, redis_client
from src.models import Appointment
from src.services.telegram_service import send_telegram_message
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
                start_time = datetime.fromisoformat(metadata.get("start_time"))
                pet_info = metadata.get("pet_info")
                
                # 1. Создаем железную запись в БД!
                end_time = start_time + timedelta(minutes=60) # Прием длится час
                new_appt = Appointment(
                    user_id=user_id,
                    start_time=start_time,
                    end_time=end_time,
                    status="scheduled",
                    pet_info=pet_info
                )
                db.add(new_appt)
                await db.commit()
                
                # 2. Снимаем временную блокировку в Redis, слот теперь официально занят в БД
                redis_key = f"slot_lock:{start_time.isoformat()}"
                await redis_client.delete(redis_key)
                
                # 3. вызов Telegram бота для уведомления врача и клиента!
                print(f"✅ УСПЕШНАЯ ОПЛАТА! Запись создана: {start_time}")
                msg_text = (
                    f"💰 <b>Новая оплаченная запись!</b>\n\n"
                    f"📅 Дата: <b>{start_time.strftime('%d.%m.%Y')}</b>\n"
                    f"⏰ Время: <b>{start_time.strftime('%H:%M')}</b>\n"
                    f"🐶 Пациент: {pet_info}\n"
                    f"👤 Клиент ID: {user_id}"
                )
                await send_telegram_message(settings.TG_DOCTOR_CHAT_ID, msg_text)
                print(f"✅ УСПЕШНАЯ ОПЛАТА! Врач уведомлен.")
                
    except Exception as e:
        print(f"❌ Ошибка обработки вебхука: {e}")
        
    # Мы ОБЯЗАНЫ вернуть 200 OK, иначе ЮKassa будет долбить нас этим запросом сутки
    return {"status": "ok"}