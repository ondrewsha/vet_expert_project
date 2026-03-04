from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, case, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from urllib.parse import quote

from src.database import get_db, fs
from src.models import Guide, User, Purchase, Like, Comment
from src.schemas.schemas import GuideCreate, GuideResponse, GuideDetailResponse, CommentCreate, CommentResponse
from src.core.security import get_current_user, get_current_user_optional
from src.services.pdf_service import generate_guide_pdf

router = APIRouter(prefix="/api/guides", tags=["Guides"])

# --- ПРОСМОТР ВСЕХ ГАЙДОВ (Витрина) ---
@router.get("", response_model=List[GuideResponse])
async def get_active_guides(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    # 1. Достаем гайды
    result = await db.execute(
        select(Guide).where(Guide.is_active == True).order_by(Guide.created_at.desc())
    )
    guides = result.scalars().all()
    
    response = []
    current_user_id = current_user.id if current_user else None

    # Это не супер-оптимально (N+1 запрос), но для MVP пойдет. 
    # В идеале нужно делать join'ы, но это усложнит код sqlalchemy сейчас.
    for g in guides:
        likes_count = await db.scalar(select(func.count()).select_from(Like).where(Like.guide_id == g.id))
        comments_count = await db.scalar(select(func.count()).select_from(Comment).where(Comment.guide_id == g.id))
        
        is_liked = False
        if current_user_id:
             like = await db.scalar(select(Like).where(Like.guide_id == g.id, Like.user_id == current_user_id))
             is_liked = bool(like)
             
        # Превращаем ORM модель в Pydantic схему вручную или через конструктор
        g_resp = GuideResponse.model_validate(g)
        g_resp.likes_count = likes_count
        g_resp.comments_count = comments_count
        g_resp.is_liked = is_liked
        response.append(g_resp)

    return response

# --- ПОЛУЧИТЬ ОДИН ГАЙД (С КОММЕНТАМИ И ЛАЙКАМИ) ---
@router.get("/{guide_id}", response_model=GuideDetailResponse)
async def get_guide(
    guide_id: int, 
    db: AsyncSession = Depends(get_db),
    # Юзер опционален (чтобы видеть гайд могли и гости), 
    # но нужен для поля is_liked. Реализуем хитрый dependency.
):
    # 1. Загружаем гайд с комментариями и их авторами
    query = (
        select(Guide)
        .options(selectinload(Guide.comments).selectinload(Comment.user))
        .where(Guide.id == guide_id)
    )
    result = await db.execute(query)
    guide = result.scalars().first()
    
    if not guide:
        raise HTTPException(status_code=404, detail="Гайд не найден")

    # 2. Считаем лайки
    likes_count_res = await db.execute(select(func.count()).select_from(Like).where(Like.guide_id == guide_id))
    likes_count = likes_count_res.scalar()

    # 3. Формируем красивый ответ
    response = GuideDetailResponse(
        id=guide.id,
        title=guide.title,
        description=guide.description,
        free_snippet=guide.free_snippet,
        price=guide.price,
        mongo_file_id=guide.mongo_file_id,
        cover_image_id=guide.cover_image_id,
        is_active=guide.is_active,
        created_at=guide.created_at,
        author_id=guide.author_id,
        
        likes_count=likes_count,
        comments=[
            CommentResponse(
                id=c.id, 
                text=c.text, 
                user_id=c.user_id, 
                created_at=c.created_at,
                user_name=c.user.full_name or c.user.phone
            ) for c in guide.comments if c.is_approved
        ],
        is_liked=False
    )
    return response

# --- ПРОВЕРКА ЛАЙКА (Отдельный эндпоинт для авторизованных) ---
@router.get("/{guide_id}/check-like", response_model=bool)
async def check_like(guide_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    like = await db.get(Like, (current_user.id, guide_id))
    return bool(like)

# --- СОЗДАНИЕ ГАЙДА ---
@router.post("", response_model=GuideResponse)
async def create_guide(
        title: str = Form(...),
        description: str = Form(...),
        price: float = Form(...),
        free_snippet: str = Form(None),
        content: str = Form(None),
        file: UploadFile = File(None),
        cover: UploadFile = File(None),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
    ):
    if current_user.role not in ["doctor", "superadmin"]:
        raise HTTPException(status_code=403, detail="Нет прав")

    # Обработка PDF
    file_id_str = None
    pdf_filename = None
    
    if content:
        # Генерируем PDF из текста
        author_name = current_user.full_name or "Врач"
        pdf_buffer = generate_guide_pdf(title, author_name, content)
        file_id = await fs.upload_from_stream(
            filename=f"{title}.pdf",
            source=pdf_buffer,
            metadata={"content_type": "application/pdf"}
        )
        file_id_str = str(file_id)
        pdf_filename = f"{title}.pdf"
    elif file:
        # Загружаем готовый PDF
        file_id = await fs.upload_from_stream(
            filename=file.filename,
            source=file.file,
            metadata={"content_type": file.content_type}
        )
        file_id_str = str(file_id)
        pdf_filename = file.filename
    else:
        raise HTTPException(status_code=400, detail="Необходимо прикрепить файл или написать текст гайда")

    cover_id = None
    if cover:
        cover_id = await fs.upload_from_stream(filename=cover.filename, source=cover.file, metadata={"content_type": cover.content_type})
        cover_id = str(cover_id)
    
    new_guide = Guide(
        title=title, description=description, free_snippet=free_snippet, content=content,
        price=price, mongo_file_id=file_id_str, pdf_filename=pdf_filename,
        author_id=current_user.id, cover_image_id=cover_id
    )
    db.add(new_guide)
    await db.commit()
    await db.refresh(new_guide)
    return new_guide

# --- СКАЧИВАНИЕ ---
@router.get("/{guide_id}/download")
async def download_guide(guide_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    guide = await db.get(Guide, guide_id)
    if not guide:
        raise HTTPException(status_code=404, detail="Гайд не найден")

    if current_user.role != "superadmin" and current_user.role != "doctor":
        # Проверяем покупку
        purchase = await db.execute(
            select(Purchase).where(
                Purchase.user_id == current_user.id,
                Purchase.guide_id == guide_id,
                Purchase.status == "succeeded"
            )
        )
        if not purchase.scalars().first():
            raise HTTPException(status_code=403, detail="Сначала купите гайд")

    from bson import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(guide.mongo_file_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Файл не найден")

    filename = quote(guide.title)
    return StreamingResponse(
        grid_out, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}.pdf"}
    )

# --- ЛАЙКНУТЬ / ДИЗЛАЙКНУТЬ ---
@router.post("/{guide_id}/like")
async def toggle_like(guide_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Проверяем, есть ли уже лайк
    existing_like = await db.get(Like, (current_user.id, guide_id))
    
    if existing_like:
        await db.delete(existing_like)
        liked = False
    else:
        new_like = Like(user_id=current_user.id, guide_id=guide_id)
        db.add(new_like)
        liked = True
        
    await db.commit()
    
    # Возвращаем новое количество лайков
    count_res = await db.execute(select(func.count()).select_from(Like).where(Like.guide_id == guide_id))
    return {"liked": liked, "count": count_res.scalar()}

# --- КОММЕНТИРОВАТЬ ---
@router.post("/{guide_id}/comments", response_model=CommentResponse)
async def create_comment(
    guide_id: int, 
    comment_in: CommentCreate, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    guide = await db.get(Guide, guide_id)
    if not guide:
        raise HTTPException(status_code=404, detail="Гайд не найден")
        
    new_comment = Comment(
        user_id=current_user.id,
        guide_id=guide_id,
        text=comment_in.text,
        is_approved=True # Пока без модерации, сразу публикуем
    )
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)
    
    # Костыль для схемы ответа (нужно имя)
    response = CommentResponse.model_validate(new_comment)
    response.user_name = current_user.full_name or current_user.phone
    
    return response

# --- ПОЛУЧЕНИЕ ОБЛОЖКИ ГАЙДА (Открытый доступ) ---
@router.get("/{guide_id}/cover")
async def get_guide_cover(guide_id: int, db: AsyncSession = Depends(get_db)):
    guide = await db.get(Guide, guide_id)
    if not guide or not guide.cover_image_id:
        # Если обложки нет, возвращаем дефолтную картинку (можно просто 404, а фронт покажет иконку)
        raise HTTPException(status_code=404, detail="Обложка не найдена")

    from bson import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(guide.cover_image_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Файл обложки физически отсутствует")

    return StreamingResponse(
        grid_out, 
        media_type="image/jpeg", # GridFS сам отдаст бинарник, браузер поймет
    )

# --- РЕДАКТИРОВАНИЕ ГАЙДА ---
@router.patch("/{guide_id}", response_model=GuideResponse)
async def update_guide(
        guide_id: int,
        title: str = Form(None),
        description: str = Form(None),
        price: float = Form(None),
        free_snippet: str = Form(None),
        content: str = Form(None),
        file: UploadFile = File(None),  # Если передали - обновляем PDF
        cover: UploadFile = File(None), # Если передали - обновляем обложку
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
    ):
    # Ищем гайд
    guide = await db.get(Guide, guide_id)
    if not guide:
        raise HTTPException(status_code=404)
        
    # Проверяем права (редактировать может автор или суперадмин)
    if current_user.role != "superadmin" and guide.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Вы можете редактировать только свои гайды")

    # Обновляем текстовые поля
    if title: guide.title = title
    if description: guide.description = description
    if price is not None: guide.price = price
    if free_snippet is not None: guide.free_snippet = free_snippet
    if content is not None: guide.content = content

    # Если загрузили новый PDF
    if file:
        file_id = await fs.upload_from_stream(filename=file.filename, source=file.file, metadata={"content_type": file.content_type})
        guide.mongo_file_id = str(file_id)
        guide.pdf_filename = file.filename
        guide.content = None
    elif content:
        # Обновили текст, перегенерируем PDF
        author = await db.get(User, guide.author_id)
        author_name = author.full_name or "Врач"
        pdf_buffer = generate_guide_pdf(guide.title, author_name, content)
        file_id = await fs.upload_from_stream(filename=f"{guide.title}.pdf", source=pdf_buffer, metadata={"content_type": "application/pdf"})
        guide.mongo_file_id = str(file_id)
        guide.pdf_filename = f"{guide.title}.pdf"

    # Если загрузили новую обложку
    if cover:
        cover_id = await fs.upload_from_stream(filename=cover.filename, source=cover.file, metadata={"content_type": cover.content_type})
        guide.cover_image_id = str(cover_id)

    await db.commit()
    await db.refresh(guide)
    return guide
