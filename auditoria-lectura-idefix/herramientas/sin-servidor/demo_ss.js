// Demo OCR con file://: carga una imagen, reconoce y comprueba red y CSP.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [url, imagen, captura] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 1300 } });
  const consola = []; p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) consola.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => consola.push('pageerror: ' + e.message.slice(0, 300)));
  const peticiones = []; p.on('request', (r) => peticiones.push(r.url().slice(0, 160)));
  await p.goto(url);
  const r = { sinArrancarVisible: await p.isVisible('#sin-arrancar'), origen: await p.textContent('#estado-origen') };
  await p.setInputFiles('#archivo', path.resolve(imagen));
  await p.click('#reconocer');
  const t0 = Date.now();
  await p.waitForFunction(() => /Listo|No se pudo|No se ha/.test(document.querySelector('#mensaje').textContent), null, { timeout: 180000 });
  r.segundos = Math.round((Date.now() - t0) / 100) / 10;
  r.mensaje = await p.textContent('#mensaje'); r.motor = await p.textContent('#estado-motor');
  r.texto = (await p.inputValue('#resultado')).slice(0, 400);
  r.redResumen = await p.textContent('#red-resumen'); r.csp = await p.textContent('#red-csp');
  await p.screenshot({ path: captura, fullPage: true });
  r.peticiones = peticiones.map((u) => u.startsWith('file://') ? 'file://…/' + u.split('/').slice(-2).join('/') : u.slice(0, 60));
  r.consola = consola.slice(0, 10);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
