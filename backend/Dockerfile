FROM python:3.11-slim

WORKDIR /app

# Запрещаем Python писать .pyc файлы и буферизовать stdout/stderr
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Код будет прокидываться через volumes при локальной разработке
COPY . .