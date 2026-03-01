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
    role: Mapped[str] = mapped_column(String, default="user") # 'user' или 'admin'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Связи (чтобы легко получать гайды юзера: user.purchases)
    purchases: Mapped[List["Purchase"]] = relationship(back_populates="user")
    appointments: Mapped[List["Appointment"]] = relationship(back_populates="user")
    comments: Mapped[List["Comment"]] = relationship(back_populates="user")
    likes: Mapped[List["Like"]] = relationship(back_populates="user")

class Guide(Base):
    __tablename__ = "guides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Бесплатный кусок
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    mongo_file_id: Mapped[Optional[str]] = mapped_column(String, nullable=True) # ID PDF файла в Mongo GridFS
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

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
    status: Mapped[str] = mapped_column(String, default="pending") # pending, succeeded, canceled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="purchases")
    guide: Mapped["Guide"] = relationship(back_populates="purchases")

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="scheduled") # scheduled, completed, canceled
    pet_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    google_event_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meet_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="appointments")

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
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True) # Для модерации
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="comments")
    guide: Mapped["Guide"] = relationship(back_populates="comments")