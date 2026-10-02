#!/bin/bash
# Verificación final de la versión sin servidor sobre una copia exacta de la entrega.
S=/tmp/claude-0/-home-user-json/55822861-099e-52f0-b166-3d8450cf56d4/scratchpad
F=$S/idefix/final
cd $S/aud
T="png01_factura.png,pdfE1_factura_escaneada.pdf,pdf01_factura_reportlab.pdf"
echo "### corpus"; BASE="file://$F/base/" ETIQUETA=sinServidorFinal node ejecutar.js salida prod | tail -2
for e in "base|$F/base/index.html|$T,jpx_escaneada.pdf,cmap_chino.pdf|-|" \
         "alt-pdf|$F/alt-pdf/index.html|$T|-|" \
         "alt-spa|$F/alt-spa/index.html|$T|-|" \
         "alt-wasm|$F/alt-wasm/index.html|jpx_escaneada.pdf,pdf01_factura_reportlab.pdf|-|" \
         "sin-simd|$F/sin-simd/index.html|png01_factura.png|-|" \
         "sin-paquetes|$F/sin-paquetes/index.html|docx01_factura.docx|-|" \
         "nav-sin-simd|$F/base/index.html|png01_factura.png|init_nosimd.js|" \
         "chino|$F/base/index.html|png01_factura.png|-|chi_sim" \
         "cola|$F/base/index.html|$T|init_cola.js|" \
         "alt-analizador|$F/alt-analizador/index.html||-|" \
         "acentos|$F/Mis documentos/Idefix José ñ/index.html|$T|-|" \
         "sin-ocr|$F/base/index-sin-ocr.html|$T|-|"; do
  IFS='|' read -r nombre url archivos init marcar <<< "$e"
  echo "### $nombre"; node escenario_ss.js "file://$url" "final-$nombre" "$archivos" "$init" $marcar
done
echo "### http"; node escenario_ss.js "http://127.0.0.1:8100/index.html" final-http "$T"
echo "### demo"; node demo_ss.js "file://$F/base/demo-ocr.html" salida/corpus/png01_factura.png capturas_ss/final-demo.png
echo "### tiempos"; node medir_ss.js "fase A (http, vendor)|http://127.0.0.1:8092/index.html" "sin servidor (file://)|file://$F/base/index.html"
echo "### memoria"; node memoria_ss.js "fase A (http, vendor)|http://127.0.0.1:8092/index.html" "sin servidor (file://)|file://$F/base/index.html"
echo "### FIN"
