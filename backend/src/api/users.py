from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from src.database import get_db
from src.models import User
from src.schemas.schemas import UserResponse, UserUpdate
from src.core.security import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users"])

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Получить данные текущего авторизованного пользователя.
    """
    # Благодаря Depends(get_current_user), сюда дойдет только тот, у кого есть валидный токен!
    return current_user

@router.patch("/me", response_model=UserResponse)
async def update_users_me(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Обновить свой профиль (например, добавить имя).
    """
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    if user_update.telegram_id is not None:
        current_user.telegram_id = user_update.telegram_id
        
    await db.commit()
    await db.refresh(current_user)
    return current_user