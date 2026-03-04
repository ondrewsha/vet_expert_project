import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import String, Integer, BigInteger, Text, Numeric, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from src.database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    phone: Mapped[str] = mapped_column(String, unique=True, index=True)
    telegram_id: Mapped[Optional[int]] = mapped_column(BigInteger, unique=True, nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="user") # 'user', 'doctor', 'superadmin'
    unused_consultations: Mapped[int] = mapped_column(Integer, default=0) # Баланс отмененных записей
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Связи
    purchases: Mapped[List["Purchase"]] = relationship(back_populates="user")
    appointments: Mapped[List["Appointment"]] = relationship(back_populates="user", foreign_keys="[Appointment.user_id]")
    doctor_appointments: Mapped[List["Appointment"]] = relationship(back_populates="doctor", foreign_keys="[Appointment.doctor_id]")
    comments: Mapped[List["Comment"]] = relationship(back_populates="user")
    likes: Mapped[List["Like"]] = relationship(back_populates="user")
    doctor_profile: Mapped[Optional["DoctorProfile"]] = relationship(back_populates="user")
    authored_guides: Mapped[List["Guide"]] = relationship(back_populates="author")

# Профиль врача (хранит настройки календаря и публичную инфу)
class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Настройки интеграций (теперь они у каждого врача свои!)
    yandex_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    yandex_password: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    telemost_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True) # Активен ли врач
    work_days: Mapped[str] = mapped_column(String, default="0,1,2,3,4,5,6") # 0-Пн, 6-Вс

    user: Mapped["User"] = relationship(back_populates="doctor_profile")

class Guide(Base):
    __tablename__ = "guides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text) # Обязательное описание
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    free_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Бесплатный фрагмент
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    mongo_file_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pdf_filename: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cover_image_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    author: Mapped[Optional["User"]] = relationship(back_populates="authored_guides")
    purchases: Mapped[List["Purchase"]] = relationship(back_populates="guide")
    comments: Mapped[List["Comment"]] = relationship(back_populates="guide")
    likes: Mapped[List["Like"]] = relationship(back_populates="guide")

class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    guide_id: Mapped[int] = mapped_column(ForeignKey("guides.id"))
    yookassa_payment_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String, default="pending") 
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="purchases")
    guide: Mapped["Guide"] = relationship(back_populates="purchases")

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id")) # К какому врачу запись
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="scheduled") # scheduled, completed, canceled
    pet_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pet_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pet_details: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_event_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meet_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    protocol_file_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id], back_populates="appointments")
    doctor: Mapped["User"] = relationship(foreign_keys=[doctor_id], back_populates="doctor_appointments")

    files: Mapped[List["AppointmentFile"]] = relationship(back_populates="appointment", cascade="all, delete-orphan")

class AppointmentFile(Base):
    __tablename__ = "appointment_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"))
    mongo_file_id: Mapped[str] = mapped_column(String)
    filename: Mapped[str] = mapped_column(String)
    
    appointment: Mapped["Appointment"] = relationship(back_populates="files")
    
class Like(Base):
    __tablename__ = "likes"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    guide_id: Mapped[int] = mapped_column(ForeignKey("guides.id"), primary_key=True)
    user: Mapped["User"] = relationship(back_populates="likes")
    guide: Mapped["Guide"] = relationship(back_populates="likes")

class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    guide_id: Mapped[int] = mapped_column(ForeignKey("guides.id"))
    text: Mapped[str] = mapped_column(Text)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True) 
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user: Mapped["User"] = relationship(back_populates="comments")
    guide: Mapped["Guide"] = relationship(back_populates="comments")
