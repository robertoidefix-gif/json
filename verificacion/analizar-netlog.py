# Analiza un net-log de Chromium (--log-net-log) y lista TODOS los destinos de red que aparecen.
import json, sys, re, collections
ruta = sys.argv[1]
texto = open(ruta, encoding='utf-8', errors='replace').read()
if not texto.rstrip().endswith('}'):
    texto = texto.rstrip().rstrip(',') + ']}'
d = json.loads(texto)
tipos = {v: k for k, v in d['constants']['logEventTypes'].items()}
urls = collections.Counter(); hosts = collections.Counter(); sockets = collections.Counter(); dns = collections.Counter()
for ev in d.get('events', []):
    t = tipos.get(ev.get('type'), str(ev.get('type')))
    p = ev.get('params') or {}
    if isinstance(p.get('url'), str):
        urls[p['url'].split('?')[0][:100]] += 1
    if t.startswith('HOST_RESOLVER') and isinstance(p.get('host'), str):
        dns[p['host']] += 1
    for clave in ('address', 'remote_address', 'source_address'):
        if isinstance(p.get(clave), str) and t.startswith(('TCP_CONNECT', 'SOCKET', 'UDP')):
            sockets[t + ' ' + clave + '=' + p[clave]] += 1
    if isinstance(p.get('host'), str) and not t.startswith('HOST_RESOLVER'):
        hosts[p['host']] += 1
def externo(u):
    return not re.match(r'^(file|blob|data|chrome|about|devtools):', u) and not re.match(r'^https?://(127\.0\.0\.1|localhost)(:\d+)?/', u)
print('Eventos en el net-log:', len(d.get('events', [])))
print('URLs distintas:', len(urls))
for u, n in sorted(urls.items()):
    print('  %s %-100s x%d' % ('EXTERNA ' if externo(u) else 'local   ', u, n))
print('Resoluciones DNS:', dict(dns) or 'ninguna')
print('Hosts en parámetros:', dict(hosts) or 'ninguno')
print('Sockets:', dict(sockets) or 'ninguno')
print('TOTAL URLs EXTERNAS:', sum(1 for u in urls if externo(u)))
