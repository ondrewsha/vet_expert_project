from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# --- АВТОРИЗАЦИЯ ---
class SendCodeRequest(BaseModel):
    phone: str

class VerifyCodeRequest(BaseModel):
    phone: str
    code: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# --- КОММЕНТАРИИ И ЛАЙКИ ---
class CommentBase(BaseModel):
    text: str

class CommentCreate(CommentBase):
    pass

class CommentResponse(CommentBase):
    id: int
    user_id: int
    user_name: Optional[str] = "Пользователь"
    created_at: datetime

    class Config:
        from_attributes = True

# --- ГАЙДЫ ---
class GuideBase(BaseModel):
    title: str
    description: str
    free_snippet: Optional[str] = None
    price: float
    is_active: bool = True

class GuideCreate(GuideBase):
    pass

class GuideResponse(GuideBase):
    id: int
    author_id: Optional[int] = None
    created_at: datetime
    cover_image_id: Optional[str] = None
    mongo_file_id: Optional[str] = None
    pdf_filename: Optional[str] = None

    class Config:
        from_attributes = True

class GuideDetailResponse(GuideResponse):
    likes_count: int = 0
    comments: List[CommentResponse] =[]
    is_liked: bool = False

# --- ДАННЫЕ ТОКЕНА ---
class TokenData(BaseModel):
    user_id: Optional[str] = None
    role: Optional[str] = None

# --- ВРАЧИ (Профиль) ---
class DoctorProfileResponse(BaseModel):
    description: Optional[str] = None
    photo_url: Optional[str] = None
    work_days: Optional[str] = None
    is_active: bool = True
    telemost_link: Optional[str] = None # Ссылку полезно видеть и клиенту (теоретически)

    class Config:
        from_attributes = True

# Полная инфа для Админа (с паролями)
class DoctorProfileAdminResponse(DoctorProfileResponse):
    yandex_email: Optional[str] = None
    yandex_password: Optional[str] = None

class DoctorBasicInfo(BaseModel):
    id: int
    full_name: Optional[str] = None
    
    class Config:
        from_attributes = True

# Обычный ответ (для списка записи)
class DoctorResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    phone: Optional[str] = None # Добавим телефон, может пригодиться
    doctor_profile: Optional[DoctorProfileResponse] = None

    class Config:
        from_attributes = True

# Ответ для Админки (с полным профилем)
class DoctorAdminResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    phone: str
    doctor_profile: Optional[DoctorProfileAdminResponse] = None

    class Config:
        from_attributes = True

# --- ПОЛЬЗОВАТЕЛИ ---
class UserResponse(BaseModel):
    id: int
    phone: str
    telegram_id: Optional[int] = None
    full_name: Optional[str] = None
    role: str
    unused_consultations: int
    doctor_profile: Optional[DoctorProfileResponse] = None # <--- ИСПРАВЛЕНИЕ ТУТ

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    telegram_id: Optional[int] = None
    phone: Optional[str] = None

# --- ЗАПИСИ НА КОНСУЛЬТАЦИЮ ---
class AppointmentBase(BaseModel):
    start_time: datetime
    pet_info: Optional[str] = None

class AppointmentCreate(AppointmentBase):
    doctor_id: Optional[int] = None

class AppointmentResponse(AppointmentBase):
    id: int
    end_time: datetime
    status: str
    meet_link: Optional[str] = None
    rating: Optional[int] = None
    google_event_id: Optional[str] = None
    doctor: Optional[DoctorBasicInfo] = None

    class Config:
        from_attributes = True

class RatingUpdate(BaseModel):
    rating: int

class BlockSlotRequest(BaseModel):
    start_time: datetime
    duration_minutes: int = 60

class DoctorDayScheduleResponse(BaseModel):
    time: str
    state: str 
    appt_id: Optional[int] = None

class ManageBlocksRequest(BaseModel):
    date: str
    to_block: List[str]
    to_unblock: List[str]