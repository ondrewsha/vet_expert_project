from datetime import datetime, timedelta, date, time
from typing import List
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from src.database import get_db, redis_client
from src.models import User, Appointment
from src.schemas.schemas import AppointmentCreate, AppointmentResponse
from src.core.security import get_current_user
from src.services.yookassa_service import create_payment_url
from src.services.yandex_calendar_service import get_busy_slots_yandex

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])

# Рабочие часы врача (для примера с 10:00 до 18:00, длительность приема - 1 час)
WORK_START_HOUR = 10
WORK_END_HOUR = 18
CONSULTATION_DURATION_MINUTES = 60

@router.get("/available")
async def get_available_slots(target_date: date, db: AsyncSession = Depends(get_db)):
    """
    Получить список свободных слотов на выбранную дату.
    """
    # 1. Генерируем все возможные слоты на этот день
    all_slots =[]
    current_time = datetime.combine(target_date, time(WORK_START_HOUR, 0))
    end_time = datetime.combine(target_date, time(WORK_END_HOUR, 0))

    moscow_tz = ZoneInfo("Europe/Moscow")
    now = datetime.now(moscow_tz).replace(tzinfo=None) 
    
    while current_time < end_time:
        if target_date == now.date() and current_time <= now + timedelta(minutes=15):
            current_time += timedelta(minutes=CONSULTATION_DURATION_MINUTES)
            continue
        all_slots.append(current_time)
        current_time += timedelta(minutes=CONSULTATION_DURATION_MINUTES)
        
    # 2. занятость на этот день
    start_of_day = datetime.combine(target_date, time.min)
    end_of_day = datetime.combine(target_date, time.max)

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
    db_booked_slots = [row[0].replace(tzinfo=None) for row in result.all()] # Убираем таймзону для сравнения

    # 3. Фильтруем слоты, оставляем только свободные
    available_slots =[]
    for slot in all_slots:
        slot_end = slot + timedelta(minutes=60)
        
        # Проверяем пересечения с Яндексом
        is_busy_yandex = False
        for b_start, b_end in yandex_busy:
            # Если слоты пересекаются
            if not (slot_end <= b_start or slot >= b_end):
                is_busy_yandex = True
                break
        
        if is_busy_yandex:
            continue

        # Проверяем, нет ли слота в БД
        if slot in db_booked_slots:
            continue
            
        # Проверяем, не заблокирован ли слот в Redis (кто-то сейчас его оплачивает)
        redis_key = f"slot_lock:{slot.isoformat()}"
        is_locked = await redis_client.get(redis_key)
        
        if not is_locked:
            available_slots.append(slot)

    return {"date": target_date, "available_slots": available_slots}

@router.post("/book")
async def book_appointment(
    appt_in: AppointmentCreate, 
    current_user: User = Depends(get_current_user)
):
    """
    Шаг 1: Пользователь выбирает время. Бронируем слот в Redis на 15 минут.
    В ответ отдаем ссылку на оплату.
    """
    slot_time = appt_in.start_time.replace(tzinfo=None) # Работаем с локальным временем для ключа
    redis_key = f"slot_lock:{slot_time.isoformat()}"
    
    # 1. Проверяем, не занял ли кто-то слот секунду назад
    is_locked = await redis_client.get(redis_key)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail="Этот слот уже кто-то оформляет. Выберите другое время."
        )
        
    # TODO: Сюда нужно добавить проверку по БД, чтобы точно никто не успел оплатить этот слот
    
    # 2. Блокируем слот в Redis на 15 минут (900 секунд)
    # В значении ключа сохраним ID пользователя и инфу о питомце, чтобы при успешной оплате достать их!
    lock_data = f"{current_user.id}|{appt_in.pet_info or ''}"
    await redis_client.set(redis_key, lock_data, ex=900)
    
    # 3. код создания платежа в ЮKassa
    # Собираем метадату, которую ЮKassa вернет нам после успешной оплаты
    metadata = {
        "type": "appointment",
        "user_id": str(current_user.id),
        "start_time": slot_time.isoformat(),
        "pet_info": appt_in.pet_info or "Не указано"
    }
    
    price = 2000.00 # Цена консультации (можно потом вынести в БД/настройки)
    
    # Генерируем реальную ссылку
    payment_url = await create_payment_url(
        amount=price,
        description=f"Онлайн-консультация с ветеринаром ({slot_time.strftime('%d.%m.%Y %H:%M')})",
        metadata=metadata,
        return_url="https://твой-будущий-домен.ru/profile" # Заглушка, куда перенаправить после оплаты
    )
    
    return {
        "message": "Слот забронирован на 15 минут! Ожидаем оплату.",
        "expires_in_minutes": 15,
        "payment_url": payment_url,
        "slot": slot_time
    }

@router.get("/me", response_model=List[AppointmentResponse])
async def get_my_appointments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Получить все записи на консультации текущего пользователя.
    """
    result = await db.execute(
        select(Appointment)
        .where(Appointment.user_id == current_user.id)
        .order_by(Appointment.start_time.desc())
    )
    return result.scalars().all()
