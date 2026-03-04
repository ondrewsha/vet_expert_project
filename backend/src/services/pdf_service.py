import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

def generate_protocol_pdf(doctor_name, client_name, date_str, pet_name, pet_details, complaints, diagnosis, recommendations):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    
    try:
        pdfmetrics.registerFont(TTFont('Arial', 'src/fonts/Arial.ttf'))
        pdfmetrics.registerFont(TTFont('Arial-Bold', 'src/fonts/Arial-Bold.ttf'))
    except:
        pass
        
    # --- ВЕРСТКА ---
    width, height = A4
    
    # Заголовок
    c.setFont("Arial-Bold", 16)
    c.drawString(2*cm, height - 2*cm, "VetExpert - Протокол консультации")
    
    c.setFont("Arial", 12)
    c.drawString(2*cm, height - 3*cm, f"Дата: {date_str}")
    c.drawString(2*cm, height - 3.5*cm, f"Врач: {doctor_name}")
    
    c.line(2*cm, height - 4*cm, width - 2*cm, height - 4*cm)
    
    # Данные пациента
    y = height - 5*cm
    c.drawString(2*cm, y, f"Клиент: {client_name}")
    y -= 0.6*cm
    c.drawString(2*cm, y, f"Имя питомца: {pet_name}")
    y -= 0.6*cm
    c.drawString(2*cm, y, f"Детали: {pet_details}")
    
    y -= 1*cm
    c.setFont("Arial-Bold", 12)
    c.drawString(2*cm, y, "Жалобы:")
    c.setFont("Arial", 12)
    y -= 0.6*cm
    # Тут надо делать перенос строк (textObject), но для MVP просто рисуем
    c.drawString(2*cm, y, complaints[:90] + "..." if len(complaints)>90 else complaints)
    
    y -= 1.5*cm
    c.setFont("Arial-Bold", 12)
    c.drawString(2*cm, y, "ДИАГНОЗ:")
    c.setFont("Arial", 12)
    y -= 0.6*cm
    c.drawString(2*cm, y, diagnosis)
    
    y -= 1.5*cm
    c.setFont("Arial-Bold", 12)
    c.drawString(2*cm, y, "РЕКОМЕНДАЦИИ:")
    c.setFont("Arial", 12)
    y -= 0.6*cm
    
    # Простой перенос строк
    text_obj = c.beginText(2*cm, y)
    for line in recommendations.split('\n'):
        text_obj.textLine(line)
    c.drawText(text_obj)
    
    # Футер
    c.setFont("Arial", 10)
    c.drawString(2*cm, 2*cm, "Этот документ сгенерирован автоматически системой VetExpert")
    
    c.showPage()
    c.save()
    
    buffer.seek(0)
    return buffer
