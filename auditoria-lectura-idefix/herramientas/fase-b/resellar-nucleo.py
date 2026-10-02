"""Recalcula SHA256_WORKER_NUCLEO de analizador-archivos.js tras cambiar el worker núcleo incrustado.
Replica aaFuenteWorkerIncrustado(): texto entre «{\n» y el último «\n}» de la función, más el salto final.
Uso: python3 resellar-nucleo.py <analizador-archivos.js> [--comprobar]
"""
import sys, re, hashlib
ruta = sys.argv[1]
s = open(ruta, encoding="utf-8").read()
ini = s.index("worker: function __aaFuenteWorkerNucleo() {\n") + len("worker: function __aaFuenteWorkerNucleo() {\n")
fin = s.index("\n},\n", ini)  # cierre de la función (primera línea «},» tras el inicio)
fuente = s[ini:fin + 1]
h = hashlib.sha256(fuente.encode("utf-8")).hexdigest()
m = re.search(r'const SHA256_WORKER_NUCLEO = "([0-9a-f]{64})";', s)
print("anclado:", m.group(1), "\ncalculado:", h)
if "--comprobar" in sys.argv:
    sys.exit(0 if m.group(1) == h else 1)
if m.group(1) != h:
    s = s.replace(m.group(0), f'const SHA256_WORKER_NUCLEO = "{h}";')
    open(ruta, "w", encoding="utf-8").write(s)
    print("actualizado")
