window.__R = {};
const R = window.__R;
const t = async (name, fn, ms = 8000) => {
  try {
    const v = await Promise.race([fn(), new Promise((_, rj) => setTimeout(() => rj(new Error('TIMEOUT ' + ms + 'ms')), ms))]);
    R[name] = 'OK ' + (typeof v === 'string' ? v : JSON.stringify(v));
  } catch (e) { R[name] = 'FALLA ' + (e && (e.name + ': ' + e.message) || String(e)); }
};
const workerProbe = (url) => new Promise((res, rej) => {
  let w;
  try { w = new Worker(url); } catch (e) { return rej(e); }
  w.onmessage = (e) => { res(e.data); w.terminate(); };
  w.onerror = (e) => { e.preventDefault(); rej(new Error('worker onerror: ' + (e.message || 'sin mensaje'))); w.terminate(); };
});
window.__run = async () => {
  R.origin = location.origin; R.protocol = location.protocol;
  R.isSecureContext = String(window.isSecureContext);
  R.cryptoSubtle = String(!!(window.crypto && crypto.subtle));
  R.sriScriptExecuted = window.__afterSri; // 'object' si el script con integrity se ejecutó (el 2º script lo carga sin integrity)
  R.tesseractGlobal = typeof Tesseract;
  await t('fetch_vendor', async () => { const r = await fetch('vendor/worker.min.js'); return r.status + ' ' + (await r.text()).length; });
  await t('xhr_vendor', () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', 'vendor/worker.min.js'); x.onload = () => res(x.status + ' ' + x.responseText.length); x.onerror = () => rej(new Error('XHR onerror')); x.send(); }));
  await t('worker_file_url', () => workerProbe('vendor/worker.min.js'));
  const absWorker = new URL('vendor/worker.min.js', location.href).href;
  await t('worker_blob_importScripts_file', () => workerProbe(URL.createObjectURL(new Blob([`try{importScripts(${JSON.stringify(absWorker)});postMessage('importScripts OK')}catch(e){postMessage('importScripts ERROR '+e.name+': '+e.message)}`], { type: 'text/javascript' }))));
  await t('worker_blob_inline', () => workerProbe(URL.createObjectURL(new Blob(['postMessage("blob worker vivo; origin=" + self.origin)'], { type: 'text/javascript' }))));
  const innerBlob = URL.createObjectURL(new Blob(['self.__inner = 42;'], { type: 'text/javascript' }));
  await t('worker_blob_importScripts_blob', () => workerProbe(URL.createObjectURL(new Blob([`try{importScripts(${JSON.stringify(innerBlob)});postMessage('importScripts(blob) OK '+self.__inner)}catch(e){postMessage('ERROR '+e.name+': '+e.message)}`], { type: 'text/javascript' }))));
  // WebAssembly mínimo (módulo vacío) en worker blob
  await t('wasm_in_blob_worker', () => workerProbe(URL.createObjectURL(new Blob([`WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0])).then(()=>postMessage('wasm OK'),e=>postMessage('wasm ERROR '+e.message))`], { type: 'text/javascript' }))));
  await t('idb_open', () => new Promise((res, rej) => { const r = indexedDB.open('probe'); r.onsuccess = () => { r.result.close(); res('IndexedDB OK'); }; r.onerror = () => rej(r.error); }));
  // E8: configuración estándar de Tesseract con rutas locales
  await t('tesseract_estandar_rutas_locales', async () => { 
    const w = await Tesseract.createWorker('spa', 1, { workerPath: 'vendor/worker.min.js', corePath: 'vendor/tesseract-core-simd-lstm.wasm.js', langPath: 'vendor', cacheMethod: 'none', errorHandler: (e) => { throw new Error(String(e)); } });
    const r = await w.recognize(document.getElementById('img') || 'factura-es.png');
    await w.terminate();
    return r.data.text.slice(0, 60);
  }, 20000);
  // E10: todo desde cadenas cargadas con <script> (sin fetch, sin servidor)
  await t('tesseract_file_envoltorios', async () => { 
    const workerURL = URL.createObjectURL(new Blob([window.__SRC_WORKER], { type: 'text/javascript' }));
    const coreURL = URL.createObjectURL(new Blob([window.__SRC_CORE], { type: 'text/javascript' })) + '#tesseract-core.wasm.js';
    const bin = atob(window.__B64_SPA); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const w = await Tesseract.createWorker([{ code: 'spa', data }], 1, { workerPath: workerURL, corePath: coreURL, cacheMethod: 'none', errorHandler: (e) => console.error('errorHandler', e) });
    const png = await new Promise((res) => { const c = document.createElement('canvas'); const im = new Image(); im.onload = () => { c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(res, 'image/png'); }; im.onerror = () => res(null); im.src = 'factura-es.png'; });
    if (!png) throw new Error('no se pudo leer la imagen local para la prueba (img file:// tainted?)');
    const r = await w.recognize(png);
    await w.terminate();
    return r.data.text;
  }, 60000);
  window.__done = true;
};
