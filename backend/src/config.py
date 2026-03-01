from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Данные подтянутся из .env файла автоматически
    DATABASE_URL: str
    MONGO_URL: str
    REDIS_HOST: str
    REDIS_PORT: int
    SECRET_KEY: str
    YOOKASSA_SHOP_ID: str = ""
    YOOKASSA_SECRET_KEY: str = ""
    TG_BOT_TOKEN: str = ""
    TG_DOCTOR_CHAT_ID: str = ""
    YANDEX_EMAIL: str = ""
    YANDEX_PASSWORD: str = ""
    YANDEX_TELEMOST_LINK: str = ""

    class Config:
        env_file = ".env"

settings = Settings()