"""Evalúa los resultados de Idefix1.0 contra la verdad-terreno del corpus.

Uso: python3 evaluar.py <dir_salida> <config> -> escribe evaluacion_<config>.json y muestra un resumen.
"""
import sys, os, json, re, unicodedata
from decimal import Decimal
from rapidfuzz.distance import Levenshtein
from datos import *

OUT = os.path.abspath(sys.argv[1])
CONFIG = sys.argv[2] if len(sys.argv) > 2 else "prod"
V = json.load(open(os.path.join(OUT, "verdad.json"), encoding="utf-8"))
CADENAS = json.load(open(os.path.join(OUT, "cadenas_sst.json"), encoding="utf-8"))
LIBRO60 = json.load(open(os.path.join(OUT, "libro60.json"), encoding="utf-8"))["LIBRO60"]


def norm(s):
    s = unicodedata.normalize("NFC", str(s)).replace(" ", " ").replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def texto_celda(c):
    v = c.get("raw")
    if v is None:
        v = c.get("value")
    return "" if v is None else str(v)


def textos(res):
    c = res.get("content") or {}
    tablas = {t["id"]: t for t in c.get("tables", [])}
    partes, solo_bloques = [], []
    usadas = set()
    for b in c.get("blocks", []):
        if b.get("kind") == "table" and b.get("tableId") in tablas:
            t = tablas[b["tableId"]]
            usadas.add(t["id"])
            if t.get("origin") == "heuristic":
                continue  # tabla reconstruida a partir de líneas que ya están en los bloques de texto
            for f in t["rows"]:
                partes.append(" ".join(texto_celda(x) for x in f["cells"] if texto_celda(x)))
        elif b.get("text"):
            partes.append(b["text"])
            solo_bloques.append(b["text"])
    for tid, t in tablas.items():
        if tid not in usadas and t.get("origin") != "heuristic":
            for f in t["rows"]:
                partes.append(" ".join(texto_celda(x) for x in f["cells"] if texto_celda(x)))
    return "\n".join(partes), "\n".join(solo_bloques)


def tokens(s):
    return re.findall(r"[\wÀ-ÿ€%/.,:-]+", norm(s))


def recall_palabras(extraido, verdad):
    from collections import Counter
    a, b = Counter(tokens(extraido)), Counter(tokens(verdad))
    total = sum(b.values())
    acierto = sum(min(a[k], v) for k, v in b.items())
    return acierto / total if total else None


def cer(extraido, verdad):
    v = norm(verdad)
    return Levenshtein.distance(norm(extraido), v) / max(1, len(v))


def num(x):
    try:
        return float(x)
    except Exception:
        return None


def valor(obj):
    return obj.get("valor") if isinstance(obj, dict) else None


# ---------------- factura ----------------
def eval_factura(res, texto):
    sem_doc = res.get("documento") or {}
    imp = (res.get("importes") or {}).get("inferidos") or {}
    nifs = [valor(x) for x in (res.get("partes") or {}).get("nifs_mencionados", [])]
    titular = valor((res.get("partes") or {}).get("titular", {}).get("nif")) if isinstance((res.get("partes") or {}).get("titular", {}).get("nif"), dict) else None
    if titular:
        nifs.append(titular)
    campos = {
        "numero": valor(sem_doc.get("numero_documento")) == FACTURA["numero"],
        "fecha": valor(sem_doc.get("fecha_documento")) == FACTURA["fecha_iso"],
        "nif_emisor": EMISOR["nif"] in nifs,
        "nif_cliente": CLIENTE["nif"] in nifs,
        "base": num(valor(imp.get("base_imponible"))) == float(FACTURA["base"]),
        "cuota": num(valor(imp.get("cuota_iva"))) == float(FACTURA["cuota"]),
        "total": num(valor(imp.get("total"))) == float(FACTURA["total"]),
    }
    obtenidos = {
        "numero": valor(sem_doc.get("numero_documento")), "fecha": valor(sem_doc.get("fecha_documento")), "nifs": nifs,
        "base": valor(imp.get("base_imponible")), "cuota": valor(imp.get("cuota_iva")), "total": valor(imp.get("total")),
    }
    verdad = "\n".join(factura_lineas_texto())
    # D7 (OCR): importes y NIF normalizados aunque no haya rótulo
    d7 = (res.get("datos_especificos") or {}).get("normalizacion_ocr")
    d7_ok = None
    if d7:
        vals = {round(x["valor"], 2) for x in d7.get("importes", []) if isinstance(x.get("valor"), (int, float))}
        esperados = {float(FACTURA["base"]), float(FACTURA["cuota"]), float(FACTURA["total"])} | {float(x) for x in FACTURA["lineas_importe"]}
        d7_ok = len(esperados & vals) / len(esperados)
    return {"campos": campos, "campos_ok": sum(campos.values()), "campos_total": len(campos), "obtenidos": obtenidos,
            "recall_palabras": recall_palabras(texto, verdad), "cer": cer(texto, verdad), "d7_importes_ok": d7_ok}


