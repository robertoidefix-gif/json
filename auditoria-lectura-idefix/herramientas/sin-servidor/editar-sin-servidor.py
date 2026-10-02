"""Aplica a analizador-archivos.js (fase A) los cambios de la versión SIN SERVIDOR.

Uso: python3 editar-sin-servidor.py <analizador-archivos.js> <tabla-paquetes.js>
"""
import sys

RUTA, TABLA = sys.argv[1:3]
s = open(RUTA, encoding="utf-8").read()
tabla = open(TABLA, encoding="utf-8").read()


def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:100])
    s = s.replace(a, b)


# ---------------------------------------------------------------- cabecera
rep("""   Fase A (auditoría de lectura de 2026-10-02), sin cambios en el JSON:
   - Núcleos de Tesseract: con OEM LSTM_ONLY, Tesseract.js 7 elige uno de
     tres núcleos según el navegador (relaxed SIMD → SIMD → sin SIMD). Los
     tres *-lstm.wasm.js son obligatorios (Chrome y Edge actuales piden el de
     relaxed SIMD) y solo se verifican y cargan esos tres. Si falta alguno en
     el manifiesto, se dice cuál antes de crear el worker.
""", """   Versión SIN SERVIDOR (2026-10-02): se abre con doble clic (file://) en
   Chrome y Edge, sin servidor, sin Node.js y sin nada que configurar ni
   sellar.
   - Las librerías oficiales (PDF.js, Tesseract.js, su núcleo y los modelos
     de idioma) van en vendor-paquetes/*.paquete.js: <script> clásicos con el
     archivo oficial en base64. Antes de usar cada archivo se comprueban su
     tamaño y su SHA-256, fijados en AA_PAQUETES. No hay manifiesto, ni
     fetch, ni servidor (con file:// Chrome y Edge bloquean fetch, los
     workers creados desde archivos y los atributos integrity).
   - El worker de PDF.js 6 es un módulo ES y con file:// solo se admiten
     workers clásicos: se ejecuta como worker clásico tras dos cambios exactos
     y comprobados sobre el archivo oficial verificado (aaWorkerPDFClasico).
   - Tesseract.js: el núcleo WebAssembly, el worker y los modelos de idioma
     van en un único blob: (con file://, un worker blob: no puede importar
     otra URL blob:). La aplicación elige el núcleo (relaxed SIMD → SIMD →
     sin SIMD) entre los disponibles y los idiomas se sirven desde memoria.
   - El modo con servidor y manifiesto (origenLibrerias: "vendor") se
     conserva para quien lo prefiera.

   Fase A (auditoría de lectura de 2026-10-02), sin cambios en el JSON:
   - Núcleos de Tesseract: la aplicación elige el núcleo y lo mete en el
     worker (ver arriba), así que basta con uno compatible; antes Tesseract.js
     pedía el de relaxed SIMD y, si faltaba, la aplicación no arrancaba.
""")

# ---------------------------------------------------------------- configuración
rep("""  modoSeguridad: "estricto", // "estricto" | "compatible"
""", """  modoSeguridad: "estricto", // "estricto" | "compatible"
  // Versión sin servidor: "paquetes" (por defecto) lee las librerías de vendor-paquetes/*.paquete.js con
  // <script> y comprueba su SHA-256 con AA_PAQUETES (funciona con doble clic, file://). "vendor" usa la
  // instalación anterior: vendor/ + manifiesto sellado, servida por http://localhost.
  origenLibrerias: "paquetes",
""")
rep("""  if (!["tesseract", "none"].includes(cfg.ocrMotor)) {
    throw new RangeError("ocrMotor debe ser tesseract o none.");
  }
""", """  if (!["tesseract", "none"].includes(cfg.ocrMotor)) {
    throw new RangeError("ocrMotor debe ser tesseract o none.");
  }
  if (!["paquetes", "vendor"].includes(cfg.origenLibrerias)) {
    throw new RangeError("origenLibrerias debe ser paquetes o vendor.");
  }
""")

