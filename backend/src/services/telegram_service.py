import httpx
from src.config import settings

async def send_telegram_message(chat_id: str, text: str):
    """
    Отправляет сообщение в Telegram через официальный API.
    """
    if not settings.TG_BOT_TOKEN or not chat_id:
        print("⚠️ Настройки Telegram не заданы, сообщение не отправлено.")
        return

    url = f"https://api.telegram.org/bot{settings.TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML" # Можно использовать жирный шрифт и т.д.
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                print(f"❌ Ошибка отправки в ТГ: {response.text}")
        except Exception as e:
            print(f"❌ Ошибка соединения с ТГ: {e}")