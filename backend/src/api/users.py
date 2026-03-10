from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List
import random
from pydantic import BaseModel
from bson import ObjectId

from src.database import get_db, redis_client, fs
from src.models import User, Purchase, Guide, Appointment, DoctorProfile
from src.schemas.schemas import UserResponse, UserUpdate, GuideResponse
from src.core.security import get_current_user
from src.services.telegram_service import send_telegram_message

router = APIRouter(prefix="/api/users", tags=["Users"])

class PhoneChangeRequest(BaseModel):
    new_phone: str

class PhoneChangeVerify(BaseModel):
    new_phone: str
    code: str

class DoctorSettingsUpdate(BaseModel):
    work_days: str # "0,1,2,3,4"

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).options(selectinload(User.doctor_profile)).where(User.id == current_user.id))
    user = res.scalars().first()
    
    # Если это врач, считаем его средний рейтинг
    if user and user.role in ["doctor", "superadmin"]:
        rating_res = await db.execute(
            select(func.avg(Appointment.rating))
            .where(Appointment.doctor_id == user.id)
            .where(Appointment.rating.isnot(None))
        )
        user.average_rating = rating_res.scalar()
        
    return user

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

@router.patch("/doctor/settings")
async def update_doctor_settings(
    work_days: str = Form(None), # "0,1,2"
    description: str = Form(None),
    file: UploadFile = File(None), # Аватарка
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in ["doctor", "superadmin"]:
        raise HTTPException(status_code=403)
        
    res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == current_user.id))
    prof = res.scalars().first()
    
    if not prof:
        prof = DoctorProfile(user_id=current_user.id)
        db.add(prof)
    
    if work_days is not None: prof.work_days = work_days
    if description is not None: prof.description = description
    
    if file:
        # Загружаем фото в Mongo
        file_id = await fs.upload_from_stream(
            filename=file.filename, 
            source=file.file, 
            metadata={"content_type": file.content_type}
        )
        prof.photo_url = str(file_id)
        
    await db.commit()
    return {"status": "ok"}

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
        await send_telegram_message(existing_user.telegram_id, f"🔄 Ваш код для смены номера в ЗооМедика: <b>{code}</b>")
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

@router.get("/{user_id}/photo")
async def get_doctor_photo(user_id: int, db: AsyncSession = Depends(get_db)):
    """Получить аватарку врача"""
    res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == user_id))
    prof = res.scalars().first()
    
    if not prof or not prof.photo_url:
        # Если фото нет, возвращаем 404 (фронт покажет заглушку)
        raise HTTPException(status_code=404, detail="Фото не найдено")

    try:
        grid_out = await fs.open_download_stream(ObjectId(prof.photo_url))
        return StreamingResponse(grid_out, media_type="image/jpeg")
    except Exception:
        raise HTTPException(status_code=404, detail="Файл не найден")