def mejor_tabla(res, verdad_filas):
    mejor = (0.0, None)
    for t in (res.get("content") or {}).get("tables", []):
        filas = [[norm(texto_celda(c)) for c in f["cells"]] for f in t["rows"]]
        aciertos = 0
        total = sum(len(f) for f in verdad_filas)
        for vf in verdad_filas:
            # mejor fila coincidente (por posición de columnas)
            best = 0
            for f in filas:
                ok = sum(1 for j, v in enumerate(vf) if j < len(f) and f[j] == norm(v))
                best = max(best, ok)
            aciertos += best
        r = aciertos / total
        if r > mejor[0]:
            mejor = (r, t["id"])
    return mejor


# ---------------- libro ----------------
CAMPOS_LIBRO = ["fecha_expedicion", "serie", "numero_factura", "nif_destinatario", "nombre_destinatario", "base_imponible", "tipo_iva", "cuota_iva", "total"]


def verdad_libro(nombre):
    if nombre == "libro60":
        filas = LIBRO60
        return [{"fecha_expedicion": r["fecha"], "serie": r["serie"], "numero_factura": r["numero"], "nif_destinatario": r["nif"],
                 "nombre_destinatario": r["nombre"], "base_imponible": float(r["base"]), "tipo_iva": float(r["tipo"]),
                 "cuota_iva": float(r["cuota"]), "total": float(r["total"])} for r in filas]
    return [{"fecha_expedicion": r["fecha_iso"], "serie": r["serie"], "numero_factura": r["numero"], "nif_destinatario": r["nif"],
             "nombre_destinatario": r["nombre"], "base_imponible": float(r["base"]), "tipo_iva": float(r["tipo"]),
             "cuota_iva": float(r["cuota"]), "total": float(r["total"])} for r in LIBRO]


def igual(campo, a, b):
    if campo in ("base_imponible", "tipo_iva", "cuota_iva", "total"):
        return num(a) is not None and abs(num(a) - b) < 0.005
    return a is not None and norm(a) == norm(b)


def eval_libro(res, nombre):
    de = res.get("datos_especificos") or {}
    regs = de.get("registros") or []
    verdad = verdad_libro(nombre)
    por_num = {}
    for r in regs:
        n = (r.get("valores") or {}).get("numero_factura")
        if n is not None:
            por_num.setdefault(norm(n), r)
    ok = 0
    fallos = {}
    total = len(verdad) * len(CAMPOS_LIBRO)
    for i, v in enumerate(verdad):
        r = por_num.get(norm(v["numero_factura"]))
        if r is None and i < len(regs):
            r = regs[i]
        vals = (r or {}).get("valores") or {}
        for c in CAMPOS_LIBRO:
            if igual(c, vals.get(c), v[c]):
                ok += 1
            else:
                fallos.setdefault(c, []).append({"esperado": v[c], "obtenido": vals.get(c)})
    tot = (de.get("resumen") or {}).get("totales") or {}
    esperado_tot = {"base_imponible": sum(x["base_imponible"] for x in verdad), "cuota_iva": sum(x["cuota_iva"] for x in verdad),
                    "total": sum(x["total"] for x in verdad)}
    totales_ok = {k: (num(valor(tot.get(k))) is not None and abs(num(valor(tot.get(k))) - e) < 0.01) for k, e in esperado_tot.items()}
    return {"registros": len(regs), "registros_esperados": len(verdad), "campos_ok": ok, "campos_total": total,
            "exactitud_campos": ok / total, "totales_ok": totales_ok, "estado_formato": de.get("estado"),
            "fallos_ejemplo": {k: v[:3] for k, v in fallos.items()}, "n_fallos_por_campo": {k: len(v) for k, v in fallos.items()}}


# ---------------- comprobaciones específicas ----------------
def issues(res):
    return (res.get("diagnostics") or {}).get("issues") or []


def hallazgos(res):
    return (res.get("seguridad_contenido") or {}).get("patrones_sospechosos_detectados") or []


