import random
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db, redis_client
from src.models import User
from src.schemas.schemas import SendCodeRequest, VerifyCodeRequest, TokenResponse
from src.core.security import create_access_token, create_refresh_token
from src.services.telegram_service import send_telegram_message

router = APIRouter(prefix="/api/auth", tags=["Auth"])

@router.post("/send-code")
async def send_code(request: SendCodeRequest, db: AsyncSession = Depends(get_db)):
    # Генерируем случайный 4-значный код
    code = str(random.randint(1000, 9999))
    
    # Сохраняем в Redis с ключом 'auth:номер_телефона', время жизни 5 минут (300 секунд)
    await redis_client.set(f"auth:{request.phone}", code, ex=300)
    
    # 3. Пытаемся отправить в Telegram
    # Сначала ищем пользователя по телефону, чтобы узнать его telegram_id
    result = await db.execute(select(User).where(User.phone == request.phone))
    user = result.scalars().first()
    
    sent_to_tg = False
    
    if user and user.telegram_id:
        # Если юзер есть и у него привязан ТГ — шлем туда
        await send_telegram_message(
            chat_id=user.telegram_id,
            text=f"🔐 Ваш код входа в ВетЭксперт: <b>{code}</b>"
        )
        sent_to_tg = True
        print(f"✅ Код отправлен в Telegram пользователю {user.id}")
    else:
        # Если юзера нет или он не нажимал Start в боте — шлем в консоль (для разработки)
        # В реале тут можно слать SMS, если подключишь провайдера
        print(f"⚠️ Юзер не найден или нет TG_ID. КОД ДЛЯ {request.phone}: {code}")

    return {
        "message": "Код отправлен", 
        "dev_info": "Смотри консоль, если это новый юзер" if not sent_to_tg else "Отправлено в бот"
    }

@router.post("/verify-code", response_model=TokenResponse)
async def verify_code(request: VerifyCodeRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # 1. Достаем код из Redis
    saved_code = await redis_client.get(f"auth:{request.phone}")
    
    if not saved_code or saved_code != request.code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный или просроченный код")
    
    # 2. Ищем пользователя в БД
    result = await db.execute(select(User).where(User.phone == request.phone))
    user = result.scalars().first()
    
    # 3. Если пользователя нет - регистрируем его
    if not user:
        user = User(phone=request.phone)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    # 4. Код верный, удаляем его из Redis, чтобы нельзя было использовать повторно
    await redis_client.delete(f"auth:{request.phone}")
    
    # 5. Генерируем токены
    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    
    # Кладем refresh_token в безопасную HttpOnly куку
    response.set_cookie(
        key="refresh_token", 
        value=refresh_token, 
        httponly=True, 
        max_age=30 * 24 * 60 * 60, # 30 дней
        samesite="lax"
    )
    
    return TokenResponse(access_token=access_token)