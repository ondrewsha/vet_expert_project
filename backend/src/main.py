from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import settings
from src.api.auth import router as auth_router
from src.api.guides import router as guides_router
from src.api.users import router as users_router

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

app.include_router(auth_router)
app.include_router(guides_router)
app.include_router(users_router)

# Тестовый эндпоинт для проверки работоспособности
@app.get("/api/ping", tags=["System"])
async def ping():
    return {
        "status": "ok",
        "message": "VetExpert API работает!",
        "db_configured": bool(settings.DATABASE_URL)
    }