def check(ch, res, texto, bloques_txt, r_bruto):
    t = ch["tipo"]
    nt = norm(texto)
    if t == "contiene":
        return norm(ch["texto"]) in nt, None
    if t == "no_contiene":
        return norm(ch["texto"]) not in nt, None
    if t == "contiene_en_algun_sitio":
        return norm(ch["texto"]) in norm(json.dumps(res.get("content") or {}, ensure_ascii=False)), None
    if t == "numeracion_lista":
        presentes = [norm(x) in nt for x in ch["items"]]
        return all(presentes), f"{sum(presentes)}/{len(presentes)} con su número"
    if t == "titulos":
        n = sum(1 for b in (res.get("content") or {}).get("blocks", []) if b.get("kind") == "heading")
        return n == ch["n"], f"{n} títulos"
    if t == "aviso_esperado":
        hay = any(re.search(ch["patron"], (i.get("message") or "") + " " + (i.get("code") or "")) for i in issues(res))
        return hay, None
    if t == "oculto_marcado":
        hay = any(h.get("tipo", "").startswith("texto_oculto") and ch["marca"] in (h.get("fragmento_seguro") or "") for h in hallazgos(res))
        return hay, None
    if t == "inyeccion_detectada":
        hay = any(h.get("tipo") in ("prompt_injection", "suplantacion_delimitador") and ch["marca"] in (h.get("fragmento_seguro") or "") for h in hallazgos(res))
        return hay, None
    if t == "apariciones":
        n = nt.count(norm(ch["texto"]))
        return n == ch["n"], f"{n} apariciones"
    if t == "celda_bajo_cabecera":
        for tb in (res.get("content") or {}).get("tables", []):
            ids = {c["id"]: c["label"] for c in tb["columns"]}
            for f in tb["rows"]:
                if any(norm(ch["fila_contiene"]) in norm(texto_celda(c)) for c in f["cells"]):
                    for c in f["cells"]:
                        if norm(ids.get(c["columnId"], "")) == norm(ch["columna"]):
                            return norm(texto_celda(c)) == norm(ch["valor"]), f"bajo «{ch['columna']}» hay «{texto_celda(c)}»"
                    return False, f"columna «{ch['columna']}» vacía en esa fila"
        return False, "fila no encontrada"
    if t == "hoja_oculta_marcada":
        hojas = (res.get("metadata") or {}).get("sheets") or []
        return any(h.get("name") == ch["hoja"] and h.get("state") in ("hidden", "veryHidden") for h in hojas), None
    if t == "truncado_avisado":
        cods = [i.get("code") for i in issues(res)]
        return "XLSX_ROWS_TRUNCATED" in cods, ", ".join(c for c in cods if c)
    if t == "rechazo_controlado":
        st = (res.get("processing") or {}).get("status")
        msgs = " | ".join((i.get("message") or "") for i in issues(res))
        ok = r_bruto.get("ok") and st == "failed" and bool(msgs)
        if ok and ch.get("patron"):
            ok = bool(re.search(ch["patron"], msgs))
        return ok, f"estado={st}; {msgs[:220]}"
    if t == "cadenas_exactas":
        tb = ((res.get("content") or {}).get("tables") or [None])[0]
        if not tb:
            return False, "sin tabla"
        col1 = tb["columns"][0]["id"]
        vistos = []
        for f in tb["rows"]:
            for c in f["cells"]:
                if c["columnId"] == col1:
                    vistos.append(texto_celda(c))
        ok = sum(1 for a, b in zip(vistos, CADENAS) if a == b)
        return ok == len(CADENAS), f"{ok}/{len(CADENAS)} cadenas idénticas"
    if t == "varias_facturas":
        presentes = [n in nt for n in ch["numeros"]]
        sem_num = valor((res.get("documento") or {}).get("numero_documento"))
        tot = valor(((res.get("importes") or {}).get("inferidos") or {}).get("total"))
        ops = res.get("operaciones") or []
        return False, (f"texto: {sum(presentes)}/3 números presentes; documento.numero_documento={sem_num!r}; "
                       f"importes.inferidos.total={tot!r}; operaciones={len(ops)}")
    if t == "sin_tablas_falsas":
        n = len((res.get("content") or {}).get("tables", []))
        return n == 0, f"{n} tabla(s) detectada(s)"
    return None, f"comprobación desconocida {t}"


def orden_lectura(texto):
    nt = norm(texto)
    pars = DOS_COLUMNAS_IZQ + DOS_COLUMNAS_DER
    pos = [nt.find(norm(p)) for p in pars]
    contiguos = sum(1 for p in pos if p >= 0)
    en_orden = all(pos[i] < pos[i + 1] for i in range(len(pos) - 1)) if all(p >= 0 for p in pos) else False
    return {"parrafos_contiguos": contiguos, "parrafos": len(pars), "en_orden": en_orden,
            "recall_palabras": recall_palabras(texto, "\n".join(pars)), "inicio": nt[:300]}


