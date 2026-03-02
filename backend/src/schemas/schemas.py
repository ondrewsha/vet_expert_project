from pydantic import BaseModel
from typing import List, Optional
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
    user_name: Optional[str] = "Пользователь" # Имя автора
    created_at: datetime

    class Config:
        from_attributes = True

# --- ГАЙДЫ ---
class GuideBase(BaseModel):
    title: str
    description: Optional[str] = None
    free_snippet: Optional[str] = None
    price: float
    is_active: bool = True

class GuideCreate(GuideBase):
    pass

class GuideResponse(GuideBase):
    id: int
    author_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True # Позволяет Pydantic читать данные из моделей SQLAlchemy

class GuideDetailResponse(GuideResponse):
    likes_count: int = 0
    comments: List[CommentResponse] = []
    is_liked: bool = False # Лайкнул ли текущий юзер

# --- ДАННЫЕ ТОКЕНА ---
class TokenData(BaseModel):
    user_id: Optional[str] = None
    role: Optional[str] = None

# --- ПОЛЬЗОВАТЕЛИ ---
class UserResponse(BaseModel):
    id: int
    phone: str
    telegram_id: Optional[int] = None
    full_name: Optional[str] = None
    role: str
    unused_consultations: int

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

class DoctorBasicInfo(BaseModel):
    id: int
    full_name: Optional[str] = None
    
    class Config:
        from_attributes = True

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

# --- ВРАЧИ ---
class DoctorProfileResponse(BaseModel):
    description: Optional[str] = None
    photo_url: Optional[str] = None

    class Config:
        from_attributes = True

class DoctorResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    doctor_profile: Optional[DoctorProfileResponse] = None

    class Config:
        from_attributes = True
