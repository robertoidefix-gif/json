"""Casos de la fase E (E1: orientación e inclinación; E2: texto pequeño) con su verdad.

Uso: python3 generar_casos_faseE.py <carpeta_salida> <carpeta_corpus_auditoria>
Crea <carpeta_salida>/corpus/* y <carpeta_salida>/verdad.json a partir de png01 (factura) y png09 (libro sin
cuadrícula) del corpus de la auditoría. Todos los giros son de PIL: rotate(g) gira g grados EN SENTIDO CONTRARIO a
las agujas del reloj, así que para enderezarla hay que girar esos mismos g grados en el sentido de las agujas
(giro esperado = g).
"""
import sys, os, io, json
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

OUT, CORPUS = sys.argv[1:3]
C = os.path.join(OUT, "corpus")
os.makedirs(C, exist_ok=True)
VERDAD = []
FACTURA = Image.open(os.path.join(CORPUS, "png01_factura.png")).convert("RGB")
LIBRO = Image.open(os.path.join(CORPUS, "png09_libro_sin_bordes.png")).convert("RGB")
IMPORTES = {"base_imponible": 1354.6, "cuota_iva": 284.47, "total": 1639.07}
LINEAS = ["Número de factura: A-2025/0157", "NIF emisor: B12345674", "Total factura: 1.639,07 €"]
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def reg(i, archivo, nota, esperado, cajetilla="otros"):
    VERDAD.append({"id": i, "archivo": archivo, "cajetilla": cajetilla, "verdad": "faseE", "checks": [], "mime": "",
                   "nota": nota, "esperado": esperado})


def factura_esperada(**extra):
    return {"importes": IMPORTES, "contiene": LINEAS, **extra}


# ---------------------------------------------------------------- E1: los cuatro giros de una factura
for g in (90, 180, 270):
    FACTURA.rotate(g, expand=True).save(os.path.join(C, f"e1_factura_r{g}.png"))
    reg(f"e1r{g}", f"e1_factura_r{g}.png", f"Factura girada {g}° a la izquierda: hay que girarla {g}° a la derecha",
        factura_esperada(aviso="OCR_ROTATED", giro=g))
FACTURA.save(os.path.join(C, "e1_factura_derecha.png"))
reg("e1r0", "e1_factura_derecha.png", "La misma factura derecha: no se gira ni se avisa",
    factura_esperada(sin_aviso=["OCR_ROTATED", "OCR_DESKEWED", "OCR_UPSCALED"]))

# Libro sin cuadrícula girado 90° (tabla de 9 columnas: no debe confundirse con texto vertical al revés).
LIBRO.rotate(90, expand=True).save(os.path.join(C, "e1_libro_r90.png"))
reg("e1lib", "e1_libro_r90.png", "Libro de facturas (tabla sin líneas) girado 90°",
    {"aviso": "OCR_ROTATED", "giro": 90, "contiene": ["2025/0101", "B87654323", "Ferretería Núñez, S.L."], "tabla_filas": 12},
    cajetilla="libro_facturas_emitidas")

# ---------------------------------------------------------------- E1: inclinación (escaneo torcido)
for grados, nombre in ((3, "e1_inclinada_3.png"), (-2, "e1_inclinada_menos2.png")):
    FACTURA.rotate(grados, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255)).save(os.path.join(C, nombre))
    reg(f"e1i{grados}", nombre, f"Factura torcida {grados}° (escaneo)", factura_esperada(aviso="OCR_DESKEWED", grados=-grados))

# ---------------------------------------------------------------- E1: foto con la orientación EXIF
# Los píxeles van girados 90° a la izquierda y la etiqueta EXIF Orientation = 6 dice que hay que girarla 90° a la derecha
# para verla: el navegador (y Tesseract) ya la ven derecha. No debe girarse otra vez.
exif = Image.Exif()
exif[0x0112] = 6
FACTURA.rotate(90, expand=True).save(os.path.join(C, "e1_exif6.jpg"), quality=92, exif=exif.tobytes())
reg("e1exif", "e1_exif6.jpg", "Foto con EXIF Orientation 6 (el visor la gira): ya se ve derecha, no hay que girarla "
    "(antes de la fase E se rechazaba como «dañada»: ancho y alto cambiados respecto a la cabecera)",
    factura_esperada(sin_aviso=["OCR_ROTATED"]))

