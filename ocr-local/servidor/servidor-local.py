#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ruta: ocr-local/servidor/servidor-local.py
Servidor estático MÍNIMO y OPCIONAL para la demostración OCR local (alternativa a abrir
index.html con doble clic). Solo hace falta si su Chrome/Edge tiene bloqueado file:// por
política de empresa o si prefiere recibir la CSP también como cabecera HTTP.

- Escucha SOLO en 127.0.0.1 (no es accesible desde otros equipos).
- Sirve únicamente archivos de la carpeta ocr-local/ con extensiones permitidas.
- Solo GET y HEAD. Sin listados de carpetas. Sin archivos ocultos. Sin salir de la carpeta.
- Comprueba la cabecera Host (protección frente a «DNS rebinding»).
- Añade la misma CSP que index.html y cabeceras de seguridad.
- No recibe, guarda ni procesa documentos: el OCR se hace en el navegador.

Dependencias: Python 3.8 o superior (solo biblioteca estándar).
Uso:      python servidor-local.py [puerto]        (por defecto 8765)
Detener:  Ctrl+C
"""
import http.server
import os
import posixpath
import socketserver
import sys
import urllib.parse

PUERTO_POR_DEFECTO = 8765
INTENTOS_DE_PUERTO = 10
RAIZ = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.wasm': 'application/wasm',
}

CSP = ("default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src blob:; "
       "connect-src 'none'; img-src 'self' blob: data:; style-src 'self'; font-src 'none'; "
       "media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; manifest-src 'none'; "
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

CABECERAS_SEGURIDAD = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), payment=()',
    'Cache-Control': 'no-store',
}


class Manejador(http.server.BaseHTTPRequestHandler):
    """Atiende GET/HEAD de archivos estáticos dentro de RAIZ con cabeceras de seguridad."""

    server_version = 'OCRLocal'
    sys_version = ''
    protocol_version = 'HTTP/1.0'

    def _responder_error(self, codigo, texto):
        cuerpo = (texto + '\n').encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(cuerpo)))
        for nombre, valor in CABECERAS_SEGURIDAD.items():
            self.send_header(nombre, valor)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(cuerpo)

    def _host_valido(self):
        puerto = self.server.server_address[1]
        host = (self.headers.get('Host') or '').strip().lower()
        return host in ('127.0.0.1:%d' % puerto, 'localhost:%d' % puerto)

    def _resolver_ruta(self):
        """Devuelve la ruta absoluta del archivo pedido o None si no es válida."""
        ruta_url = urllib.parse.urlsplit(self.path).path
        ruta = urllib.parse.unquote(ruta_url, errors='strict')
        if '\x00' in ruta or '\\' in ruta or ':' in ruta:
            return None
        if ruta == '/':
            ruta = '/index.html'
        normalizada = posixpath.normpath(ruta)
        partes = [p for p in normalizada.split('/') if p]
        if not partes or any(p.startswith('.') for p in partes):
            return None
        absoluta = os.path.realpath(os.path.join(RAIZ, *partes))
        if os.path.commonpath([absoluta, RAIZ]) != RAIZ:
            return None
        if os.path.splitext(absoluta)[1].lower() not in TIPOS:
            return None
        if not os.path.isfile(absoluta):
            return None
        return absoluta

    def _servir(self):
        if not self._host_valido():
            self._responder_error(421, 'Host no permitido.')
            return
        try:
            absoluta = self._resolver_ruta()
        except UnicodeDecodeError:
            absoluta = None
        if absoluta is None:
            self._responder_error(404, 'No encontrado.')
            return
        with open(absoluta, 'rb') as archivo:
            datos = archivo.read()
        self.send_response(200)
        self.send_header('Content-Type', TIPOS[os.path.splitext(absoluta)[1].lower()])
        self.send_header('Content-Length', str(len(datos)))
        for nombre, valor in CABECERAS_SEGURIDAD.items():
            self.send_header(nombre, valor)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(datos)

    def do_GET(self):  # noqa: N802 (nombre impuesto por BaseHTTPRequestHandler)
        self._servir()

    def do_HEAD(self):  # noqa: N802
        self._servir()

    def _no_permitido(self):
        self._responder_error(405, 'Método no permitido.')

    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_TRACE = do_CONNECT = _no_permitido

    def log_message(self, formato, *args):
        sys.stdout.write('[%s] %s\n' % (self.log_date_time_string(), formato % args))
        sys.stdout.flush()


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else PUERTO_POR_DEFECTO
    servidor = None
    for intento in range(INTENTOS_DE_PUERTO):
        try:
            servidor = Servidor(('127.0.0.1', puerto + intento), Manejador)
            break
        except OSError:
            continue
    if servidor is None:
        print('No hay ningún puerto libre entre %d y %d.' % (puerto, puerto + INTENTOS_DE_PUERTO - 1))
        return 1
    url = 'http://127.0.0.1:%d/' % servidor.server_address[1]
    print('OCR local · servidor estático en %s (solo este equipo)' % url)
    print('Carpeta servida: %s' % RAIZ)
    print('Abra esa dirección en Chrome o Edge. Pulse Ctrl+C para detener.')
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor detenido.')
    finally:
        servidor.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