# ---------------------------------------------------------------- paquetes
rep("""/**
 * Manifiesto de integridad: { version: 1, algoritmo: "SHA-256",""", """/* --------------------------------------------------------------------------
   2b) LIBRERÍAS EN PAQUETES <script> (versión sin servidor)
   Con file:// Chrome y Edge bloquean fetch(), los workers creados desde un
   archivo y los atributos integrity, pero ejecutan <script src> clásicos.
   Cada archivo oficial va en vendor-paquetes/*.paquete.js en base64 y se
   apunta en la cola self.IdefixPaquetes. Antes de usarlo se comprueban su
   tamaño y su SHA-256 contra AA_PAQUETES (fijados aquí): no hay manifiesto
   que generar ni nada que sellar. Las páginas pueden cargar los paquetes con
   etiquetas <script>; si falta alguno, se inserta su etiqueta al necesitarlo.
   -------------------------------------------------------------------------- */

/** Ruta oficial → [SHA-256, tamaño en bytes, paquete de vendor-paquetes/ que la contiene]. */
""" + tabla + """
const AA_CARPETA_PAQUETES = "./vendor-paquetes/";
const AA_MS_MAX_CARGA_PAQUETE = 60000;
const __aaCargasPaquete = new Map();

function aaBase64ABytes(base64) {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(base64);
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function aaBytesABase64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Saca de la cola self.IdefixPaquetes el contenido de una ruta (si hay varios, se usará el que coincida). */
function aaTomarDeColaPaquetes(ruta) {
  const cola = globalThis.IdefixPaquetes;
  if (!Array.isArray(cola)) return [];
  const encontrados = [];
  for (let i = cola.length - 1; i >= 0; i--) {
    const entrada = cola[i];
    if (Array.isArray(entrada) && entrada[0] === ruta && typeof entrada[1] === "string") {
      encontrados.unshift(entrada[1]);
      cola.splice(i, 1);
    }
  }
  return encontrados;
}

/** Inserta <script src="vendor-paquetes/…"> (con file:// es la única forma de leer un archivo local). */
function aaCargarScriptPaquete(archivo) {
  if (__aaCargasPaquete.has(archivo)) return __aaCargasPaquete.get(archivo);
  const promesa = new Promise((resolver, rechazar) => {
    const script = document.createElement("script");
    let temporizador = 0;
    const terminar = error => {
      clearTimeout(temporizador);
      script.onload = null;
      script.onerror = null;
      script.remove();
      __aaCargasPaquete.delete(archivo);
      if (error) rechazar(error); else resolver();
    };
    script.onload = () => terminar(null);
    script.onerror = () => terminar(new Error(`no se encontró vendor-paquetes/${archivo}: copia la carpeta vendor-paquetes completa junto a la página`));
    temporizador = setTimeout(() => terminar(new Error(`vendor-paquetes/${archivo} no terminó de cargarse en ${AA_MS_MAX_CARGA_PAQUETE / 1000} s`)),
      AA_MS_MAX_CARGA_PAQUETE);
    script.src = aaResolverURLLocal(`${AA_CARPETA_PAQUETES}${archivo}`);
    document.head.appendChild(script);
  });
  __aaCargasPaquete.set(archivo, promesa);
  return promesa;
}

/** Bytes de un archivo oficial empaquetado, comprobados (tamaño y SHA-256) contra AA_PAQUETES. */
async function aaObtenerPaquete(ruta) {
  const entrada = Object.prototype.hasOwnProperty.call(AA_PAQUETES, ruta) ? AA_PAQUETES[ruta] : null;
  if (!entrada) throw new Error(`${ruta} no figura entre las librerías empaquetadas.`);
  const [esperado, tamano, archivo] = entrada;
  let candidatos = aaTomarDeColaPaquetes(ruta);
  for (let intento = 0; !candidatos.length && intento < 2; intento++) {
    await aaCargarScriptPaquete(archivo);
    candidatos = aaTomarDeColaPaquetes(ruta);
  }
  if (!candidatos.length) throw new Error(`vendor-paquetes/${archivo} no contiene ${ruta}: vuelve a copiar la carpeta vendor-paquetes`);
  for (const base64 of candidatos) {
    let bytes;
    try { bytes = aaBase64ABytes(base64); } catch { continue; }
    if (bytes.length === tamano && await aaSha256Hex(bytes) === esperado) return bytes;
  }
  throw new Error(`Integridad fallida en ${ruta}: el contenido de vendor-paquetes/${archivo} no coincide con el SHA-256 del archivo oficial.`);
}

/**
 * Manifiesto de integridad: { version: 1, algoritmo: "SHA-256",""")

