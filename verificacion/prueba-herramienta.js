const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'); const crypto = require('crypto'); const path = require('path');
// DIR debe contener: los 4 .tgz oficiales (tesseract.js-7.0.0.tgz, tesseract.js-core-7.0.0.tgz,
// bootstrap-5.3.8.tgz y el de spa renombrado como descarga-con-otro-nombre.tgz), bootstrap-manipulado.tgz
// (bootstrap con 1 bit cambiado en el byte 5000), cualquiera.js (texto cualquiera) y worker-suelto.min.js
// (copia de package/dist/worker.min.js).
const DIR = process.argv[2] || process.cwd();
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '..', 'ocr-local', 'herramientas', 'empaquetar-vendor.html'));
  // 1) archivos inválidos
  await p.setInputFiles('#entradaArchivos', [path.join(DIR, 'bootstrap-manipulado.tgz'), path.join(DIR, 'cualquiera.js')]);
  await p.waitForFunction(() => document.querySelectorAll('#mensajes .aviso').length >= 2, null, { timeout: 60000 });
  const invalidos = await p.$$eval('#mensajes .aviso', (a) => a.map((x) => x.className + ' | ' + x.textContent));
  // 2) oficiales (spa con otro nombre) + archivo suelto oficial
  await p.setInputFiles('#entradaArchivos', [path.join(DIR, 'tesseract.js-7.0.0.tgz'), path.join(DIR, 'tesseract.js-core-7.0.0.tgz'), path.join(DIR, 'bootstrap-5.3.8.tgz'), path.join(DIR, 'descarga-con-otro-nombre.tgz'), path.join(DIR, 'worker-suelto.min.js')]);
  await p.waitForFunction(() => document.querySelectorAll('#mensajes .aviso').length >= 5, null, { timeout: 120000 });
  const validos = await p.$$eval('#mensajes .aviso', (a) => a.map((x) => x.className + ' | ' + x.textContent));
  const estados = await p.$$eval('#cuerpoPaquetes tr', (f) => f.map((x) => x.textContent));
  const enlaces = await p.$$eval('#cuerpoPaquetes a[download]', (a) => a.map((x) => x.getAttribute('download')));
  const resultados = [];
  for (const nombre of enlaces) {
    const [descarga] = await Promise.all([p.waitForEvent('download'), p.click(`a[download="${nombre}"]`)]);
    const destino = path.join(require('os').tmpdir(), 'ocr-local-descargas', nombre); await descarga.saveAs(destino);
    const generado = fs.readFileSync(destino); const comprometido = fs.readFileSync(path.resolve(__dirname, '..', 'ocr-local', 'vendor-paquetes', nombre));
    resultados.push(nombre + ' → ' + (Buffer.compare(generado, comprometido) === 0 ? 'IDÉNTICO al de vendor-paquetes' : 'DISTINTO') + ' sha256=' + crypto.createHash('sha256').update(generado).digest('hex'));
  }
  console.log(JSON.stringify({ invalidos, validos, estados: estados.map((e) => e.slice(0, 90)), resultados, errores }, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