# ---------------------------------------------------------------- E1: casos que NO deben girarse
img = Image.new("RGB", (1200, 800), (255, 255, 255))
d = ImageDraw.Draw(img)
for k in range(0, 800, 4):
    d.line([(0, k), (1200, k)], fill=(255 - k // 4, 200, 120 + k // 8))
d.ellipse([300, 200, 700, 600], fill=(30, 60, 150))
img.save(os.path.join(C, "e1_sin_texto.png"))
reg("e1sin", "e1_sin_texto.png", "Imagen sin texto (degradado y un círculo): ni se gira ni se amplía, y no falla",
    {"sin_aviso": ["OCR_ROTATED", "OCR_DESKEWED", "OCR_UPSCALED"], "estado": ["complete", "partial"]})

img = Image.new("RGB", (1400, 900), (255, 255, 255))
ImageDraw.Draw(img).text((120, 400), "Total factura: 1.639,07 €", font=ImageFont.truetype(FUENTE, 34), fill=(0, 0, 0))
img.save(os.path.join(C, "e1_poco_texto.png"))
reg("e1poco", "e1_poco_texto.png", "Una sola línea de texto en una imagen grande: no hay datos para girar",
    {"contiene": ["Total factura: 1.639,07 €"], "sin_aviso": ["OCR_ROTATED"]})

sello = Image.new("RGB", (60, 520), (255, 255, 255))
capa = Image.new("RGB", (520, 60), (255, 255, 255))
ImageDraw.Draw(capa).text((10, 15), "COPIA AUTÉNTICA · CSV 12345", font=ImageFont.truetype(FUENTE, 22), fill=(150, 0, 0))
sello.paste(capa.rotate(90, expand=True), (0, 0))
conmargen = Image.new("RGB", (FACTURA.width + 80, FACTURA.height), (255, 255, 255))
conmargen.paste(FACTURA, (80, 0))
conmargen.paste(sello, (10, 200))
conmargen.save(os.path.join(C, "e1_sello_vertical.png"))
reg("e1sello", "e1_sello_vertical.png", "Factura derecha con un sello en vertical en el margen: no se gira",
    factura_esperada(sin_aviso=["OCR_ROTATED"]))

# Factura con un código de barras grande (barras verticales): las barras no son texto en vertical, no se gira.
import random
random.seed(7)
barras = Image.new("RGB", (FACTURA.width, FACTURA.height + 260), (255, 255, 255))
barras.paste(FACTURA, (0, 0))
db = ImageDraw.Draw(barras)
x = 120
while x < FACTURA.width - 120:
    ancho = random.choice((2, 3, 4, 6))
    if random.random() < 0.55:
        db.rectangle([x, FACTURA.height + 30, x + ancho - 1, FACTURA.height + 230], fill=(0, 0, 0))
    x += ancho + random.choice((2, 3, 4))
barras.save(os.path.join(C, "e1_codigo_barras.png"))
reg("e1barras", "e1_codigo_barras.png", "Factura derecha con un código de barras grande debajo: no se gira",
    factura_esperada(sin_aviso=["OCR_ROTATED"]))

# ---------------------------------------------------------------- E2: texto pequeño
pequena = FACTURA.resize((round(FACTURA.width * 0.32), round(FACTURA.height * 0.32)), Image.LANCZOS)
pequena.save(os.path.join(C, "e2_pequena.png"))
reg("e2peq", "e2_pequena.png", f"Captura reducida al 32 % ({pequena.width}×{pequena.height} px, líneas de unos 7 px)",
    factura_esperada(aviso="OCR_UPSCALED"))
pequena.rotate(270, expand=True).save(os.path.join(C, "e2_pequena_r270.png"))
reg("e2peqr", "e2_pequena_r270.png", "La captura reducida y girada 90° a la derecha: se gira (270°) y se amplía",
    factura_esperada(aviso="OCR_UPSCALED", aviso2="OCR_ROTATED", giro=270))
# Imagen grande con letra pequeña: la ampliación tiene que quedarse dentro del máximo de píxeles (12 Mpx).
grande = Image.new("RGB", (3600, 2200), (255, 255, 255))
grande.paste(pequena, (100, 100))
grande.paste(pequena, (1900, 1200))
grande.save(os.path.join(C, "e2_grande_letra_pequena.png"))
reg("e2tope", "e2_grande_letra_pequena.png", "3600×2200 px con letra pequeña: la ampliación se limita a 12 Mpx (×1,23 como mucho: √(12 / 7,92))",
    {"aviso": "OCR_UPSCALED", "escala_maxima": 1.24, "contiene": ["NIF emisor: B12345674"]})


# ---------------------------------------------------------------- PDF escaneados
def pdf_con_imagen(nombre, imagen):
    ruta = os.path.join(OUT, "_tmp.png")
    imagen.save(ruta)
    c = canvas.Canvas(os.path.join(C, nombre), pagesize=A4)
    w, h = A4
    esc = min((w - 40) / imagen.width, (h - 80) / imagen.height)
    c.drawImage(ruta, 20, h - 40 - imagen.height * esc, imagen.width * esc, imagen.height * esc)
    c.showPage()
    c.save()
    os.remove(ruta)


pdf_con_imagen("e1_pdf_r90.pdf", FACTURA.rotate(90, expand=True))
reg("e1pdf", "e1_pdf_r90.pdf", "PDF escaneado con la factura girada 90° en una página vertical",
    factura_esperada(aviso="OCR_ROTATED", giro=90))
pdf_con_imagen("e1_pdf_inclinada.pdf", FACTURA.rotate(2.5, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255)))
reg("e1pdfi", "e1_pdf_inclinada.pdf", "PDF escaneado torcido 2,5°", factura_esperada(aviso="OCR_DESKEWED", grados=-2.5))
pdf_con_imagen("e1_pdf_r180.pdf", FACTURA.rotate(180, expand=True))
reg("e1pdf180", "e1_pdf_r180.pdf", "PDF escaneado del revés", factura_esperada(aviso="OCR_ROTATED", giro=180))

json.dump(VERDAD, open(os.path.join(OUT, "verdad.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(VERDAD), "casos en", OUT)
