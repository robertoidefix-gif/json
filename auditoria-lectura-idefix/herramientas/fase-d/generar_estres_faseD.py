"""Documentos hostiles para la revisión de texto oculto de la fase D: no deben bloquear el análisis.

Uso: python3 generar_estres_faseD.py <carpeta_salida>
Cada caso debe terminar (complete o partial) en pocos segundos, sin colgar la página ni el worker.
"""
import sys, os, json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

OUT = sys.argv[1]
C = os.path.join(OUT, "corpus")
os.makedirs(C, exist_ok=True)
V = []


def reg(i, archivo, nota):
    V.append({"id": i, "archivo": archivo, "cajetilla": "otros", "verdad": "estres", "checks": [], "mime": "", "nota": nota,
              "esperado": {"termina": True}})


def html(nombre, cabeza, cuerpo):
    open(os.path.join(C, nombre), "w", encoding="utf-8").write(
        f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title>{cabeza}</head><body>{cuerpo}</body></html>')


# 1) Atributos style enormes pensados para expresiones regulares con retroceso.
letras = "a" * 400000
digitos = "font-size:" + "1" * 200000 + "x"
parentesis = "a:(" * 60000
html("e1_style_retroceso.html", "", f'<p style="{letras}">uno</p><p style="{digitos}">dos</p><p style="{parentesis}">tres</p>'
     f'<p style="transform:{"scale(" * 50000}">cuatro</p><p style="background:{"x " * 100000}">cinco</p>')
reg("e1", "e1_style_retroceso.html", "style de 400.000 letras, 200.000 dígitos, 60.000 «a:(», scale( sin cerrar y fondo de 100.000 palabras")

# 2) Muchas reglas universales y muchos elementos.
reglas = "".join(f"*{{color:#00{k % 100:02d}00}}" for k in range(20000))
html("e2_reglas_universales.html", f"<style>{reglas}</style>", "".join(f"<div><p>p{k}</p></div>" for k in range(40000)))
reg("e2", "e2_reglas_universales.html", "20.000 reglas «*{…}» y 80.000 elementos (presupuesto de comprobaciones)")

# 3) CSS patológico: llaves sin abrir, @media anidados sin cerrar y selectores larguísimos.
css = "}" * 300000 + "@media screen{" * 50000 + ".a " * 100000 + "{display:none}"
html("e3_css_patologico.html", f"<style>{css}</style>", "<p class='a'>texto</p>")
reg("e3", "e3_css_patologico.html", "300.000 «}», 50.000 @media anidados y un selector de 100.000 partes")

# 4) PDF con miles de rectángulos y de textos blancos en una página.
c = canvas.Canvas(os.path.join(C, "e4_pdf_rellenos.pdf"), pagesize=A4)
c.setFont("Helvetica", 4)
for k in range(6000):
    x, y = 10 + (k % 60) * 9.5, 20 + (k // 60) * 8
    c.setFillColorRGB(0.2, 0.2, 0.2); c.rect(x, y, 9, 7, stroke=0, fill=1)
for k in range(12000):
    x, y = 10 + (k % 120) * 4.7, 20 + (k // 120) * 8
    c.setFillColorRGB(1, 1, 1); c.drawString(x, y, "w")
c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica", 12); c.drawString(40, 820, "Texto normal de la pagina")
c.showPage(); c.save()
reg("e4", "e4_pdf_rellenos.pdf", "PDF: 6.000 rectángulos oscuros y 12.000 textos blancos en una página (topes de la revisión)")

json.dump(V, open(os.path.join(OUT, "verdad.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(V), "casos en", OUT)
