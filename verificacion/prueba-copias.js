const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'); const fs = require('fs'); const os = require('os');
const ORIGEN = path.resolve(__dirname, '..', 'ocr-local');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-local-copias-'));
function preparar() {
  for (const c of ['manipulado', 'ausente', 'tiempo']) fs.cpSync(ORIGEN, path.join(TMP, 'copia-' + c), { recursive: true });
  const p = path.join(TMP, 'copia-manipulado', 'vendor-paquetes', 'tessdata-spa-4.0.0_best_int.traineddata.gz.paquete.js');
  let s = fs.readFileSync(p, 'utf8'); const i = s.indexOf('", "') + 4 + 100000; s = s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1); fs.writeFileSync(p, s);
  fs.rmSync(path.join(TMP, 'copia-ausente', 'vendor-paquetes', 'tesseract-core-7.0.0-simd-lstm.wasm.js.paquete.js'));
  const t = path.join(TMP, 'copia-tiempo', 'js', 'ocr-local.js'); fs.writeFileSync(t, fs.readFileSync(t, 'utf8').replace('MS_MAX_RECONOCIMIENTO: 180000', 'MS_MAX_RECONOCIMIENTO: 1'));
}
preparar();
(async () => {
  const b = await chromium.launch(); const R = {};
  for (const c of ['manipulado', 'ausente', 'tiempo']) {
    const p = await b.newPage(); const err = []; p.on('pageerror', (e) => err.push(e.message));
    await p.addInitScript(() => { window.__rechazos = []; window.addEventListener('unhandledrejection', (e) => window.__rechazos.push(String(e.reason))); });
    await p.goto('file://' + path.join(TMP, 'copia-' + c, 'index.html'));
    await p.waitForFunction(() => /listo|no ha podido/i.test(document.getElementById('textoEtapa').textContent), null, { timeout: 60000 });
    const r = { etapa: await p.textContent('#textoEtapa'), avisos: await p.$$eval('#avisos .aviso', (a) => a.map((x) => x.textContent.slice(0, 200))), workers: p.workers().length };
    if (c === 'tiempo') {
      await p.setInputFiles('#entradaImagen', path.join(__dirname, 'imagenes', 'factura.jpg'));
      await p.waitForTimeout(150); await p.click('#botonReconocer');
      await p.waitForFunction(() => document.querySelector('.aviso-error'), null, { timeout: 60000 });
      await p.waitForTimeout(800);
      r.trasReconocer = { avisos: await p.$$eval('#avisos .aviso', (a) => a.map((x) => x.textContent.slice(0, 200))), workers: p.workers().length, botonHabilitado: await p.$eval('#botonReconocer', (x) => !x.disabled) };
    } else {
      r.panelBibliotecas = await p.evaluate(() => { const dt = Array.from(document.querySelectorAll('#listaComprobacion dt')).find((d) => /Bibliotecas/.test(d.textContent)); return dt ? dt.nextElementSibling.textContent : ''; });
      r.botonReconocerConImagen = await (async () => { await p.setInputFiles('#entradaImagen', path.join(__dirname, 'imagenes', 'factura.jpg')); await p.waitForTimeout(150); return p.$eval('#botonReconocer', (x) => !x.disabled); })();
    }
    r.rechazos = await p.evaluate(() => window.__rechazos); r.errores = err;
    R[c] = r; await p.close();
  }
  console.log(JSON.stringify(R, null, 1)); await b.close();
})();
