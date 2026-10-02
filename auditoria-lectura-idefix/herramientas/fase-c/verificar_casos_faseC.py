"""Comprueba los casos de la fase C (generar_casos_faseC.py).

Uso: python3 verificar_casos_faseC.py <carpeta_salida_casos> <etiqueta>
"""
import sys, os, json, unicodedata, re

OUT, ETIQ = sys.argv[1:3]
verdad = {d["id"]: d for d in json.load(open(os.path.join(OUT, "verdad.json"), encoding="utf-8"))}
R = os.path.join(OUT, "resultados", ETIQ)
fallos = 0


def ok(cond, texto):
    global fallos
    print(("  ✅ " if cond else "  ❌ ") + texto)
    if not cond:
        fallos += 1


def norm(t):
    t = unicodedata.normalize("NFC", t or "")
    return re.sub(r"\s+", " ", t).strip()


for i, d in verdad.items():
    print(f"{i} · {d['nota']}")
    e = d["esperado"]
    rb = json.load(open(os.path.join(R, f"{i}.json"), encoding="utf-8"))
    r = rb.get("resultado") or {}
    if e.get("rechazado"):
        mensaje = ((r.get("diagnostics") or {}).get("issues") or [{}])[0].get("message", "") or str(rb.get("error") or "")
        ok(not rb.get("ok") or (r.get("processing") or {}).get("status") == "failed", f"rechazado con mensaje: {mensaje[:70]!r}")
        continue
    cont = r.get("content") or {}
    bloques = [b.get("text", "") for b in cont.get("blocks", []) if b.get("kind") != "table"]
    texto = norm("\n".join(bloques))
    codigos = [x["code"] for x in (r.get("diagnostics") or {}).get("issues", [])]
    if "orden" in e:
        pos = [texto.find(norm(t)) for t in e["orden"]]
        ok(all(p >= 0 for p in pos), f"{sum(p >= 0 for p in pos)}/{len(pos)} líneas o párrafos presentes")
        ok(all(p >= 0 for p in pos) and pos == sorted(pos), "en orden de lectura")
    if "lineas_enteras" in e:
        for t in e["lineas_enteras"]:
            ok(any(norm(b) == norm(t) for b in bloques), f"línea entera: {t!r}")
    if "importes" in e:
        inf = (r.get("importes") or {}).get("inferidos") or {}
        for k, v in e["importes"].items():
            ok(abs(((inf.get(k) or {}).get("valor") or 0) - v) < 0.005, f"importes.inferidos.{k} = {v} (leído: {(inf.get(k) or {}).get('valor')})")
    if "tabla_filas" in e or "tabla_contiene" in e:
        tablas = cont.get("tables", [])
        celdas = [[c.get("raw") for c in row["cells"]] for t in tablas for row in t["rows"]]
        if "tabla_filas" in e:
            ok(any(len(t["rows"]) >= e["tabla_filas"] for t in tablas), f"tabla con ≥ {e['tabla_filas']} filas ({[len(t['rows']) for t in tablas]})")
        for v in e.get("tabla_contiene", []):
            ok(any(v in [str(x) for x in f if x is not None] for f in celdas), f"celda {v!r} en una tabla")
    if "filas" in e:
        t = cont["tables"][0]
        filas = [[c["raw"] for c in row["cells"]] for row in t["rows"]]
        for k, esperada in enumerate(e["filas"]):
            ok(k < len(filas) and filas[k] == esperada, f"fila {k + 1}: {esperada} (leída: {filas[k] if k < len(filas) else None})")
        for clave, origen in e.get("combinada_desde", {}).items():
            a, b = map(int, clave.split(","))
            ok(t["rows"][a]["cells"][b]["source"].get("combinada_desde") == origen, f"fila {a + 1} col {b + 1}: combinada_desde = {origen}")
    if "contiene" in e:
        todo = norm(json.dumps(cont, ensure_ascii=False))
        for t in e["contiene"]:
            ok(norm(t) in todo, f"contiene {t!r}")
        for t in e.get("no_contiene", []):
            ok(norm(t) not in todo, f"no contiene {t!r}")
    if e.get("inyeccion"):
        pats = ((r.get("seguridad_contenido") or {}).get("patrones_sospechosos_detectados") or [])
        ok(any(p.get("tipo") == "prompt_injection" for p in pats), "instrucción inyectada detectada")
    if "aviso" in e:
        ok(e["aviso"] in codigos, f"aviso {e['aviso']}")
    if "sin_aviso" in e:
        ok(e["sin_aviso"] not in codigos, f"sin el aviso {e['sin_aviso']}")

print("FALLOS:", fallos)
sys.exit(1 if fallos else 0)
