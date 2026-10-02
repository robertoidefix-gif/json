"""Comprueba los casos de la fase F (generar_casos_faseF.py) con los resultados del analizador.

Uso: python3 verificar_casos_faseF.py <carpeta_salida_casos> <etiqueta>
"""
import sys, os, json, re, unicodedata

OUT, ETIQ = sys.argv[1:3]
verdad = json.load(open(os.path.join(OUT, "verdad.json"), encoding="utf-8"))
R = os.path.join(OUT, "resultados", ETIQ)
fallos = 0


def ok(cond, texto):
    global fallos
    print(("  ✅ " if cond else "  ❌ ") + texto)
    if not cond:
        fallos += 1


def norm(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(t or ""))).strip()


def celda_txt(c):
    v = c.get("raw")
    return "" if v is None and c.get("value") is None else str(v if v is not None else c.get("value"))


for d in verdad:
    print(f"{d['id']} · {d['nota']}")
    e = d["esperado"]
    rb = json.load(open(os.path.join(R, f"{d['id']}.json"), encoding="utf-8"))
    r = rb.get("resultado") or {}
    if not rb.get("ok") or not r:
        ok(False, f"analizado sin excepción ({rb.get('error')})")
        continue
    issues = (r.get("diagnostics") or {}).get("issues", [])
    codigos = {x["code"]: x for x in issues}
    mensajes = " | ".join(x.get("message") or "" for x in issues)
    estado = (r.get("processing") or {}).get("status")
    ok(estado in e["estado"], f"estado {estado} (esperado {', '.join(e['estado'])})")
    if "aviso" in e:
        ok(e["aviso"] in codigos, f"aviso {e['aviso']}" + (f": {codigos[e['aviso']]['message'][:120]}" if e["aviso"] in codigos else ""))
    for c in e.get("sin_aviso", []):
        ok(c not in codigos, f"sin el aviso {c}")
    if "mensaje_contiene" in e:
        ok(e["mensaje_contiene"] in mensajes, f"mensaje con «{e['mensaje_contiene']}»")
    for t in e.get("mensaje_no_contiene", []):
        ok(t not in mensajes, f"ningún mensaje contiene «{t}»" + (f" (mensajes: {mensajes[:160]})" if t in mensajes else ""))
    for cod, esperado in e.get("detalles", {}).items():
        det = (codigos.get(cod) or {}).get("details") or {}
        for k, v in esperado.items():
            ok(det.get(k) == v, f"{cod}.details.{k} = {v!r} (leído: {det.get(k)!r})")
    if "formato" in e:
        ok((r.get("source") or {}).get("detectedFormat") == e["formato"], f"formato detectado {e['formato']} (leído: {(r.get('source') or {}).get('detectedFormat')})")
    cont = r.get("content") or {}
    bloques = [b for b in cont.get("blocks", []) if b.get("text")]
    tablas = cont.get("tables", [])
    texto = "\n".join([b["text"] for b in bloques] + [celda_txt(c) for t in tablas for f in t["rows"] for c in f["cells"]])
    for t in e.get("texto_contiene", []):
        ok(norm(t) in norm(texto), f"texto contiene {t!r}")
    for t, n in e.get("texto_veces", []):
        veces = norm(texto).count(norm(t))
        ok(veces == n, f"{t!r} aparece {n} vez/veces (leído: {veces})")
    if "bloques_exactos" in e:
        propios = [b["text"] for b in bloques if (b.get("source") or {}).get("part") == "word/document.xml"]
        ok(propios == e["bloques_exactos"], "párrafos con su número: " + ("todos correctos" if propios == e["bloques_exactos"] else
           "; ".join(f"{a!r}≠{b!r}" for a, b in zip(propios, e["bloques_exactos"]) if a != b)[:300] or f"{len(propios)} párrafos"))
    for fila, col, valor in e.get("celdas", []):
        hallado = None
        for t in tablas:
            ids = {c["id"]: c["label"] for c in t["columns"]}
            for f in t["rows"]:
                if any(fila in celda_txt(c) for c in f["cells"]):
                    hallado = next((celda_txt(c) for c in f["cells"] if norm(ids.get(c["columnId"])) == norm(col)), "")
                    break
            if hallado is not None:
                break
        ok(hallado is not None and norm(hallado) == norm(valor), f"fila «{fila}», columna «{col}» = {valor!r} (leído: {hallado!r})")
    for t in e.get("ninguna_celda_contiene", []):
        ok(not any(t in celda_txt(c) for tb in tablas for f in tb["rows"] for c in f["cells"]), f"ninguna celda contiene «{t}»")
    if "combinadas" in e:
        n = sum(1 for t in tablas for f in t["rows"] for c in f["cells"] if (c.get("source") or {}).get("combinada_desde"))
        ok(n == e["combinadas"], f"{e['combinadas']} celdas con combinada_desde (leídas: {n})")
    if "tiempo_max_ms" in e:
        ok(rb.get("ms", 0) <= e["tiempo_max_ms"], f"tiempo {rb.get('ms')} ms ≤ {e['tiempo_max_ms']} ms")
    if "facturas" in e:
        fd = (r.get("documento") or {}).get("facturas_detectadas") or []
        leidas = [[(f.get("numero_documento") or {}).get("valor"), f.get("pagina_desde"), f.get("pagina_hasta"),
                   (f.get("total") or {}).get("valor")] for f in fd]
        ok(leidas == e["facturas"], f"facturas_detectadas = {e['facturas']} (leídas: {leidas})")
    if "numero_documento" in e:
        leido = ((r.get("documento") or {}).get("numero_documento") or {}).get("valor")
        ok(leido == e["numero_documento"], f"documento.numero_documento = {e['numero_documento']!r} (leído: {leido!r})")

print(f"\nFALLOS: {fallos}")
sys.exit(1 if fallos else 0)
