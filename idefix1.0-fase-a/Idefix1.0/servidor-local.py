#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Idefix1.0 — servidor estático LOCAL mínimo (alternativa con Python 3; solo la librería estándar).

Por qué hace falta: Chrome y Edge no permiten, en páginas abiertas como archivo (file://), cargar con
fetch los archivos que la aplicación tiene que verificar (manifiesto, PDF.js, núcleo y modelos de
Tesseract), ni crear un Worker desde un archivo local, y no comprueban el atributo «integrity» de un
script en file://. Este servidor solo entrega los archivos de esta carpeta a ESTE ordenador.

Qué hace y qué no:
  - Escucha solo en 127.0.0.1 (no es accesible desde la red local ni desde Internet).
  - Solo GET y HEAD; no recibe datos, no procesa nada y no guarda nada.
  - No sirve archivos ocultos (.algo) ni fuera de esta carpeta.
  - Envía las cabeceras de seguridad de herramientas/cabeceras-http-recomendadas.txt, también la CSP,
    que así cubre la página y sus workers.

Uso (desde esta carpeta):
    python servidor-local.py            → http://127.0.0.1:8080/
    python servidor-local.py 8123       → otro puerto
Para pararlo: Ctrl+C.
"""
import http.server
import os
import posixpath
import socketserver
import sys
import urllib.parse

RAIZ = os.path.dirname(os.path.abspath(__file__))
PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

CSP = ("default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src 'self'; "
       "style-src 'self'; img-src 'none'; font-src 'none'; media-src 'none'; manifest-src 'none'; object-src 'none'; "
       "frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
CABECERAS = {
    "Content-Security-Policy": CSP,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), serial=(), payment=(), clipboard-read=()",
    "Cache-Control": "no-store",
}
TIPOS = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm", ".gz": "application/gzip", ".txt": "text/plain; charset=utf-8",
    ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".ttf": "font/ttf",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf",
}


class Manejador(http.server.SimpleHTTPRequestHandler):
    server_version = "IdefixLocal/1.0"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def guess_type(self, path):
        return TIPOS.get(os.path.splitext(path)[1].lower(), "application/octet-stream")

    def translate_path(self, path):
        # Ruta normalizada dentro de RAIZ; cualquier segmento oculto («.git», «..») se rechaza.
        ruta = urllib.parse.unquote(urllib.parse.urlsplit(path).path, errors="strict")
        partes = [p for p in posixpath.normpath(ruta).split("/") if p]
        if any(p.startswith(".") or "\\" in p or ":" in p for p in partes):
            return os.path.join(RAIZ, "__no_permitido__", "x")
        destino = os.path.realpath(os.path.join(RAIZ, *partes))
        if destino != RAIZ and not destino.startswith(RAIZ + os.sep):
            return os.path.join(RAIZ, "__no_permitido__", "x")
        return destino

    def list_directory(self, path):
        self.send_error(404, "No se listan carpetas")
        return None

    def end_headers(self):
        for k, v in CABECERAS.items():
            self.send_header(k, v)
        super().end_headers()

    def do_POST(self):
        self.send_error(405)

    do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_POST

    def log_message(self, formato, *args):
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), formato % args))


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    # En Linux y macOS permite reabrir el puerto nada más cerrar el servidor; en Windows SO_REUSEADDR
    # dejaría que otro programa compartiera el puerto, así que no se activa.
    allow_reuse_address = os.name != "nt"


if __name__ == "__main__":
    try:
        srv = Servidor(("127.0.0.1", PUERTO), Manejador)
    except OSError as e:
        sys.exit(f"No se pudo abrir el puerto {PUERTO} ({e}). Prueba otro: python servidor-local.py 8123")
    with srv:
        print(f"Idefix1.0 — sirviendo {RAIZ}")
        print(f"Abre en Chrome o Edge: http://127.0.0.1:{PUERTO}/  (demo OCR: http://127.0.0.1:{PUERTO}/demo-ocr.html)")
        print("Solo accesible desde este ordenador. Ctrl+C para parar.")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
