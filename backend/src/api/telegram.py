from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from src.database import get_db
from src.models import User
from src.services.telegram_service import send_telegram_message

router = APIRouter(prefix="/api/telegram", tags=["Telegram Webhook"])

@router.post("/webhook")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    data = await request.json()
    
    # Проверяем, есть ли сообщение
    if "message" in data:
        msg = data["message"]
        chat_id = msg["chat"]["id"]
        
        # 1. Если пользователь нажал /start
        if "text" in msg and msg["text"] == "/start":
            # Формируем специальную клавиатуру
            contact_keyboard = {
                "keyboard": [
                    [
                        {
                            "text": "📱 Отправить мой номер телефона", 
                            "request_contact": True  # <--- ВОТ ЭТА МАГИЯ
                        }
                    ]
                ],
                "resize_keyboard": True, # Кнопка будет компактной
                "one_time_keyboard": True # Скроется после нажатия
            }
            
            await send_telegram_message(
                chat_id, 
                "👋 Привет! Добро пожаловать в ВетЭксперт.\n\n"
                "Чтобы я мог присылать вам коды для входа, нажмите кнопку ниже:",
                keyboard=contact_keyboard # Передаем клавиатуру
            )

        # 2. Если пользователь отправил КОНТАКТ (телефон)
        elif "contact" in msg:
            phone_number = msg["contact"]["phone_number"]
            # Телеграм может прислать номер без плюса или с ним, приводим к формату
            if not phone_number.startswith("+"):
                phone_number = f"+{phone_number}"
            
            # Ищем юзера в БД
            result = await db.execute(select(User).where(User.phone == phone_number))
            user = result.scalars().first()
            
            if user:
                # Если юзер уже был (например, админ создал), обновляем ему telegram_id
                user.telegram_id = chat_id
                await db.commit()
                await send_telegram_message(chat_id, "✅ Ваш телефон привязан! Теперь вы можете входить на сайт.")
            else:
                # Если юзера нет - создаем нового
                new_user = User(phone=phone_number, telegram_id=chat_id)
                db.add(new_user)
                await db.commit()
                await send_telegram_message(chat_id, "✅ Регистрация успешна! Теперь вы можете входить на сайт.")
                
    return {"status": "ok"}
