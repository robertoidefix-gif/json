"""Consolida las evaluaciones por formato con reglas de veredicto explícitas.

Reglas (las mismas para todos los formatos):
  factura  ✅ los 7 datos fiscales correctos, texto ≥ 95 % y, si se comprueba, tabla de líneas ≥ 95 % y resto de comprobaciones OK
           ⚠️ ≥ 4 datos fiscales o texto ≥ 80 %            ❌ en otro caso
  libro    ✅ todos los registros y el 100 % de sus campos  ⚠️ campos ≥ 80 %   ❌ en otro caso
  dañado   ✅ rechazo controlado con mensaje claro en español  ⚠️ controlado pero mensaje técnico en inglés  ❌ cuelgue o excepción
  resto    ✅ todas las comprobaciones   ⚠️ alguna   ❌ ninguna
Puntuación de un grupo = 10 × (✅ + ½·⚠️) / casos.
"""
import sys, os, json, statistics, re

OUT = os.path.abspath(sys.argv[1])
V = {d["id"]: d for d in json.load(open(os.path.join(OUT, "verdad.json"), encoding="utf-8"))}
EV = {c: {e["id"]: e for e in json.load(open(os.path.join(OUT, f"evaluacion_{c}.json"), encoding="utf-8"))} for c in ("prod", "latinos", "spa")}
PRINCIPAL = os.environ.get("PRINCIPAL", "prod")
if PRINCIPAL != "prod":
    EV[PRINCIPAL] = {e["id"]: e for e in json.load(open(os.path.join(OUT, f"evaluacion_{PRINCIPAL}.json"), encoding="utf-8"))}
INY = json.load(open(os.path.join(OUT, "variantes_inyeccion.json"), encoding="utf-8"))

TIPICOS = {"html01", "html02", "htm03", "htm04", "html12", "htm10", "docx01", "docx02", "docx03", "docx10", "docx11", "xlsx01", "xlsx02", "xlsx03",
           "xlsx04", "xlsx08", "xlsx09", "xls01", "xls02", "xls04", "xls05", "pdf01", "pdf02", "pdf03", "pdf04", "pdf06", "pdf11b", "pdf15",
           "pdfE1", "pdfE2", "pdfE3", "pdfE4", "png01", "jpg02", "jpeg03", "png04", "png09"}
FORMATO = {}
for i, d in V.items():
    ext = d["archivo"].rsplit(".", 1)[1].lower()
    if ext == "pdf":
        ext = "pdf-escaneado" if (i.startswith("pdfE") or i == "pdf09") else "pdf-digital"
    FORMATO[i] = ext


