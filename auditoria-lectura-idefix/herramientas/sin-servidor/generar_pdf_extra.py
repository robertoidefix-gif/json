"""Genera los dos PDF extra de la prueba sin servidor (no están en verdad.json):
  cmap_chino.pdf     texto con fuente CJK NO incrustada (STSong-Light, CMap UniGB-UCS2-H): PDF.js necesita
                     los CMaps de vendor-paquetes.
  jpx_escaneada.pdf  la factura png01 como imagen JPEG 2000 (/JPXDecode) y sin texto: PDF.js necesita el
                     WASM openjpeg para dibujarla y el OCR la lee.
Uso: python3 generar_pdf_extra.py <png01_factura.png> <carpeta_salida>
"""
import sys, io
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

PNG, SALIDA = sys.argv[1:3]
pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
c = canvas.Canvas(f"{SALIDA}/cmap_chino.pdf")
c.setFont("STSong-Light", 16)
c.drawString(72, 750, "发票号码 A-2025/0157 合计 1.639,07 EUR")
c.setFont("Helvetica", 12)
c.drawString(72, 720, "Factura con fuente CJK no incrustada (CMap UniGB-UCS2-H)")
c.save()

im = Image.open(PNG).convert("L")
b = io.BytesIO(); im.save(b, format="JPEG2000", irreversible=False); jp2 = b.getvalue()
w, h = im.size
pw, ph = 595, round(595 * h / w)
cont = f"q {pw} 0 0 {ph} 0 0 cm /Im0 Do Q".encode()
objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pw} {ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>".encode(),
    f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /Filter /JPXDecode /Length {len(jp2)} >>\nstream\n".encode() + jp2 + b"\nendstream",
    f"<< /Length {len(cont)} >>\nstream\n".encode() + cont + b"\nendstream",
]
out = io.BytesIO(); out.write(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"); offs = []
for i, o in enumerate(objs, 1):
    offs.append(out.tell()); out.write(f"{i} 0 obj\n".encode() + o + b"\nendobj\n")
x = out.tell()
out.write(f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs))
out.write(f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode())
open(f"{SALIDA}/jpx_escaneada.pdf", "wb").write(out.getvalue())
print("ok")
