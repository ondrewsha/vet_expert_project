import caldav
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

def get_client(email: str, password: str):
    if not email or not password:
        return None
    url = f"https://{email}:{password}@caldav.yandex.ru/calendars/{email}/events-default/"
    try:
        client = caldav.DAVClient(url)
        principal = client.principal()
        calendars = principal.calendars()
        if calendars:
            return calendars[0]
    except Exception as e:
        print(f"❌ Ошибка подключения к CalDAV для {email}: {e}")
        return None

def get_busy_slots_yandex(start_date: datetime, end_date: datetime, email: str, password: str) -> list[tuple[datetime, datetime]]:
    calendar = get_client(email, password)
    if not calendar:
        return[]

    events = calendar.date_search(start=start_date, end=end_date, expand=True)
    moscow_tz = ZoneInfo("Europe/Moscow")
    
    busy_slots =[]
    for event in events:
        vevent = event.instance.vevent
        dtstart = vevent.dtstart.value
        dtend = vevent.dtend.value

        if hasattr(dtstart, "astimezone") and dtstart.tzinfo is not None:
            dtstart = dtstart.astimezone(moscow_tz)
        if hasattr(dtend, "astimezone") and dtend.tzinfo is not None:
            dtend = dtend.astimezone(moscow_tz)

        if hasattr(dtstart, "replace"): dtstart = dtstart.replace(tzinfo=None)
        if hasattr(dtend, "replace"): dtend = dtend.replace(tzinfo=None)
            
        busy_slots.append((dtstart, dtend))
    return busy_slots

def create_yandex_event(start_time: datetime, summary: str, description: str, email: str, password: str):
    calendar = get_client(email, password)
    if not calendar:
        return None
    end_time = start_time + timedelta(hours=1)
    try:
        event = calendar.save_event(
            dtstart=start_time, dtend=end_time, summary=summary, description=description
        )
        return event.url
    except Exception as e:
        print(f"❌ Не удалось создать событие в Яндексе для {email}: {e}")
        return None