EVAL = []
for d in V:
    ruta = os.path.join(OUT, "resultados", CONFIG, d["id"] + ".json")
    if not os.path.exists(ruta):
        continue
    rb = json.load(open(ruta, encoding="utf-8"))
    res = rb.get("resultado") or {}
    texto, bloques_txt = textos(res)
    e = {"id": d["id"], "archivo": d["archivo"], "cajetilla": d["cajetilla"], "verdad": d["verdad"], "nota": d["nota"],
         "ok": rb.get("ok"), "ms": rb.get("ms"), "error": rb.get("error"),
         "estado": (res.get("processing") or {}).get("status"),
         "parser": ((res.get("processing") or {}).get("parser") or {}).get("name"),
         "ocr": (res.get("processing") or {}).get("ocr"),
         "issues": [{"code": i.get("code"), "severity": i.get("severity"), "message": (i.get("message") or "")[:300]} for i in issues(res)],
         "confianza_global": (res.get("confianza") or {}).get("confianza_global"),
         "n_bloques": len((res.get("content") or {}).get("blocks", [])), "n_tablas": len((res.get("content") or {}).get("tables", [])),
         "texto_inicio": norm(texto)[:400]}
    checks = []
    for ch in d["checks"]:
        if ch == "campos_factura":
            f = eval_factura(res, texto)
            e["factura"] = f
        elif ch == "tabla_lineas":
            r, tid = mejor_tabla(res, FACTURA_TABLA)
            e["tabla_lineas"] = {"exactitud_celdas": r, "tabla": tid}
        elif ch in ("registros",):
            e["libro"] = eval_libro(res, d["verdad"])
            filas = LIBRO60 if d["verdad"] == "libro60" else None
            verdad_txt = "\n".join(" ".join(libro_fila_texto(r)) for r in LIBRO) if d["verdad"] == "libro" else None
            if verdad_txt:
                e["libro"]["recall_palabras_texto"] = recall_palabras(texto, verdad_txt)
        elif ch == "valores_formula":
            regs = (res.get("datos_especificos") or {}).get("registros") or []
            n = sum(1 for r in regs if "cuota_iva" in (r.get("valores_calculados_por_excel") or []))
            e["valores_formula"] = {"registros_marcados_formula": n}
        elif ch == "fila_total_excluida":
            ft = ((res.get("datos_especificos") or {}).get("resumen") or {}).get("filas_totales_documento") or []
            e["fila_total_excluida"] = len(ft) == 1
        elif ch == "orden_lectura":
            e["orden_lectura"] = orden_lectura(texto)
        elif ch == "sin_mojibake":
            e["sin_mojibake"] = ("Ibáñez" in texto and "€" in texto and "Ã" not in texto)
        elif isinstance(ch, dict):
            ok, det = check(ch, res, texto, bloques_txt, rb)
            checks.append({"check": ch, "ok": ok, "detalle": det})
    if d["verdad"] == "factura" and "factura" not in e:
        e["factura"] = eval_factura(res, texto)
    e["checks"] = checks
    EVAL.append(e)

json.dump(EVAL, open(os.path.join(OUT, f"evaluacion_{CONFIG}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for e in EVAL:
    linea = f"{e['id']:8} {str(e['estado']):9} {e['ms']:>6}ms"
    if "factura" in e:
        f = e["factura"]
        linea += f" | campos {f['campos_ok']}/{f['campos_total']} recall {f['recall_palabras']:.3f} CER {f['cer']:.3f}"
        if f.get("d7_importes_ok") is not None:
            linea += f" D7 {f['d7_importes_ok']:.2f}"
    if "tabla_lineas" in e:
        linea += f" | tabla {e['tabla_lineas']['exactitud_celdas']:.2f}"
    if "libro" in e:
        l = e["libro"]
        linea += f" | reg {l['registros']}/{l['registros_esperados']} campos {l['exactitud_campos']:.3f} tot {sum(l['totales_ok'].values())}/3"
        if l.get("recall_palabras_texto") is not None:
            linea += f" texto {l['recall_palabras_texto']:.3f}"
    if "orden_lectura" in e:
        o = e["orden_lectura"]
        linea += f" | contiguos {o['parrafos_contiguos']}/{o['parrafos']} orden {o['en_orden']}"
    for c in e["checks"]:
        linea += f" | {c['check']['tipo']}={c['ok']}" + (f" ({c['detalle']})" if c["detalle"] else "")
    for k in ("sin_mojibake", "fila_total_excluida", "valores_formula"):
        if k in e:
            linea += f" | {k}={e[k]}"
    print(linea)
