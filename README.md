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

## Estructura

```
ocr-local/            aplicación OCR (demo, motor, cargador verificado, paquetes, herramienta, servidores opcionales)
contexto-analisis/    cajetilla «Contexto del análisis» (módulo + demostración)
verificacion/         pruebas, imágenes de prueba, capturas y resultados
```

Bibliotecas de terceros (incluidas como paquetes verificados por SHA-256): Tesseract.js 7.0.0 y
tesseract.js-core 7.0.0 (Apache-2.0), modelo `spa` 4.0.0_best_int (Apache-2.0), Bootstrap 5.3.8 (MIT).
Licencias en `ocr-local/vendor-paquetes/licencias/`.
