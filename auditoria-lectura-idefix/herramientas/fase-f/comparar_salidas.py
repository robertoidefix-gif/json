"""Fase F (F9): compara dos ejecuciones (mismos documentos, código distinto) campo a campo.
Uso: python3 comparar_salidas.py <dir_resultados_A> <dir_resultados_B>
Se quitan solo los datos que cambian en cada ejecución (fechas de generación, tiempos, UUID)."""
import json, os, re, sys
A, B = sys.argv[1], sys.argv[2]
VOLATILES = {"generatedAt", "ms", "ultima_modificacion", "lastModified", "lastModifiedAt", "durationMs", "elapsedMs", "startedAt", "finishedAt", "generado"}
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
def limpiar(o):
    if isinstance(o, dict):
        return {k: limpiar(v) for k, v in o.items() if k not in VOLATILES}
    if isinstance(o, list):
        return [limpiar(x) for x in o]
    if isinstance(o, str):
        return UUID.sub("<UUID>", o)
    return o
def diferencias(a, b, ruta="", out=None):
    out = [] if out is None else out
    if len(out) >= 5:
        return out
    if type(a) != type(b):
        out.append(f"{ruta}: tipo {type(a).__name__} → {type(b).__name__}")
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{ruta}/{k}: {'falta en A' if k not in a else 'falta en B'}")
            else:
                diferencias(a[k], b[k], f"{ruta}/{k}", out)
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append(f"{ruta}: {len(a)} → {len(b)} elementos")
        for i, (x, y) in enumerate(zip(a, b)):
            diferencias(x, y, f"{ruta}[{i}]", out)
    elif a != b:
        out.append(f"{ruta}: {str(a)[:80]!r} → {str(b)[:80]!r}")
    return out
ids = sorted(f[:-5] for f in os.listdir(A) if f.endswith(".json") and not f.startswith("_"))
iguales, distintos = 0, []
for i in ids:
    fb = os.path.join(B, i + ".json")
    if not os.path.exists(fb):
        distintos.append((i, ["no está en B"])); continue
    a = limpiar(json.load(open(os.path.join(A, i + ".json"), encoding="utf-8")))
    b = limpiar(json.load(open(fb, encoding="utf-8")))
    d = diferencias(a, b)
    if d: distintos.append((i, d))
    else: iguales += 1
for i, d in distintos:
    print("DISTINTO", i)
    for x in d: print("   ", x)
print(f"comparados {len(ids)}: {iguales} idénticos, {len(distintos)} distintos")
