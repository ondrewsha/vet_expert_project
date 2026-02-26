import random
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database import get_db, redis_client
from src.models import User
from src.schemas.schemas import SendCodeRequest, VerifyCodeRequest, TokenResponse
from src.core.security import create_access_token, create_refresh_token

router = APIRouter(prefix="/api/auth", tags=["Auth"])

@router.post("/send-code")
async def send_code(request: SendCodeRequest):
    # Генерируем случайный 4-значный код
    code = str(random.randint(1000, 9999))
    
    # Сохраняем в Redis с ключом 'auth:номер_телефона', время жизни 5 минут (300 секунд)
    await redis_client.set(f"auth:{request.phone}", code, ex=300)
    
    # TODO: Здесь будет вызов Telegram-бота для отправки сообщения с кодом
    # Пока мы просто выводим его в консоль, чтобы ты мог его скопировать
    print(f"✅ КОД ДЛЯ {request.phone}: {code}")
    
    return {"message": "Код отправлен (смотри в консоль Docker)"}

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