rep("""class IntegridadLocal {
  constructor({ exigir }) {
    this.exigir = !!exigir;
    this.hashes = null;          // Map<URL absoluta, hex>
""", """class IntegridadLocal {
  constructor({ exigir, paquetes = false }) {
    this.exigir = !!exigir;
    // Versión sin servidor: los SHA-256 están fijados en AA_PAQUETES y los bytes llegan por <script>.
    this.paquetes = !!paquetes;
    this.rutaDeURL = null;       // paquetes: Map<URL absoluta, ruta de AA_PAQUETES>
    this.hashes = null;          // Map<URL absoluta, hex>
""")
rep("""  async cargar() {
    const url = aaResolverURLLocal(RECURSOS_ANALIZADOR_ARCHIVOS_LOCAL.manifiestoIntegridad);
""", """  /** Sin servidor: no hay manifiesto que descargar; los SHA-256 de los archivos oficiales están en AA_PAQUETES. */
  cargarDePaquetes() {
    const hashes = new Map();
    const rutas = new Map();
    for (const [ruta, [hex]] of Object.entries(AA_PAQUETES)) {
      const absoluta = aaResolverURLLocal(`./${ruta}`);
      hashes.set(absoluta, hex);
      rutas.set(absoluta, ruta);
    }
    this.hashes = hashes;
    this.rutaDeURL = rutas;
  }

  /** Versión sin servidor: AA_PAQUETES; instalación con servidor: el manifiesto anclado. */
  async cargar() {
    return this.paquetes ? this.cargarDePaquetes() : this.cargarManifiesto();
  }

  async cargarManifiesto() {
    const url = aaResolverURLLocal(RECURSOS_ANALIZADOR_ARCHIVOS_LOCAL.manifiestoIntegridad);
""")
rep("""    if (!esperado && this.activo) throw new Error(`${url} no figura en el manifiesto de integridad.`);
    const clave = esperado ? `${url}|${esperado}` : null;
    if (cachear && clave && __aaCacheBinarios.has(clave)) return __aaCacheBinarios.get(clave).slice();
    const bytes = await aaDescargarLocal(url);
""", """    if (!esperado && this.activo) {
      throw new Error(this.paquetes ? `${url} no figura entre las librerías empaquetadas.` : `${url} no figura en el manifiesto de integridad.`);
    }
    const clave = esperado ? `${url}|${esperado}` : null;
    if (cachear && clave && __aaCacheBinarios.has(clave)) return __aaCacheBinarios.get(clave).slice();
    let bytes;
    if (this.paquetes) {
      const ruta = this.rutaDeURL.get(url);
      if (!ruta) throw new Error(`${url} no figura entre las librerías empaquetadas.`);
      bytes = await aaObtenerPaquete(ruta);
    } else {
      bytes = await aaDescargarLocal(url);
    }
""")

# ---------------------------------------------------------------- PDF.js: worker clásico
rep("""    const urlModulo = await integridad.urlVerificada(moduleUrl, { hashFijo: fijo(cfg.modulePath) });
    const urlWorker = await integridad.urlVerificada(workerUrl, { hashFijo: fijo(cfg.workerPath) });
""", """    const urlModulo = await integridad.urlVerificada(moduleUrl, { hashFijo: fijo(cfg.modulePath) });
    // Versión sin servidor: con file:// Chrome y Edge no ejecutan workers de tipo módulo creados desde blob:
    // (comprobado en Chromium 141), pero sí los clásicos. El worker oficial, ya verificado, se adapta a
    // worker clásico con dos cambios exactos y comprobados (aaWorkerPDFClasico).
    const hashWorkerOficial = fijo(cfg.workerPath);
    const bytesWorker = await integridad.obtenerVerificado(workerUrl, { hashFijo: hashWorkerOficial });
    const urlWorker = URL.createObjectURL(new Blob([aaWorkerPDFClasico(bytesWorker)], { type: "text/javascript" }));
    __aaHashDeURLBlob.set(urlWorker, hashWorkerOficial);
""")
rep("""/** PDF.js deja globalThis.pdfjsWorker cuando procesa en el hilo principal. */
function aaComprobarSinWorkerFalsoPDF() {""", """/**
 * El worker de PDF.js 6 (pdf.worker.mjs) es un módulo ES y con file:// solo pueden crearse workers clásicos.
 * Se adapta el archivo oficial, YA VERIFICADO por SHA-256, con dos cambios exactos:
 *   - import.meta.url (2 apariciones; solo sirve para calcular una carpeta que no se usa, porque los WASM,
 *     CMaps y fuentes los entrega la página) → self.location.href;
 *   - se quita la línea final «export { WorkerMessageHandler };» (el worker se inicia solo).
 * Si el archivo no tiene exactamente esa forma, no se usa.
 */
function aaWorkerPDFClasico(bytes) {
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const EXPORTACION = "\\nexport { WorkerMessageHandler };\\n";
  const partes = texto.split("import.meta.url");
  const posicion = texto.indexOf(EXPORTACION);
  if (partes.length !== 3 || posicion < 0 || posicion !== texto.lastIndexOf(EXPORTACION)) {
    throw new Error("el worker de PDF.js no tiene la forma esperada para ejecutarse como worker clásico.");
  }
  const clasico = partes.join("self.location.href").replace(EXPORTACION, "\\n");
  if (/(?:^|\\n)\\s*(?:import|export)\\s[^(]/.test(clasico)) {
    throw new Error("el worker de PDF.js contiene otras declaraciones de módulo; no se puede ejecutar como worker clásico.");
  }
  return clasico;
}

/** PDF.js deja globalThis.pdfjsWorker cuando procesa en el hilo principal. */
function aaComprobarSinWorkerFalsoPDF() {""")
rep("""    const puerto = new Worker(this.urlWorker, { type: "module", name: "pdfjs" });""",
    """    // Worker clásico (versión sin servidor: con file:// no se admiten workers de tipo módulo).
    const puerto = new Worker(this.urlWorker, { name: "pdfjs" });""")

