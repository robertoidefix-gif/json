#!/bin/bash
# Verificación final de la fase F sobre una copia exacta de la entrega (idefix1.0-fase-f/Idefix1.0).
S=/tmp/claude-0/-home-user-json/55822861-099e-52f0-b166-3d8450cf56d4/scratchpad
F=$S/idefix/finalF
H=/home/user/json/auditoria-lectura-idefix/herramientas
cd $S/aud
echo "### sello del worker núcleo"; python3 $S/resellar-nucleo.py $F/base/analizador-archivos.js --comprobar
echo "### ESLint sobre el archivo entregado (misma configuración para E y F)"
cp $F/base/analizador-archivos.js $S/lint/faseF_entregada.js; cp $F/base/pruebas-corpus.js $S/lint/pruebas_entregada.js
(cd $S/lint && eslint -f json faseE_entregada.js faseF_entregada.js pruebas_entregada.js > lintEF_final.json); python3 - <<'PY'
import json, re, collections
d = json.load(open("/tmp/claude-0/-home-user-json/55822861-099e-52f0-b166-3d8450cf56d4/scratchpad/lint/lintEF_final.json"))
norm = lambda m: (m["ruleId"], re.sub(r"\d+", "N", m["message"]))
for f in d:
    c = collections.Counter(m["severity"] for m in f["messages"])
    print(f["filePath"].split("/")[-1], "errores", c[2], "avisos", c[1], dict(collections.Counter(m["ruleId"] for m in f["messages"] if m["severity"] == 2)))
E = collections.Counter(norm(m) for m in d[0]["messages"]); Fm = collections.Counter(norm(m) for m in d[1]["messages"])
print("mensajes nuevos en F respecto de E:", sum((Fm - E).values()), "· desaparecidos:", sum((E - Fm).values()))
PY
echo "### corpus"; BASE="file://$F/base/" ETIQUETA=faseFFinal node ejecutar.js salida prod | tail -1
python3 evaluar.py salida faseFFinal > eval_faseFFinal.txt 2>&1
PRINCIPAL=faseFFinal python3 consolidar.py salida > consolidar_faseFFinal.txt 2>&1 && head -13 consolidar_faseFFinal.txt
echo "### equivalencia de las salidas del corpus con la referencia previa a F9 (dividir funciones no cambia nada)"
python3 comparar_salidas.py salida/resultados/pre9 salida/resultados/faseFFinal | tail -3
echo "### casos de la fase F"; BASE="file://$F/base/" ETIQUETA=faseFFinal node ejecutar.js $S/casosF prod | tail -1; python3 $H/fase-f/verificar_casos_faseF.py $S/casosF faseFFinal | tail -1
echo "### documentos de estrés de la fase F"; BASE="file://$F/base/" ETIQUETA=faseFFinal node ejecutar.js $S/estresF prod | tail -5
for c in casosE casosD casosC casosB; do echo "### $c (y equivalencia con la referencia previa a F9)"; BASE="file://$F/base/" ETIQUETA=faseFFinal node ejecutar.js $S/$c prod | tail -1
  python3 comparar_salidas.py $S/$c/resultados/pre9 $S/$c/resultados/faseFFinal | tail -1; done
python3 $H/fase-e/verificar_casos_faseE.py $S/casosE faseFFinal | tail -1
python3 $H/fase-d/verificar_casos_faseD.py $S/casosD faseFFinal | tail -1
python3 $H/fase-c/verificar_casos_faseC.py $S/casosC faseFFinal | tail -1
echo "### imágenes grandes o engañosas (fase E)"; BASE="file://$F/base/" ETIQUETA=faseFFinal node ejecutar.js $S/estresE prod | tail -5
echo "### documentos hostiles de la fase D (no deben bloquear)"; BASE="file://$F/base/" ETIQUETA=faseFFinal node ejecutar.js $S/estresD prod | tail -5
echo "### sin OCR"; BASE="file://$F/base/" ETIQUETA=faseFFinal-sinocr node ejecutar.js salida sinocr pdf09,png01,pdfE1 | tail -1
python3 $H/fase-b/verificar_casos_faseB.py $S/casosB faseFFinal $S/aud/salida/resultados/faseFFinal-sinocr | tail -1
echo "### prompt fiscal: equivalencia con la referencia previa a F9"
BASE="file://$F/base/" node prueba_prompt.js generar salida $S/prompt-equiv/final.json | tail -1
node prueba_prompt.js comparar $S/prompt-equiv/pre9-a.json $S/prompt-equiv/final.json | tail -1
echo "### página de pruebas sin Node (pruebas-corpus.html) con el veredicto esperado de este consolidado"
rm -rf $S/corpus-pruebas && mkdir -p $S/corpus-pruebas && cp salida/corpus/* $S/corpus-pruebas/
python3 $H/fase-f/generar_verdad_pruebas.py salida $S/corpus-pruebas/verdad-pruebas.json salida/consolidado_faseFFinal.json
node verificar_pagina_pruebas.js "file://$F/base/" $S/corpus-pruebas | tail -2
T="png01_factura.png,pdfE1_factura_escaneada.pdf,pdf01_factura_reportlab.pdf,png04_libro_emitidas.png"
for e in "base|$F/base/index.html|$T,jpx_escaneada.pdf,cmap_chino.pdf,pdf09_mixto_sello_digital_mas_imagen.pdf,jpg08_rotada_90.jpg,png05_baja_resolucion.png,jpeg03_factura_escaneo_degradado.jpeg,pdfE2_factura_escaneo_degradado.pdf,pdf11a_cifrado_con_clave.pdf,pdf14_bytes_previos.pdf|-|" \
         "alt-pdf|$F/alt-pdf/index.html|$T|-|" \
         "alt-analizador|$F/alt-analizador/index.html||-|" \
         "cola|$F/base/index.html|$T|init_cola.js|" \
         "nav-sin-simd|$F/base/index.html|png04_libro_emitidas.png|init_nosimd.js|" \
         "sin-ocr|$F/base/index-sin-ocr.html|$T,pdf09_mixto_sello_digital_mas_imagen.pdf|-|"; do
  IFS='|' read -r nombre url archivos init marcar <<< "$e"
  echo "### $nombre"; node escenario_ss.js "file://$url" "faseF-$nombre" "$archivos" "$init" $marcar
done
echo "### demo"; node demo_ss.js "file://$F/base/demo-ocr.html" salida/corpus/png01_factura.png capturas_ss/faseF-demo.png
echo "### tiempos"; node medir_ss.js "fase E (file://)|file://$S/idefix/finalE/base/index.html" "fase F (file://)|file://$F/base/index.html"
echo "### memoria"; node memoria_ss.js "fase E (file://)|file://$S/idefix/finalE/base/index.html" "fase F (file://)|file://$F/base/index.html"
echo "### FIN"
