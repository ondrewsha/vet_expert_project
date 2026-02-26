from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from src.database import get_db
from src.models import Guide
from src.schemas.schemas import GuideCreate, GuideResponse

router = APIRouter(prefix="/api/guides", tags=["Guides"])

@router.get("", response_model=List[GuideResponse])
async def get_active_guides(db: AsyncSession = Depends(get_db)):
    """Получить список всех активных гайдов (витрина)"""
    result = await db.execute(select(Guide).where(Guide.is_active == True))
    return result.scalars().all()

@router.post("", response_model=GuideResponse)
async def create_guide(guide_in: GuideCreate, db: AsyncSession = Depends(get_db)):
    """Создать новый гайд (Потом закроем этот эндпоинт только для Admin)"""
    new_guide = Guide(**guide_in.model_dump())
    db.add(new_guide)
    await db.commit()
    await db.refresh(new_guide)
    return new_guide

@router.get("/{guide_id}", response_model=GuideResponse)
async def get_guide(guide_id: int, db: AsyncSession = Depends(get_db)):
    """Получить информацию о конкретном гайде"""
    result = await db.execute(select(Guide).where(Guide.id == guide_id))
    guide = result.scalars().first()
    if not guide:
        raise HTTPException(status_code=404, detail="Гайд не найден")
    return guide