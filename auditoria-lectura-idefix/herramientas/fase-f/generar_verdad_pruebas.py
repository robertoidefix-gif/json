"""Fase F (F9): reúne en un solo JSON lo que necesita la página de pruebas sin Node (Idefix1.0/pruebas-corpus.html).

Contiene la verdad del corpus (verdad.json) y los datos de referencia que usa evaluar.py (factura, libro de 12
registros, libro de 60, cadenas del XLS, párrafos de dos columnas y variantes de instrucciones de html13). Con un
consolidado (consolidar.py) añade el veredicto esperado de cada caso para detectar regresiones.

Uso: python3 generar_verdad_pruebas.py <dir_con_verdad_y_datos> <salida.json> [consolidado_esperado.json]
     (el directorio debe tener verdad.json, cadenas_sst.json, libro60.json y variantes_inyeccion.json; datos.py
     se importa desde herramientas/)."""
import json, os, sys
from decimal import Decimal
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from datos import FACTURA, EMISOR, CLIENTE, FACTURA_TABLA, LIBRO, DOS_COLUMNAS_IZQ, DOS_COLUMNAS_DER, factura_lineas_texto, libro_fila_texto

ORIGEN, SALIDA = sys.argv[1], sys.argv[2]
ESPERADO = sys.argv[3] if len(sys.argv) > 3 else None
leer = lambda n: json.load(open(os.path.join(ORIGEN, n), encoding="utf-8"))
V = leer("verdad.json")
L60 = leer("libro60.json")["LIBRO60"]
num = lambda x: float(x) if isinstance(x, (Decimal, int, float)) else float(str(x))

TIPICOS = {"html01", "html02", "htm03", "htm04", "html12", "htm10", "docx01", "docx02", "docx03", "docx10", "docx11", "xlsx01", "xlsx02", "xlsx03",
           "xlsx04", "xlsx08", "xlsx09", "xls01", "xls02", "xls04", "xls05", "pdf01", "pdf02", "pdf03", "pdf04", "pdf06", "pdf11b", "pdf15",
           "pdfE1", "pdfE2", "pdfE3", "pdfE4", "png01", "jpg02", "jpeg03", "png04", "png09"}
esperados = {}
if ESPERADO:
    for c in json.load(open(ESPERADO, encoding="utf-8"))["casos"]:
        esperados[c["id"]] = c["veredicto"]

def formato(d):
    ext = d["archivo"].rsplit(".", 1)[1].lower()
    if ext == "pdf":
        return "pdf-escaneado" if (d["id"].startswith("pdfE") or d["id"] == "pdf09") else "pdf-digital"
    return ext

casos = []
for d in V:
    c = dict(d)
    c["formato"] = formato(d)
    c["tipo"] = "típico" if d["id"] in TIPICOS else "límite"
    if d["id"] in esperados:
        c["esperado"] = esperados[d["id"]]
    casos.append(c)

salida = {
    "version": 1,
    "descripcion": "Verdad del corpus de auditoría de Idefix1.0 para pruebas-corpus.html (sin Node).",
    "factura": {"numero": FACTURA["numero"], "fecha_iso": FACTURA["fecha_iso"], "base": num(FACTURA["base"]), "cuota": num(FACTURA["cuota"]),
                "total": num(FACTURA["total"]), "lineas_importe": [num(x) for x in FACTURA["lineas_importe"]],
                "nif_emisor": EMISOR["nif"], "nif_cliente": CLIENTE["nif"], "texto": "\n".join(factura_lineas_texto()),
                "tabla": FACTURA_TABLA},
    "libro": [{"fecha_expedicion": r["fecha_iso"], "serie": r["serie"], "numero_factura": r["numero"], "nif_destinatario": r["nif"],
               "nombre_destinatario": r["nombre"], "base_imponible": num(r["base"]), "tipo_iva": num(r["tipo"]),
               "cuota_iva": num(r["cuota"]), "total": num(r["total"])} for r in LIBRO],
    "libro_texto": "\n".join(" ".join(libro_fila_texto(r)) for r in LIBRO),
    "libro60": [{"fecha_expedicion": r["fecha"], "serie": r["serie"], "numero_factura": r["numero"], "nif_destinatario": r["nif"],
                 "nombre_destinatario": r["nombre"], "base_imponible": num(r["base"]), "tipo_iva": num(r["tipo"]),
                 "cuota_iva": num(r["cuota"]), "total": num(r["total"])} for r in L60],
    "cadenas": leer("cadenas_sst.json"),
    "dos_columnas": DOS_COLUMNAS_IZQ + DOS_COLUMNAS_DER,
    "inyecciones_html13": leer("variantes_inyeccion.json"),
    "casos": casos,
}
json.dump(salida, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(casos)} casos ({len(esperados)} con veredicto esperado) → {SALIDA}")
