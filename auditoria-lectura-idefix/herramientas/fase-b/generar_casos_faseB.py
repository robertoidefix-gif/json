"""Casos sintéticos de la fase B (bordes de B1, B2 y B3) con su verdad. No sustituyen al corpus de la auditoría.

Uso: python3 generar_casos_faseB.py <png01_factura.png> <carpeta_salida>
Crea <carpeta_salida>/corpus/*.{xlsx,html,pdf} y <carpeta_salida>/verdad.json (mismo formato que el corpus).
"""
import sys, os, io, json, zipfile
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

PNG, OUT = sys.argv[1:3]
C = os.path.join(OUT, "corpus")
os.makedirs(C, exist_ok=True)
VERDAD = []


def reg(i, archivo, cajetilla, nota, esperado):
    VERDAD.append({"id": i, "archivo": archivo, "cajetilla": cajetilla, "verdad": "faseB", "checks": [], "mime": "",
                   "nota": nota, "esperado": esperado})


# ---------------------------------------------------------------- B3: XLSX con r presente, ausente y no válida
def xlsx(nombre, sheet_xml, cadenas):
    sst = "".join(f"<si><t>{c}</t></si>" for c in cadenas)
    partes = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
        "xl/sharedStrings.xml": f'<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{sst}</sst>',
        "xl/worksheets/sheet1.xml": '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{sheet_xml}</sheetData></worksheet>",
    }
    with zipfile.ZipFile(os.path.join(C, nombre), "w", zipfile.ZIP_DEFLATED) as z:
        for k, v in partes.items():
            z.writestr(k, v)


s = lambda i: f'<c t="s"><v>{i}</v></c>'
xlsx("b3_referencias_mixtas.xlsx",
     '<row r="1">' + s(0) + s(1) + '</row>'          # A1 Concepto, B1 Importe (B1 sin r)
     '<row>' + s(2) + '<c><v>10</v></c></row>'          # fila 2 implícita: A2 Uno, B2 10
     '<row r="5"><c r="C5" t="s"><v>3</v></c><c><v>7</v></c></row>'   # C5 x, D5 7 (implícita tras C5)
     '<row><c r="ZZ!9" t="s"><v>4</v></c>' + s(5) + '</row>',          # fila 6: referencia no válida (se avisa) y A6 Fin
     ["Concepto", "Importe", "Uno", "x", "malo", "Fin"])
reg("b3x1", "b3_referencias_mixtas.xlsx", "otros", "Celdas y filas con r, sin r y con una r no válida",
    {"celdas": {"A1": "Concepto", "B1": "Importe", "A2": "Uno", "B2": "10", "C5": "x", "D5": "7", "A6": "Fin"},
     "avisos": ["XLSX_IMPLICIT_CELL_POSITIONS", "XLSX_INVALID_CELL_REFERENCES"], "estado": "partial"})

# ---------------------------------------------------------------- B2: HTML con rowspan y colspan combinados
html = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>combinadas</title></head><body>
<table>
<tr><th>Grupo</th><th>Concepto</th><th colspan="2">Importe y tipo</th><th>Nota</th></tr>
<tr><td rowspan="3">G1</td><td>Alfa</td><td>100,00</td><td>21</td><td rowspan="2">revisar</td></tr>
<tr><td>Beta</td><td colspan="2" rowspan="2">50,00 (exento)</td></tr>
<tr><td>Gamma</td><td>ok</td></tr>
<tr><td>G2</td><td>Delta</td><td>7,00</td><td>10</td><td>ok</td></tr>
</table></body></html>"""
open(os.path.join(C, "b2_rowspan_colspan.html"), "w", encoding="utf-8").write(html)
reg("b2h1", "b2_rowspan_colspan.html", "otros", "rowspan y colspan juntos, también en la última columna",
    {"filas": [["Grupo", "Concepto", "Importe y tipo", None, "Nota"],
               ["G1", "Alfa", "100,00", "21", "revisar"],
               ["G1", "Beta", "50,00 (exento)", None, "revisar"],
               ["G1", "Gamma", "50,00 (exento)", None, "ok"],
               ["G2", "Delta", "7,00", "10", "ok"]],
     "combinada_desde": {"2,0": 2, "3,0": 2, "2,4": 2, "3,2": 3}, "avisos": ["HTML_ROWSPAN_EXPANDED"]})

# ---------------------------------------------------------------- B1: PDF digital con imagen grande (no mixta)
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
gris = Image.new("RGB", (800, 500), (200, 200, 200))
b = io.BytesIO(); gris.save(b, "PNG"); ruta_gris = os.path.join(OUT, "_gris.png"); open(ruta_gris, "wb").write(b.getvalue())
c = canvas.Canvas(os.path.join(C, "b1_digital_con_imagen.pdf"), pagesize=A4)
c.setFont("DejaVu", 11)
y = 800
for i in range(14):  # < 1500 caracteres: se mide la superficie del texto (≈ 12 % de la página)
    c.drawString(40, y, f"Línea {i + 1:02d} del informe digital con texto suficiente para no ser un escaneo.")
    y -= 14
c.drawImage(ruta_gris, 40, 40, 515, 300)
c.showPage(); c.save()
reg("b1p1", "b1_digital_con_imagen.pdf", "otros", "PDF digital con mucho texto y una imagen grande sin texto",
    {"ocr_pagina": "no", "bloques_ocr": 0})

# ---------------------------------------------------------------- B1: escaneo con capa de texto (PDF buscable)
im = Image.open(PNG)
w, h = A4
esc = min((w - 40) / im.width, (h - 80) / im.height)
c = canvas.Canvas(os.path.join(C, "b1_escaneo_con_capa_texto.pdf"), pagesize=A4)
c.drawImage(PNG, 20, h - 40 - im.height * esc, im.width * esc, im.height * esc)
t = c.beginText(); t.setTextRenderMode(3); t.setFont("DejaVu", 10)
lineas = ["Número de factura: A-2025/0157", "Fecha de expedición: 14/03/2025", "Emisor: Construcciones Muñoz Ibáñez, S.L.",
          "NIF emisor: B12345674", "Domicilio: C/ Mayor 12, 28013 Madrid", "Cliente: Talleres Peña Gutiérrez, S.A.",
          "NIF cliente: A58818501", "Domicilio cliente: Avda. de la Constitución 45, 41001 Sevilla",
          "Concepto Cantidad Precio Importe", "Reparación de cubierta 1 850,00 850,00", "Sustitución de canalón (m) 12 32,05 384,60",
          "Retirada de escombros 1 120,00 120,00", "Base imponible: 1.354,60 €", "IVA 21 %: 284,47 €", "Total factura: 1.639,07 €",
          "Forma de pago: transferencia bancaria"]
yy = h - 70
for ln in lineas:
    t.setTextOrigin(30, yy); t.textLine(ln); yy -= 19
c.drawText(t)
c.showPage(); c.save()
reg("b1p2", "b1_escaneo_con_capa_texto.pdf", "otros", "Escaneo con capa de texto invisible (PDF buscable): no necesita OCR",
    {"ocr_pagina": "no", "bloques_ocr": 0})

os.remove(ruta_gris)
json.dump(VERDAD, open(os.path.join(OUT, "verdad.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(VERDAD), "casos")
