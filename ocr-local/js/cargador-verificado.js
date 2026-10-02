/**
 * @file cargador-verificado.js
 * @description Carga verificada de las bibliotecas de terceros (Bootstrap, Tesseract.js,
 *   tesseract.js-core y el modelo de español) desde «paquetes» locales de vendor-paquetes/.
 *
 *   Por qué paquetes y no los archivos oficiales tal cual: con file:// Chrome y Edge bloquean
 *   fetch() y XMLHttpRequest a archivos locales, no permiten new Worker('archivo.js') y bloquean
 *   cualquier <script>/<link> con atributo integrity (SRI). Un <script src> clásico sí se carga.
 *   Cada paquete es un .js que solo contiene el archivo OFICIAL codificado en base64 y una llamada
 *   a OCRLocalPaquetes.registrar(). Antes de usar nada se decodifica y se comprueba que su
 *   SHA-256 coincide con el del archivo oficial (MANIFIESTO). Si no coincide, no se usa.
 *
 *   Funciona igual abriendo index.html con doble clic (file://) que con el servidor local opcional.
 *
 * Ruta: ocr-local/js/cargador-verificado.js
 * Dependencias: ninguna. Debe cargarse antes que cualquier otro script de la aplicación.
 * Expone: window.OCRLocalPaquetes (registro) y window.CargadorVerificado (API de carga).
 */
