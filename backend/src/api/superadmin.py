from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from src.database import get_db, fs
from src.models import User, DoctorProfile, Appointment, Purchase
from src.core.security import get_current_user
from src.schemas.schemas import DoctorAdminResponse

router = APIRouter(prefix="/api/superadmin", tags=["SuperAdmin"])

class StatsResponse(BaseModel):
    total_users: int
    total_doctors: int
    total_appointments: int
    total_guides_sold: int
    total_income: float

class DoctorStatsResponse(BaseModel):
    doctor_name: str
    total_appointments: int
    total_income: float

@router.get("/stats", response_model=StatsResponse)
async def get_stats(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    users = await db.scalar(select(func.count(User.id)))
    doctors = await db.scalar(select(func.count(User.id)).where(User.role.in_(["doctor", "superadmin"])))
    appts = await db.scalar(select(func.count(Appointment.id)).where(Appointment.status == "completed"))
    purchases = await db.scalar(select(func.count(Purchase.id)).where(Purchase.status == "succeeded"))
    
    guides_money = await db.scalar(select(func.sum(Purchase.amount)).where(Purchase.status == "succeeded")) or 0
    total_money = guides_money + (appts * 1490)

    return StatsResponse(
        total_users=users, total_doctors=doctors, 
        total_appointments=appts, total_guides_sold=purchases, total_income=total_money
    )

@router.get("/doctors", response_model=List[DoctorAdminResponse])
async def get_all_doctors_admin(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    # 1. Получаем врачей
    res = await db.execute(
        select(User)
        .options(selectinload(User.doctor_profile))
        .where(User.role.in_(["doctor", "superadmin"]))
        .order_by(User.id)
    )
    doctors = res.scalars().all()
    
    # 2. Высчитываем средний рейтинг для каждого
    for doc in doctors:
        rating_res = await db.execute(
            select(func.avg(Appointment.rating))
            .where(Appointment.doctor_id == doc.id)
            .where(Appointment.rating.isnot(None))
        )
        # SQLAlchemy вернет None, если оценок нет. Pydantic сам это "проглотит" благодаря Optional
        doc.average_rating = rating_res.scalar() 
        
    return doctors

# --- СОЗДАНИЕ ВРАЧА (FORM DATA) ---
@router.post("/doctors")
async def create_doctor(
    phone: str = Form(...),
    full_name: str = Form(...),
    description: str = Form(None),
    yandex_email: str = Form(None),
    yandex_password: str = Form(None),
    telemost_link: str = Form(None), # <--- ССЫЛКА НА ЗВОНОК
    file: UploadFile = File(None),   # <--- ФОТО
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    res = await db.execute(select(User).where(User.phone == phone))
    user = res.scalars().first()
    
    if user:
        user.role = "doctor"
        user.full_name = full_name
    else:
        user = User(phone=phone, full_name=full_name, role="doctor")
        db.add(user)
        await db.flush()
        
    prof_res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == user.id))
    prof = prof_res.scalars().first()
    
    if not prof:
        prof = DoctorProfile(user_id=user.id)
        db.add(prof)
    
    prof.description = description
    prof.yandex_email = yandex_email
    prof.yandex_password = yandex_password
    prof.telemost_link = telemost_link

    if file:
        file_id = await fs.upload_from_stream(
            filename=file.filename, source=file.file, metadata={"content_type": file.content_type}
        )
        prof.photo_url = str(file_id)

    await db.commit()
    return {"status": "ok", "message": "Врач сохранен"}

# --- РЕДАКТИРОВАНИЕ ВРАЧА ---
@router.patch("/doctors/{user_id}")
async def update_doctor_admin(
    user_id: int,
    full_name: str = Form(None),
    phone: str = Form(None),
    description: str = Form(None),
    yandex_email: str = Form(None),
    yandex_password: str = Form(None),
    telemost_link: str = Form(None),
    file: UploadFile = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != "superadmin": raise HTTPException(403)

    user = await db.get(User, user_id)
    if not user: raise HTTPException(404, detail="Врач не найден")

    if full_name: user.full_name = full_name
    if phone: user.phone = phone # Тут без проверки кода, т.к. админ главный

    # Профиль
    res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == user.id))
    prof = res.scalars().first()
    if not prof:
        prof = DoctorProfile(user_id=user.id)
        db.add(prof)

    if description is not None: prof.description = description
    if yandex_email is not None: prof.yandex_email = yandex_email
    if yandex_password is not None: prof.yandex_password = yandex_password
    if telemost_link is not None: prof.telemost_link = telemost_link
    
    if file:
        file_id = await fs.upload_from_stream(
            filename=file.filename, source=file.file, metadata={"content_type": file.content_type}
        )
        prof.photo_url = str(file_id)

    await db.commit()
    return {"status": "ok"}

@router.patch("/doctors/{id}/toggle")
async def toggle_doctor_active(id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    res = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == id))
    prof = res.scalars().first()
    if not prof: raise HTTPException(404, detail="Профиль врача не найден")
    
    prof.is_active = not prof.is_active
    await db.commit()
    return {"status": "ok", "is_active": prof.is_active}

@router.get("/doctors/{doctor_id}/stats", response_model=DoctorStatsResponse)
async def get_doctor_monthly_stats(
    doctor_id: int, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != "superadmin": raise HTTPException(403)
    
    # Определяем начало текущего месяца
    now = datetime.now()
    start_of_month = datetime(now.year, now.month, 1)
    
    # 1. Получаем имя врача
    doc = await db.get(User, doctor_id)
    if not doc: raise HTTPException(404)
    
    # 2. Считаем успешные приемы за месяц
    res = await db.execute(
        select(func.count(Appointment.id))
        .where(Appointment.doctor_id == doctor_id)
        .where(Appointment.status == "completed")
        .where(Appointment.start_time >= start_of_month)
    )
    count = res.scalar() or 0
    
    # 3. Считаем заработок (допустим, 1490 руб за прием)
    income = count * 1490.0 * 0.9
    
    return DoctorStatsResponse(
        doctor_name=doc.full_name,
        total_appointments=count,
        total_income=income
    )
