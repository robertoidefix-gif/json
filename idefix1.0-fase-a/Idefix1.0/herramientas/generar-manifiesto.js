"use strict";
/*
 * Herramienta de integridad (Fase 12). Todo ocurre en este navegador.
 * Recorre la carpeta de la aplicación, genera el manifiesto de vendor/ y
 * comprueba las tres anclas de la cadena de confianza:
 *   - SHA256_MANIFIESTO_INTEGRIDAD (en analizador-archivos.js)
 *   - SHA256_WORKER_NUCLEO         (en analizador-archivos.js)
 *   - integrity de index.html      (analizador-archivos.js y, en la versión
 *                                    de desarrollo, las hojas de estilo)
 * Desde v6.13.0 (archivo único; Idefix1.0): el worker núcleo, la hoja de estilos y el
 * MARCO_FISCAL_LOCAL van dentro de analizador-archivos.js. El SHA-256 del
 * worker se calcula sobre el texto incrustado, extraído igual que lo hace la
 * aplicación. La versión de desarrollo (archivos separados) sigue admitida.
 */
(() => {
  const entrada = document.getElementById("carpeta");
  const estado = document.getElementById("estado");
  const errores = document.getElementById("errores");
  const avisos = document.getElementById("avisos");
  const tabla = document.getElementById("comprobaciones");
  const boton = document.getElementById("descargar");
  let textoManifiesto = null;

  // Mismas reglas de ruta que aplica la aplicación al leer el manifiesto.
  const RE_RUTA = /^vendor\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

  // No deben desplegarse: la aplicación dejaría de arrancar o PDF.js podría
  // cargarlos por su cuenta sin verificación.
  const PROHIBIDOS = [
    [/_nowasm_fallback\.js$/i, "módulos *_nowasm_fallback.js (PDF.js los importaría por URL sin verificar)"],
    [/(^|\/)qcms_bg\.wasm$/i, "qcms_bg.wasm (perfiles de color; la aplicación no lo usa)"],
    [/(^|\/)pdf\.sandbox\.mjs$/i, "pdf.sandbox.mjs (motor de scripts del visor de PDF.js)"],
    [/(^|\/)quickjs-eval\./i, "quickjs-eval (motor de scripts del visor de PDF.js)"],
    [/(^|\/)web\/viewer\./i, "visor web de PDF.js (viewer.*)"]
  ];
  // Innecesarios pero inofensivos: se avisa.
  const INNECESARIOS = [
    [/\.map$/i, "mapas de código fuente (.map)"],
    [/(^|\/)web\/(debugger|locale|images)\b/i, "recursos del visor web de PDF.js"],
    [/(^|\/)web\/iccs\//i, "perfiles ICC"],
    [/\.pdf$/i, "documentos PDF de ejemplo"]
  ];
  // Fase A: núcleos de Tesseract.js 7 que pueden pedirse con OEM LSTM_ONLY e idiomas por defecto del OCR.
  const NUCLEOS_OCR = ["tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-lstm.wasm.js"];
  const IDIOMAS_POR_DEFECTO = ["spa", "cat", "eus", "eng", "fra"];
  // Código ejecutable de PDF.js 6.2.108 (build 0365cbde0) con el que se probó
  // esta versión. Otro contenido en estas rutas no se acepta.
  const PDFJS_6_2_108 = {
    "vendor/pdfjs/build/pdf.mjs": "e0ccc62fbfa69942eb7dd46c89d4b3ea8fc08f61b234e65f32e6d5c76efc04c8",
    "vendor/pdfjs/build/pdf.worker.mjs": "1a7607f28cfbc63f0e4e0a41927c89f991e353e4f3fb4565ecfd621ac5975089",
    "vendor/pdfjs-legacy/build/pdf.mjs": "0c43f0f1b4f6bce98af889eda3adff7ac8c991a0a43408709be9287aecc4ac14",
    "vendor/pdfjs-legacy/build/pdf.worker.mjs": "b4e582882f5e811f4d1b7b511f68d9a0c3209141e6f68856f01408c5cc155131",
    "vendor/pdfjs/web/wasm/openjpeg.wasm": "004a0e62db930ba9ff2a22212f4554d0bb57a0635a8287caf70f98117cee14ba",
    "vendor/pdfjs/web/wasm/jbig2.wasm": "e6bee67724a7b5436fe8162638e3708cfc8d52b6342db69a49715e30ff27cfdc",
    "vendor/pdfjs-legacy/web/wasm/openjpeg.wasm": "004a0e62db930ba9ff2a22212f4554d0bb57a0635a8287caf70f98117cee14ba",
    "vendor/pdfjs-legacy/web/wasm/jbig2.wasm": "e6bee67724a7b5436fe8162638e3708cfc8d52b6342db69a49715e30ff27cfdc"
  };

  const item = (lista, texto) => {
    const li = document.createElement("li");
    li.textContent = texto;
    lista.appendChild(li);
  };

  const sha256 = async datos => new Uint8Array(await crypto.subtle.digest("SHA-256", datos));
  const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  const base64 = bytes => btoa(String.fromCharCode(...bytes));

  const fila = (comprobacion, correcto, valor) => {
    const tr = document.createElement("tr");
    const a = document.createElement("td");
    a.textContent = comprobacion;
    const b = document.createElement("td");
    b.className = correcto ? "ok" : "mal";
    b.textContent = correcto ? "Coincide" : "Hay que actualizarlo";
    const c = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = valor;
    c.appendChild(code);
    tr.append(a, b, c);
    tabla.tBodies[0].appendChild(tr);
  };

  entrada.addEventListener("change", async () => {
    errores.replaceChildren();
    avisos.replaceChildren();
    tabla.tBodies[0].replaceChildren();
    tabla.hidden = true;
    boton.disabled = true;
    textoManifiesto = null;

    const todos = [...entrada.files].filter(f => f.webkitRelativePath);
    if (!todos.length) {
      estado.textContent = "La carpeta está vacía.";
      return;
    }
    const raiz = todos[0].webkitRelativePath.split("/")[0];
    const porRuta = new Map(todos.map(f => [f.webkitRelativePath.split("/").slice(1).join("/"), f]));
    const faltan = ["index.html", "analizador-archivos.js"].filter(r => !porRuta.has(r));
    if (faltan.length) {
      item(errores, `La carpeta "${raiz}" no parece la raíz de la aplicación: faltan ${faltan.join(", ")}.`);
      estado.textContent = "Elige la carpeta que contiene index.html y vendor.";
      return;
    }

    let bloqueado = false;
    const salida = {};
    // Archivos ocultos del sistema (.DS_Store, ._x, desktop.ini no): la
    // aplicación nunca los carga y sus nombres no son válidos en el manifiesto.
    const ocultos = [...porRuta.keys()].filter(r => r.startsWith("vendor/") && r.split("/").some(seg => seg.startsWith(".")));
    if (ocultos.length) item(avisos, `Se ignoran ${ocultos.length} archivo(s) oculto(s) del sistema (p. ej. ${ocultos[0]}); la aplicación no los carga.`);
    const vendor = [...porRuta.entries()].filter(([r]) => r.startsWith("vendor/") && r !== "vendor/manifiesto-integridad.json" && !ocultos.includes(r));
    let n = 0;
    const innecesarios = new Set();
    for (const [ruta, archivo] of vendor) {
      estado.textContent = `Calculando… ${++n}/${vendor.length}`;
      if (!RE_RUTA.test(ruta) || /[\x00-\x1f\\]/.test(ruta)) {
        item(errores, `Nombre de archivo no permitido: ${ruta}. Renómbralo o bórralo.`);
        bloqueado = true;
        continue;
      }
      const prohibido = PROHIBIDOS.find(([re]) => re.test(ruta));
      if (prohibido) {
        item(errores, `${ruta}: ${prohibido[1]}. Bórralo de vendor.`);
        bloqueado = true;
        continue;
      }
      for (const [re, texto] of INNECESARIOS) if (re.test(ruta)) innecesarios.add(texto);
      const h = hex(await sha256(await archivo.arrayBuffer()));
      if (PDFJS_6_2_108[ruta] && PDFJS_6_2_108[ruta] !== h) {
        item(errores, `${ruta} no es el archivo de PDF.js 6.2.108 con el que se probó esta versión. ` +
          "No sustituyas PDF.js sin actualizar también la aplicación.");
        bloqueado = true;
      }
      salida[ruta] = h;
    }
    for (const texto of innecesarios) item(avisos, `Se incluyen ${texto}. No son necesarios: puedes borrarlos y volver a comprobar.`);

    // Fase A: con Tesseract copiado, los tres núcleos *-lstm.wasm.js son obligatorios. Tesseract.js 7 elige
    // uno según el navegador (Chrome y Edge actuales piden el de relaxed SIMD); sin él, el OCR no arranca.
    const conOCR = Object.keys(salida).some(r => /^vendor\/(?:tesseract|tesseract-core|tessdata)\//.test(r) && !/\/LEEME\.txt$/i.test(r));
    if (conOCR) {
      const faltanNucleos = NUCLEOS_OCR.filter(n => !salida[`vendor/tesseract-core/${n}`]);
      if (faltanNucleos.length) {
        item(errores, `Faltan en vendor/tesseract-core: ${faltanNucleos.join(", ")}. Tesseract.js 7 usa uno de los tres ` +
          "*-lstm.wasm.js según el navegador (Chrome y Edge actuales, el de relaxed SIMD): cópialos los tres del paquete " +
          "tesseract.js-core 7.0.0 (paso 2.2 de las instrucciones).");
        bloqueado = true;
      }
      const sobran = Object.keys(salida).filter(r => r.startsWith("vendor/tesseract-core/") && /\.wasm(?:\.js)?$/.test(r) &&
        !NUCLEOS_OCR.some(n => r === `vendor/tesseract-core/${n}`));
      if (sobran.length) {
        item(avisos, `vendor/tesseract-core contiene ${sobran.length} archivo(s) que la aplicación no usa (núcleos sin «-lstm» y .wasm sueltos; ` +
          "los *.wasm.js llevan el WASM incrustado). Puedes borrarlos y volver a comprobar.");
      }
      const htmlIndex = await porRuta.get("index.html").text();
      const atributo = /data-idiomas-ocr="([^"]*)"/.exec(htmlIndex);
      const idiomas = atributo ? atributo[1].split(",").map(x => x.trim()).filter(Boolean) : IDIOMAS_POR_DEFECTO;
      const faltanIdiomas = idiomas.filter(c => !salida[`vendor/tessdata/${c}.traineddata.gz`]);
      if (faltanIdiomas.length) {
        item(avisos, `index.html usa los idiomas ${idiomas.join(", ")}, pero faltan en vendor/tessdata: ` +
          `${faltanIdiomas.map(c => `${c}.traineddata.gz`).join(", ")}. Cópialos o quítalos de data-idiomas-ocr; si no, la aplicación ` +
          "arrancará sin OCR (y lo avisará).");
      }
    }
    const js = await porRuta.get("analizador-archivos.js").text();
    // Archivo único: worker incrustado entre estas dos marcas (las escribe la distribución).
    const MARCA_WORKER = "worker: function __aaFuenteWorkerNucleo() {\n";
    const FIN_WORKER = "},\n/* fin del worker núcleo incrustado */";
    const iniWorker = js.indexOf(MARCA_WORKER);
    const unico = iniWorker >= 0 && js.indexOf(MARCA_WORKER, iniWorker + 1) < 0 && js.indexOf(FIN_WORKER) > iniWorker;
    const marcoIncrustado = unico && /\nmarco: \{/.test(js);
    if (!unico && !porRuta.has("aa-nucleo.worker.js")) {
      item(errores, "No se encuentra el worker núcleo: ni incrustado en analizador-archivos.js ni como aa-nucleo.worker.js.");
      estado.textContent = "Comprueba que analizador-archivos.js es la versión de archivo único completa.";
      return;
    }
    if (!marcoIncrustado && !salida["vendor/marco-fiscal/marco-fiscal-local.json"]) {
      item(avisos, "Falta vendor/marco-fiscal/marco-fiscal-local.json (MARCO_FISCAL_LOCAL): en modo estricto la aplicación no arrancará.");
    }
    if (bloqueado) {
      estado.textContent = "No se genera el manifiesto: corrige primero los errores en rojo.";
      return;
    }

    // Formato determinista (sin fecha): el mismo contenido de vendor produce
    // siempre el mismo manifiesto y, por tanto, el mismo SHA-256.
    const archivos = Object.fromEntries(Object.keys(salida).sort().map(k => [k, salida[k]]));
    textoManifiesto = JSON.stringify({ version: 1, algoritmo: "SHA-256", archivos }, null, 1);
    const hashManifiesto = hex(await sha256(new TextEncoder().encode(textoManifiesto)));

    // Declaración real (a principio de línea) y única: un comentario no puede suplantarla.
    const constante = nombre => {
      const m = [...js.matchAll(new RegExp(`^const ${nombre} = "([0-9a-f]{64})";`, "gm"))];
      return m.length === 1 ? m[0][1] : "(no encontrado o repetido)";
    };
    const hashWorker = unico
      ? hex(await sha256(new TextEncoder().encode(js.slice(iniWorker + MARCA_WORKER.length, js.indexOf(FIN_WORKER)))))
      : hex(await sha256(await porRuta.get("aa-nucleo.worker.js").arrayBuffer()));

    const actual = porRuta.get("vendor/manifiesto-integridad.json");
    const manifiestoActual = actual ? await actual.text() : null;

    const html = new DOMParser().parseFromString(await porRuta.get("index.html").text(), "text/html");
    const integridadDe = selector => html.querySelector(selector)?.getAttribute("integrity") || "(sin integrity)";
    const sri = async ruta => porRuta.has(ruta) ? `sha256-${base64(await sha256(await porRuta.get(ruta).arrayBuffer()))}` : "(archivo no encontrado)";

    fila("vendor/manifiesto-integridad.json está al día", manifiestoActual === textoManifiesto,
      manifiestoActual === textoManifiesto ? "—" : "Descarga el manifiesto con el botón de abajo");
    fila("SHA256_MANIFIESTO_INTEGRIDAD (analizador-archivos.js)", constante("SHA256_MANIFIESTO_INTEGRIDAD") === hashManifiesto, hashManifiesto);
    fila(`SHA256_WORKER_NUCLEO (${unico ? "worker incrustado" : "aa-nucleo.worker.js"})`, constante("SHA256_WORKER_NUCLEO") === hashWorker, hashWorker);
    // Hojas de estilo: solo si index.html las enlaza (versión de desarrollo).
    const comprobar = [['script[src$="analizador-archivos.js"]', "analizador-archivos.js"],
      ['link[href$="analizador-archivos.css"]', "analizador-archivos.css"], ['link[href$="pagina.css"]', "pagina.css"]]
      .filter(([selector], i) => i === 0 || html.querySelector(selector));
    for (const [selector, ruta] of comprobar) {
      const esperado = await sri(ruta);
      fila(`integrity de ${ruta} (index.html)`, integridadDe(selector) === esperado, esperado);
    }
    // Idefix1.0: las otras páginas de la raíz (sin OCR y demostración del OCR) llevan sus propios atributos integrity.
    for (const pagina of ["index-sin-ocr.html", "demo-ocr.html"]) {
      if (!porRuta.has(pagina)) continue;
      const doc = new DOMParser().parseFromString(await porRuta.get(pagina).text(), "text/html");
      for (const [selector, ruta] of [['script[src$="analizador-archivos.js"]', "analizador-archivos.js"],
        ['script[src$="demo-ocr.js"]', "demo-ocr.js"], ['link[href$="demo-ocr.css"]', "demo-ocr.css"]]) {
        if (!doc.querySelector(selector)) continue;
        const esperado = await sri(ruta);
        fila(`integrity de ${ruta} (${pagina})`, (doc.querySelector(selector).getAttribute("integrity") || "(sin integrity)") === esperado, esperado);
      }
    }
    tabla.hidden = false;
    estado.textContent = `Manifiesto listo: ${Object.keys(archivos).length} archivos de vendor` +
      (unico ? " (archivo único: worker, estilos y marco fiscal incrustados)." : ".");
    boton.disabled = manifiestoActual === textoManifiesto;
  });

  boton.addEventListener("click", () => {
    if (!textoManifiesto) return;
    const url = URL.createObjectURL(new Blob([textoManifiesto], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "manifiesto-integridad.json";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
})();
