"""Genera Idefix1.0-sin-servidor-codigo-completo.txt con el MISMO formato que el archivo del usuario
(04f297ed-Idefix1.0-codigo-completo_1.txt) y comprueba la ida y vuelta byte a byte.

Uso: python3 codigo-completo-sin-servidor.py <carpeta Idefix1.0> <txt_salida> <titulo> <fecha_version>
"""
import sys, re, hashlib, os

CARPETA, SALIDA = sys.argv[1:3]
TITULO = sys.argv[3] if len(sys.argv) > 3 else "VERSIÓN SIN SERVIDOR"
SEP = "=" * 110

ARCHIVOS = [
    ("analizador-archivos.js",
     "Aplicación completa (archivo único): JavaScript, interfaz, hoja de estilos incrustada, worker núcleo incrustado y MARCO_FISCAL_LOCAL incrustado. Lleva fijados en AA_PAQUETES el tamaño y el SHA-256 de cada librería oficial.",
     "vendor-paquetes/*.paquete.js (PDF.js para arrancar; Tesseract.js, su núcleo y los idiomas con OCR). Lo cargan index.html, index-sin-ocr.html o demo-ocr.html."),
    ("index.html",
     "Página de la aplicación con OCR (data-ocr=\"true\"; data-idiomas-ocr=\"spa,cat,eus,eng,fra\"). Se abre con doble clic.",
     "analizador-archivos.js y los paquetes de vendor-paquetes/ con etiquetas <script> (sin integrity: con file:// lo impediría)."),
    ("index-sin-ocr.html",
     "Página de la aplicación sin OCR. Se abre con doble clic.",
     "analizador-archivos.js y los dos paquetes de PDF.js."),
    ("demo-ocr.html",
     "Demostración: cargar una imagen y reconocer su texto en español. Se abre con doble clic.",
     "demo-ocr.css, los paquetes de Tesseract.js (núcleo SIMD e idioma spa), analizador-archivos.js (sin autoarranque) y demo-ocr.js."),
    ("demo-ocr.js",
     "Lógica de la demostración (elegir/arrastrar imagen, vista previa en lienzo, OCR, comprobación de red).",
     "AnalizadorArchivosAPI.crearOCRLocal (de analizador-archivos.js) y vendor-paquetes/."),
    ("demo-ocr.css",
     "Estilos de la demostración.",
     "Ninguna."),
    ("LEEME.txt",
     "Cómo se abre (doble clic en index.html), qué hay en la carpeta, seguridad y navegadores.",
     "—"),
    ("vendor-paquetes/LEEME.txt",
     "Qué son los paquetes, cómo se verifican, cuándo se carga cada uno y SHA-256 de los 197 archivos oficiales.",
     "—"),
    ("vendor-paquetes/licencias/tessdata-AVISO.txt",
     "Origen y licencia de los modelos de idioma.",
     "—"),
]
N = len(ARCHIVOS)


def fin(nombre):
    return "-" * 40 + f" FIN DE {nombre} " + "-" * 40


paquetes = sorted(f for f in os.listdir(f"{CARPETA}/vendor-paquetes") if f.endswith(".paquete.js"))
licencias = sorted(os.listdir(f"{CARPETA}/vendor-paquetes/licencias"))

pre = [SEP, f"IDEFIX1.0 — CÓDIGO COMPLETO (sin omisiones) · {TITULO}", "AnalizadorArchivos 6.14.0 · 2 de octubre de 2026", SEP, ""]
pre += [
    "Cada archivo va completo, byte a byte igual que en la carpeta Idefix1.0, precedido de su ruta, su función,",
    "sus dependencias, su tamaño y su SHA-256. Solo JavaScript, HTML y CSS nativos: sin servidor, sin Node.js y",
    "sin frameworks. Se abre con doble clic en index.html (Chrome o Edge).",
    "",
    "No se incluye el contenido de vendor-paquetes/*.paquete.js: son las librerías OFICIALES (PDF.js 6.2.108,",
    "Tesseract.js 7.0.0, tesseract.js-core 7.0.0 y los modelos de idioma) sin modificar, en base64 (34 MB).",
    "analizador-archivos.js comprueba el tamaño y el SHA-256 de cada archivo oficial antes de usarlo; la lista",
    "completa de esos SHA-256 está en vendor-paquetes/LEEME.txt (archivo 8). Paquetes de la carpeta:",
]
for p in paquetes:
    datos = open(f"{CARPETA}/vendor-paquetes/{p}", "rb").read()
    pre.append(f"  {p}  ·  {len(datos):,} bytes  ·  SHA-256 del paquete: {hashlib.sha256(datos).hexdigest()}")
pre.append("Licencias de terceros (textos oficiales, no incluidos aquí): vendor-paquetes/licencias/ — " + ", ".join(l for l in licencias if l != "tessdata-AVISO.txt") + ".")
pre.append("")
pre.append("ÍNDICE")
for i, (nombre, funcion, dep) in enumerate(ARCHIVOS, 1):
    pre += [f"{i:2d}. {nombre}", f"    Función: {funcion}", f"    Dependencias: {dep}"]
pre.append("")
partes = ["\n".join(pre) + "\n"]
for i, (nombre, funcion, dep) in enumerate(ARCHIVOS, 1):
    datos = open(f"{CARPETA}/{nombre}", "rb").read()
    contenido = datos.decode("utf-8")
    assert not contenido.startswith("﻿") and "\r" not in contenido, nombre
    lineas = contenido.count("\n") + (0 if contenido.endswith("\n") else 1)
    cab = [SEP, f"ARCHIVO {i}/{N}: {nombre}", f"Ruta: Idefix1.0/{nombre}", f"Función: {funcion}", f"Dependencias: {dep}",
           f"Tamaño: {len(datos):,} bytes · Líneas: {lineas:,} · SHA-256: {hashlib.sha256(datos).hexdigest()}", SEP]
    partes.append("\n".join(cab) + "\n" + contenido + ("" if contenido.endswith("\n") else "\n") + fin(nombre) + "\n\n")
salida = "".join(partes).rstrip("\n") + "\n"
open(SALIDA, "w", encoding="utf-8", newline="\n").write(salida)

# --- Ida y vuelta: extraer cada archivo del .txt generado y compararlo con el real
gen = open(SALIDA, encoding="utf-8").read()
RE_CAB = re.compile(r"^" + SEP + r"\nARCHIVO (\d+)/(\d+): (.+)\nRuta: (.+)\nFunción: (.*)\nDependencias: (.*)\nTamaño: .*SHA-256: ([0-9a-f]{64})\n" + SEP + r"\n", re.M)
ok = 0
for m in RE_CAB.finditer(gen):
    nombre = m.group(3)
    ini = m.end()
    f = gen.index("\n" + fin(nombre) + "\n", ini - 1) + 1
    cuerpo = gen[ini:f]
    real = open(f"{CARPETA}/{nombre}", "rb").read()
    if cuerpo.encode("utf-8") == real and hashlib.sha256(real).hexdigest() == m.group(7):
        ok += 1
    else:
        print("NO COINCIDE:", nombre)
print(f"ida y vuelta: {ok}/{N} archivos idénticos · {len(gen):,} caracteres · {gen.count(chr(10)):,} líneas")
