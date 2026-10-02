"""Corpus de auditoría — fase 3: imágenes (PNG/JPG/JPEG) y PDF escaneados a partir de las capturas de Chromium."""
import sys, os, json, random
from PIL import Image, ImageFilter, ImageOps, ImageChops, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas as rlcanvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

OUT = os.path.abspath(sys.argv[1])
C, T = os.path.join(OUT, "corpus"), os.path.join(OUT, "tmp")
VERDAD = json.load(open(os.path.join(OUT, "verdad_fase1.json"), encoding="utf-8"))
# PDF generados por Chromium en render_chromium.js
for _d in [
    {"id": "pdf02", "archivo": "pdf02_factura_chromium.pdf", "cajetilla": "otros", "verdad": "factura", "checks": ["campos_factura", "tabla_lineas"], "mime": "", "nota": "«Imprimir a PDF» de Chrome/Edge"},
    {"id": "pdf04", "archivo": "pdf04_libro_emitidas_chromium.pdf", "cajetilla": "libro_facturas_emitidas", "verdad": "libro", "checks": ["registros"], "mime": "", "nota": "Libro de facturas impreso a PDF desde Chrome (tabla con bordes)"},
    {"id": "pdf06", "archivo": "pdf06_libro_60_filas_multipagina.pdf", "cajetilla": "libro_facturas_emitidas", "verdad": "libro60", "checks": ["registros"], "mime": "", "nota": "60 filas en 2 páginas con la cabecera repetida en cada página"},
]:
    if not any(x["id"] == _d["id"] for x in VERDAD):
        VERDAD.append(_d)


def reg(id_, archivo, cajetilla, verdad, checks=None, mime="", nota=""):
    VERDAD.append({"id": id_, "archivo": archivo, "cajetilla": cajetilla, "verdad": verdad, "checks": checks or [], "mime": mime, "nota": nota})


def recortar(im, margen=40):
    gris = ImageOps.invert(im.convert("L"))
    caja = gris.point(lambda v: 255 if v > 30 else 0).getbbox()
    x0, y0, x1, y1 = caja
    return im.crop((max(0, x0 - margen), max(0, y0 - margen), min(im.width, x1 + margen), min(im.height, y1 + margen)))


fac = recortar(Image.open(os.path.join(T, "factura_2x.png")).convert("RGB"))
lib = recortar(Image.open(os.path.join(T, "libro_2x.png")).convert("RGB"))

fac.save(os.path.join(C, "png01_factura.png"), optimize=True)
reg("png01", "png01_factura.png", "otros", "factura", ["campos_factura", "tabla_lineas"], "image/png",
    f"Captura nítida ({fac.width}×{fac.height} px, ≈190 ppp)")
fac.save(os.path.join(C, "jpg02_factura.jpg"), quality=85)
reg("jpg02", "jpg02_factura.jpg", "otros", "factura", ["campos_factura", "tabla_lineas"], "image/jpeg", "La misma factura en JPEG calidad 85")

random.seed(7)
deg = fac.rotate(1.5, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255))
deg = deg.resize((int(deg.width * 0.62), int(deg.height * 0.62)), Image.LANCZOS)
ruido = Image.effect_noise(deg.size, 28).convert("RGB")
deg = ImageChops.add(ImageChops.multiply(deg, Image.new("RGB", deg.size, (238, 236, 228))), ImageChops.subtract(ruido, Image.new("RGB", deg.size, (110, 110, 110))), 1, -12)
deg = deg.filter(ImageFilter.GaussianBlur(0.7))
deg.save(os.path.join(C, "jpeg03_factura_escaneo_degradado.jpeg"), quality=60)
reg("jpeg03", "jpeg03_factura_escaneo_degradado.jpeg", "otros", "factura", ["campos_factura", "tabla_lineas"], "image/jpeg",
    "Simulación de escaneo malo: inclinación 1,5°, ≈120 ppp, ruido, desenfoque, fondo amarillento, JPEG 60")

lib.save(os.path.join(C, "png04_libro_emitidas.png"), optimize=True)
reg("png04", "png04_libro_emitidas.png", "libro_facturas_emitidas", "libro", ["registros"], "image/png",
    f"Captura del libro de facturas ({lib.width}×{lib.height} px)")

