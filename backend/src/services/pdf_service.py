import io
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# Регистрация шрифтов
font_path_regular = os.path.join(os.path.dirname(__file__), '..', 'fonts', 'Arial.ttf')
font_path_bold = os.path.join(os.path.dirname(__file__), '..', 'fonts', 'Arial-Bold.ttf')

try:
    pdfmetrics.registerFont(TTFont('Arial', font_path_regular))
    pdfmetrics.registerFont(TTFont('Arial-Bold', font_path_bold))
    pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold')
except Exception as e:
    print(f"ОШИБКА ШРИФТОВ: {e}")

# Стили для документов
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='RuNormal', fontName='Arial', fontSize=11, leading=16, alignment=TA_JUSTIFY))
styles.add(ParagraphStyle(name='RuHeading1', fontName='Arial-Bold', fontSize=18, leading=22, spaceAfter=15, textColor=colors.HexColor('#10b981')))
styles.add(ParagraphStyle(name='RuHeading2', fontName='Arial-Bold', fontSize=14, leading=18, spaceBefore=10, spaceAfter=10))
styles.add(ParagraphStyle(name='RuCenterTitle', fontName='Arial-Bold', fontSize=24, leading=28, spaceAfter=20, alignment=TA_CENTER))
styles.add(ParagraphStyle(name='RuSubtitle', fontName='Arial', fontSize=14, leading=18, spaceAfter=40, alignment=TA_CENTER, textColor=colors.gray))

def generate_protocol_pdf(doctor_name, client_name, date_str, pet_name, pet_details, complaints, diagnosis, recommendations):
    buffer = io.BytesIO()
    # Отступы страницы
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    story =[]

    # Заголовок
    story.append(Paragraph("ЗооМедика", styles['RuHeading1']))
    story.append(Paragraph("ПРОТОКОЛ ВЕТЕРИНАРНОЙ ОНЛАЙН-КОНСУЛЬТАЦИИ", styles['RuHeading2']))
    story.append(Spacer(1, 0.5*cm))

    # Таблица данных (для красивого выравнивания)
    data = [
        [Paragraph("<b>Дата приема:</b>", styles['RuNormal']), Paragraph(date_str, styles['RuNormal'])],[Paragraph("<b>Ветеринарный врач:</b>", styles['RuNormal']), Paragraph(doctor_name, styles['RuNormal'])],
        [Paragraph("<b>Клиент:</b>", styles['RuNormal']), Paragraph(client_name, styles['RuNormal'])],
        [Paragraph("<b>Кличка питомца:</b>", styles['RuNormal']), Paragraph(pet_name, styles['RuNormal'])],[Paragraph("<b>Данные питомца:</b>", styles['RuNormal']), Paragraph(pet_details, styles['RuNormal'])],
    ]
    
    t = Table(data, colWidths=[5*cm, 12*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f9fafb')),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.black),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#e5e7eb')),
    ]))
    story.append(t)
    story.append(Spacer(1, 1*cm))

    # Блок: Жалобы
    story.append(Paragraph("Жалобы пациента (анамнез):", styles['RuHeading2']))
    # Меняем переносы строк на теги <br/> для ReportLab
    complaints_formatted = str(complaints).replace('\n', '<br/>')
    story.append(Paragraph(complaints_formatted, styles['RuNormal']))
    story.append(Spacer(1, 0.5*cm))

    # Блок: Диагноз
    story.append(Paragraph("Предварительный диагноз:", styles['RuHeading2']))
    diag_formatted = str(diagnosis).replace('\n', '<br/>')
    story.append(Paragraph(diag_formatted, styles['RuNormal']))
    story.append(Spacer(1, 0.5*cm))

    # Блок: Рекомендации
    story.append(Paragraph("Рекомендации и назначения:", styles['RuHeading2']))
    rec_formatted = str(recommendations).replace('\n', '<br/>')
    story.append(Paragraph(rec_formatted, styles['RuNormal']))

    # Сборка документа
    doc.build(story)
    buffer.seek(0)
    return buffer

def generate_guide_pdf(title, author_name, content):
    """Генерация PDF для гайда, написанного на сайте"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2.5*cm, leftMargin=2.5*cm, topMargin=3*cm, bottomMargin=3*cm)
    story =[]

    # Очистка HTML от Tiptap для ReportLab Paragraph
    # ReportLab понимает <b>, <i>, <u>, <br/>. 
    # Заменяем <p> на переносы, убираем <ul> и превращаем <li> в буллиты.
    clean_content = content.replace('<p>', '').replace('</p>', '<br/>')
    clean_content = clean_content.replace('<ul>', '').replace('</ul>', '')
    clean_content = clean_content.replace('<li>', ' • ').replace('</li>', '<br/>')

    # Титульный лист
    story.append(Spacer(1, 5*cm))
    story.append(Paragraph(title, styles['RuCenterTitle']))
    story.append(Paragraph(f"Автор: {author_name}", styles['RuSubtitle']))
    story.append(Paragraph("Эксклюзивно на платформе ЗооМедика", styles['RuSubtitle']))
    
    # Разрыв страницы
    story.append(PageBreak())
    story.append(Spacer(1, 4*cm))

    # Основной текст (разбиваем по абзацам)
    # Разбиваем по <br/> и рисуем
    parts = clean_content.split('<br/>')
    for text in parts:
        if text.strip():
            story.append(Paragraph(text, styles['RuNormal']))
            story.append(Spacer(1, 0.2*cm))

    doc.build(story)
    buffer.seek(0)
    return buffer
