from datetime import datetime, timedelta, date, time
from typing import List
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel

from src.database import get_db, redis_client
from src.models import User, Appointment
from src.schemas.schemas import AppointmentCreate, AppointmentResponse
from src.core.security import get_current_user
from src.services.yookassa_service import create_payment_url
from src.services.yandex_calendar_service import get_busy_slots_yandex
from src.config import settings

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])

WORK_START_HOUR = 10
WORK_END_HOUR = 18
CONSULTATION_DURATION_MINUTES = 60

class RatingUpdate(BaseModel):
    rating: int

@router.get("/available")
async def get_available_slots(target_date: date, db: AsyncSession = Depends(get_db)):
    all_slots =[]
    moscow_tz = ZoneInfo("Europe/Moscow")
    
    current_time = datetime.combine(target_date, time(WORK_START_HOUR, 0))
    end_time = datetime.combine(target_date, time(WORK_END_HOUR, 0))
    now = datetime.now(moscow_tz).replace(tzinfo=None) 
    
    while current_time < end_time:
        # Убираем прошедшее время
        if target_date == now.date() and current_time <= now + timedelta(minutes=15):
            current_time += timedelta(minutes=CONSULTATION_DURATION_MINUTES)
            continue
        all_slots.append(current_time)
        current_time += timedelta(minutes=CONSULTATION_DURATION_MINUTES)
        
    start_of_day = datetime.combine(target_date, time.min).replace(tzinfo=moscow_tz)
    end_of_day = datetime.combine(target_date, time.max).replace(tzinfo=moscow_tz)

    yandex_busy = get_busy_slots_yandex(start_of_day, end_of_day)
    
    result = await db.execute(
        select(Appointment.start_time).where(
            and_(
                Appointment.start_time >= start_of_day,
                Appointment.start_time <= end_of_day,
                Appointment.status.in_(["scheduled", "completed"])
            )
        )
    )
    # Корректно читаем из БД в часовом поясе МСК
    db_booked_slots = []
    for row in result.all():
        dt = row[0]
        if dt.tzinfo is not None:
            dt = dt.astimezone(moscow_tz)
        db_booked_slots.append(dt.replace(tzinfo=None))

    available_slots =[]
    for slot in all_slots:
        slot_end = slot + timedelta(minutes=60)
        
        is_busy_yandex = False
        for b_start, b_end in yandex_busy:
            if not (slot_end <= b_start or slot >= b_end):
                is_busy_yandex = True
                break
        
        if is_busy_yandex or slot in db_booked_slots:
            continue
            
        redis_key = f"slot_lock:{slot.isoformat()}"
        is_locked = await redis_client.get(redis_key)
        if not is_locked:
            available_slots.append(slot)

    return {"date": target_date, "available_slots": available_slots}

@router.post("/book")
async def book_appointment(appt_in: AppointmentCreate, current_user: User = Depends(get_current_user)):
    slot_time = appt_in.start_time.replace(tzinfo=None)
    redis_key = f"slot_lock:{slot_time.isoformat()}"
    
    if await redis_client.get(redis_key):
        raise HTTPException(status_code=409, detail="Слот занят.")
        
    lock_data = f"{current_user.id}|{appt_in.pet_info or ''}"
    await redis_client.set(redis_key, lock_data, ex=900)
    
    metadata = {
        "type": "appointment",
        "user_id": str(current_user.id),
        "start_time": slot_time.isoformat(),
        "pet_info": appt_in.pet_info or "Не указано"
    }
    
    payment_url = await create_payment_url(
        amount=2000.00,
        description=f"Онлайн-консультация с ветеринаром ({slot_time.strftime('%d.%m.%Y %H:%M')})",
        metadata=metadata,
        return_url="https://твой-сайт.ru/profile"
    )
    
    return {"message": "Забронировано", "payment_url": payment_url, "slot": slot_time}

@router.get("/me", response_model=List[AppointmentResponse])
async def get_my_appointments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Appointment).where(Appointment.user_id == current_user.id).order_by(Appointment.start_time.desc())
    )
    appts = result.scalars().all()
    
    moscow_tz = ZoneInfo("Europe/Moscow")
    now = datetime.now(moscow_tz)
    changed = False
    
    # АВТОМАТИЧЕСКИ ПЕРЕНОСИМ В ИСТОРИЮ ЧЕРЕЗ 30 МИН ПОСЛЕ НАЧАЛА
    for appt in appts:
        appt_time = appt.start_time if appt.start_time.tzinfo else appt.start_time.replace(tzinfo=moscow_tz)
        if appt.status == "scheduled" and now >= appt_time + timedelta(minutes=30):
            appt.status = "completed"
            changed = True
            
    if changed:
        await db.commit()
        
    return appts

@router.patch("/{appt_id}/refresh-link", response_model=AppointmentResponse)
async def refresh_appointment_link(appt_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Умное обновление ссылки: если её нет, записываем из настроек"""
    appt = await db.get(Appointment, appt_id)
    if not appt or appt.user_id != current_user.id:
        raise HTTPException(status_code=404)
        
    if not appt.meet_link:
        appt.meet_link = settings.YANDEX_TELEMOST_LINK
        await db.commit()
        
    return appt

@router.patch("/{appt_id}/rating")
async def rate_appointment(appt_id: int, payload: RatingUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сохранение оценки приема"""
    appt = await db.get(Appointment, appt_id)
    if not appt or appt.user_id != current_user.id:
        raise HTTPException(status_code=404)
        
    appt.rating = payload.rating
    await db.commit()
    return {"status": "ok"}
