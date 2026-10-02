#!/bin/bash
# Verificación final de la fase B sobre una copia exacta de la entrega (idefix1.0-fase-b/Idefix1.0).
S=/tmp/claude-0/-home-user-json/55822861-099e-52f0-b166-3d8450cf56d4/scratchpad
F=$S/idefix/finalC
H=/home/user/json/auditoria-lectura-idefix/herramientas/fase-b
cd $S/aud
echo "### corpus"; BASE="file://$F/base/" ETIQUETA=faseCFinal node ejecutar.js salida prod | tail -1
python3 evaluar.py salida faseCFinal > eval_faseCFinal.txt 2>&1
echo "### casos de borde"; BASE="file://$F/base/" ETIQUETA=faseCFinal node ejecutar.js $S/casosB prod | tail -1
echo "### casos fase C"; BASE="file://$F/base/" ETIQUETA=faseCFinal node ejecutar.js $S/casosC prod | tail -1; python3 /home/user/json/auditoria-lectura-idefix/herramientas/fase-c/verificar_casos_faseC.py $S/casosC faseCFinal
echo "### sin OCR"; BASE="file://$F/base/" ETIQUETA=faseCFinal-sinocr node ejecutar.js salida sinocr pdf09,png01,pdfE1 | tail -1
python3 $H/verificar_casos_faseB.py $S/casosB faseCFinal $S/aud/salida/resultados/faseCFinal-sinocr
T="png01_factura.png,pdfE1_factura_escaneada.pdf,pdf01_factura_reportlab.pdf,png04_libro_emitidas.png"
for e in "base|$F/base/index.html|$T,jpx_escaneada.pdf,cmap_chino.pdf,pdf09_mixto_sello_digital_mas_imagen.pdf,pdf05_dos_columnas.pdf,docx08_celdas_combinadas.docx,html08_fragmento_tabla.html|-|" \
         "alt-pdf|$F/alt-pdf/index.html|$T|-|" \
         "alt-analizador|$F/alt-analizador/index.html||-|" \
         "cola|$F/base/index.html|$T|init_cola.js|" \
         "nav-sin-simd|$F/base/index.html|png04_libro_emitidas.png|init_nosimd.js|" \
         "sin-ocr|$F/base/index-sin-ocr.html|$T,pdf09_mixto_sello_digital_mas_imagen.pdf|-|"; do
  IFS='|' read -r nombre url archivos init marcar <<< "$e"
  echo "### $nombre"; node escenario_ss.js "file://$url" "faseC-$nombre" "$archivos" "$init" $marcar
done
echo "### demo"; node demo_ss.js "file://$F/base/demo-ocr.html" salida/corpus/png01_factura.png capturas_ss/faseC-demo.png
echo "### tiempos"; node medir_ss.js "fase B (file://)|file://$S/idefix/finalB/base/index.html" "fase C (file://)|file://$F/base/index.html"
echo "### memoria"; node memoria_ss.js "fase B (file://)|file://$S/idefix/finalB/base/index.html" "fase C (file://)|file://$F/base/index.html"
echo "### FIN"
