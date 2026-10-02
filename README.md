# OCR local en español con Tesseract.js 7.0.0 (Chrome / Edge)

OCR 100 % local: sin Internet, sin Node.js, sin npm, sin CDN y **sin servidor** (se abre con doble clic).
Solo JavaScript, HTML y CSS nativos + Bootstrap 5.3.8 (solo CSS).

## Uso rápido

1. Descargue la carpeta (botón **Code → Download ZIP**) y descomprímala.
2. Abra `ocr-local/index.html` con Google Chrome o Microsoft Edge.
3. Arrastre una imagen (PNG, JPEG, WebP o BMP) y pulse **Reconocer texto**.

Si su navegador tiene `file://` bloqueado por política de empresa, use el servidor opcional
`ocr-local/servidor/iniciar-servidor-local.bat` (solo escucha en 127.0.0.1).

## Documentación

| Archivo | Contenido |
|---|---|
| [`ENTREGA-OCR-LOCAL.txt`](ENTREGA-OCR-LOCAL.txt) | Viabilidad comprobada de `file://`, mapa de archivos y dependencias, instrucciones, comprobación de red, «Contexto del análisis», fuentes oficiales con huellas y **todo el código** |
| [`INFORME-AUDITORIA-OCR-LOCAL.txt`](INFORME-AUDITORIA-OCR-LOCAL.txt) | Auditoría en 6 dimensiones, lista única priorizada, recomendación y fase de mejora |
| [`verificacion/`](verificacion/) | Pruebas automáticas usadas (opcionales, no las necesita la aplicación) y sus resultados |
| [`auditoria-lectura-idefix/`](auditoria-lectura-idefix/) | **Auditoría real de Idefix1.0**: calidad de lectura medida en cada formato (pdf, docx, xlsx, xls, html, htm, png, jpg, jpeg) con 72 documentos de verdad-terreno, valoración del código, lista priorizada y corpus reproducible |
| [`idefix1.0-fase-a/`](idefix1.0-fase-a/) | **Idefix1.0 con la fase A aplicada**: los 17 archivos, el código completo en un único .txt, el diff y [`CAMBIOS-FASE-A.txt`](idefix1.0-fase-a/CAMBIOS-FASE-A.txt) (núcleos de Tesseract, idiomas del OCR, arranque sin OCR con aviso) |
| [`idefix1.0-sin-servidor/`](idefix1.0-sin-servidor/) | **Idefix1.0 sin servidor**: doble clic en `Idefix1.0/index.html`, sin servidor, sin Node.js y sin sellar nada. Librerías oficiales en `vendor-paquetes/` (cargadas con `<script>` y comprobadas por SHA-256), código completo .txt, diff y [`CAMBIOS-SIN-SERVIDOR.txt`](idefix1.0-sin-servidor/CAMBIOS-SIN-SERVIDOR.txt) |
| [`idefix1.0-fase-b/`](idefix1.0-fase-b/) | **Idefix1.0 sin servidor + fase B**: lo mismo, con mejor lectura (PDF escaneados con sello o CSV, rowspan en HTML, XLSX sin referencias, cuadrícula y tablas en el OCR). Código completo .txt, diff y [`CAMBIOS-FASE-B.txt`](idefix1.0-fase-b/CAMBIOS-FASE-B.txt) |
| [`idefix1.0-fase-c/`](idefix1.0-fase-c/) | **Idefix1.0 sin servidor + fases B y C**: además, tablas de Word combinadas, totales en tabla, PDF a dos columnas y girados, fragmentos HTML y filas con onclick. Código completo .txt, diff y [`CAMBIOS-FASE-C.txt`](idefix1.0-fase-c/CAMBIOS-FASE-C.txt) |
| [`idefix1.0-fase-d/`](idefix1.0-fase-d/) | **Idefix1.0 sin servidor + fases B, C y D (recomendada)**: además, marca el texto oculto en Word, PDF y HTML/CSS y detecta instrucciones a una IA en catalán, francés, euskera y las sutiles (es una ayuda, no una garantía). Código completo .txt, diff y [`CAMBIOS-FASE-D.txt`](idefix1.0-fase-d/CAMBIOS-FASE-D.txt) |

## Estructura

```
ocr-local/            aplicación OCR (demo, motor, cargador verificado, paquetes, herramienta, servidores opcionales)
contexto-analisis/    cajetilla «Contexto del análisis» (módulo + demostración)
verificacion/         pruebas, imágenes de prueba, capturas y resultados
auditoria-lectura-idefix/  auditoría de lectura por formato de Idefix1.0 (informe, corpus, herramientas y resultados)
idefix1.0-fase-a/          Idefix1.0 con la fase A aplicada (archivos, código completo .txt, diff y cambios)
idefix1.0-sin-servidor/    Idefix1.0 sin servidor: Idefix1.0/ se abre con doble clic (código completo .txt, diff y cambios)
idefix1.0-fase-b/          Idefix1.0 sin servidor + fase B (código completo .txt, diff y cambios)
idefix1.0-fase-c/          Idefix1.0 sin servidor + fases B y C (código completo .txt, diff y cambios)
idefix1.0-fase-d/          Idefix1.0 sin servidor + fases B, C y D (recomendada; código completo .txt, diff y cambios)
```

Bibliotecas de terceros (incluidas como paquetes verificados por SHA-256): Tesseract.js 7.0.0 y
tesseract.js-core 7.0.0 (Apache-2.0), modelo `spa` 4.0.0_best_int (Apache-2.0), Bootstrap 5.3.8 (MIT).
Licencias en `ocr-local/vendor-paquetes/licencias/`.
