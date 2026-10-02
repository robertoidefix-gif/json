"""Comprueba los casos sintéticos de la fase B (generar_casos_faseB.py) y, con el OCR desactivado, los avisos
de pdf09 y png01 del corpus.

Uso: python3 verificar_casos_faseB.py <carpeta_salida_casos> <etiqueta> [<carpeta_resultados_sin_ocr>]
"""
import sys, os, json

OUT, ETIQ = sys.argv[1:3]
SINOCR = sys.argv[3] if len(sys.argv) > 3 else None
verdad = {d["id"]: d for d in json.load(open(os.path.join(OUT, "verdad.json"), encoding="utf-8"))}
fallos = 0


def ok(cond, texto):
    global fallos
    print(("  ✅ " if cond else "  ❌ ") + texto)
    if not cond:
        fallos += 1


def cargar(carpeta, i):
    return json.load(open(os.path.join(carpeta, f"{i}.json"), encoding="utf-8"))["resultado"]


def codigos(r):
    return [x["code"] for x in r["diagnostics"]["issues"]]


R = os.path.join(OUT, "resultados", ETIQ)
COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

print("b3x1 · XLSX con referencias mixtas")
r = cargar(R, "b3x1")
e = verdad["b3x1"]["esperado"]
celdas = {}
for t in r["content"]["tables"]:
    for row in t["rows"]:
        for j, c in enumerate(row["cells"]):
            if c["raw"] not in (None, ""):
                rng = c["source"].get("range") or f"{COLS[j]}{row.get('sourceRow')}"
                celdas[rng] = str(c["raw"])
for ref, v in e["celdas"].items():
    ok(celdas.get(ref) == v, f"{ref} = {v!r} (leído: {celdas.get(ref)!r})")
for cod in e["avisos"]:
    ok(cod in codigos(r), f"aviso {cod}")
ok(r["processing"]["status"] == e["estado"], f"estado {e['estado']} (leído: {r['processing']['status']})")
ok("malo" not in json.dumps(r["content"], ensure_ascii=False), "la celda con referencia no válida no se coloca en ningún sitio")

print("b2h1 · HTML con rowspan y colspan")
r = cargar(R, "b2h1")
e = verdad["b2h1"]["esperado"]
t = r["content"]["tables"][0]
filas = [[c["raw"] for c in row["cells"]] for row in t["rows"]]
for i, esperada in enumerate(e["filas"]):
    leida = filas[i] if i < len(filas) else None
    ok(leida == esperada, f"fila {i + 1}: {esperada} (leída: {leida})")
for clave, origen in e["combinada_desde"].items():
    i, j = map(int, clave.split(","))
    ok(t["rows"][i]["cells"][j]["source"].get("combinada_desde") == origen, f"fila {i + 1} col {j + 1}: combinada_desde = {origen}")
ok(sum(1 for row in t["rows"] for c in row["cells"] if c["source"].get("combinada_desde")) == len(e["combinada_desde"]),
   "solo las celdas repetidas llevan combinada_desde")
for cod in e["avisos"]:
    ok(cod in codigos(r), f"aviso {cod}")

for i in ("b1p1", "b1p2"):
    print(f"{i} · {verdad[i]['nota']}")
    r = cargar(R, i)
    ocr = [b for b in r["content"]["blocks"] if b["kind"] == "ocr-text"]
    ok(not r["processing"]["ocr"]["used"], f"sin OCR (ocr.used = {r['processing']['ocr']['used']})")
    ok(len(ocr) == 0, f"0 bloques ocr-text (leídos: {len(ocr)})")
    ok("PDF_MIXED_PAGE_OCR" not in codigos(r), "no se trata como página mixta")

if SINOCR:
    print("pdf09 con el OCR desactivado")
    r = cargar(SINOCR, "pdf09")
    ok("PDF_PAGE_IMAGE_WITHOUT_OCR" in codigos(r), "aviso PDF_PAGE_IMAGE_WITHOUT_OCR")
    ok(r["processing"]["status"] == "partial", f"estado partial (leído: {r['processing']['status']})")
    print("png01 con el OCR desactivado")
    r = cargar(SINOCR, "png01")
    ok("IMAGE_OCR_DISABLED" in codigos(r), "aviso IMAGE_OCR_DISABLED")
    ok(r["processing"]["status"] == "partial", f"estado partial (leído: {r['processing']['status']})")

print("FALLOS:", fallos)
sys.exit(1 if fallos else 0)
