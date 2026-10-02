"""Genera p1.js, p2.js y p3.js para las sondas de file:// (sonda.html, sonda2.html y sonda3.html).

Uso: python3 generar_sondas.py <pdf.mjs oficial (legacy)> <pdf.worker.mjs oficial (legacy)> <un PDF de prueba>
Cada p*.js deja el archivo en base64 en window.__P; las sondas lo leen sin fetch (con file:// no se puede).
"""
import sys, base64
for salida, clave, ruta in (("p1.js", "pdfmjs", sys.argv[1]), ("p2.js", "pdfworker", sys.argv[2]), ("p3.js", "doc", sys.argv[3])):
    b64 = base64.b64encode(open(ruta, "rb").read()).decode()
    open(salida, "w").write(f"window.__P = window.__P || {{}}; window.__P['{clave}'] = \"{b64}\";\n")
    print(salida, len(b64))
