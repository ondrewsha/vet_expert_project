from celery import Celery
from src.config import settings

celery_app = Celery(
    "vet_worker",
    broker=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    backend=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    include=["src.tasks"]
)

celery_app.conf.broker_connection_retry_on_startup = True

# Настройки периодических задач (Beat)
celery_app.conf.beat_schedule = {
    # Запускать задачу проверки каждую минуту
    "check-appointments-every-minute": {
        "task": "src.tasks.check_appointments_status",
        "schedule": 60.0, # секунд
    },
}

celery_app.conf.timezone = 'Europe/Moscow'