# ---------------------------------------------------------------- Tesseract: un único blob
ini = s.index("""/**
 * Código que se antepone al worker de Tesseract (Fase 13).""")
fin = s.index("""/* ==========================================================================
   4) EJECUTOR DEL WORKER NÚCLEO""")
s = s[:ini] + """/** Ruta ficticia (sin red) desde la que el worker de Tesseract pide los modelos de idioma que lleva dentro. */
const AA_RUTA_MEMORIA_IDIOMAS = "idefix-memoria://tessdata";

/** Módulos WebAssembly mínimos para saber si el navegador admite SIMD y relaxed SIMD (los mismos que usa Tesseract.js). */
const AA_WASM_SIMD = Object.freeze([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const AA_WASM_RELAXED_SIMD = Object.freeze([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2,
  253, 15, 253, 128, 2, 11]);
function aaWasmAdmite(modulo) {
  try { return typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array(modulo)); } catch { return false; }
}

/**
 * Preludio del worker de Tesseract (versión sin servidor). Dentro del worker:
 * - no hay red: fetch solo entrega los modelos de idioma que van dentro del propio worker, ya verificados en
 *   la página y comprobados aquí otra vez con su SHA-256; importScripts, XMLHttpRequest, WebSocket,
 *   EventSource y sendBeacon quedan anulados;
 * - el núcleo WebAssembly va a continuación en el mismo blob (define TesseractCore), así Tesseract.js no lo
 *   pide: con file://, un worker blob: no puede importar otra URL blob: (comprobado en Chromium 141).
 * @param {Object<string, [string, string]>} idiomas URL en memoria → [SHA-256, base64]
 */
function aaPreludioWorkerTesseract(idiomas) {
  return `"use strict";
(() => {
  const IDIOMAS = ${JSON.stringify(idiomas)};
  const normalizar = u => String(u).split("#")[0].split("?")[0];
  const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
  self.fetch = async (recurso) => {
    const url = normalizar(typeof recurso === "string" ? recurso : recurso && recurso.url);
    const entrada = Object.prototype.hasOwnProperty.call(IDIOMAS, url) ? IDIOMAS[url] : null;
    if (!entrada) throw new TypeError("AnalizadorArchivos: petición no permitida desde el OCR: " + url.slice(0, 200));
    delete IDIOMAS[url];
    const binario = atob(entrada[1]);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== entrada[0]) {
      throw new TypeError("Integridad fallida en " + url + ": el modelo de idioma no coincide con su SHA-256.");
    }
    return new Response(bytes, { status: 200, headers: { "Content-Type": "application/octet-stream" } });
  };
  self.importScripts = () => { throw new TypeError("AnalizadorArchivos: importScripts está desactivado dentro del worker OCR."); };
  for (const k of ["XMLHttpRequest", "WebSocket", "EventSource"]) {
    try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (e) { /* ya anulado */ }
  }
  try { if (self.navigator) Object.defineProperty(self.navigator, "sendBeacon", { value: undefined }); } catch (e) { /* sin sendBeacon */ }
})();
`;
}

/**
 * Núcleo de Tesseract: lo elige la aplicación con el mismo criterio que Tesseract.js (relaxed SIMD → SIMD →
 * sin SIMD), entre los disponibles, y va dentro del worker: basta con que haya uno compatible con el navegador.
 * Se usa el primero que se pueda leer (p. ej., si falta el paquete del de SIMD, el de sin SIMD). Uno alterado
 * no se salta en silencio: se informa y el OCR no arranca.
 * @returns {Promise<{ nucleo: string, bytes: Uint8Array }>}
 */
async function aaLeerNucleoTesseract(baseNucleo, integridad, obtener, dondeFalta) {
  const compatibles = AA_ARCHIVOS_TESSERACT.nucleos.map(r => r.slice(r.lastIndexOf("/") + 1))
    .filter(n => (n.includes("relaxedsimd") ? aaWasmAdmite(AA_WASM_RELAXED_SIMD) : n.includes("simd") ? aaWasmAdmite(AA_WASM_SIMD) : true));
  const disponibles = [];
  for (const n of compatibles) {
    if (await aaExisteRecurso(`${baseNucleo}${n}`, integridad)) disponibles.push(n);
  }
  if (!disponibles.length) {
    throw new Error(`no hay ningún núcleo de Tesseract compatible con este navegador ${dondeFalta} (se buscó: ${compatibles.join(", ")})`);
  }
  const fallos = [];
  for (const n of disponibles) {
    try {
      return { nucleo: n, bytes: await obtener(`${baseNucleo}${n}`) };
    } catch (error) {
      if (/Integridad fallida/.test(String(error?.message))) throw error;
      fallos.push(`${n}: ${error?.message || error}`);
    }
  }
  throw new Error(`no se pudo leer ningún núcleo de Tesseract (${fallos.join(" | ")})`);
}

/**
 * Crea el worker de Tesseract con los idiomas indicados, sin red y sin importar nada: un único blob: con el
 * preludio, el núcleo WebAssembly elegido, el worker oficial y los modelos de idioma (todos verificados por
 * SHA-256: con AA_PAQUETES en la versión sin servidor o con el manifiesto en la instalación con servidor).
 * @param {string[]} idiomas códigos de AA_IDIOMAS_TESSERACT
 */
async function crearWorkerTesseractLocal(idiomas, integridad = null) {
  aaValidarIdiomasTesseract(idiomas);
  const T = await cargarTesseractLocal(integridad);
  const cfg = RECURSOS_ANALIZADOR_ARCHIVOS_LOCAL.tesseract;
  const urlWorker = aaResolverURLLocal(cfg.workerPath);
  const baseNucleo = aaResolverURLLocal(cfg.corePath, { directorio: true });
  const baseIdiomas = aaResolverURLLocal(cfg.langPath, { directorio: true });
  const obtener = url => (integridad?.activo ? integridad.obtenerVerificado(url, { cachear: true }) : aaDescargarLocal(url));
  const dondeFalta = integridad?.paquetes ? "entre las librerías empaquetadas (vendor-paquetes)" : "en el manifiesto";

  const memoria = {};
  for (const idioma of idiomas) {
    const u = `${baseIdiomas}${idioma}.traineddata.gz`;
    if (integridad?.activo && !integridad.esperado(u)) {
      throw new Error(`el idioma ${idioma} (${AA_IDIOMAS_TESSERACT[idioma]}) no figura ${dondeFalta}: copia ${idioma}.traineddata.gz` +
        (integridad.paquetes ? " (su paquete de vendor-paquetes)" : " en vendor/tessdata/ y vuelve a sellar"));
    }
    // Fase A: los idiomas se comprueban en la página antes de crear el worker; un modelo que no coincide no
    // llega a Tesseract (que, si falla al cargarlo, no rechaza la creación del worker y se queda esperando).
    const bytes = await obtener(u);
    memoria[`${AA_RUTA_MEMORIA_IDIOMAS}/${idioma}.traineddata.gz`] = [await aaSha256Hex(bytes), aaBytesABase64(bytes)];
  }
  const { nucleo, bytes: bytesNucleo } = await aaLeerNucleoTesseract(baseNucleo, integridad, obtener, dondeFalta);
  const bytesWorker = await obtener(urlWorker);
  const workerPath = URL.createObjectURL(new Blob(
    [aaPreludioWorkerTesseract(memoria), "\\n", bytesNucleo, "\\n;\\n", bytesWorker, "\\n"], { type: "text/javascript" }));

  // Tesseract.createWorker crea el Worker de forma síncrona antes de su primer await: se captura para poder
  // terminarlo si no llega a iniciarse (si falla al cargar, createWorker no termina nunca).
  let nativo = null;
  let creacion;
  const WorkerOriginal = globalThis.Worker;
  try {
    globalThis.Worker = function WorkerCapturado(ruta, opciones) {
      nativo = new WorkerOriginal(ruta, opciones);
      return nativo;
    };
    creacion = T.createWorker(
      [...idiomas],
      T.OEM?.LSTM_ONLY ?? 1,
      {
        workerPath,
        // El núcleo ya va dentro del worker (TesseractCore definido): Tesseract.js no usa esta ruta.
        corePath: `${baseNucleo}${nucleo}`,
        langPath: AA_RUTA_MEMORIA_IDIOMAS,
        workerBlobURL: false,
        // Sin caché en IndexedDB: nada persiste entre sesiones.
        cacheMethod: "none",
        gzip: true
      }
    );
  } finally {
    globalThis.Worker = WorkerOriginal;
  }
  let temporizador = null;
  let vencido = false;
  let alFallar = null;
  try {
    // Fase A: si el worker llega a crearse después del tiempo máximo, se termina (nadie lo usará).
    creacion.then(w => { if (vencido) w?.terminate?.(); }, () => {});
    const limite = new Promise((_, rechazar) => {
      alFallar = evento => {
        evento.preventDefault?.();
        rechazar(new Error(`el worker OCR falló al iniciarse: ${evento.message || "error al cargarlo"}`));
      };
      nativo?.addEventListener("error", alFallar);
      temporizador = setTimeout(() => {
        vencido = true;
        rechazar(new Error(`el motor OCR no terminó de iniciarse en ${AA_MAX_MS_ARRANQUE_OCR / 1000} s`));
      }, AA_MAX_MS_ARRANQUE_OCR);
    });
    return await Promise.race([creacion, limite]);
  } catch (error) {
    vencido = true;
    try { nativo?.terminate(); } catch { /* ya terminado */ }
    throw error;
  } finally {
    clearTimeout(temporizador);
    if (alFallar) nativo?.removeEventListener("error", alFallar);
    // El worker ya ha cargado su código (o ha fallado): la URL blob: no se reutiliza.
    URL.revokeObjectURL(workerPath);
  }
}

""" + s[fin:]

