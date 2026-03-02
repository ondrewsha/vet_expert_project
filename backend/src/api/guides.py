from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from src.database import get_db, fs
from src.models import Guide, User, Purchase
from src.schemas.schemas import GuideCreate, GuideResponse
from src.core.security import get_current_user
from urllib.parse import quote

router = APIRouter(prefix="/api/guides", tags=["Guides"])

# --- ПРОСМОТР ВСЕХ ГАЙДОВ (Витрина) ---
@router.get("", response_model=List[GuideResponse])
async def get_active_guides(db: AsyncSession = Depends(get_db)):
    """Получить список всех активных гайдов (витрина)"""
    result = await db.execute(select(Guide).where(Guide.is_active == True))
    return result.scalars().all()

# --- СОЗДАНИЕ ГАЙДА (С ЗАГРУЗКОЙ ФАЙЛА) ---
@router.post("", response_model=GuideResponse)
async def create_guide(
        title: str = Form(...),
        description: str = Form(...), # Теперь обязательное
        price: float = Form(...),
        free_snippet: str = Form(None), # <--- НОВОЕ ПОЛЕ (краткий фрагмент)
        file: UploadFile = File(...),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user) # <--- ОБЯЗАТЕЛЬНАЯ АВТОРИЗАЦИЯ
    ):
    """Создать новый гайд (Только для врачей и админов)"""
    
    if current_user.role not in ["doctor", "superadmin"]:
        raise HTTPException(status_code=403, detail="У вас нет прав выкладывать гайды")

    # 1. Загружаем файл в MongoDB GridFS
    file_id = await fs.upload_from_stream(
        filename=file.filename,
        source=file.file,
        metadata={"content_type": file.content_type}
    )
    
    # 2. Создаем запись о гайде
    new_guide = Guide(
        title=title,
        description=description,
        free_snippet=free_snippet, # Сохраняем сниппет
        price=price,
        mongo_file_id=str(file_id),
        author_id=current_user.id # Привязываем к автору
    )
    db.add(new_guide)
    await db.commit()
    await db.refresh(new_guide)
    
    return new_guide

# --- СКАЧИВАНИЕ ФАЙЛА (Только для купивших) ---
@router.get("/{guide_id}/download")
async def download_guide(
    guide_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Ищем гайд в БД
    result = await db.execute(select(Guide).where(Guide.id == guide_id))
    guide = result.scalars().first()
    if not guide:
        raise HTTPException(status_code=404, detail="Гайд не найден")

    # 2. Проверяем, купил ли пользователь этот гайд
    # (Или если он админ — разрешаем скачивать свои гайды)
    if current_user.role != "admin":
        purchase_query = await db.execute(
            select(Purchase).where(
                Purchase.user_id == current_user.id,
                Purchase.guide_id == guide_id,
                Purchase.status == "succeeded"
            )
        )
        purchase = purchase_query.scalars().first()
        
        if not purchase:
            raise HTTPException(status_code=403, detail="Сначала нужно купить этот гайд!")

    # 3. Скачиваем файл из MongoDB и отдаем пользователю как поток (Stream)
    from bson import ObjectId
    
    try:
        grid_out = await fs.open_download_stream(ObjectId(guide.mongo_file_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Файл физически отсутствует в хранилище")

    filename = quote(guide.title)
    return StreamingResponse(
        grid_out, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}.pdf"}
    )

@router.get("/{guide_id}", response_model=GuideResponse)
async def get_guide(guide_id: int, db: AsyncSession = Depends(get_db)):
    """Получить информацию о конкретном гайде"""
    result = await db.execute(select(Guide).where(Guide.id == guide_id))
    guide = result.scalars().first()
    if not guide:
        raise HTTPException(status_code=404, detail="Гайд не найден")
    return guide