sinb = recortar(Image.open(os.path.join(T, "libro_sin_bordes_2x.png")).convert("RGB"))
sinb.save(os.path.join(C, "png09_libro_sin_bordes.png"))
reg("png09", "png09_libro_sin_bordes.png", "libro_facturas_emitidas", "libro", ["registros"], "image/png",
    "El mismo libro en imagen, tabla SIN líneas de cuadrícula")

baja = fac.resize((int(fac.width * 0.38), int(fac.height * 0.38)), Image.LANCZOS)
baja.save(os.path.join(C, "png05_baja_resolucion.png"))
reg("png05", "png05_baja_resolucion.png", "otros", "factura", ["campos_factura"], "image/png",
    f"Baja resolución ({baja.width}×{baja.height} px, ≈72 ppp: captura de pantalla reducida)")

grande = Image.new("RGB", (4200, 3100), (255, 255, 255))
grande.paste(fac, (100, 100))
grande.save(os.path.join(C, "png06_grande_13mpx.png"), optimize=True)
reg("png06", "png06_grande_13mpx.png", "otros", "error", [{"tipo": "rechazo_controlado", "patron": "(?i)p[ií]xel|grande|megap|l[ií]mite"}], "image/png",
    "4200×3100 = 13,0 Mpx (supera el máximo de 12 Mpx)")

g = fac.convert("L")
alfa = ImageOps.invert(g)
transp = Image.merge("RGBA", (Image.new("L", g.size, 0),) * 3 + (alfa,))
transp.save(os.path.join(C, "png07_fondo_transparente.png"))
reg("png07", "png07_fondo_transparente.png", "otros", "factura", ["campos_factura"], "image/png",
    "Texto negro sobre fondo TRANSPARENTE (PNG con canal alfa, p. ej. exportado desde un programa de diseño)")

fac.rotate(90, expand=True).save(os.path.join(C, "jpg08_rotada_90.jpg"), quality=90)
reg("jpg08", "jpg08_rotada_90.jpg", "otros", "factura", ["campos_factura"], "image/jpeg",
    "Factura girada 90° (escaneo apaisado o foto de móvil sin girar)")

# ---------------- PDF escaneados ----------------
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
pdfmetrics.registerFont(TTFont("DejaVu", FUENTE))


def pdf_imagen(nombre, ruta_img, tam=A4, cabecera=None):
    c = rlcanvas.Canvas(os.path.join(C, nombre), pagesize=tam)
    w, h = tam
    im = Image.open(ruta_img)
    esc = min((w - 40) / im.width, (h - 80) / im.height)
    c.drawImage(ruta_img, 20, h - 40 - im.height * esc, im.width * esc, im.height * esc)
    if cabecera:
        c.setFont("DejaVu", 8)
        c.drawString(20, h - 20, cabecera)
    c.showPage()
    c.save()


pdf_imagen("pdfE1_factura_escaneada.pdf", os.path.join(C, "png01_factura.png"))
reg("pdfE1", "pdfE1_factura_escaneada.pdf", "otros", "factura", ["campos_factura", "tabla_lineas"], "",
    "PDF solo imagen (escáner, ≈200 ppp efectivos)")
pdf_imagen("pdfE2_factura_escaneo_degradado.pdf", os.path.join(C, "jpeg03_factura_escaneo_degradado.jpeg"))
reg("pdfE2", "pdfE2_factura_escaneo_degradado.pdf", "otros", "factura", ["campos_factura", "tabla_lineas"], "",
    "PDF solo imagen con el escaneo degradado")
pdf_imagen("pdfE3_libro_escaneado.pdf", os.path.join(C, "png04_libro_emitidas.png"), tam=landscape(A4))
reg("pdfE3", "pdfE3_libro_escaneado.pdf", "libro_facturas_emitidas", "libro", ["registros"], "", "Libro de facturas escaneado (PDF solo imagen)")
pdf_imagen("pdf09_mixto_sello_digital_mas_imagen.pdf", os.path.join(C, "png01_factura.png"),
           cabecera="Copia auténtica de documento digitalizado · CSV: GEN-1a2b-3c4d-5e6f · Verificable en la sede electrónica")
reg("pdf09", "pdf09_mixto_sello_digital_mas_imagen.pdf", "otros", "factura", ["campos_factura"], "",
    "Factura escaneada con una línea de texto digital añadida (sello de copia auténtica/CSV), caso típico de la sede electrónica")

json.dump(VERDAD, open(os.path.join(OUT, "verdad.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(VERDAD), "documentos en total")