rep("""/**
 * Archivos de Tesseract.js que deben copiarse en vendor/ (y sellarse en el manifiesto) para activar el OCR.
 * Los núcleos *.wasm.js llevan el WASM incrustado: no hace falta ningún .wasm suelto.
 * Fase A: con OEM LSTM_ONLY, Tesseract.js 7 elige uno de estos TRES núcleos según lo que admita el navegador
 * (relaxed SIMD → SIMD → sin SIMD; Chrome y Edge actuales piden el primero). Los tres son obligatorios.
 */""", """/**
 * Archivos de Tesseract.js (en vendor-paquetes en la versión sin servidor; en vendor/ con servidor).
 * Los núcleos *.wasm.js llevan el WASM incrustado: no hace falta ningún .wasm suelto. Con OEM LSTM_ONLY solo
 * sirven los *-lstm; la aplicación elige, por este orden, el primero que el navegador admita y esté disponible.
 */""")

# ---------------------------------------------------------------- factoría y entorno
rep("""  const integridad = new IntegridadLocal({ exigir: cfg.modoSeguridad === "estricto" });
  await integridad.cargar();""", """  const integridad = new IntegridadLocal({ exigir: cfg.modoSeguridad === "estricto", paquetes: cfg.origenLibrerias === "paquetes" });
  await integridad.cargar();""")