def veredicto(e, d):
    checks = e.get("checks", [])
    extra_ok = all(c["ok"] for c in checks) if checks else True
    if d["verdad"] in ("error", "error_o_parcial"):
        c = checks[0] if checks else {"ok": False, "detalle": ""}
        msg = c.get("detalle") or ""
        if c["ok"] and re.search(r"No password given|Invalid PDF structure", msg):
            return "⚠️", "rechazo controlado, pero el mensaje es el texto técnico de PDF.js en inglés: " + msg.split("; ", 1)[-1][:80]
        return ("✅", "rechazo controlado: " + msg.split("; ", 1)[-1][:110]) if c["ok"] else ("❌", msg[:120])
    if d["id"] == "html05":
        # Fase D: se calcula con el resultado y va ANTES de la regla de factura. Antes estaba detrás y nunca se
        # aplicaba: html05 se puntuaba solo por sus datos fiscales (✅) aunque la tabla del informe dijera ⚠️.
        r = json.load(open(os.path.join(OUT, "resultados", PRINCIPAL, "html05.json"), encoding="utf-8"))["resultado"]
        H = r["seguridad_contenido"]["patrones_sospechosos_detectados"]
        marcados = sorted({h["fragmento_seguro"][:4] for h in H if h["tipo"] == "texto_oculto_html" and h["fragmento_seguro"].startswith("OC_")})
        inyec = sorted({h["fragmento_seguro"][:4] for h in H if h["tipo"] == "prompt_injection" and h["fragmento_seguro"].startswith("OC_")})
        faltan = [k for k in ("OC_A", "OC_B", "OC_C", "OC_D", "OC_E", "OC_F", "OC_G", "OC_H") if k not in marcados]
        txt = (f"datos fiscales {e['factura']['campos_ok']}/7 · texto oculto marcado como oculto: {len(marcados)}/8" +
               (f" (sin marcar: {', '.join(faltan)})" if faltan else "") + f" · instrucción detectada por patrón en {len(inyec)}/8")
        if e["factura"]["campos_ok"] == 7 and len(marcados) == 8 and len(inyec) == 8:
            return "✅", txt
        return ("⚠️" if marcados or e["factura"]["campos_ok"] >= 4 else "❌"), txt
    if "factura" in e:
        f = e["factura"]
        tabla = e.get("tabla_lineas", {}).get("exactitud_celdas")
        txt = f"datos fiscales {f['campos_ok']}/7 · texto {f['recall_palabras'] * 100:.0f} %" + (f" · tabla de líneas {tabla * 100:.0f} %" if tabla is not None else "")
        if e.get("sin_mojibake") is False:
            extra_ok = False
            txt += " · mojibake"
        malos = [c for c in checks if not c["ok"]]
        if malos:
            txt += " · falla: " + "; ".join(f"{c['check']['tipo']}" + (f" ({c['detalle']})" if c["detalle"] else "") for c in malos)
        if f["campos_ok"] == 7 and f["recall_palabras"] >= 0.95 and (tabla is None or tabla >= 0.95) and extra_ok:
            return "✅", txt
        if f["campos_ok"] >= 4 or f["recall_palabras"] >= 0.80:
            return "⚠️", txt
        return "❌", txt
    if "libro" in e:
        l = e["libro"]
        txt = f"registros {l['registros']}/{l['registros_esperados']} · campos {l['exactitud_campos'] * 100:.1f} % · totales {sum(l['totales_ok'].values())}/3"
        if l.get("recall_palabras_texto") is not None and l["registros"] == 0:
            txt += f" · texto leído {l['recall_palabras_texto'] * 100:.0f} %"
        for k in ("fila_total_excluida",):
            if k in e:
                txt += f" · fila «Total» excluida: {'sí' if e[k] else 'no'}"
                extra_ok = extra_ok and e[k]
        malos = [c for c in checks if not c["ok"]]
        if malos:
            txt += " · falla: " + "; ".join(c["check"]["tipo"] for c in malos)
        if l["registros"] == l["registros_esperados"] and l["exactitud_campos"] == 1.0 and extra_ok:
            return "✅", txt
        if l["exactitud_campos"] >= 0.8:
            return "⚠️", txt
        return "❌", txt
    if "orden_lectura" in e:
        o = e["orden_lectura"]
        # Fase C: la regla común (✅ si se cumplen todas las comprobaciones); antes este caso siempre fallaba.
        if o["parrafos_contiguos"] == o["parrafos"] and o["en_orden"] and extra_ok:
            return "✅", f"{o['parrafos']}/{o['parrafos']} párrafos legibles y en orden · {checks[0]['detalle'] if checks else ''}"
        return ("⚠️" if o["parrafos_contiguos"] * 2 >= o["parrafos"] else "❌"), (
            f"{o['parrafos_contiguos']}/{o['parrafos']} párrafos legibles seguidos; las líneas de las dos columnas se intercalan"
            f" · {checks[0]['detalle'] if checks else ''}")
    if d["id"] == "pdf07":
        return "⚠️", "se lee todo el texto, pero solo la 1.ª factura se estructura: " + checks[0]["detalle"]
    if d["id"] == "html13":
        # Fase D: detección calculada con el resultado (antes, fija). Cada variante es un párrafo «INYxx: …».
        r = json.load(open(os.path.join(OUT, "resultados", PRINCIPAL, "html13.json"), encoding="utf-8"))["resultado"]
        bloques = r["content"]["blocks"]
        detectadas = set()
        for h in r["seguridad_contenido"]["patrones_sospechosos_detectados"]:
            m = re.match(r"^/content/blocks/(\d+)/text$", h["campo"])
            if m and h["tipo"] in ("prompt_injection", "suplantacion_delimitador"):
                detectadas.add(bloques[int(m.group(1))].get("text", "")[:5])
        det, n = [], 0
        for k, idioma, t in INY:
            if k == "INY10":
                continue
            ok = k in detectadas
            n += ok
            det.append(f"{idioma}:{'sí' if ok else 'no'}")
        txt = (f"{n}/10 variantes detectadas (" + ", ".join(det) + "); en HTML el delimitador </DOCUMENT_DATA> se elimina al analizar la "
               f"etiqueta (INY10 {'detectada' if 'INY10' in detectadas else 'no detectada'} por su texto)")
        return ("✅" if n == 10 else "⚠️" if n else "❌"), txt
    if d["verdad"] == "rendimiento":
        return ("✅" if e["estado"] == "complete" else "❌"), f"{e['ms']} ms · {e['n_bloques']} bloques"
    if checks:
        n = sum(1 for c in checks if c["ok"])
        txt = "; ".join(f"{c['check']['tipo']}={'OK' if c['ok'] else 'FALLA'}" + (f" ({c['detalle']})" if c["detalle"] else "") for c in checks)
        return ("✅" if n == len(checks) else "⚠️" if n else "❌"), txt
    return "?", ""


