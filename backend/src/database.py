from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from src.config import settings
import redis.asyncio as aioredis
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

# --- POSTGRES ---
# Создаем асинхронный движок (echo=True будет выводить SQL-запросы в консоль, для прода потом выключим)
engine = create_async_engine(settings.DATABASE_URL, echo=True)
# Фабрика сессий (через них мы будем делать запросы к БД)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
# Базовый класс для всех будущих таблиц
Base = declarative_base()

# Зависимость (Dependency) для получения сессии в FastAPI эндпоинтах
async def get_db():
    async with async_session_maker() as session:
        yield session

# --- REDIS ---
redis_client = aioredis.Redis(
    host=settings.REDIS_HOST, 
    port=settings.REDIS_PORT, 
    decode_responses=True # Чтобы Redis возвращал строки, а не байты
)

# --- MONGODB (GridFS) ---
# Создаем клиента
mongo_client = AsyncIOMotorClient(settings.MONGO_URL)
# Выбираем базу данных внутри Mongo (назовем её vet_files)
mongo_db = mongo_client.vet_files
# Инициализируем "ведро" (Bucket) для хранения файлов
fs = AsyncIOMotorGridFSBucket(mongo_db)
