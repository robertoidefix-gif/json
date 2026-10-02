"""Genera vendor-paquetes/ de Idefix1.0 sin servidor y la tabla AA_PAQUETES para analizador-archivos.js.

Cada paquete es un <script> clásico que solo contiene archivos OFICIALES en base64:
    (self.IdefixPaquetes = self.IdefixPaquetes || []).push(["vendor/ruta/oficial", "<base64>"]);
analizador-archivos.js comprueba el tamaño y el SHA-256 de cada archivo (fijados en AA_PAQUETES)
antes de usarlo.

Uso: python3 empaquetar-idefix.py <vendor_oficial> <salida_vendor_paquetes> <salida_tabla.js>
"""
import sys, os, base64, hashlib, json

VENDOR, SALIDA, TABLA = sys.argv[1:4]
os.makedirs(SALIDA, exist_ok=True)

PDFJS = "pdfjs-legacy"
PAQUETES = [
    ("pdfjs-6.2.108-legacy-pdf.mjs.paquete.js", "npm pdfjs-dist@6.2.108 (legacy) · build/pdf.mjs", "Apache-2.0",
     [f"{PDFJS}/build/pdf.mjs"]),
    ("pdfjs-6.2.108-legacy-pdf.worker.mjs.paquete.js", "npm pdfjs-dist@6.2.108 (legacy) · build/pdf.worker.mjs", "Apache-2.0",
     [f"{PDFJS}/build/pdf.worker.mjs"]),
    ("pdfjs-6.2.108-legacy-wasm.paquete.js", "pdfjs-6.2.108-legacy-dist · web/wasm (openjpeg, jbig2)", "Apache-2.0, BSD-2-Clause (OpenJPEG) y BSD-3-Clause (JBIG2 de PDFium), ver licencias/",
     [f"{PDFJS}/web/wasm/openjpeg.wasm", f"{PDFJS}/web/wasm/jbig2.wasm"]),
    ("pdfjs-6.2.108-legacy-fuentes.paquete.js", "pdfjs-6.2.108-legacy-dist · web/standard_fonts", "Foxit (BSD) y Liberation (OFL 1.1), ver licencias/",
     sorted(f"{PDFJS}/web/standard_fonts/{n}" for n in os.listdir(f"{VENDOR}/{PDFJS}/web/standard_fonts") if not n.startswith("LICENSE"))),
    ("pdfjs-6.2.108-legacy-cmaps.paquete.js", "pdfjs-6.2.108-legacy-dist · web/cmaps", "Adobe (BSD-3-Clause), ver licencias/",
     sorted(f"{PDFJS}/web/cmaps/{n}" for n in os.listdir(f"{VENDOR}/{PDFJS}/web/cmaps") if n.endswith(".bcmap"))),
    ("tesseract-7.0.0.min.js.paquete.js", "npm tesseract.js@7.0.0 · dist/tesseract.min.js", "Apache-2.0", ["tesseract/tesseract.min.js"]),
    ("tesseract-7.0.0-worker.min.js.paquete.js", "npm tesseract.js@7.0.0 · dist/worker.min.js", "Apache-2.0", ["tesseract/worker.min.js"]),
    ("tesseract-core-7.0.0-simd-lstm.wasm.js.paquete.js", "npm tesseract.js-core@7.0.0 · tesseract-core-simd-lstm.wasm.js", "Apache-2.0",
     ["tesseract-core/tesseract-core-simd-lstm.wasm.js"]),
    ("tesseract-core-7.0.0-lstm.wasm.js.paquete.js", "npm tesseract.js-core@7.0.0 · tesseract-core-lstm.wasm.js (navegadores sin SIMD)", "Apache-2.0",
     ["tesseract-core/tesseract-core-lstm.wasm.js"]),
] + [
    (f"tessdata-{c}.traineddata.gz.paquete.js", f"@tesseract.js-data/{c} · 4.0.0_best_int/{c}.traineddata.gz", "Apache-2.0",
     [f"tessdata/{c}.traineddata.gz"]) for c in ["spa", "cat", "eus", "eng", "fra", "chi_sim", "chi_tra"]
]

tabla = {}
resumen = []
for archivo, origen, licencia, rutas in PAQUETES:
    lineas = [
        "/* Idefix1.0 · paquete de librería local (generado; NO EDITAR).",
        f" * Contenido: {origen} · Licencia: {licencia}.",
        " * Archivos OFICIALES en base64. analizador-archivos.js comprueba su tamaño y su SHA-256",
        " * (fijados en AA_PAQUETES) antes de usarlos: si no coinciden, no se usan. */",
    ]
    total = 0
    for r in rutas:
        datos = open(f"{VENDOR}/{r}", "rb").read()
        total += len(datos)
        clave = f"vendor/{r}"
        tabla[clave] = [hashlib.sha256(datos).hexdigest(), len(datos), archivo]
        lineas.append(f'(self.IdefixPaquetes = self.IdefixPaquetes || []).push([{json.dumps(clave)}, "{base64.b64encode(datos).decode()}"]);')
    texto = "\n".join(lineas) + "\n"
    open(f"{SALIDA}/{archivo}", "w", encoding="utf-8", newline="\n").write(texto)
    resumen.append((archivo, len(rutas), total, len(texto.encode())))

# Tabla para analizador-archivos.js (orden estable)
filas = ",\n".join(f'  {json.dumps(k)}: Object.freeze([{json.dumps(v[0])}, {v[1]}, {json.dumps(v[2])}])' for k, v in sorted(tabla.items()))
open(TABLA, "w", encoding="utf-8", newline="\n").write("const AA_PAQUETES = Object.freeze({\n" + filas + "\n});\n")
for a, n, t, p in resumen:
    print(f"{a:58} {n:4} archivo(s) {t:>10,} bytes → paquete {p:>10,} bytes")
print("total paquetes:", f"{sum(p for *_, p in resumen):,} bytes", "· entradas en la tabla:", len(tabla))
