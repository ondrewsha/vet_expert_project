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
    
    # 1. ЗАЩИТА: Описание в ЮKassa не может быть длиннее 128 символов
    safe_description = description[:128]
    
    # 2. ЗАЩИТА: Строго форматируем сумму до 2 знаков после запятой (иначе будет 400 ошибка)
    safe_amount = f"{amount:.2f}"
    
    # 3. ЗАЩИТА: Значения в metadata не могут превышать 512 символов
    safe_metadata = {}
    for k, v in metadata.items():
        safe_metadata[k] = str(v)[:500]
    
    def _create():
        try:
            return Payment.create({
                "amount": {
                    "value": safe_amount,
                    "currency": "RUB"
                },
                # "payment_method_data": {
                #     "type": "sbp"
                # },
                "confirmation": {
                    "type": "redirect",
                    "return_url": return_url # Куда вернуть юзера после оплаты
                },
                "capture": True, 
                "description": safe_description,
                "metadata": safe_metadata 
            }, idempotence_key)
        except Exception as e:
            # МАГИЯ: Печатаем настоящую причину ошибки от ЮKassa!
            if hasattr(e, 'response') and hasattr(e.response, 'text'):
                print("\n" + "="*50)
                print(f"❌ ЮKASSA ERROR DETAIL: {e.response.text}")
                print("="*50 + "\n")
            raise e
    
    payment = await run_in_threadpool(_create)
    return payment.confirmation.confirmation_url
