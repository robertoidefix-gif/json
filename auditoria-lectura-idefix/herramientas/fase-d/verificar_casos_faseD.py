"""Comprueba los casos de la fase D (generar_casos_faseD.py) con los resultados del analizador.

Uso: python3 verificar_casos_faseD.py <carpeta_salida_casos> <etiqueta>
  ocultos      [marca, motivo]: debe haber un hallazgo texto_oculto_* cuyo fragmento contenga la marca, con ese motivo
  no_ocultos   marcas que NO deben aparecer en ningún hallazgo de texto oculto (texto visible que lo parece)
  sin_ocultos  ningún hallazgo de texto oculto en todo el documento
  contiene     el texto (también el oculto) se conserva en el contenido
  frases       [Fnn, True|False]: el párrafo «Fnn: …» debe (o no) tener un hallazgo de instrucción a una IA
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
    H = (r.get("seguridad_contenido") or {}).get("patrones_sospechosos_detectados") or []
    ocultos = [h for h in H if h["tipo"].startswith("texto_oculto")]
    codigos = [x["code"] for x in (r.get("diagnostics") or {}).get("issues", [])]
    for marca, motivo in e.get("ocultos", []):
        h = [x for x in ocultos if marca in x.get("fragmento_seguro", "")]
        ok(any(x["patron"] == motivo for x in h), f"{marca} marcado como oculto ({motivo}); leído: {[x['patron'] for x in h] or 'sin marcar'}")
    for marca in e.get("no_ocultos", []):
        h = [x for x in ocultos if marca in x.get("fragmento_seguro", "")]
        ok(not h, f"{marca} no se marca (se ve); leído: {[x['patron'] for x in h] or 'sin marcar'}")
    if e.get("sin_ocultos"):
        ok(not ocultos, f"ningún texto oculto en el documento ({len(ocultos)})")
    if "contiene" in e:
        todo = norm(json.dumps(r.get("content") or {}, ensure_ascii=False))
        for t in e["contiene"]:
            ok(norm(t) in todo, f"se conserva {t[:60]!r}")
    if "frases" in e:
        bloques = (r.get("content") or {}).get("blocks", [])
        marcadas = set()
        for h in H:
            m = re.match(r"^/content/blocks/(\d+)/text$", h["campo"])
            if m and h["tipo"] in ("prompt_injection", "suplantacion_delimitador"):
                marcadas.add(bloques[int(m.group(1))].get("text", "")[:3])
        for clave, esperado in e["frases"]:
            texto = next((b.get("text", "") for b in bloques if b.get("text", "").startswith(clave + ":")), "")
            ok((clave in marcadas) == esperado, f"{clave} {'se detecta' if esperado else 'no se marca'}: {texto[5:85]}")
    if "aviso" in e:
        ok(e["aviso"] in codigos, f"aviso {e['aviso']}")
    if "sin_aviso" in e:
        ok(e["sin_aviso"] not in codigos, f"sin el aviso {e['sin_aviso']}")

print("FALLOS:", fallos)
sys.exit(1 if fallos else 0)
