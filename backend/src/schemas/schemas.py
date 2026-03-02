from pydantic import BaseModel
from typing import Optional
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

# --- ГАЙДЫ ---
class GuideBase(BaseModel):
    title: str
    description: Optional[str] = None
    price: float
    is_active: bool = True

class GuideCreate(GuideBase):
    pass

class GuideResponse(GuideBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True # Позволяет Pydantic читать данные из моделей SQLAlchemy

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
    pass

class AppointmentResponse(AppointmentBase):
    id: int
    end_time: datetime
    status: str
    meet_link: Optional[str] = None
    rating: Optional[int] = None

    class Config:
        from_attributes = True
