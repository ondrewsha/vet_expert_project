from fastapi import APIRouter, Request, Depends, BackgroundTasks, HTTPException
from yookassa.domain.notification import WebhookNotificationFactory
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta

from src.database import get_db, redis_client
from src.models import Appointment, Guide, User
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
                start_time = datetime.fromisoformat(metadata.get("start_time"))
                pet_info = metadata.get("pet_info")
                
                # 1. Создаем железную запись в БД!
                end_time = start_time + timedelta(minutes=60) # Прием длится час
                meet_link = settings.YANDEX_TELEMOST_LINK
                new_appt = Appointment(
                    user_id=user_id,
                    start_time=start_time,
                    end_time=end_time,
                    status="scheduled",
                    pet_info=pet_info,
                    meet_link=meet_link
                )
                db.add(new_appt)
                await db.commit()

                # Создаем событие в Яндекс Календаре
                create_yandex_event(
                    start_time=start_time,
                    summary=f"🩺 Пациент: {pet_info}",
                    description=f"Запись через сайт. Клиент ID: {user_id}"
                )
                
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
            
            elif metadata.get("type") == "guide":
                user_id = int(metadata.get("user_id"))
                guide_id = int(metadata.get("guide_id"))
                
                from src.models import Purchase
                
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
                    settings.TG_DOCTOR_CHAT_ID, 
                    f"📚 <b>Куплен гайд!</b>\nПользователь {user_id} купил гайд #{guide_id}."
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
        
    # 2. Формируем метаданные для вебхука (тип = guide)
    metadata = {
        "type": "guide",
        "user_id": str(current_user.id),
        "guide_id": str(guide.id)
    }
    
    # 3. Создаем платеж
    payment_url = await create_payment_url(
        amount=float(guide.price),
        description=f"Гайд: {guide.title}",
        metadata=metadata,
        return_url="https://твой-сайт.ru/profile"
    )
    
    return {"payment_url": payment_url}
