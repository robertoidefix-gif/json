"""Documentos de estrés para las rutas nuevas de la fase F: deben terminar en pocos segundos y avisar de lo que no se hace.

Uso: python3 generar_estres_faseF.py <carpeta_salida>   → <carpeta>/corpus/* y <carpeta>/verdad.json
"""
import sys, os, io, json, re, zipfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import docx
import openpyxl

OUT = sys.argv[1]
C = os.path.join(OUT, "corpus")
os.makedirs(C, exist_ok=True)
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
VERDAD = []


def reg(i, archivo, nota, cajetilla="otros"):
    VERDAD.append({"id": i, "archivo": archivo, "cajetilla": cajetilla, "verdad": "estres", "checks": [], "mime": "", "nota": nota})


# 15.000 rangos combinados de dos filas (más de los 10.000 que se expanden) y uno que cubre toda la columna.
wb = openpyxl.Workbook(write_only=False)
ws = wb.active
ws.append(["Fecha expedición", "Serie", "Número factura", "Base imponible", "Total"])
for k in range(30000):
    ws.append(["2025-01-01", "A" if k % 2 == 0 else None, f"2025/{k:05d}", 100.0, 121.0])
for k in range(15000):
    ws.merge_cells(start_row=2 + 2 * k, start_column=2, end_row=3 + 2 * k, end_column=2)
ws["F2"] = "x"
ws.merge_cells("F2:F1048576")
wb.save(os.path.join(C, "ef_xlsx_15000_combinadas.xlsx"))
reg("efx", "ef_xlsx_15000_combinadas.xlsx", "15.000 rangos combinados y F2:F1048576 en 30.000 filas", cajetilla="libro_facturas_emitidas")


# 300 facturas, una por página.
def muchas_facturas(c):
    for k in range(300):
        c.setFont("DejaVu", 11)
        c.drawString(50, 800, f"Número de factura: B-2025/{k:04d}")
        c.drawString(50, 784, f"Base imponible: {k + 1},00 €")
        c.drawString(50, 768, f"Total factura: {k + 1},21 €")
        c.showPage()


b = io.BytesIO()
cv = canvas.Canvas(b, pagesize=A4)
muchas_facturas(cv)
cv.save()
open(os.path.join(C, "ef_pdf_300_facturas.pdf"), "wb").write(b.getvalue())
reg("efp", "ef_pdf_300_facturas.pdf", "300 facturas, una por página")

# Tabla de 40 páginas en la que cada fila lleva dos líneas de continuación (unas 2.000 candidatas).
b = io.BytesIO()
cv = canvas.Canvas(b, pagesize=A4)
for pag in range(40):
    cv.setFont("DejaVu", 9)
    y = 800
    for x, t in zip([50, 300, 400], ["Concepto", "Cantidad", "Importe"]):
        cv.drawString(x, y, t)
    for fila in range(17):
        y -= 12
        cv.drawString(50, y, f"Concepto {pag}-{fila} con texto")
        cv.drawString(300, y, "1")
        cv.drawString(400, y, f"{fila + 1},00")
        for extra in ("que sigue en otra línea", "y en una tercera"):
            y -= 11
            cv.drawString(50, y, extra)
    cv.showPage()
cv.save()
open(os.path.join(C, "ef_pdf_continuaciones.pdf"), "wb").write(b.getvalue())
reg("efc", "ef_pdf_continuaciones.pdf", "40 páginas de tabla con dos líneas de continuación por fila")

# 20.000 párrafos numerados en tres niveles.
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
d = docx.Document()
d.add_paragraph("x")
bb = io.BytesIO()
d.save(bb)
zin = zipfile.ZipFile(io.BytesIO(bb.getvalue()))
sect = re.search(r"<w:sectPr\b.*?</w:sectPr>", zin.read("word/document.xml").decode(), re.S).group(0)
parr = "".join(f'<w:p><w:pPr><w:numPr><w:ilvl w:val="{k % 3}"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Párrafo {k}</w:t></w:r></w:p>'
               for k in range(20000))
num = ('<w:abstractNum w:abstractNumId="1">' + "".join(
    f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="{f}"/><w:lvlText w:val="{t}"/></w:lvl>'
    for i, f, t in [(0, "decimal", "%1."), (1, "decimal", "%1.%2."), (2, "lowerRoman", "%3)")]) +
    '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>')
salida = io.BytesIO()
with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
    for info in zin.infolist():
        datos = zin.read(info.filename)
        if info.filename == "word/document.xml":
            datos = f'<?xml version="1.0" encoding="UTF-8"?><w:document {W}><w:body>{parr}{sect}</w:body></w:document>'.encode()
        elif info.filename == "word/numbering.xml":
            datos = f'<?xml version="1.0" encoding="UTF-8"?><w:numbering {W}>{num}</w:numbering>'.encode()
        z.writestr(info, datos)
open(os.path.join(C, "ef_docx_20000_numerados.docx"), "wb").write(salida.getvalue())
reg("efd", "ef_docx_20000_numerados.docx", "20.000 párrafos numerados en tres niveles")

json.dump(VERDAD, open(os.path.join(OUT, "verdad.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(VERDAD), "casos en", OUT)
