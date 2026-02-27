import uuid
from yookassa import Configuration, Payment
from starlette.concurrency import run_in_threadpool
from src.config import settings

# Инициализируем ЮKassa
Configuration.account_id = settings.YOOKASSA_SHOP_ID
Configuration.secret_key = settings.YOOKASSA_SECRET_KEY

async def create_payment_url(amount: float, description: str, metadata: dict, return_url: str) -> str:
    """
    Создает платеж в ЮKassa и возвращает ссылку на страницу оплаты.
    """
    # Ключ идемпотентности (чтобы не создать два одинаковых платежа при сбое сети)
    idempotence_key = str(uuid.uuid4())
    
    # Оборачиваем синхронный код ЮKassa в функцию
    def _create():
        return Payment.create({
            "amount": {
                "value": str(amount),
                "currency": "RUB"
            },
            "confirmation": {
                "type": "redirect",
                "return_url": return_url # Куда вернуть юзера после оплаты
            },
            "capture": True, # Автоматически забирать деньги (без холдирования)
            "description": description,
            "metadata": metadata # Скрытые данные (кто платит и за что)
        }, idempotence_key)
    
    # Запускаем в пуле потоков, чтобы не блокировать асинхронный FastAPI
    payment = await run_in_threadpool(_create)
    return payment.confirmation.confirmation_url