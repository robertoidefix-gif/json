/**
 * @file ocr-local.js
 * @description Motor OCR 100 % local sobre Tesseract.js 7.0.0 para Chrome y Edge (Chromium).
 *
 *   Cómo evita la red y las restricciones de file://:
 *   1. Tesseract.js, su worker, el núcleo WebAssembly y el modelo de español se obtienen de los
 *      paquetes locales verificados por SHA-256 (cargador-verificado.js).
 *   2. El Worker se crea desde UNA sola URL blob: que contiene, por este orden:
 *        a) un preludio que anula la red dentro del worker (fetch, XMLHttpRequest, WebSocket,
 *           EventSource, importScripts, IndexedDB, Cache Storage…) y sirve el modelo de idioma
 *           desde memoria tras volver a comprobar su SHA-256;
 *        b) el núcleo tesseract.js-core (define TesseractCore, así la biblioteca no llama a
 *           importScripts para buscarlo);
 *        c) el worker oficial de Tesseract.js.
 *      Con file:// un worker blob: NO puede hacer importScripts() de otra URL blob: (comprobado en
 *      Chromium 141), por eso todo va en un único blob.
 *   3. El idioma se pide a «ocr-local-memoria://tessdata/spa.traineddata.gz», un esquema que no es
 *      de red: solo lo atiende el preludio. No se usa la forma { code, data } de la API porque en
 *      Tesseract.js 7.0.0 está rota (src/worker-script/index.js, initialize: usa l.data como nombre
 *      del idioma).
 *   4. cacheMethod 'none': no se lee ni se escribe IndexedDB (evita envenenamiento de caché).
 *   5. La imagen se valida (contenido, tamaño, dimensiones), se decodifica con el navegador y se
 *      entrega a Tesseract como PNG generado localmente: Leptonica nunca ve el archivo original.
 *
 * Ruta: ocr-local/js/ocr-local.js
 * Dependencias: ocr-local/js/cargador-verificado.js (window.CargadorVerificado) y los paquetes
 *   tesseract-main, tesseract-worker, tesseract-core-simd-lstm (o tesseract-core-lstm) y
 *   tessdata-spa de ocr-local/vendor-paquetes/.
 * Expone: window.OCRLocal
 */
