#!/bin/bash
# Verificación final de la fase D sobre una copia exacta de la entrega (idefix1.0-fase-d/Idefix1.0).
S=/tmp/claude-0/-home-user-json/55822861-099e-52f0-b166-3d8450cf56d4/scratchpad
F=$S/idefix/finalD
H=/home/user/json/auditoria-lectura-idefix/herramientas
cd $S/aud
echo "### sello del worker núcleo"; python3 $S/resellar-nucleo.py $F/base/analizador-archivos.js --comprobar
echo "### corpus"; BASE="file://$F/base/" ETIQUETA=faseDFinal node ejecutar.js salida prod | tail -1
python3 evaluar.py salida faseDFinal > eval_faseDFinal.txt 2>&1
PRINCIPAL=faseDFinal python3 consolidar.py salida > /dev/null 2>&1 && echo "consolidado_faseDFinal.json escrito"
echo "### casos de la fase D"; BASE="file://$F/base/" ETIQUETA=faseDFinal node ejecutar.js $S/casosD prod | tail -1; python3 $H/fase-d/verificar_casos_faseD.py $S/casosD faseDFinal | tail -1
echo "### documentos hostiles (no deben bloquear)"; BASE="file://$F/base/" ETIQUETA=faseDFinal node ejecutar.js $S/estresD prod | tail -5
echo "### casos de la fase C"; BASE="file://$F/base/" ETIQUETA=faseDFinal node ejecutar.js $S/casosC prod | tail -1; python3 $H/fase-c/verificar_casos_faseC.py $S/casosC faseDFinal | tail -1
echo "### casos de borde (fase B)"; BASE="file://$F/base/" ETIQUETA=faseDFinal node ejecutar.js $S/casosB prod | tail -1
echo "### sin OCR"; BASE="file://$F/base/" ETIQUETA=faseDFinal-sinocr node ejecutar.js salida sinocr pdf09,png01,pdfE1 | tail -1
python3 $H/fase-b/verificar_casos_faseB.py $S/casosB faseDFinal $S/aud/salida/resultados/faseDFinal-sinocr | tail -1
T="png01_factura.png,pdfE1_factura_escaneada.pdf,pdf01_factura_reportlab.pdf,png04_libro_emitidas.png"
for e in "base|$F/base/index.html|$T,jpx_escaneada.pdf,cmap_chino.pdf,pdf09_mixto_sello_digital_mas_imagen.pdf,pdf10_texto_oculto.pdf,docx06_texto_oculto.docx,html05_texto_oculto.html|-|" \
         "alt-pdf|$F/alt-pdf/index.html|$T|-|" \
         "alt-analizador|$F/alt-analizador/index.html||-|" \
         "cola|$F/base/index.html|$T|init_cola.js|" \
         "nav-sin-simd|$F/base/index.html|png04_libro_emitidas.png|init_nosimd.js|" \
         "sin-ocr|$F/base/index-sin-ocr.html|$T,pdf09_mixto_sello_digital_mas_imagen.pdf|-|"; do
  IFS='|' read -r nombre url archivos init marcar <<< "$e"
  echo "### $nombre"; node escenario_ss.js "file://$url" "faseD-$nombre" "$archivos" "$init" $marcar
done
echo "### demo"; node demo_ss.js "file://$F/base/demo-ocr.html" salida/corpus/png01_factura.png capturas_ss/faseD-demo.png
echo "### tiempos"; node medir_ss.js "fase C (file://)|file://$S/idefix/finalC/base/index.html" "fase D (file://)|file://$F/base/index.html"
echo "### memoria"; node memoria_ss.js "fase C (file://)|file://$S/idefix/finalC/base/index.html" "fase D (file://)|file://$F/base/index.html"
echo "### FIN"
