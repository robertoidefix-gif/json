"""Comprueba los casos de la fase E (generar_casos_faseE.py) con los resultados del analizador.

Uso: python3 verificar_casos_faseE.py <carpeta_salida_casos> <etiqueta>
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
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", t or "")).strip()


for d in verdad:
    print(f"{d['id']} · {d['nota']}")
    e = d["esperado"]
    rb = json.load(open(os.path.join(R, f"{d['id']}.json"), encoding="utf-8"))
    r = rb.get("resultado") or {}
    if not rb.get("ok") or not r:
        ok(False, f"analizado sin error ({rb.get('error')})")
        continue
    issues = (r.get("diagnostics") or {}).get("issues", [])
    codigos = {x["code"]: x for x in issues}
    estado = (r.get("processing") or {}).get("status")
    ok(estado in e.get("estado", ["complete"]), f"estado {estado}")
    for clave in ("aviso", "aviso2"):
        if clave in e:
            ok(e[clave] in codigos, f"aviso {e[clave]}" + (f": {codigos[e[clave]]['message'][:110]}" if e[clave] in codigos else ""))
    for c in e.get("sin_aviso", []):
        ok(c not in codigos, f"sin el aviso {c}")
    if "giro" in e:
        det = (codigos.get("OCR_ROTATED") or {}).get("details") or {}
        leido = det.get("giro") if "giro" in det else [p.get("giro") for p in det.get("pages", [])]
        ok(leido == e["giro"] or leido == [e["giro"]], f"giro {e['giro']}° (leído: {leido})")
    if "grados" in e:
        det = (codigos.get("OCR_DESKEWED") or {}).get("details") or {}
        leido = det.get("grados") if "grados" in det else ([p.get("grados") for p in det.get("pages", [])] or [None])[0]
        ok(leido is not None and abs(leido - e["grados"]) <= 0.3, f"enderezado {e['grados']}° ± 0,3 (leído: {leido})")
    if "escala_maxima" in e:
        det = (codigos.get("OCR_UPSCALED") or {}).get("details") or {}
        ok(det.get("escala") is not None and det["escala"] <= e["escala_maxima"], f"ampliación ≤ ×{e['escala_maxima']} (leída: {det.get('escala')})")
    cont = r.get("content") or {}
    texto = norm(json.dumps(cont, ensure_ascii=False))
    for t in e.get("contiene", []):
        ok(norm(t) in texto, f"contiene {t!r}")
    if "importes" in e:
        inf = (r.get("importes") or {}).get("inferidos") or {}
        for k, v in e["importes"].items():
            ok(abs(((inf.get(k) or {}).get("valor") or 0) - v) < 0.005, f"importes.inferidos.{k} = {v} (leído: {(inf.get(k) or {}).get('valor')})")
    if "tabla_filas" in e:
        filas = [len(t["rows"]) for t in cont.get("tables", [])]
        ok(any(n >= e["tabla_filas"] for n in filas), f"tabla con ≥ {e['tabla_filas']} filas ({filas})")

print("FALLOS:", fallos)
sys.exit(1 if fallos else 0)