rep("""  if (url.protocol === "file:") {
    errors.push(
      "La página se abrió como archivo (file://). Los Web Workers, obligatorios en esta versión, no funcionan así: " +
      "sírvela desde http://localhost o HTTPS."
    );
  }
""", """  // Versión sin servidor: con origenLibrerias "paquetes" la aplicación funciona abierta como archivo (file://).
  if (url.protocol === "file:" && config.origenLibrerias === "vendor") {
    errors.push(
      "La página se abrió como archivo (file://) con origenLibrerias \\"vendor\\", que necesita servidor: " +
      "sírvela desde http://localhost o usa la versión sin servidor (vendor-paquetes)."
    );
  }
""")
rep("""  if (propio && !/^sha(256|384|512)-/.test(propio.getAttribute("integrity") || "")) {""",
    """  // Con file:// el atributo integrity impide cargar el script: solo se recomienda en la instalación con servidor.
  if (config.origenLibrerias === "vendor" && propio && !/^sha(256|384|512)-/.test(propio.getAttribute("integrity") || "")) {""")

# ---------------------------------------------------------------- API de OCR sin interfaz
rep(""" * Solo funciona servido por http(s) (Chrome y Edge no permiten fetch ni workers en file://).
 * @param {{ idiomas?: string[] }} [opciones] idiomas de AA_IDIOMAS_TESSERACT (por defecto ["spa"])
 * @returns {Promise<{ idiomas: string[], reconocer: Function, terminar: Function }>}
 */
async function aaCrearOCRLocal({ idiomas = ["spa"] } = {}) {
  if (globalThis.location?.protocol === "file:") {
    throw new Error("La página se abrió como archivo (file://): Chrome y Edge no permiten así cargar Tesseract, su núcleo WASM ni los modelos de idioma. " +
      "Sírvela con el servidor local (servidor-local.ps1 o servidor-local.py) y ábrela en http://localhost.");
  }
  aaValidarIdiomasTesseract(idiomas);
  const integridad = new IntegridadLocal({ exigir: true });""", """ * Versión sin servidor: funciona abierta con doble clic (file://), con las librerías de vendor-paquetes.
 * @param {{ idiomas?: string[], origenLibrerias?: "paquetes"|"vendor" }} [opciones] idiomas de AA_IDIOMAS_TESSERACT
 *   (por defecto ["spa"]); origenLibrerias "vendor" usa vendor/ y el manifiesto (necesita servidor).
 * @returns {Promise<{ idiomas: string[], reconocer: Function, terminar: Function }>}
 */
async function aaCrearOCRLocal({ idiomas = ["spa"], origenLibrerias = "paquetes" } = {}) {
  if (!["paquetes", "vendor"].includes(origenLibrerias)) throw new RangeError("origenLibrerias debe ser paquetes o vendor.");
  if (origenLibrerias === "vendor" && globalThis.location?.protocol === "file:") {
    throw new Error("Con origenLibrerias \\"vendor\\" la página necesita servidor (http://localhost); con doble clic usa la versión sin servidor (vendor-paquetes).");
  }
  aaValidarIdiomasTesseract(idiomas);
  const integridad = new IntegridadLocal({ exigir: true, paquetes: origenLibrerias === "paquetes" });""")

