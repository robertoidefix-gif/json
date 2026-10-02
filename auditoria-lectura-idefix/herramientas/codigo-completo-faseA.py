"""Genera Idefix1.0-faseA-codigo-completo.txt con el MISMO formato que el archivo del usuario
(04f297ed-Idefix1.0-codigo-completo_1.txt) y comprueba la ida y vuelta byte a byte.

Uso: python3 codigo-completo-faseA.py <txt_original> <carpeta_faseA> <txt_salida>
"""
import sys, re, hashlib

ORIG, CARPETA, SALIDA = sys.argv[1:4]
SEP = "=" * 110
texto = open(ORIG, encoding="utf-8").read()

# Cabeceras de archivo: bloque entre dos líneas de «=» que empieza por «ARCHIVO n/17: …»
RE_CAB = re.compile(r"^" + SEP + r"\nARCHIVO (\d+)/(\d+): (.+)\nRuta: (.+)\nFunción: (.*)\nDependencias: (.*)\nTamaño: .*\n(?:Nota: (.*)\n)?" + SEP + r"\n", re.M)
cabs = list(RE_CAB.finditer(texto))
assert len(cabs) == 17, len(cabs)
preambulo = texto[:cabs[0].start()]
entradas = []
for m in cabs:
    entradas.append({"n": int(m.group(1)), "nombre": m.group(3), "ruta": m.group(4), "funcion": m.group(5),
                     "dependencias": m.group(6), "nota": m.group(7)})


def fin(nombre):
    return "-" * 40 + f" FIN DE {nombre} " + "-" * 40


# --- Ajustes de la fase A en las descripciones
for e in entradas:
    if e["nombre"] == "index.html":
        e["funcion"] = 'Página de la aplicación con OCR (data-ocr="true"; data-idiomas-ocr="spa,cat,eus,eng,fra" desde la fase A).'
    if e["nombre"] == "vendor/manifiesto-integridad.json":
        e["dependencias"] = "Lo lee analizador-archivos.js; su SHA-256 está anclado en la línea 466 (fase A)."
    if e["nombre"] == "analizador-archivos.js":
        e["dependencias"] = e["dependencias"].replace("vendor/tesseract-core/*", "los tres vendor/tesseract-core/tesseract-core-*-lstm.wasm.js")

preambulo = preambulo.replace("IDEFIX1.0 — CÓDIGO COMPLETO (sin omisiones)\nAnalizadorArchivos 6.14.0 · 2 de octubre de 2026",
                              "IDEFIX1.0 — CÓDIGO COMPLETO (sin omisiones) · FASE A\nAnalizadorArchivos 6.14.0 · 2 de octubre de 2026")
assert "· FASE A" in preambulo
aviso_fase = """FASE A (auditoría de lectura): este es tu código completo con la fase A aplicada. Cambios, con sus pruebas, en
CAMBIOS-FASE-A.txt. Archivos modificados: analizador-archivos.js, index.html, index-sin-ocr.html y demo-ocr.html
(solo el atributo integrity), herramientas/generar-manifiesto.js y .html, vendor/manifiesto-integridad.json,
vendor/tesseract-core/LEEME.txt y vendor/tessdata/LEEME.txt. El resto es idéntico byte a byte al original.

"""
preambulo = preambulo.replace("ÍNDICE\n", aviso_fase + "ÍNDICE\n", 1)
# Índice: regenerar las líneas de función/dependencias desde las entradas
indice = ["ÍNDICE"]
for e in entradas:
    indice += [f"{e['n']:2d}. {e['nombre']}", f"    Función: {e['funcion']}", f"    Dependencias: {e['dependencias']}"]
preambulo = re.sub(r"ÍNDICE\n(?:.*\n)*?(?=\n" + SEP + r"|\Z)", "\n".join(indice) + "\n", preambulo)

partes = [preambulo]
for e in entradas:
    datos = open(f"{CARPETA}/{e['nombre']}", "rb").read()
    contenido = datos.decode("utf-8")
    if contenido.startswith("﻿"):
        contenido = contenido[1:]
    contenido = contenido.replace("\r\n", "\n")
    lineas = contenido.count("\n") + (0 if contenido.endswith("\n") else 1)
    cab = [SEP, f"ARCHIVO {e['n']}/17: {e['nombre']}", f"Ruta: {e['ruta']}", f"Función: {e['funcion']}",
           f"Dependencias: {e['dependencias']}",
           f"Tamaño: {len(datos):,} bytes · Líneas: {lineas:,} · SHA-256: {hashlib.sha256(datos).hexdigest()}"]
    if e["nota"]:
        cab.append(f"Nota: {e['nota']}")
    cab.append(SEP)
    partes.append("\n".join(cab) + "\n" + contenido + ("" if contenido.endswith("\n") else "\n") + fin(e["nombre"]) + "\n\n")
salida = "".join(partes).rstrip("\n") + "\n"
open(SALIDA, "w", encoding="utf-8", newline="\n").write(salida)

# --- Ida y vuelta: extraer cada archivo del .txt generado y compararlo con el real
gen = open(SALIDA, encoding="utf-8").read()
ok = 0
for m in RE_CAB.finditer(gen):
    nombre = m.group(3)
    ini = m.end()
    f = gen.index("\n" + fin(nombre) + "\n", ini - 1) + 1
    cuerpo = gen[ini:f]
    real = open(f"{CARPETA}/{nombre}", "rb").read()
    candidatos = []
    for c in (cuerpo, cuerpo[:-1]):
        for crlf in (False, True):
            for bom in (False, True):
                b = c.replace("\n", "\r\n") if crlf else c
                candidatos.append((("﻿" if bom else "") + b).encode("utf-8"))
    sha = re.search(r"SHA-256: ([0-9a-f]{64})", m.group(0)).group(1)
    if real in candidatos and hashlib.sha256(real).hexdigest() == sha:
        ok += 1
    else:
        print("NO COINCIDE:", nombre)
print(f"ida y vuelta: {ok}/17 archivos idénticos · {len(gen):,} caracteres · {gen.count(chr(10)):,} líneas")
