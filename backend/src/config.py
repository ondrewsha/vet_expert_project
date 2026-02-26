from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Данные подтянутся из .env файла автоматически
    DATABASE_URL: str
    MONGO_URL: str
    REDIS_HOST: str
    REDIS_PORT: int
    SECRET_KEY: str

    class Config:
        env_file = ".env"

settings = Settings()