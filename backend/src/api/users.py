from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import random
from pydantic import BaseModel

from src.database import get_db, redis_client
from src.models import User, Purchase, Guide, Appointment
from src.schemas.schemas import UserResponse, UserUpdate, GuideResponse
from src.core.security import get_current_user
from src.services.telegram_service import send_telegram_message

router = APIRouter(prefix="/api/users", tags=["Users"])

# Схемы для смены телефона
class PhoneChangeRequest(BaseModel):
    new_phone: str

class PhoneChangeVerify(BaseModel):
    new_phone: str
    code: str

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/me", response_model=UserResponse)
async def update_users_me(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновление имени (телефон теперь обновляется через отдельный эндпоинт с кодом)"""
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
        await db.commit()
        await db.refresh(current_user)
    return current_user

@router.get("/me/guides", response_model=List[GuideResponse])
async def get_my_guides(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Guide).join(Purchase, Purchase.guide_id == Guide.id)
        .where(Purchase.user_id == current_user.id, Purchase.status == "succeeded")
    )
    return result.scalars().all()

# --- НОВАЯ ЛОГИКА СМЕНЫ ТЕЛЕФОНА ---

@router.post("/me/phone/request")
async def request_phone_change(req: PhoneChangeRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.new_phone == current_user.phone:
        raise HTTPException(status_code=400, detail="Это ваш текущий номер")
    
    # Ищем, нет ли уже такого юзера
    result = await db.execute(select(User).where(User.phone == req.new_phone))
    existing_user = result.scalars().first()
    
    if existing_user:
        # Проверяем, не активный ли это аккаунт
        p_res = await db.execute(select(Purchase).where(Purchase.user_id == existing_user.id))
        a_res = await db.execute(select(Appointment).where(Appointment.user_id == existing_user.id))
        if p_res.scalars().first() or a_res.scalars().first():
            raise HTTPException(status_code=400, detail="Этот номер уже используется активным аккаунтом")

    code = str(random.randint(1000, 9999))
    await redis_client.set(f"phone_change:{current_user.id}", code, ex=300)
    
    need_bot = True
    if existing_user and existing_user.telegram_id:
        await send_telegram_message(existing_user.telegram_id, f"🔄 Ваш код для смены номера в ВетЭксперт: <b>{code}</b>")
        need_bot = False
    else:
        print(f"⚠️ КОД СМЕНЫ ТЕЛЕФОНА ДЛЯ {req.new_phone}: {code}")

    return {"message": "Код отправлен", "need_bot": need_bot}

@router.post("/me/phone/verify")
async def verify_phone_change(req: PhoneChangeVerify, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    saved_code = await redis_client.get(f"phone_change:{current_user.id}")
    if not saved_code or saved_code != req.code:
        raise HTTPException(status_code=400, detail="Неверный или просроченный код")
        
    result = await db.execute(select(User).where(User.phone == req.new_phone))
    zombie_user = result.scalars().first()
    
    if zombie_user:
        # Сохраняем ID во временную переменную
        new_tg_id = zombie_user.telegram_id
        
        # Сначала физически удаляем зомби из базы
        await db.delete(zombie_user)
        # flush заставляет базу выполнить DELETE прямо сейчас, ДО коммита
        await db.flush() 
        
        # Теперь, когда уникальный telegram_id свободен, забираем его себе
        current_user.telegram_id = new_tg_id
        
    # Телефон тоже свободен, можно безопасно менять
    current_user.phone = req.new_phone
    await db.commit()
    await redis_client.delete(f"phone_change:{current_user.id}")
    
    return {"status": "ok"}
