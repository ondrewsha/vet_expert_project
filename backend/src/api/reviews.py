from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from src.database import get_db
from src.models import Review, User
from src.schemas.schemas import ReviewCreate, ReviewResponse
from src.core.security import get_current_user

router = APIRouter(prefix="/api/reviews", tags=["Reviews"])

@router.post("", response_model=ReviewResponse)
async def create_review(
    review_in: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_review = Review(
        user_id=current_user.id,
        doctor_id=review_in.doctor_id,
        rating=review_in.rating,
        text=review_in.text,
        is_approved=True # Для MVP сразу одобряем, потом можно добавить модерацию
    )
    db.add(new_review)
    await db.commit()
    await db.refresh(new_review)
    
    # Формируем ответ вручную, чтобы добавить имя пользователя
    return ReviewResponse(
        id=new_review.id,
        text=new_review.text,
        rating=new_review.rating,
        user_name=current_user.full_name or "Аноним",
        created_at=new_review.created_at
    )