(function () {
  'use strict';

  if (window.CargadorVerificado) {
    return;
  }

  /** Tiempo máximo para que un paquete .js termine de cargarse. */
  const MS_MAX_CARGA_PAQUETE = 30000;

  /**
   * Manifiesto de archivos oficiales. «sha256» y «bytes» son los del archivo ORIGINAL publicado
   * en el registro npm (no los del envoltorio). Comprobados contra los tarballs oficiales cuya
   * integridad sha512 coincide con la publicada por registry.npmjs.org.
   */
  const MANIFIESTO = Object.freeze({
    'bootstrap-css': Object.freeze({
      archivo: 'vendor-paquetes/bootstrap-5.3.8.min.css.paquete.js',
      sha256: 'd85327d99c7a3ee1f9b5d0500d1370acea3ad2db39c163c2f51f232baedbdede',
      bytes: 232111,
      origen: 'npm bootstrap@5.3.8 · package/dist/css/bootstrap.min.css',
      licencia: 'MIT'
    }),
    'tesseract-main': Object.freeze({
      archivo: 'vendor-paquetes/tesseract-7.0.0.min.js.paquete.js',
      sha256: '000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e',
      bytes: 62961,
      origen: 'npm tesseract.js@7.0.0 · package/dist/tesseract.min.js',
      licencia: 'Apache-2.0'
    }),
    'tesseract-worker': Object.freeze({
      archivo: 'vendor-paquetes/tesseract-worker-7.0.0.min.js.paquete.js',
      sha256: '576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d',
      bytes: 111307,
      origen: 'npm tesseract.js@7.0.0 · package/dist/worker.min.js',
      licencia: 'Apache-2.0'
    }),
    'tesseract-core-simd-lstm': Object.freeze({
      archivo: 'vendor-paquetes/tesseract-core-7.0.0-simd-lstm.wasm.js.paquete.js',
      sha256: 'c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38',
      bytes: 3899472,
      origen: 'npm tesseract.js-core@7.0.0 · package/tesseract-core-simd-lstm.wasm.js',
      licencia: 'Apache-2.0'
    }),
    'tesseract-core-lstm': Object.freeze({
      archivo: 'vendor-paquetes/tesseract-core-7.0.0-lstm.wasm.js.paquete.js',
      sha256: 'eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680',
      bytes: 3896484,
      origen: 'npm tesseract.js-core@7.0.0 · package/tesseract-core-lstm.wasm.js',
      licencia: 'Apache-2.0'
    }),
    'tessdata-spa': Object.freeze({
      archivo: 'vendor-paquetes/tessdata-spa-4.0.0_best_int.traineddata.gz.paquete.js',
      sha256: '40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb',
      bytes: 2100190,
      origen: 'npm @tesseract.js-data/spa@1.0.0 · package/4.0.0_best_int/spa.traineddata.gz',
      licencia: 'Apache-2.0 (modelo tessdata_best de tesseract-ocr; el paquete npm declara MIT)'
    })
  });

  /** Solo se aceptan cadenas base64 estándar (sin espacios ni saltos de línea). */
  const RE_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

  /**
   * Error de carga o de integridad con un código estable para la interfaz.
   */
  class ErrorCarga extends Error {
    /**
     * @param {string} codigo PAQUETE_DESCONOCIDO | PAQUETE_AUSENTE | PAQUETE_INVALIDO | INTEGRIDAD | NO_SOPORTADO
     * @param {string} mensaje Mensaje en español para el usuario.
     */
    constructor(codigo, mensaje) {
      super(mensaje);
      this.name = 'ErrorCarga';
      this.codigo = codigo;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Registro de paquetes (lo invocan los archivos de vendor-paquetes/)
  // ---------------------------------------------------------------------------------------------

  /** @type {Map<string, string>} nombre → base64 pendiente de verificar */
  const pendientes = new Map();

  const registro = Object.freeze({
    /**
     * Registra el contenido base64 de un paquete. Solo admite nombres del MANIFIESTO y no permite
     * sustituir un paquete pendiente de verificar (evita que un segundo script lo reemplace).
     * @param {string} nombre Clave del MANIFIESTO.
     * @param {string} base64 Archivo oficial codificado en base64.
     */
    registrar(nombre, base64) {
      if (typeof nombre !== 'string' || !Object.prototype.hasOwnProperty.call(MANIFIESTO, nombre)) {
        throw new ErrorCarga('PAQUETE_DESCONOCIDO', 'Paquete desconocido: no figura en el manifiesto.');
      }
      if (pendientes.has(nombre)) {
        throw new ErrorCarga('PAQUETE_INVALIDO', 'El paquete «' + nombre + '» ya estaba registrado y pendiente de verificar.');
      }
      if (typeof base64 !== 'string' || base64.length === 0 || base64.length % 4 !== 0 || !RE_BASE64.test(base64)) {
        throw new ErrorCarga('PAQUETE_INVALIDO', 'El paquete «' + nombre + '» no contiene base64 válido.');
      }
      pendientes.set(nombre, base64);
    },
    /**
     * @param {string} nombre
     * @returns {boolean} true si hay contenido pendiente de verificar para ese paquete.
     */
    tiene(nombre) {
      return pendientes.has(nombre);
    }
  });

  Object.defineProperty(window, 'OCRLocalPaquetes', {
    value: registro, writable: false, configurable: false, enumerable: false
  });

  /**
   * Entrega y elimina del registro el base64 pendiente (se consume una sola vez).
   * @param {string} nombre
   * @returns {string|undefined}
   */
  function tomarPendiente(nombre) {
    const valor = pendientes.get(nombre);
    pendientes.delete(nombre);
    return valor;
  }

  // ---------------------------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------------------------

  let rutaBase = './';
  /** @type {Map<string, {sha256: string, bytes: number, verificadoEn: string}>} */
  const verificados = new Map();

  /**
   * Decodifica base64 a bytes. Usa Uint8Array.fromBase64 si el navegador lo trae.
   * @param {string} base64
   * @returns {Uint8Array}
   */
  function base64ABytes(base64) {
    if (typeof Uint8Array.fromBase64 === 'function') {
      return Uint8Array.fromBase64(base64);
    }
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) {
      bytes[i] = binario.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * SHA-256 en hexadecimal (minúsculas) con la Web Crypto API nativa.
   * @param {BufferSource} datos
   * @returns {Promise<string>}
   */
  async function sha256Hex(datos) {
    const resumen = new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
    let hex = '';
    for (let i = 0; i < resumen.length; i += 1) {
      hex += resumen[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /**
   * Inserta un <script src> clásico y espera a que termine. Con file:// es la única forma de leer
   * un archivo local. El elemento se retira del DOM al terminar.
   * @param {string} ruta Ruta relativa a la página o URL blob:.
   * @param {string} [descripcion] Nombre que se muestra si falla (por defecto, la ruta).
   * @returns {Promise<void>}
   */
  function cargarScript(ruta, descripcion) {
    const nombre = descripcion || ruta;
    return new Promise((resolver, rechazar) => {
      const script = document.createElement('script');
      let temporizador = 0;
      const terminar = (error) => {
        clearTimeout(temporizador);
        script.onload = null;
        script.onerror = null;
        script.remove();
        if (error) {
          rechazar(error);
        } else {
          resolver();
        }
      };
      script.onload = () => terminar(null);
      script.onerror = () => terminar(new ErrorCarga('PAQUETE_AUSENTE', descripcion
        ? 'No se pudo ejecutar «' + nombre + '» (¿falta «blob:» en script-src de la CSP?).'
        : 'No se pudo cargar «' + nombre + '». Compruebe que la carpeta vendor-paquetes está completa.'));
      temporizador = setTimeout(() => terminar(new ErrorCarga('PAQUETE_AUSENTE',
        'La carga de «' + nombre + '» superó ' + (MS_MAX_CARGA_PAQUETE / 1000) + ' s.')), MS_MAX_CARGA_PAQUETE);
      script.src = ruta;
      document.head.appendChild(script);
    });
  }

  /**
   * Carga (si hace falta), decodifica y verifica un paquete.
   * @param {string} nombre Clave del MANIFIESTO.
   * @returns {Promise<{bytes: Uint8Array, base64: string, entrada: object}>}
   * @throws {ErrorCarga} Si falta, es inválido o su SHA-256 no coincide con el oficial.
   */
  async function obtenerVerificado(nombre) {
    if (!Object.prototype.hasOwnProperty.call(MANIFIESTO, nombre)) {
      throw new ErrorCarga('PAQUETE_DESCONOCIDO', 'Paquete desconocido: ' + String(nombre).slice(0, 60));
    }
    if (!window.crypto || !crypto.subtle) {
      throw new ErrorCarga('NO_SOPORTADO', 'Este navegador no ofrece crypto.subtle: no se puede verificar la integridad.');
    }
    const entrada = MANIFIESTO[nombre];
    if (!registro.tiene(nombre)) {
      await cargarScript(rutaBase + entrada.archivo);
    }
    const base64 = tomarPendiente(nombre);
    if (typeof base64 !== 'string') {
      throw new ErrorCarga('PAQUETE_INVALIDO', 'El archivo «' + entrada.archivo + '» se cargó pero no registró su contenido.');
    }
    const bytes = base64ABytes(base64);
    if (bytes.length !== entrada.bytes) {
      throw new ErrorCarga('INTEGRIDAD', 'Tamaño inesperado en «' + nombre + '»: ' + bytes.length + ' bytes (se esperaban ' + entrada.bytes + ').');
    }
    const hex = await sha256Hex(bytes);
    if (hex !== entrada.sha256) {
      throw new ErrorCarga('INTEGRIDAD', 'El SHA-256 de «' + nombre + '» no coincide con el del archivo oficial. No se usará.');
    }
    verificados.set(nombre, { sha256: hex, bytes: bytes.length, verificadoEn: new Date().toISOString() });
    return { bytes, base64, entrada };
  }

  /**
   * Aplica una hoja de estilos verificada mediante una hoja construible (adoptedStyleSheets).
   * Se envuelve en la capa «vendor» para que los estilos propios sin capa siempre la sobrescriban,
   * aunque las hojas adoptadas vayan después en la cascada.
   * @param {string} nombre Clave del MANIFIESTO (p. ej. 'bootstrap-css').
   * @returns {Promise<void>}
   */
  async function aplicarHojaVerificada(nombre) {
    const { bytes } = await obtenerVerificado(nombre);
    const css = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const hoja = new CSSStyleSheet();
    hoja.replaceSync('@layer vendor {\n' + css + '\n}');
    document.adoptedStyleSheets = [hoja, ...document.adoptedStyleSheets];
  }

  /**
   * Ejecuta en la página un script verificado creando una URL blob: con sus bytes exactos.
   * Requiere «script-src blob:» en la CSP.
   * @param {string} nombre Clave del MANIFIESTO.
   * @returns {Promise<void>}
   */
  async function ejecutarScriptVerificado(nombre) {
    const { bytes } = await obtenerVerificado(nombre);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    try {
      await cargarScript(url, nombre + ' (verificado)');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const api = Object.freeze({
    MANIFIESTO,
    ErrorCarga,
    /**
     * Cambia la ruta base desde la que se buscan los paquetes (por defecto, './').
     * @param {{rutaBase?: string}} opciones
     */
    configurar(opciones) {
      if (opciones && typeof opciones.rutaBase === 'string') {
        rutaBase = opciones.rutaBase.endsWith('/') ? opciones.rutaBase : opciones.rutaBase + '/';
      }
    },
    obtenerVerificado,
    aplicarHojaVerificada,
    ejecutarScriptVerificado,
    sha256Hex,
    /**
     * Copia del estado de verificación de los paquetes usados hasta ahora.
     * @returns {Array<{nombre: string, sha256: string, bytes: number, verificadoEn: string}>}
     */
    informeVerificacion() {
      return Array.from(verificados, ([nombre, datos]) => ({ nombre, ...datos }));
    }
  });

  Object.defineProperty(window, 'CargadorVerificado', {
    value: api, writable: false, configurable: false, enumerable: false
  });
})();