# ---------------------------------------------------------------- scripts propios con file://
rep("""      .filter(Boolean)
      .filter(scriptUrl => scriptUrl.origin !== origin);
""", """      .filter(Boolean)
      // Versión sin servidor: con file:// Chrome y Edge dan a los archivos el origen «file://» y a las URL blob:
      // creadas por la propia página el origen «null» (comprobado en Chromium 141). Son locales, no de terceros.
      .filter(scriptUrl => !(url.protocol === "file:" &&
        (scriptUrl.protocol === "file:" || (scriptUrl.protocol === "blob:" && scriptUrl.href.startsWith("blob:null/")))))
      .filter(scriptUrl => scriptUrl.origin !== origin);
""")

# ---------------------------------------------------------------- mensajes y ayuda para la versión sin servidor
rep("""      const motivo = `${String(error?.message || error).replace(/\\.+$/, "")}. Revisa vendor/tesseract, vendor/tesseract-core y ` +
        `vendor/tessdata (idiomas: ${cfg.idiomasTesseract.join(", ")}) según el paso 2 de las instrucciones y vuelve a sellar con ` +
        "herramientas/generar-manifiesto.html, o desactiva el OCR con data-ocr=\\"false\\" en la etiqueta <script> " +
        "(o { ocr: false } si creas el analizador por código).";
      // Un archivo que NO coincide con el manifiesto es una instalación alterada: se detiene todo, como antes.""",
"""      const motivo = `${String(error?.message || error).replace(/\\.+$/, "")}. ` + (cfg.origenLibrerias === "paquetes"
        ? `Vuelve a copiar la carpeta vendor-paquetes completa de la entrega original (idiomas: ${cfg.idiomasTesseract.join(", ")}), `
        : `Revisa vendor/tesseract, vendor/tesseract-core y vendor/tessdata (idiomas: ${cfg.idiomasTesseract.join(", ")}) según ` +
          "el paso 2 de las instrucciones y vuelve a sellar con herramientas/generar-manifiesto.html, ") +
        "o desactiva el OCR con data-ocr=\\"false\\" en la etiqueta <script> (o { ocr: false } si creas el analizador por código).";
      // Un archivo que NO coincide con su SHA-256 es una instalación alterada: se detiene todo, como antes.""")
