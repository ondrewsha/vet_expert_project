import caldav
from datetime import datetime, timedelta
from src.config import settings

# URL для подключения к Яндексу (стандартный)
CALDAV_URL = "https://caldav.yandex.ru/calendars/"

def get_client():
    if not settings.YANDEX_EMAIL or not settings.YANDEX_PASSWORD:
        return None
    
    # Собираем полный URL с авторизацией
    url = f"https://{settings.YANDEX_EMAIL}:{settings.YANDEX_PASSWORD}@caldav.yandex.ru/calendars/{settings.YANDEX_EMAIL}/events-default/"
    
    try:
        client = caldav.DAVClient(url)
        # Получаем главный календарь
        principal = client.principal()
        calendars = principal.calendars()
        if calendars:
            return calendars[0] # Берем основной календарь
    except Exception as e:
        print(f"❌ Ошибка подключения к CalDAV: {e}")
        return None

def get_busy_slots_yandex(start_date: datetime, end_date: datetime) -> list[tuple[datetime, datetime]]:
    """
    Получает занятые интервалы из Яндекса.
    """
    calendar = get_client()
    if not calendar:
        return []

    # Ищем события в диапазоне
    events = calendar.date_search(start=start_date, end=end_date, expand=True)
    
    busy_slots = []
    for event in events:
        # Парсим iCal формат
        vevent = event.instance.vevent
        
        dtstart = vevent.dtstart.value
        dtend = vevent.dtend.value

        # Приводим всё к datetime без таймзон (naive), чтобы сравнивать проще
        if hasattr(dtstart, "replace"):
            dtstart = dtstart.replace(tzinfo=None)
        if hasattr(dtend, "replace"):
            dtend = dtend.replace(tzinfo=None)
            
        busy_slots.append((dtstart, dtend))
        
    return busy_slots

def create_yandex_event(start_time: datetime, summary: str, description: str):
    """
    Создает событие в Яндекс.Календаре.
    """
    calendar = get_client()
    if not calendar:
        return None

    end_time = start_time + timedelta(hours=1)

    # Создаем событие
    try:
        event = calendar.save_event(
            dtstart=start_time,
            dtend=end_time,
            summary=summary,
            description=description
        )
        return event.url
    except Exception as e:
        print(f"❌ Не удалось создать событие в Яндексе: {e}")
        return None