(function () {
  'use strict';

  if (window.OCRLocal) {
    return;
  }
  const Cargador = window.CargadorVerificado;
  if (!Cargador) {
    throw new Error('ocr-local.js necesita que cargador-verificado.js se cargue antes.');
  }

  const VERSION = '1.0.0';

  /** Límites centralizados (tamaños, píxeles y tiempos máximos). */
  const LIMITES = Object.freeze({
    BYTES_MAX_IMAGEN: 25 * 1024 * 1024,
    BYTES_CABECERA_JPEG: 4 * 1024 * 1024,
    PIXELES_MAX: 40000000,
    LADO_MAX: 12000,
    LADO_MIN: 16,
    MS_MAX_DECODIFICACION: 30000,
    MS_MAX_INICIO: 90000,
    MS_MAX_PARAMETROS: 15000,
    MS_MAX_RECONOCIMIENTO: 180000,
    MAX_AVISOS_RED: 100
  });

  const IDIOMA = 'spa';
  /** OEM 1 = solo LSTM (el núcleo «-lstm» no incluye el motor antiguo). */
  const OEM_SOLO_LSTM = 1;
  const RUTA_DATOS_MEMORIA = 'ocr-local-memoria://tessdata';
  const URL_DATOS_MEMORIA = RUTA_DATOS_MEMORIA + '/' + IDIOMA + '.traineddata.gz';
  /** Por debajo de esta confianza (0–100) una palabra se marca como dudosa. */
  const UMBRAL_BAJA_CONFIANZA = 60;

  /** Módulo WebAssembly mínimo con una instrucción SIMD (misma sonda que wasm-feature-detect). */
  const SONDA_SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

  /** Etapas que comunica Tesseract.js → [inicio, fin, texto en español] dentro de la fase «motor». */
  const ETAPAS_MOTOR = Object.freeze({
    'loading tesseract core': [0.45, 0.5, 'Cargando el núcleo WebAssembly'],
    'initializing tesseract': [0.5, 0.65, 'Inicializando el motor WebAssembly'],
    'loading language traineddata': [0.65, 0.85, 'Cargando el modelo de español'],
    'initializing api': [0.85, 1, 'Preparando el reconocimiento']
  });

  /**
   * Error del motor con código estable.
   */
  class ErrorOCR extends Error {
    /**
     * @param {string} codigo NO_SOPORTADO | ARCHIVO_VACIO | TAMANO | FORMATO | DIMENSIONES |
     *   DECODIFICACION | INTEGRIDAD | PAQUETE | MOTOR | TIEMPO_AGOTADO | CANCELADO | OCUPADO | LIBERADO
     * @param {string} mensaje Texto en español para mostrar al usuario.
     */
    constructor(codigo, mensaje) {
      super(mensaje);
      this.name = 'ErrorOCR';
      this.codigo = codigo;
    }
  }

  /**
   * Registra en la consola (nivel debug) un rechazo que ya se ha comunicado por otra vía,
   * para que no aparezca como «unhandled rejection» y tampoco se pierda.
   * @param {unknown} motivo
   */
  function registrarYaGestionado(motivo) {
    console.debug('[OCR local] rechazo ya gestionado:', motivo);
  }

  /**
   * Convierte cualquier valor de error en texto corto y seguro para mostrarlo con textContent.
   * @param {unknown} valor
   * @returns {string}
   */
  function textoError(valor) {
    let texto;
    if (valor && typeof valor === 'object' && 'message' in valor) {
      texto = String(valor.message);
    } else {
      texto = String(valor);
    }
    return texto.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
  }

  /**
   * Comprueba las capacidades del navegador que necesita el motor.
   * @returns {{ok: boolean, faltan: string[]}}
   */
  function comprobarSoporte() {
    const faltan = [];
    if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') {
      faltan.push('WebAssembly');
    }
    if (typeof Worker !== 'function') {
      faltan.push('Web Workers');
    }
    if (!window.crypto || !crypto.subtle) {
      faltan.push('crypto.subtle');
    }
    if (typeof createImageBitmap !== 'function') {
      faltan.push('createImageBitmap');
    }
    if (typeof OffscreenCanvas !== 'function') {
      faltan.push('OffscreenCanvas');
    }
    if (typeof Blob !== 'function' || typeof URL.createObjectURL !== 'function') {
      faltan.push('Blob/URL.createObjectURL');
    }
    return { ok: faltan.length === 0, faltan };
  }

  /**
   * @returns {boolean} true si el navegador admite WebAssembly SIMD.
   */
  function hayWasmSimd() {
    try {
      return WebAssembly.validate(SONDA_SIMD);
    } catch (error) {
      registrarYaGestionado(error);
      return false;
    }
  }

  /**
   * Rechaza si la promesa no termina antes de «ms». Si se abandona, «alAbandonar» recibe el valor
   * que llegue tarde (para liberar recursos como un ImageBitmap).
   * @template T
   * @param {Promise<T>} promesa
   * @param {number} ms
   * @param {string} mensaje
   * @param {(valorTardio: T) => void} [alAbandonar]
   * @returns {Promise<T>}
   */
  function conTiempoMaximo(promesa, ms, mensaje, alAbandonar) {
    let temporizador = 0;
    let abandonada = false;
    const limite = new Promise((resolver, rechazar) => {
      temporizador = setTimeout(() => {
        abandonada = true;
        rechazar(new ErrorOCR('TIEMPO_AGOTADO', mensaje));
      }, ms);
    });
    promesa.then((valor) => {
      if (abandonada && alAbandonar) {
        alAbandonar(valor);
      }
    }, registrarYaGestionado);
    return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
  }

  // ---------------------------------------------------------------------------------------------
  // Validación de la imagen
  // ---------------------------------------------------------------------------------------------

  /**
   * Detecta el formato por la firma del contenido (no por la extensión ni por file.type).
   * @param {Uint8Array} b Primeros bytes del archivo.
   * @returns {'png'|'jpeg'|'webp'|'bmp'|null}
   */
  function detectarFormato(b) {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
        b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
      return 'png';
    }
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      return 'jpeg';
    }
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      return 'webp';
    }
    if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) {
      return 'bmp';
    }
    return null;
  }

  /**
   * Busca el marcador SOF de un JPEG para leer sus dimensiones sin decodificarlo.
   * @param {Uint8Array} b
   * @returns {{ancho: number, alto: number}|null}
   */
  function dimensionesJPEG(b) {
    let i = 2;
    while (i + 3 < b.length) {
      if (b[i] !== 0xff) {
        return null;
      }
      let marcador = b[i + 1];
      while (marcador === 0xff && i + 2 < b.length) {
        i += 1;
        marcador = b[i + 1];
      }
      if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) {
        i += 2;
        continue;
      }
      if (marcador === 0xd9 || marcador === 0xda) {
        return null;
      }
      const longitud = (b[i + 2] << 8) | b[i + 3];
      if (longitud < 2) {
        return null;
      }
      const esSOF = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
      if (esSOF) {
        if (i + 8 >= b.length) {
          return null;
        }
        return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + longitud;
    }
    return null;
  }

  /**
   * Lee las dimensiones declaradas en la cabecera (protección frente a «bombas» de descompresión).
   * @param {'png'|'jpeg'|'webp'|'bmp'} formato
   * @param {Uint8Array} b
   * @returns {{ancho: number, alto: number}|null}
   */
  function dimensionesDeCabecera(formato, b) {
    const vista = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (formato === 'png') {
      const esIHDR = b.length >= 24 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52;
      return esIHDR ? { ancho: vista.getUint32(16, false), alto: vista.getUint32(20, false) } : null;
    }
    if (formato === 'jpeg') {
      return dimensionesJPEG(b);
    }
    if (formato === 'webp') {
      if (b.length < 30) {
        return null;
      }
      const fragmento = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (fragmento === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
        return { ancho: vista.getUint16(26, true) & 0x3fff, alto: vista.getUint16(28, true) & 0x3fff };
      }
      if (fragmento === 'VP8L' && b[20] === 0x2f) {
        const bits = vista.getUint32(21, true);
        return { ancho: (bits & 0x3fff) + 1, alto: ((bits >>> 14) & 0x3fff) + 1 };
      }
      if (fragmento === 'VP8X') {
        return {
          ancho: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
          alto: 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
        };
      }
      return null;
    }
    if (formato === 'bmp') {
      if (b.length < 26) {
        return null;
      }
      const tamanoDIB = vista.getUint32(14, true);
      if (tamanoDIB === 12) {
        return { ancho: vista.getUint16(18, true), alto: vista.getUint16(20, true) };
      }
      if (tamanoDIB >= 40) {
        return { ancho: vista.getInt32(18, true), alto: Math.abs(vista.getInt32(22, true)) };
      }
      return null;
    }
    return null;
  }

  /**
   * @param {{ancho: number, alto: number}} d
   * @throws {ErrorOCR} DIMENSIONES si la imagen es demasiado pequeña o demasiado grande.
   */
  function validarDimensiones(d) {
    if (!Number.isInteger(d.ancho) || !Number.isInteger(d.alto) || d.ancho < LIMITES.LADO_MIN || d.alto < LIMITES.LADO_MIN) {
      throw new ErrorOCR('DIMENSIONES', 'La imagen es demasiado pequeña o sus dimensiones no son válidas (mínimo ' +
        LIMITES.LADO_MIN + ' × ' + LIMITES.LADO_MIN + ' píxeles).');
    }
    if (d.ancho > LIMITES.LADO_MAX || d.alto > LIMITES.LADO_MAX || d.ancho * d.alto > LIMITES.PIXELES_MAX) {
      throw new ErrorOCR('DIMENSIONES', 'La imagen es demasiado grande (' + d.ancho + ' × ' + d.alto +
        ' píxeles; máximo ' + LIMITES.LADO_MAX + ' por lado y ' + (LIMITES.PIXELES_MAX / 1e6) + ' megapíxeles).');
    }
  }

  /**
   * Valida una imagen y la convierte en un PNG generado por el propio navegador (fondo blanco,
   * orientación EXIF aplicada, sin metadatos).
   * @param {Blob} archivo Imagen elegida por el usuario.
   * @returns {Promise<{png: Blob, ancho: number, alto: number, formato: string}>}
   * @throws {ErrorOCR}
   */
  async function prepararImagen(archivo) {
    if (!(archivo instanceof Blob)) {
      throw new ErrorOCR('FORMATO', 'No se ha recibido ningún archivo de imagen.');
    }
    if (archivo.size === 0) {
      throw new ErrorOCR('ARCHIVO_VACIO', 'El archivo está vacío (0 bytes).');
    }
    if (archivo.size > LIMITES.BYTES_MAX_IMAGEN) {
      throw new ErrorOCR('TAMANO', 'El archivo ocupa ' + (archivo.size / 1048576).toFixed(1) +
        ' MB; el máximo es ' + (LIMITES.BYTES_MAX_IMAGEN / 1048576) + ' MB.');
    }
    const cabecera = new Uint8Array(await archivo.slice(0, 64).arrayBuffer());
    const formato = detectarFormato(cabecera);
    if (!formato) {
      throw new ErrorOCR('FORMATO', 'Formato no admitido. Solo PNG, JPEG, WebP o BMP (se comprueba el contenido, no la extensión).');
    }
    const muestra = formato === 'jpeg'
      ? new Uint8Array(await archivo.slice(0, Math.min(archivo.size, LIMITES.BYTES_CABECERA_JPEG)).arrayBuffer())
      : cabecera;
    const declaradas = dimensionesDeCabecera(formato, muestra);
    if (!declaradas) {
      throw new ErrorOCR('FORMATO', 'No se pudieron leer las dimensiones de la imagen: el archivo está dañado o no es válido.');
    }
    validarDimensiones(declaradas);

    let mapa;
    try {
      mapa = await conTiempoMaximo(
        createImageBitmap(archivo, { imageOrientation: 'from-image' }),
        LIMITES.MS_MAX_DECODIFICACION,
        'La imagen tardó demasiado en decodificarse.',
        (tardio) => tardio.close()
      );
    } catch (error) {
      if (error instanceof ErrorOCR) {
        throw error;
      }
      throw new ErrorOCR('DECODIFICACION', 'El navegador no pudo decodificar la imagen (archivo dañado o incompleto).');
    }
    try {
      const reales = { ancho: mapa.width, alto: mapa.height };
      validarDimensiones(reales);
      const lienzo = new OffscreenCanvas(reales.ancho, reales.alto);
      const contexto = lienzo.getContext('2d', { alpha: false });
      contexto.fillStyle = '#ffffff';
      contexto.fillRect(0, 0, reales.ancho, reales.alto);
      contexto.drawImage(mapa, 0, 0);
      const png = await lienzo.convertToBlob({ type: 'image/png' });
      return { png, ancho: reales.ancho, alto: reales.alto, formato };
    } catch (error) {
      if (error instanceof ErrorOCR) {
        throw error;
      }
      throw new ErrorOCR('DECODIFICACION', 'No se pudo preparar la imagen para el OCR: ' + textoError(error));
    } finally {
      mapa.close();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Construcción del worker
  // ---------------------------------------------------------------------------------------------

  /**
   * Código que se ejecuta dentro del worker ANTES del núcleo y de Tesseract.js. Se divide en dos
   * partes para insertar entre ellas el base64 del modelo sin copiarlo en otra cadena.
   * @param {string} sha256Datos SHA-256 esperado del modelo.
   * @returns {{antes: string, despues: string}}
   */
  function construirPreludio(sha256Datos) {
    const antes = '(function () {\n' +
      '"use strict";\n' +
      'var g = self;\n' +
      'var URL_DATOS = ' + JSON.stringify(URL_DATOS_MEMORIA) + ';\n' +
      'var SHA256_DATOS = ' + JSON.stringify(sha256Datos) + ';\n' +
      'var B64 = "';
    const despues = '";\n' +
      'var enviar = g.postMessage.bind(g);\n' +
      'var bloqueados = 0;\n' +
      'function informar(api, destino) {\n' +
      '  bloqueados += 1;\n' +
      '  var texto = destino && typeof destino === "object" && typeof destino.url === "string" ? destino.url : String(destino === undefined ? "" : destino);\n' +
      '  try { enviar({ ocrLocalRed: { api: String(api), destino: texto.slice(0, 200), total: bloqueados } }); } catch (e) { /* el intento ya está bloqueado */ }\n' +
      '}\n' +
      'function bloqueado(nombre) {\n' +
      '  return function () {\n' +
      '    informar(nombre, arguments.length > 0 ? arguments[0] : "");\n' +
      '    throw new TypeError("OCR local: «" + nombre + "» está desactivado dentro del worker (sin red).");\n' +
      '  };\n' +
      '}\n' +
      'function fijar(objeto, nombre, valor) {\n' +
      '  if (!objeto) { return; }\n' +
      '  try { Object.defineProperty(objeto, nombre, { value: valor, writable: false, configurable: false, enumerable: false }); }\n' +
      '  catch (e) { try { objeto[nombre] = valor; } catch (e2) { informar("fijar", nombre); } }\n' +
      '}\n' +
      'function hex(buffer) {\n' +
      '  var b = new Uint8Array(buffer), s = "";\n' +
      '  for (var i = 0; i < b.length; i += 1) { s += (b[i] < 16 ? "0" : "") + b[i].toString(16); }\n' +
      '  return s;\n' +
      '}\n' +
      'var servido = false;\n' +
      'function fetchLocal(entrada) {\n' +
      '  var url = typeof entrada === "string" ? entrada : (entrada && typeof entrada.url === "string" ? entrada.url : String(entrada));\n' +
      '  if (url === URL_DATOS && !servido && B64 !== null) {\n' +
      '    servido = true;\n' +
      '    var binario = atob(B64); B64 = null;\n' +
      '    var datos = new Uint8Array(binario.length);\n' +
      '    for (var i = 0; i < binario.length; i += 1) { datos[i] = binario.charCodeAt(i); }\n' +
      '    binario = null;\n' +
      '    return crypto.subtle.digest("SHA-256", datos).then(function (resumen) {\n' +
      '      if (hex(resumen) !== SHA256_DATOS) { throw new Error("OCR local: el modelo de idioma no supera la verificación SHA-256 dentro del worker."); }\n' +
      '      return new Response(datos, { status: 200, headers: { "Content-Type": "application/octet-stream" } });\n' +
      '    });\n' +
      '  }\n' +
      '  informar("fetch", url);\n' +
      '  return Promise.reject(new TypeError("OCR local: petición bloqueada dentro del worker: " + url.slice(0, 120)));\n' +
      '}\n' +
      'fijar(g, "fetch", fetchLocal);\n' +
      'if (typeof WorkerGlobalScope !== "undefined") { fijar(WorkerGlobalScope.prototype, "fetch", fetchLocal); }\n' +
      '["XMLHttpRequest", "WebSocket", "WebSocketStream", "EventSource", "WebTransport", "Worker", "SharedWorker",\n' +
      ' "BroadcastChannel", "FontFace", "importScripts"].forEach(function (nombre) {\n' +
      '  if (nombre in g) { fijar(g, nombre, bloqueado(nombre)); }\n' +
      '});\n' +
      'fijar(g, "indexedDB", Object.freeze({ open: bloqueado("indexedDB.open"), deleteDatabase: bloqueado("indexedDB.deleteDatabase"),\n' +
      '  databases: bloqueado("indexedDB.databases"), cmp: bloqueado("indexedDB.cmp") }));\n' +
      'fijar(g, "caches", Object.freeze({ open: bloqueado("caches.open"), match: bloqueado("caches.match"), has: bloqueado("caches.has"),\n' +
      '  keys: bloqueado("caches.keys"), "delete": bloqueado("caches.delete") }));\n' +
      'g.addEventListener("securitypolicyviolation", function (e) { informar("CSP " + e.violatedDirective, e.blockedURI); });\n' +
      '})();\n';
    return { antes, despues };
  }

  // ---------------------------------------------------------------------------------------------
  // Motor
  // ---------------------------------------------------------------------------------------------

  /**
   * Motor OCR local. Una instancia mantiene un único worker de Tesseract y procesa una imagen
   * cada vez. Cancelar o agotar el tiempo termina el worker; se vuelve a crear en la siguiente
   * llamada a partir de los bytes ya verificados.
   */
  class MotorOCRLocal {
    #estado = 'sin_iniciar';
    #ocupado = false;
    #promesaInicio = null;
    #tesseract = null;
    #blobTrabajador = null;
    #trabajador = null;
    #workerNativo = null;
    #canalError = null;
    #generacion = 0;
    #abortarActual = null;
    #alProgreso = null;
    #nucleo = '';
    #avisosRed = [];
    #alAvisoRed = null;

    /**
     * @param {{alAvisoRed?: (aviso: {api: string, destino: string, total: number}) => void}} [opciones]
     *   alAvisoRed se llama cada vez que el preludio del worker bloquea un intento de red.
     */
    constructor(opciones = {}) {
      this.#alAvisoRed = typeof opciones.alAvisoRed === 'function' ? opciones.alAvisoRed : null;
    }

    /** @returns {string} sin_iniciar | iniciando | listo | reconociendo | error | liberado */
    get estado() {
      return this.#estado;
    }

    /** @returns {string} Variante del núcleo WebAssembly en uso (vacío si aún no se ha elegido). */
    get nucleo() {
      return this.#nucleo;
    }

    /** @returns {Array<{api: string, destino: string, total: number}>} Intentos de red bloqueados en el worker. */
    get avisosRed() {
      return this.#avisosRed.slice();
    }

    /**
     * Verifica las bibliotecas y arranca el worker. Llamadas repetidas comparten la misma promesa.
     * @param {(p: {fase: string, etapa: string, progreso: number}) => void} [alProgreso]
     * @returns {Promise<void>}
     */
    iniciar(alProgreso) {
      if (this.#estado === 'liberado') {
        return Promise.reject(new ErrorOCR('LIBERADO', 'El motor OCR ya se liberó; recargue la página.'));
      }
      if (typeof alProgreso === 'function') {
        this.#alProgreso = alProgreso;
      }
      if (this.#trabajador && this.#estado !== 'error') {
        return Promise.resolve();
      }
      if (this.#promesaInicio) {
        return this.#promesaInicio;
      }
      this.#estado = 'iniciando';
      this.#promesaInicio = this.#iniciarInterno()
        .then(() => {
          if (this.#estado === 'liberado') {
            this.#terminarTrabajador();
            throw new ErrorOCR('LIBERADO', 'El motor OCR se liberó durante el arranque.');
          }
          this.#estado = 'listo';
        }, (error) => {
          this.#terminarTrabajador();
          // liberar() pudo llamarse mientras tanto: ese estado es definitivo y no se sobrescribe.
          if (this.#estado !== 'liberado') {
            this.#estado = error instanceof ErrorOCR && error.codigo === 'CANCELADO' ? 'sin_iniciar' : 'error';
          }
          throw error;
        })
        .finally(() => {
          this.#promesaInicio = null;
        });
      return this.#promesaInicio;
    }

    /**
     * Reconoce el texto en español de una imagen.
     * @param {Blob} archivo Imagen PNG, JPEG, WebP o BMP.
     * @param {{alProgreso?: (p: {fase: string, etapa: string, progreso: number}) => void}} [opciones]
     * @returns {Promise<ResultadoOCR>}
     * @throws {ErrorOCR}
     */
    async reconocer(archivo, opciones = {}) {
      // La marca se pone de forma síncrona, antes de cualquier «await»: dos llamadas seguidas no
      // pueden colarse a la vez aunque la primera esté esperando el arranque del motor.
      if (this.#ocupado) {
        throw new ErrorOCR('OCUPADO', 'Ya hay un reconocimiento en curso.');
      }
      this.#ocupado = true;
      try {
        return await this.#reconocerInterno(archivo, opciones);
      } finally {
        this.#ocupado = false;
      }
    }

    /**
     * @param {Blob} archivo
     * @param {{alProgreso?: Function}} opciones
     * @returns {Promise<ResultadoOCR>}
     */
    async #reconocerInterno(archivo, opciones) {
      await this.iniciar(opciones.alProgreso);
      if (this.#estado !== 'listo' || !this.#trabajador) {
        throw new ErrorOCR('MOTOR', 'El motor OCR no está disponible.');
      }
      this.#estado = 'reconociendo';
      const cancelacion = this.#prepararCancelacion();
      const canal = this.#canalError;
      let workerOcupado = false;
      try {
        this.#notificar('imagen', 'Validando y preparando la imagen', 0);
        const imagen = await Promise.race([prepararImagen(archivo), cancelacion]);
        workerOcupado = true;
        this.#notificar('reconocimiento', 'Reconociendo texto', 0);
        const inicio = performance.now();
        const respuesta = await conTiempoMaximo(
          Promise.race([this.#trabajador.recognize(imagen.png, {}, { text: true, blocks: true }), canal.promesa, cancelacion]),
          LIMITES.MS_MAX_RECONOCIMIENTO,
          'El reconocimiento superó ' + (LIMITES.MS_MAX_RECONOCIMIENTO / 1000) + ' s y se ha detenido.'
        );
        this.#notificar('reconocimiento', 'Reconocimiento terminado', 1);
        return construirResultado(respuesta.data, imagen, performance.now() - inicio, this.#nucleo);
      } catch (error) {
        const codigo = error instanceof ErrorOCR ? error.codigo : 'MOTOR';
        // Si el worker ya tenía la imagen, la única forma de pararlo es terminarlo. Si se canceló
        // mientras se preparaba la imagen, el worker sigue limpio y se conserva.
        if (workerOcupado && (codigo === 'CANCELADO' || codigo === 'TIEMPO_AGOTADO' || codigo === 'MOTOR')) {
          this.#terminarTrabajador();
          if (this.#estado !== 'liberado') {
            this.#estado = 'sin_iniciar';
          }
        }
        if (error instanceof ErrorOCR) {
          throw error;
        }
        throw new ErrorOCR('MOTOR', 'Error del motor OCR: ' + textoError(error));
      } finally {
        this.#abortarActual = null;
        if (this.#estado === 'reconociendo') {
          this.#estado = 'listo';
        }
      }
    }

    /**
     * Cancela la operación en curso (inicio o reconocimiento). El worker se termina de inmediato.
     * @returns {boolean} true si había algo que cancelar.
     */
    cancelar() {
      const abortar = this.#abortarActual;
      if (!abortar) {
        return false;
      }
      this.#abortarActual = null;
      abortar(new ErrorOCR('CANCELADO', 'Operación cancelada.'));
      return true;
    }

    /**
     * Termina el worker y suelta los bytes verificados. El motor no puede volver a usarse.
     */
    liberar() {
      this.cancelar();
      this.#terminarTrabajador();
      this.#blobTrabajador = null;
      this.#estado = 'liberado';
    }

    async #iniciarInterno() {
      const soporte = comprobarSoporte();
      if (!soporte.ok) {
        throw new ErrorOCR('NO_SOPORTADO', 'El navegador no ofrece: ' + soporte.faltan.join(', ') + '. Use Chrome o Edge actualizados.');
      }
      const cancelacion = this.#prepararCancelacion();
      try {
        if (!this.#tesseract) {
          this.#notificar('motor', 'Verificando Tesseract.js (SHA-256)', 0.05);
          if (!window.Tesseract) {
            await Promise.race([this.#conCodigo(Cargador.ejecutarScriptVerificado('tesseract-main')), cancelacion]);
          }
          if (!window.Tesseract || typeof window.Tesseract.createWorker !== 'function') {
            throw new ErrorOCR('PAQUETE', 'Tesseract.js no se ha inicializado correctamente.');
          }
          this.#tesseract = window.Tesseract;
        }
        if (!this.#blobTrabajador) {
          const nombreNucleo = hayWasmSimd() ? 'tesseract-core-simd-lstm' : 'tesseract-core-lstm';
          this.#notificar('motor', 'Verificando el núcleo WebAssembly (SHA-256)', 0.15);
          const nucleo = await Promise.race([this.#conCodigo(Cargador.obtenerVerificado(nombreNucleo)), cancelacion]);
          this.#notificar('motor', 'Verificando el worker de Tesseract.js (SHA-256)', 0.3);
          const worker = await Promise.race([this.#conCodigo(Cargador.obtenerVerificado('tesseract-worker')), cancelacion]);
          this.#notificar('motor', 'Verificando el modelo de español (SHA-256)', 0.38);
          const datos = await Promise.race([this.#conCodigo(Cargador.obtenerVerificado('tessdata-spa')), cancelacion]);
          const preludio = construirPreludio(datos.entrada.sha256);
          this.#blobTrabajador = new Blob(
            [preludio.antes, datos.base64, preludio.despues, '\n', nucleo.bytes, '\n;\n', worker.bytes, '\n'],
            { type: 'text/javascript' }
          );
          this.#nucleo = nombreNucleo;
        }
      } finally {
        this.#abortarActual = null;
      }
      await this.#crearTrabajador();
    }

    /**
     * Traduce los errores del cargador a ErrorOCR.
     * @template T
     * @param {Promise<T>} promesa
     * @returns {Promise<T>}
     */
    #conCodigo(promesa) {
      return promesa.catch((error) => {
        if (error instanceof ErrorOCR) {
          throw error;
        }
        const codigo = error && error.codigo === 'INTEGRIDAD' ? 'INTEGRIDAD' : 'PAQUETE';
        throw new ErrorOCR(codigo, textoError(error));
      });
    }

    async #crearTrabajador() {
      this.#generacion += 1;
      const generacion = this.#generacion;
      const canal = this.#crearCanalError();
      const cancelacion = this.#prepararCancelacion();
      const url = URL.createObjectURL(this.#blobTrabajador);
      const WorkerOriginal = window.Worker;
      let capturado = null;
      let promesa;
      try {
        // Tesseract.createWorker crea el Worker de forma síncrona, antes de su primer «await».
        // Se captura esa instancia para poder terminarla aunque la promesa no llegue a resolverse
        // (en 7.0.0, si falla la carga del idioma o la inicialización, createWorker nunca termina).
        window.Worker = function WorkerCapturado(ruta, opcionesWorker) {
          capturado = new WorkerOriginal(ruta, opcionesWorker);
          return capturado;
        };
        promesa = this.#tesseract.createWorker(IDIOMA, OEM_SOLO_LSTM, {
          workerPath: url,
          workerBlobURL: false,
          langPath: RUTA_DATOS_MEMORIA,
          cacheMethod: 'none',
          gzip: true,
          logger: (mensaje) => {
            if (generacion === this.#generacion) {
              this.#alMensajeTesseract(mensaje);
            }
          },
          errorHandler: (error) => {
            if (generacion === this.#generacion) {
              canal.rechazar(new ErrorOCR('MOTOR', 'El motor OCR informó de un error: ' + textoError(error)));
            }
          }
        });
      } finally {
        window.Worker = WorkerOriginal;
      }
      this.#workerNativo = capturado;
      if (capturado) {
        capturado.addEventListener('message', (evento) => this.#alMensajeWorker(generacion, evento));
        capturado.addEventListener('error', (evento) => {
          if (generacion === this.#generacion) {
            canal.rechazar(new ErrorOCR('MOTOR', 'El worker OCR se detuvo con un error: ' + textoError(evento.message || 'sin detalle')));
          }
        });
      }
      try {
        const trabajador = await conTiempoMaximo(
          Promise.race([promesa, canal.promesa, cancelacion]),
          LIMITES.MS_MAX_INICIO,
          'El motor OCR no terminó de arrancar en ' + (LIMITES.MS_MAX_INICIO / 1000) + ' s.'
        );
        if (generacion !== this.#generacion) {
          throw new ErrorOCR('CANCELADO', 'Operación cancelada.');
        }
        await conTiempoMaximo(
          Promise.race([trabajador.setParameters({ preserve_interword_spaces: '1' }), canal.promesa, cancelacion]),
          LIMITES.MS_MAX_PARAMETROS,
          'El motor OCR no aceptó la configuración a tiempo.'
        );
        this.#trabajador = trabajador;
      } finally {
        this.#abortarActual = null;
        URL.revokeObjectURL(url);
      }
    }

    /**
     * Prepara la promesa de cancelación de la operación actual.
     * @returns {Promise<never>}
     */
    #prepararCancelacion() {
      let rechazar;
      const promesa = new Promise((resolverNoUsado, r) => {
        rechazar = r;
      });
      promesa.catch(registrarYaGestionado);
      this.#abortarActual = rechazar;
      return promesa;
    }

    /**
     * Canal por el que se notifican los errores del worker de la generación actual.
     * @returns {{promesa: Promise<never>, rechazar: (e: Error) => void}}
     */
    #crearCanalError() {
      let rechazar;
      const promesa = new Promise((resolverNoUsado, r) => {
        rechazar = r;
      });
      promesa.catch(registrarYaGestionado);
      this.#canalError = { promesa, rechazar };
      return this.#canalError;
    }

    #terminarTrabajador() {
      this.#generacion += 1;
      const nativo = this.#workerNativo;
      this.#trabajador = null;
      this.#workerNativo = null;
      this.#canalError = null;
      if (nativo) {
        nativo.terminate();
      }
    }

    /**
     * @param {MessageEvent} evento Mensaje del worker; solo interesan los avisos del preludio.
     */
    #alMensajeWorker(generacion, evento) {
      const datos = evento.data;
      if (generacion !== this.#generacion || !datos || typeof datos !== 'object' || !datos.ocrLocalRed) {
        return;
      }
      const aviso = {
        api: String(datos.ocrLocalRed.api).slice(0, 80),
        destino: String(datos.ocrLocalRed.destino).slice(0, 200),
        total: Number(datos.ocrLocalRed.total) || 0
      };
      if (this.#avisosRed.length < LIMITES.MAX_AVISOS_RED) {
        this.#avisosRed.push(aviso);
      }
      if (this.#alAvisoRed) {
        this.#alAvisoRed(aviso);
      }
    }

    /**
     * @param {{status?: string, progress?: number}} mensaje Progreso que envía Tesseract.js.
     */
    #alMensajeTesseract(mensaje) {
      const estado = mensaje && typeof mensaje.status === 'string' ? mensaje.status : '';
      const avance = Math.min(1, Math.max(0, Number(mensaje && mensaje.progress) || 0));
      if (estado === 'recognizing text') {
        this.#notificar('reconocimiento', 'Reconociendo texto', avance);
        return;
      }
      const etapa = ETAPAS_MOTOR[estado];
      if (etapa) {
        this.#notificar('motor', etapa[2], etapa[0] + (etapa[1] - etapa[0]) * avance);
      }
    }

    #notificar(fase, etapa, progreso) {
      if (this.#alProgreso) {
        this.#alProgreso({ fase, etapa, progreso });
      }
    }
  }

  /**
   * @typedef {object} ResultadoOCR
   * @property {string} texto Texto reconocido (sin tratar: mostrar solo con textContent/value).
   * @property {number|null} confianzaMedia Confianza media 0–100 que da Tesseract.
   * @property {Array<{texto: string, confianza: number|null, caja: object|null, palabrasDudosas: number}>} lineas
   * @property {number} totalPalabras
   * @property {number} palabrasBajaConfianza Palabras por debajo de UMBRAL_BAJA_CONFIANZA.
   * @property {{formato: string, ancho: number, alto: number}} imagen
   * @property {string} idioma
   * @property {string} motor
   * @property {number} msReconocimiento
   */

  /**
   * @param {unknown} valor
   * @returns {number|null} Número con un decimal, o null si no es un número finito.
   */
  function confianzaONull(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.round(numero * 10) / 10 : null;
  }

  /**
   * Convierte la salida de Tesseract.js (blocks → paragraphs → lines → words) en un resultado plano.
   * @param {object} datos respuesta.data de recognize()
   * @param {{formato: string, ancho: number, alto: number}} imagen
   * @param {number} ms
   * @param {string} nucleo
   * @returns {ResultadoOCR}
   */
  function construirResultado(datos, imagen, ms, nucleo) {
    const lineas = [];
    let totalPalabras = 0;
    let palabrasBajaConfianza = 0;
    const bloques = Array.isArray(datos && datos.blocks) ? datos.blocks : [];
    for (const bloque of bloques) {
      for (const parrafo of (bloque && Array.isArray(bloque.paragraphs) ? bloque.paragraphs : [])) {
        for (const linea of (parrafo && Array.isArray(parrafo.lines) ? parrafo.lines : [])) {
          const texto = String(linea && linea.text ? linea.text : '').replace(/\s+$/u, '');
          if (texto.trim() === '') {
            continue;
          }
          let palabrasDudosas = 0;
          for (const palabra of (Array.isArray(linea.words) ? linea.words : [])) {
            totalPalabras += 1;
            const confianza = confianzaONull(palabra && palabra.confidence);
            if (confianza === null || confianza < UMBRAL_BAJA_CONFIANZA) {
              palabrasDudosas += 1;
              palabrasBajaConfianza += 1;
            }
          }
          const caja = linea.bbox && Number.isFinite(linea.bbox.x0)
            ? { x0: linea.bbox.x0, y0: linea.bbox.y0, x1: linea.bbox.x1, y1: linea.bbox.y1 }
            : null;
          lineas.push({ texto, confianza: confianzaONull(linea.confidence), caja, palabrasDudosas });
        }
      }
    }
    return {
      texto: String(datos && datos.text ? datos.text : ''),
      confianzaMedia: confianzaONull(datos && datos.confidence),
      lineas,
      totalPalabras,
      palabrasBajaConfianza,
      imagen: { formato: imagen.formato, ancho: imagen.ancho, alto: imagen.alto },
      idioma: IDIOMA,
      motor: 'Tesseract.js 7.0.0 · ' + nucleo,
      msReconocimiento: Math.round(ms)
    };
  }

  Object.defineProperty(window, 'OCRLocal', {
    value: Object.freeze({
      VERSION,
      LIMITES,
      UMBRAL_BAJA_CONFIANZA,
      ErrorOCR,
      MotorOCRLocal,
      comprobarSoporte,
      hayWasmSimd,
      prepararImagen,
      detectarFormato,
      dimensionesDeCabecera,
      /** Expuesto solo para auditar y probar el preludio que anula la red dentro del worker. */
      construirPreludioWorker: construirPreludio,
      URL_DATOS_MEMORIA
    }),
    writable: false,
    configurable: false,
    enumerable: false
  });
})();
