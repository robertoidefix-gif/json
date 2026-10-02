// Batería de casos límite sobre la demo real (file://). Solo herramienta de verificación.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'); const path = require('path');
const IMG = path.join(__dirname, 'imagenes');
const URL_DEMO = process.argv[2] || 'file://' + path.resolve(__dirname, '..', 'ocr-local', 'index.html');
const R = {};
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.addInitScript(() => { window.__rechazos = []; window.addEventListener('unhandledrejection', (e) => window.__rechazos.push(String(e.reason && e.reason.message || e.reason))); });
  await p.goto(URL_DEMO);
  await p.waitForFunction(() => /listo/i.test(document.getElementById('textoEtapa').textContent), null, { timeout: 60000 });
  const esperarFin = () => p.waitForFunction(() => !document.getElementById('botonReconocer').disabled || document.querySelector('.aviso-error'), null, { timeout: 120000 });
  const avisos = () => p.$$eval('#avisos .aviso', (a) => a.map((x) => x.className.replace('aviso aviso-', '') + ': ' + x.textContent.replace(/\s+/g, ' ').slice(0, 170)));
  // A. Formatos y archivos inválidos
  R.A = {};
  // El archivo de nombre largo se crea al vuelo (un nombre de 200 caracteres en el repositorio
  // superaría el límite de ruta de Windows al descomprimir).
  const NOMBRE_LARGO = path.join(require('os').tmpdir(), 'n'.repeat(200) + '.png');
  fs.copyFileSync(path.join(IMG, 'factura-es.png'), NOMBRE_LARGO);
  const casos = ['factura.jpg', 'factura.webp', 'blanco.bmp', 'vacio.png', 'texto-con-extension.png', 'documento.pdf.png', 'bomba-dimensiones.png', 'truncado.png', NOMBRE_LARGO];
  for (const c of casos) {
    await p.setInputFiles('#entradaImagen', path.isAbsolute(c) ? c : path.join(IMG, c));
    await p.waitForTimeout(150);
    const habilitado = await p.$eval('#botonReconocer', (x) => !x.disabled);
    if (habilitado) {
      await p.click('#botonReconocer');
      await p.waitForFunction(() => document.querySelector('#avisos .aviso'), null, { timeout: 120000 });
      await esperarFin();
    }
    const texto = await p.$eval('#textoResultado', (x) => x.value);
    R.A[c.length > 40 ? 'nombre-de-200-caracteres.png' : c] = { botonReconocerHabilitado: habilitado, avisos: await avisos(), primeraLinea: texto.split('\n')[0].slice(0, 60), pie: await p.$eval('#datosImagen', (x) => x.textContent.length) };
  }
  // B. Cancelación durante el reconocimiento de un A4 grande y reintento
  await p.setInputFiles('#entradaImagen', path.join(IMG, 'a4-grande.png'));
  await p.waitForTimeout(150);
  await p.click('#botonReconocer');
  await p.waitForFunction(() => /Reconociendo/.test(document.getElementById('textoEtapa').textContent), null, { timeout: 60000 });
  await p.waitForTimeout(400);
  const workersAntes = p.workers().length;
  await p.click('#botonCancelar');
  await esperarFin();
  R.B = { avisosTrasCancelar: await avisos(), workersAntesDeCancelar: workersAntes, workersTrasCancelar: p.workers().length, etapa: await p.textContent('#textoEtapa') };
  const t0 = Date.now();
  await p.click('#botonReconocer');
  await p.waitForFunction(() => document.getElementById('textoResultado').value.length > 0 || document.querySelector('.aviso-error'), null, { timeout: 180000 });
  await esperarFin();
  R.B.reintento = { ms: Date.now() - t0, resumen: await p.textContent('#resumenResultado'), avisos: await avisos(), workers: p.workers().length, linea70: (await p.$eval('#textoResultado', (x) => x.value)).split('\n').filter((l) => /Línea 70/.test(l))[0] };
  // C. Varias pasadas seguidas: no se acumulan workers
  for (let i = 0; i < 3; i++) { await p.setInputFiles('#entradaImagen', path.join(IMG, 'factura.jpg')); await p.waitForTimeout(100); await p.click('#botonReconocer'); await esperarFin(); }
  R.C = { workersTras3Pasadas: p.workers().length };
  // E. Arrastrar y soltar
  const urlAntes = p.url();
  const soltar = async (selector, nombres) => p.evaluate(async ({ selector, archivos }) => {
    const dt = new DataTransfer();
    for (const a of archivos) { const bin = atob(a.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], a.nombre, { type: 'image/png' })); }
    const destino = document.querySelector(selector);
    for (const tipo of ['dragenter', 'dragover', 'drop']) destino.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: dt }));
    return true;
  }, { selector, archivos: nombres.map((n) => ({ nombre: n, b64: fs.readFileSync(path.join(n.startsWith('/') ? '' : IMG, n)).toString('base64') })) });
  await soltar('h1', ['factura.webp']);
  await p.waitForTimeout(200);
  R.E = { fuera: { urlSinCambio: p.url() === urlAntes, avisos: await avisos() } };
  await soltar('#zonaArrastre', ['factura.webp', 'factura.jpg']);
  await p.waitForTimeout(400);
  R.E.dosEnZona = { avisos: await avisos(), pie: await p.textContent('#datosImagen'), claseArrastrandoTrasSoltar: await p.$eval('#zonaArrastre', (z) => z.classList.contains('arrastrando')) };
  // F. Preludio: red anulada dentro del worker
  R.F = await p.evaluate(async () => {
    const datos = new Uint8Array([1, 2, 3, 4, 5]);
    const hex = await window.CargadorVerificado.sha256Hex(datos);
    const b64 = btoa(String.fromCharCode(...datos));
    const pre = window.OCRLocal.construirPreludioWorker(hex);
    const URLD = window.OCRLocal.URL_DATOS_MEMORIA;
    const prueba = `
      (async () => {
        const r = {}; const avisos = [];
        const intenta = async (n, f) => { try { const v = await f(); r[n] = 'PERMITIDO: ' + String(v).slice(0, 60); } catch (e) { r[n] = 'bloqueado (' + e.name + ')'; } };
        await intenta('fetch(URL_DATOS) 1ª vez', async () => { const x = await fetch(${JSON.stringify(URLD)}); return (await x.arrayBuffer()).byteLength + ' bytes servidos desde memoria'; });
        await intenta('fetch(URL_DATOS) 2ª vez', () => fetch(${JSON.stringify(URLD)}));
        await intenta('fetch externo', () => fetch('https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz'));
        await intenta('WorkerGlobalScope.prototype.fetch', () => WorkerGlobalScope.prototype.fetch.call(self, 'https://example.com/'));
        await intenta('redefinir fetch', () => { Object.defineProperty(self, 'fetch', { value: () => 1 }); return 'redefinido'; });
        await intenta('XMLHttpRequest', () => { const x = new XMLHttpRequest(); x.open('GET', 'https://example.com/'); x.send(); });
        await intenta('WebSocket', () => new WebSocket('wss://example.com/'));
        await intenta('EventSource', () => new EventSource('https://example.com/'));
        await intenta('importScripts', () => importScripts('https://example.com/x.js'));
        await intenta('indexedDB.open', () => indexedDB.open('x'));
        await intenta('caches.open', () => caches.open('x'));
        await intenta('Worker anidado', () => new Worker('data:text/javascript,1'));
        await intenta('import() dinámico', () => import('https://example.com/m.js'));
        await intenta('WebAssembly', async () => { await WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0])); return 'ok'; });
        postMessage({ resultado: r });
      })();`;
    return await new Promise((res) => {
      const url = URL.createObjectURL(new Blob([pre.antes, b64, pre.despues, prueba], { type: 'text/javascript' }));
      const w = new Worker(url); const avisos = [];
      w.onmessage = (e) => { if (e.data && e.data.ocrLocalRed) avisos.push(e.data.ocrLocalRed.api + ' → ' + e.data.ocrLocalRed.destino.slice(0, 70)); else if (e.data && e.data.resultado) { w.terminate(); res({ resultado: e.data.resultado, avisosRecibidos: avisos }); } };
      w.onerror = (e) => { e.preventDefault(); res({ error: e.message }); };
    });
  });
  // I. API: OCUPADO, cancelar durante el arranque y reintentar
  R.I = await p.evaluate(async (b64img) => {
    const out = {};
    const m = new window.OCRLocal.MotorOCRLocal();
    const pIni = m.iniciar(); setTimeout(() => m.cancelar(), 5);
    try { await pIni; out.cancelarArranque = 'NO se canceló (terminó antes)'; } catch (e) { out.cancelarArranque = e.codigo + ' · estado=' + m.estado; }
    await m.iniciar(); out.trasReintento = m.estado;
    const bin = atob(b64img); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: 'image/jpeg' });
    const a = m.reconocer(blob); let b2;
    try { await m.reconocer(blob); b2 = 'NO dio OCUPADO'; } catch (e) { b2 = e.codigo; }
    out.segundaLlamadaSimultanea = b2;
    out.primera = (await a).lineas.length + ' líneas';
    m.liberar(); out.trasLiberar = m.estado;
    try { await m.reconocer(blob); } catch (e) { out.usarTrasLiberar = e.codigo; }
    // liberar() durante el arranque y durante el reconocimiento: el estado final debe seguir siendo «liberado»
    const m2 = new window.OCRLocal.MotorOCRLocal(); const pIni2 = m2.iniciar(); m2.liberar();
    try { await pIni2; out.liberarDuranteArranque = 'terminó sin error · estado=' + m2.estado; } catch (e) { out.liberarDuranteArranque = e.codigo + ' · estado=' + m2.estado; }
    const m3 = new window.OCRLocal.MotorOCRLocal(); await m3.iniciar(); const pr3 = m3.reconocer(blob); setTimeout(() => m3.liberar(), 300);
    try { await pr3; out.liberarDuranteOCR = 'terminó antes · estado=' + m3.estado; } catch (e) { out.liberarDuranteOCR = e.codigo + ' · estado=' + m3.estado; }
    return out;
  }, fs.readFileSync(path.join(IMG, 'factura.jpg')).toString('base64'));
  await p.waitForTimeout(1500);
  R.workersFinales = p.workers().length;
  R.rechazosSinGestionar = await p.evaluate(() => window.__rechazos);
  R.erroresDePagina = errores;
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
