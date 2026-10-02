# Replica el paso 4 de Idefix1.0-instrucciones.txt (herramientas/generar-manifiesto.js):
# manifiesto de vendor/ (claves ordenadas, JSON.stringify(...,null,1)), ancla SHA256_MANIFIESTO_INTEGRIDAD
# y atributos integrity de las páginas. Solo para montar el entorno de pruebas.
import hashlib, base64, json, os, re, sys
app = sys.argv[1]
salida = {}
for raiz, dirs, archivos in os.walk(os.path.join(app, 'vendor')):
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for a in archivos:
        if a.startswith('.'):
            continue
        ruta = os.path.relpath(os.path.join(raiz, a), app).replace(os.sep, '/')
        if ruta == 'vendor/manifiesto-integridad.json':
            continue
        salida[ruta] = hashlib.sha256(open(os.path.join(app, ruta), 'rb').read()).hexdigest()
texto = json.dumps({'version': 1, 'algoritmo': 'SHA-256', 'archivos': dict(sorted(salida.items()))}, indent=1, ensure_ascii=False)
open(os.path.join(app, 'vendor/manifiesto-integridad.json'), 'w', encoding='utf-8', newline='\n').write(texto)
hm = hashlib.sha256(texto.encode('utf-8')).hexdigest()
js_ruta = os.path.join(app, 'analizador-archivos.js')
js = open(js_ruta, 'rb').read().decode('utf-8')
js, n = re.subn(r'const SHA256_MANIFIESTO_INTEGRIDAD = "[0-9a-f]{64}";', 'const SHA256_MANIFIESTO_INTEGRIDAD = "%s";' % hm, js)
assert n == 1
open(js_ruta, 'wb').write(js.encode('utf-8'))
sri = 'sha256-' + base64.b64encode(hashlib.sha256(js.encode('utf-8')).digest()).decode()
for pagina in ['index.html', 'index-sin-ocr.html', 'demo-ocr.html']:
    p = os.path.join(app, pagina)
    h = open(p, encoding='utf-8').read()
    h, n = re.subn(r'(<script src="analizador-archivos\.js" integrity=")sha256-[^"]+(")', r'\g<1>' + sri + r'\2', h)
    assert n == 1, pagina
    open(p, 'w', encoding='utf-8', newline='').write(h)
print('archivos en manifiesto', len(salida), 'ancla', hm, 'SRI', sri)
