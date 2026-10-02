#!/bin/bash
# Verificación final de la fase E sobre una copia exacta de la entrega (idefix1.0-fase-e/Idefix1.0).
S=/tmp/claude-0/-home-user-json/55822861-099e-52f0-b166-3d8450cf56d4/scratchpad
F=$S/idefix/finalE
H=/home/user/json/auditoria-lectura-idefix/herramientas
cd $S/aud
echo "### sello del worker núcleo"; python3 $S/resellar-nucleo.py $F/base/analizador-archivos.js --comprobar
echo "### corpus"; BASE="file://$F/base/" ETIQUETA=faseEFinal node ejecutar.js salida prod | tail -1
python3 evaluar.py salida faseEFinal > eval_faseEFinal.txt 2>&1
PRINCIPAL=faseEFinal python3 consolidar.py salida > /dev/null 2>&1 && echo "consolidado_faseEFinal.json escrito"
echo "### casos de la fase E"; BASE="file://$F/base/" ETIQUETA=faseEFinal node ejecutar.js $S/casosE prod | tail -1; python3 $H/fase-e/verificar_casos_faseE.py $S/casosE faseEFinal | tail -1
echo "### imágenes grandes o engañosas (fase E)"; BASE="file://$F/base/" ETIQUETA=faseEFinal node ejecutar.js $S/estresE prod | tail -5
echo "### casos de la fase D"; BASE="file://$F/base/" ETIQUETA=faseEFinal node ejecutar.js $S/casosD prod | tail -1; python3 $H/fase-d/verificar_casos_faseD.py $S/casosD faseEFinal | tail -1
echo "### documentos hostiles de la fase D (no deben bloquear)"; BASE="file://$F/base/" ETIQUETA=faseEFinal node ejecutar.js $S/estresD prod | tail -5
echo "### casos de la fase C"; BASE="file://$F/base/" ETIQUETA=faseEFinal node ejecutar.js $S/casosC prod | tail -1; python3 $H/fase-c/verificar_casos_faseC.py $S/casosC faseEFinal | tail -1
echo "### casos de borde (fase B)"; BASE="file://$F/base/" ETIQUETA=faseEFinal node ejecutar.js $S/casosB prod | tail -1
echo "### sin OCR"; BASE="file://$F/base/" ETIQUETA=faseEFinal-sinocr node ejecutar.js salida sinocr pdf09,png01,pdfE1 | tail -1
python3 $H/fase-b/verificar_casos_faseB.py $S/casosB faseEFinal $S/aud/salida/resultados/faseEFinal-sinocr | tail -1
T="png01_factura.png,pdfE1_factura_escaneada.pdf,pdf01_factura_reportlab.pdf,png04_libro_emitidas.png"
for e in "base|$F/base/index.html|$T,jpx_escaneada.pdf,cmap_chino.pdf,pdf09_mixto_sello_digital_mas_imagen.pdf,jpg08_rotada_90.jpg,png05_baja_resolucion.png,jpeg03_factura_escaneo_degradado.jpeg,pdfE2_factura_escaneo_degradado.pdf|-|" \
         "alt-pdf|$F/alt-pdf/index.html|$T|-|" \
         "alt-analizador|$F/alt-analizador/index.html||-|" \
         "cola|$F/base/index.html|$T|init_cola.js|" \
         "nav-sin-simd|$F/base/index.html|png04_libro_emitidas.png|init_nosimd.js|" \
         "sin-ocr|$F/base/index-sin-ocr.html|$T,pdf09_mixto_sello_digital_mas_imagen.pdf|-|"; do
  IFS='|' read -r nombre url archivos init marcar <<< "$e"
  echo "### $nombre"; node escenario_ss.js "file://$url" "faseE-$nombre" "$archivos" "$init" $marcar
done
echo "### demo"; node demo_ss.js "file://$F/base/demo-ocr.html" salida/corpus/png01_factura.png capturas_ss/faseE-demo.png
echo "### tiempos"; node medir_ss.js "fase D (file://)|file://$S/idefix/finalD/base/index.html" "fase E (file://)|file://$F/base/index.html"
echo "### memoria"; node memoria_ss.js "fase D (file://)|file://$S/idefix/finalD/base/index.html" "fase E (file://)|file://$F/base/index.html"
echo "### FIN"
