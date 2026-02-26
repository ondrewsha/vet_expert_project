from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.config import settings
from src.database import get_db
from src.models import User
from src.schemas.schemas import TokenData

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 день (для удобства разработки, потом можно уменьшить)
REFRESH_TOKEN_EXPIRE_DAYS = 30

# Эта штука автоматически будет искать заголовок Authorization в запросах
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/verify-code")

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учетные данные (токен недействителен или просрочен)",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Расшифровываем токен
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id, role=payload.get("role"))
    except JWTError:
        raise credentials_exception

    # Ищем пользователя в БД
    result = await db.execute(select(User).where(User.id == int(token_data.user_id)))
    user = result.scalars().first()
    
    if user is None:
        raise credentials_exception
        
    return user