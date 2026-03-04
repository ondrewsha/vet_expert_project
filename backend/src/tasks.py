import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from src.celery_app import celery_app
from src.config import settings
from src.models import Appointment, User
from src.services.telegram_service import send_telegram_message

async def process_appointments():
    # Создаем НОВЫЙ движок для каждой задачи, чтобы избежать конфликта Event Loop
    local_engine = create_async_engine(settings.DATABASE_URL, echo=False)
    local_session_maker = async_sessionmaker(local_engine, expire_on_commit=False)

    async with local_session_maker() as session:
        moscow_tz = ZoneInfo("Europe/Moscow")
        now = datetime.now(moscow_tz)
        
        # 1. ЗАВЕРШЕНИЕ СТАРЫХ ЗАПИСЕЙ
        res = await session.execute(select(Appointment).where(Appointment.status == "scheduled"))
        active_appts = res.scalars().all()
        
        for appt in active_appts:
            # Приводим к МСК для сравнения
            if appt.end_time.tzinfo:
                appt_end = appt.end_time.astimezone(moscow_tz)
            else:
                appt_end = appt.end_time.replace(tzinfo=moscow_tz)
            
            if now > appt_end:
                appt.status = "completed"
                print(f"🔄 Celery: Запись {appt.id} завершена автоматически.")
                
                if not appt.protocol_file_id:
                    doc = await session.get(User, appt.doctor_id)
                    if doc and doc.telegram_id:
                        await send_telegram_message(
                            doc.telegram_id, 
                            f"⚠️ <b>Напоминание!</b>\nПрием завершен, но протокол не загружен.\nКлиент: {appt.pet_info}"
                        )

        # 2. НАПОМИНАНИЕ ЗА 1 ЧАС
        # Ищем записи, которые начнутся через 60 минут (+- 1 минута)
        target_time_start = now + timedelta(minutes=60)
        target_time_end = now + timedelta(minutes=61)
        
        # Приводим target_time к UTC, если в базе UTC, или оставляем с TZ, если база с TZ
        # SQLAlchemy с asyncpg обычно работает корректно с aware datetime
        
        upcoming_res = await session.execute(
            select(Appointment)
            .options(selectinload(Appointment.user), selectinload(Appointment.doctor))
            .where(Appointment.status == "scheduled")
        )
        upcoming = upcoming_res.scalars().all()

        for appt in upcoming:
            if appt.start_time.tzinfo:
                start_msk = appt.start_time.astimezone(moscow_tz)
            else:
                start_msk = appt.start_time.replace(tzinfo=moscow_tz)

            # Проверяем интервал вручную, чтобы не мучиться с SQL датами
            if target_time_start <= start_msk <= target_time_end:
                # Шлем клиенту
                if appt.user.telegram_id:
                    await send_telegram_message(
                        appt.user.telegram_id,
                        f"⏰ <b>Напоминание!</b>\nЧерез 1 час консультация.\nВрач: {appt.doctor.full_name}\nСсылка: {appt.meet_link}"
                    )
                # Шлем врачу
                if appt.doctor.telegram_id:
                    await send_telegram_message(
                        appt.doctor.telegram_id,
                        f"⏰ <b>Напоминание!</b>\nЧерез 1 час прием.\nПациент: {appt.pet_info}"
                    )
                print(f"🔔 Celery: Напоминание отправлено для записи {appt.id}")

        await session.commit()
    
    # Обязательно закрываем движок
    await local_engine.dispose()

@celery_app.task
def check_appointments_status():
    """Эта функция запускается Celery Worker'ом"""
    # Запускаем асинхронную логику внутри синхронной задачи
    asyncio.run(process_appointments())
