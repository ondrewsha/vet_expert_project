from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import settings

# Инициализация приложения
app = FastAPI(
    title="VetExpert API",
    description="Бэкенд для платформы ВетЭксперт (гайды и консультации)",
    version="1.0.0",
)

# Настройка CORS (чтобы React мог делать запросы к API с другого порта)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # В проде заменим на домен сайта
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Тестовый эндпоинт для проверки работоспособности
@app.get("/api/ping", tags=["System"])
async def ping():
    return {
        "status": "ok",
        "message": "VetExpert API работает!",
        "db_configured": bool(settings.DATABASE_URL)
    }