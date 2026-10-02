# Generador de referencia (solo para el desarrollador). El usuario usa herramientas/empaquetar-vendor.html.
import base64, hashlib, sys, os
D, OUT = sys.argv[1], sys.argv[2]
P = [
 ('bootstrap-css','bootstrap-5.3.8.min.css.paquete.js', D+'/bootstrap-5.3.8/package/dist/css/bootstrap.min.css','npm bootstrap@5.3.8 · package/dist/css/bootstrap.min.css','MIT'),
 ('tesseract-main','tesseract-7.0.0.min.js.paquete.js', D+'/tesseract.js-7.0.0/package/dist/tesseract.min.js','npm tesseract.js@7.0.0 · package/dist/tesseract.min.js','Apache-2.0'),
 ('tesseract-worker','tesseract-worker-7.0.0.min.js.paquete.js', D+'/tesseract.js-7.0.0/package/dist/worker.min.js','npm tesseract.js@7.0.0 · package/dist/worker.min.js','Apache-2.0'),
 ('tesseract-core-simd-lstm','tesseract-core-7.0.0-simd-lstm.wasm.js.paquete.js', D+'/tesseract.js-core-7.0.0/package/tesseract-core-simd-lstm.wasm.js','npm tesseract.js-core@7.0.0 · package/tesseract-core-simd-lstm.wasm.js','Apache-2.0'),
 ('tesseract-core-lstm','tesseract-core-7.0.0-lstm.wasm.js.paquete.js', D+'/tesseract.js-core-7.0.0/package/tesseract-core-lstm.wasm.js','npm tesseract.js-core@7.0.0 · package/tesseract-core-lstm.wasm.js','Apache-2.0'),
 ('tessdata-spa','tessdata-spa-4.0.0_best_int.traineddata.gz.paquete.js', D+'/spa-1.0.0/package/4.0.0_best_int/spa.traineddata.gz','npm @tesseract.js-data/spa@1.0.0 · package/4.0.0_best_int/spa.traineddata.gz','Apache-2.0 (modelo tessdata_best de tesseract-ocr; el paquete npm declara MIT)'),
]
for nombre, salida, ruta, origen, lic in P:
    b = open(ruta,'rb').read()
    h = hashlib.sha256(b).hexdigest()
    txt = ('/* Paquete generado por herramientas/empaquetar-vendor.html (OCR local). NO EDITAR.\n'
           ' * Contenido: ' + origen + '\n'
           ' * SHA-256 del archivo oficial: ' + h + ' · ' + str(len(b)) + ' bytes · Licencia: ' + lic + '\n'
           ' */\n'
           'OCRLocalPaquetes.registrar("' + nombre + '", "' + base64.b64encode(b).decode() + '");\n')
    open(os.path.join(OUT, salida),'w',encoding='utf-8',newline='\n').write(txt)
    print(nombre, h, len(b), hashlib.sha256(txt.encode()).hexdigest(), salida)
