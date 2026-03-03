from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel

from src.database import get_db
from src.models import User, DoctorProfile, Appointment, Purchase
from src.core.security import get_current_user
from src.schemas.schemas import DoctorResponse

router = APIRouter(prefix="/api/superadmin", tags=["SuperAdmin"])

class CreateDoctorRequest(BaseModel):
    phone: str
    full_name: str
    description: Optional[str] = None
    yandex_email: Optional[str] = None
    yandex_password: Optional[str] = None

class StatsResponse(BaseModel):
    total_users: int
    total_doctors: int
    total_appointments: int
    total_guides_sold: int
    total_income: float

@router.get("/stats", response_model=StatsResponse)
async def get_stats(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    users = await db.scalar(select(func.count(User.id)))
    doctors = await db.scalar(select(func.count(User.id)).where(User.role.in_(["doctor", "superadmin"])))
    appts = await db.scalar(select(func.count(Appointment.id)).where(Appointment.status == "completed"))
    purchases = await db.scalar(select(func.count(Purchase.id)).where(Purchase.status == "succeeded"))
    
    # Считаем деньги (Гайды + Консультации по 2000р)
    guides_money = await db.scalar(select(func.sum(Purchase.amount)).where(Purchase.status == "succeeded")) or 0
    total_money = guides_money + (appts * 2000)

    return StatsResponse(
        total_users=users, total_doctors=doctors, 
        total_appointments=appts, total_guides_sold=purchases, total_income=total_money
    )

@router.get("/doctors", response_model=List[DoctorResponse])
async def get_all_doctors_admin(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "superadmin": raise HTTPException(403)
    # Возвращаем всех врачей (даже неактивных)
    res = await db.execute(select(User).options(selectinload(User.doctor_profile)).where(User.role.in_(["doctor", "superadmin"])).order_by(User.id))
    return res.scalars().all()

@router.post("/doctors")
async def create_doctor(req: CreateDoctorRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    # 1. Создаем/Ищем юзера
    res = await db.execute(select(User).where(User.phone == req.phone))
    user = res.scalars().first()
    
    if user:
        user.role = "doctor"
        user.full_name = req.full_name
    else:
        user = User(phone=req.phone, full_name=req.full_name, role="doctor")
        db.add(user)
        await db.flush() # Получаем ID
        
    # 2. Создаем/Обновляем профиль с данными
    prof_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == user.id))
    prof = prof_res.scalars().first()
    
    if not prof:
        prof = DoctorProfile(
            user_id=user.id,
            description=req.description,
            yandex_email=req.yandex_email,
            yandex_password=req.yandex_password
        )
        db.add(prof)
    else:
        prof.description = req.description
        prof.yandex_email = req.yandex_email
        prof.yandex_password = req.yandex_password
        
    await db.commit()
    return {"status": "ok", "message": "Врач успешно сохранен"}

@router.patch("/doctors/{id}/toggle")
async def toggle_doctor_active(id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == id))
    prof = res.scalars().first()
    if not prof: raise HTTPException(404, detail="Профиль врача не найден")
    
    prof.is_active = not prof.is_active
    await db.commit()
    return {"status": "ok", "is_active": prof.is_active}