rep("""                                 solo hace falta copiar en vendor/tessdata los que se usen""",
    """                                 (versión sin servidor: todos van en vendor-paquetes; con
                                 servidor, basta con copiar en vendor/tessdata los que se usen)""")
rep("""  // Idefix1.0: data-idiomas-ocr="spa,eng" limita los idiomas del OCR a los que se han copiado en vendor/tessdata.""",
    """  // Idefix1.0: data-idiomas-ocr="spa,eng" limita los idiomas del OCR (vendor-paquetes, o vendor/tessdata con servidor).""")
rep("""  USO (autoarranque) — ARCHIVO ÚNICO

  <div id="analizadorArchivos"></div>
  <script src="./analizador-archivos.js" integrity="sha256-…"></script>
""", """  USO (autoarranque) — ARCHIVO ÚNICO · VERSIÓN SIN SERVIDOR

  <div id="analizadorArchivos"></div>
  <script src="vendor-paquetes/pdfjs-6.2.108-legacy-pdf.mjs.paquete.js"></script>
  … (los demás paquetes: ver index.html)
  <script src="./analizador-archivos.js"></script>

  Se abre con doble clic (file://) en Chrome o Edge: no hace falta servidor,
  ni Node.js, ni sellar nada. Basta con copiar la carpeta completa
  (index.html, analizador-archivos.js y vendor-paquetes/). Los SHA-256 de las
  librerías están fijados en AA_PAQUETES; con file:// no se usa el atributo
  integrity (Chrome y Edge no cargarían el script).
""")
rep("""  Librerías que hay que desplegar junto a la página (locales, nunca CDN):
    vendor/manifiesto-integridad.json        (herramientas/generar-manifiesto.html)""",
"""  Instalación con servidor (origenLibrerias: "vendor"), la de antes: <script
  … integrity="sha256-…"> y estas librerías junto a la página (locales, nunca CDN):
    vendor/manifiesto-integridad.json        (herramientas/generar-manifiesto.html)""")

# ---------------------------------------------------------------- CSP de referencia y panel del OCR desactivado
rep("""   CSP DE REFERENCIA (la de index.html; conviene enviarla también como
   cabecera HTTP, porque frame-ancestors no funciona en <meta>; ver
   herramientas/cabeceras-http-recomendadas.txt). Los workers se crean desde
   URL blob: de bytes verificados y heredan esta política:
     default-src 'none';
     script-src 'self' 'wasm-unsafe-eval' blob:;
     worker-src blob:;
     connect-src 'self';""", """   CSP DE REFERENCIA (la de index.html). Versión sin servidor: connect-src
   'none', porque las librerías llegan por <script> y no hace falta ninguna
   petición. Si se sirve por HTTP, conviene enviarla también como cabecera
   (frame-ancestors no funciona en <meta>). Los workers se crean desde URL
   blob: de bytes verificados y heredan esta política:
     default-src 'none';
     script-src 'self' 'wasm-unsafe-eval' blob:;
     worker-src blob:;
     connect-src 'none';""")
rep("""        `Idiomas configurados: ${Object.values(AA_IDIOMAS_TESSERACT).join(", ")}. Para activarlo, copia Tesseract.js y sus idiomas en vendor/ ` +
        "(tesseract, tesseract-core y tessdata), sella el manifiesto y usa data-ocr=\\"true\\" en la etiqueta <script>."));""",
"""        `Idiomas configurados: ${Object.values(AA_IDIOMAS_TESSERACT).join(", ")}. ` + (this.config.origenLibrerias === "paquetes"
          ? "Para activarlo, abre index.html (lleva data-ocr=\\"true\\" y los paquetes de Tesseract de vendor-paquetes)."
          : "Para activarlo, copia Tesseract.js y sus idiomas en vendor/ (tesseract, tesseract-core y tessdata), sella el " +
            "manifiesto y usa data-ocr=\\"true\\" en la etiqueta <script>.")));""")

open(RUTA, "w", encoding="utf-8").write(s)
print("líneas:", s.count("\n"))
