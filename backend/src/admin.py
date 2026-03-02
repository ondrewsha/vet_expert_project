from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import engine, async_session_maker
from src.models import User, Guide, Appointment, DoctorProfile, Purchase
from src.core.security import ALGORITHM, settings
from jose import jwt, JWTError

# --- ЛОГИКА АВТОРИЗАЦИИ ДЛЯ АДМИНКИ ---
class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        phone = form.get("username") # Будем вводить телефон
        code = form.get("password")  # И код из ТГ (как пароль)
        
        # Проверяем код в Redis (логика похожа на обычный логин)
        import redis.asyncio as aioredis
        redis_client = aioredis.Redis(host=settings.REDIS_HOST, port=settings.REDIS_PORT, decode_responses=True)
        saved_code = await redis_client.get(f"auth:{phone}")
        
        if not saved_code or saved_code != code:
            return False
            
        # Ищем юзера и проверяем его роль
        async with async_session_maker() as session:
            result = await session.execute(select(User).where(User.phone == phone))
            user = result.scalars().first()
            
            if not user or user.role not in ["admin", "superadmin", "doctor"]:
                return False
                
            # Код верный и роль подходит. Сохраняем ID в сессию админки
            request.session.update({"admin_user_id": str(user.id), "admin_role": user.role})
            await redis_client.delete(f"auth:{phone}")
            return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return "admin_user_id" in request.session

authentication_backend = AdminAuth(secret_key=settings.SECRET_KEY)

# --- ПРЕДСТАВЛЕНИЯ ТАБЛИЦ (ВЬЮХИ) ---

class UserAdmin(ModelView, model=User):
    column_list =[User.id, User.phone, User.full_name, User.role, User.unused_consultations]
    column_searchable_list =[User.phone, User.full_name]
    column_sortable_list =[User.id, User.created_at]
    can_create = False # Юзеры создаются сами
    name = "Пользователь"
    name_plural = "Пользователи"
    icon = "fa-solid fa-users"

    # Врач не может редактировать пользователей, суперадмин может
    def is_accessible(self, request: Request) -> bool:
        return request.session.get("admin_role") == "superadmin"

class DoctorProfileAdmin(ModelView, model=DoctorProfile):
    column_list =[DoctorProfile.id, DoctorProfile.user, DoctorProfile.telemost_link]
    name = "Профиль врача"
    name_plural = "Профили врачей"
    icon = "fa-solid fa-user-doctor"

    def is_accessible(self, request: Request) -> bool:
        return request.session.get("admin_role") == "superadmin"

class GuideAdmin(ModelView, model=Guide):
    column_list =[Guide.id, Guide.title, Guide.price, Guide.is_active, Guide.author]
    column_searchable_list = [Guide.title]
    name = "Гайд"
    name_plural = "Гайды"
    icon = "fa-solid fa-book"

    # Врач видит только свои гайды, суперадмин - все
    def get_query(self, request: Request):
        query = super().get_query(request)
        if request.session.get("admin_role") == "superadmin":
            return query
        return query.where(Guide.author_id == int(request.session.get("admin_user_id")))

class AppointmentAdmin(ModelView, model=Appointment):
    column_list =[Appointment.id, Appointment.start_time, Appointment.status, Appointment.user, Appointment.doctor]
    column_sortable_list =[Appointment.start_time]
    column_searchable_list = [Appointment.pet_info]
    name = "Запись на прием"
    name_plural = "Записи на прием"
    icon = "fa-solid fa-calendar-check"

    # Врач видит только свои записи
    def get_query(self, request: Request):
        query = super().get_query(request)
        if request.session.get("admin_role") == "superadmin":
            return query
        return query.where(Appointment.doctor_id == int(request.session.get("admin_user_id")))

class PurchaseAdmin(ModelView, model=Purchase):
    column_list =[Purchase.id, Purchase.guide, Purchase.user, Purchase.amount, Purchase.status]
    can_create = False
    can_edit = False
    name = "Покупка"
    name_plural = "Покупки"
    icon = "fa-solid fa-money-bill"

    def is_accessible(self, request: Request) -> bool:
        return request.session.get("admin_role") == "superadmin"

# Функция для подключения админки к приложению FastAPI
def setup_admin(app):
    # Добавляем middleware для сессий, он нужен для AdminAuth
    from starlette.middleware.sessions import SessionMiddleware
    app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)
    
    admin = Admin(app, engine, authentication_backend=authentication_backend, title="VetExpert Бэк-офис")
    
    # Регистрируем наши вьюхи
    admin.add_view(UserAdmin)
    admin.add_view(DoctorProfileAdmin)
    admin.add_view(GuideAdmin)
    admin.add_view(AppointmentAdmin)
    admin.add_view(PurchaseAdmin)