salida = {"formatos": {}, "casos": []}
for i, d in V.items():
    e = EV[PRINCIPAL].get(i)
    if not e:
        continue
    v, txt = veredicto(e, d)
    caso = {"id": i, "formato": FORMATO[i], "archivo": d["archivo"], "cajetilla": d["cajetilla"], "tipo": "típico" if i in TIPICOS else "límite",
            "nota": d["nota"], "veredicto": v, "resultado": txt, "estado": e["estado"], "ms": e["ms"]}
    for c in ("latinos", "spa"):
        if i in EV[c]:
            v2, t2 = veredicto(EV[c][i], d)
            caso[c] = {"veredicto": v2, "resultado": t2, "ms": EV[c][i]["ms"]}
    salida["casos"].append(caso)

pt = lambda cs: round(10 * sum(1 if c["veredicto"] == "✅" else 0.5 if c["veredicto"] == "⚠️" else 0 for c in cs) / len(cs), 1) if cs else None
FAMILIAS = {"pdf-digital": ["pdf-digital"], "pdf-escaneado": ["pdf-escaneado"], "pdf (global)": ["pdf-digital", "pdf-escaneado"], "docx": ["docx"],
            "xlsx": ["xlsx"], "xls": ["xls"], "html": ["html"], "htm": ["htm"], "html+htm (mismo lector)": ["html", "htm"], "png": ["png"], "jpg": ["jpg"],
            "jpeg": ["jpeg"], "imagenes png+jpg+jpeg (mismo OCR)": ["png", "jpg", "jpeg"]}
for fmt, miembros in FAMILIAS.items():
    cs = [c for c in salida["casos"] if c["formato"] in miembros]
    tip = [c for c in cs if c["tipo"] == "típico"]
    lim = [c for c in cs if c["tipo"] == "límite"]
    ok = [c["ms"] for c in cs if c["estado"] in ("complete", "partial")]
    salida["formatos"][fmt] = {"casos": len(cs), "✅": sum(c["veredicto"] == "✅" for c in cs), "⚠️": sum(c["veredicto"] == "⚠️" for c in cs),
                               "❌": sum(c["veredicto"] == "❌" for c in cs), "puntuacion": pt(cs), "puntuacion_tipicos": pt(tip),
                               "puntuacion_limite": pt(lim), "ms_mediana": statistics.median(ok) if ok else None, "ms_max": max(ok) if ok else None}
json.dump(salida, open(os.path.join(OUT, "consolidado.json" if PRINCIPAL == "prod" else f"consolidado_{PRINCIPAL}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for fmt, r in salida["formatos"].items():
    print(f"{fmt:14} casos {r['casos']:2}  ✅{r['✅']:2} ⚠️{r['⚠️']:2} ❌{r['❌']:2}  nota {r['puntuacion']}  típicos {r['puntuacion_tipicos']}  límite {r['puntuacion_limite']}  ms mediana {r['ms_mediana']} máx {r['ms_max']}")
print()
for c in salida["casos"]:
    extra = ""
    if "spa" in c:
        extra = f"  || 5 latinos: {c['latinos']['veredicto']} {c['latinos']['ms']} ms · solo spa: {c['spa']['veredicto']} {c['spa']['ms']} ms"
    print(f"{c['formato']:13} {c['id']:7} {c['tipo']:7} {c['veredicto']} {c['ms']:>6} ms  {c['resultado'][:230]}{extra}")
