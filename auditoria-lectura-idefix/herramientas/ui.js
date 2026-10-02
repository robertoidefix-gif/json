// Camino real de la interfaz: index.html (CSP de producción, 7 idiomas), subida por las cajetillas y «Descargar JSON».
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const C = path.resolve('salida/corpus');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const log = []; p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) log.push(m.type() + ': ' + m.text().slice(0, 200)); });
  p.on('pageerror', (e) => log.push('pageerror: ' + e.message.slice(0, 200)));
  const peticiones = []; p.on('request', (r) => peticiones.push(r.url()));
  await p.goto('http://127.0.0.1:8090/index.html');
  await p.waitForSelector('section[data-aa-caja="otros"] input.aa-input', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(3000);
  const otros = ['pdf01_factura_reportlab.pdf', 'docx01_factura.docx', 'html01_factura.html', 'png01_factura.png', 'jpg02_factura.jpg', 'jpeg03_factura_escaneo_degradado.jpeg', 'pdfE1_factura_escaneada.pdf'];
  await p.setInputFiles('section[data-aa-caja="otros"] input.aa-input', otros.map((f) => path.join(C, f)));
  await p.setInputFiles('section[data-aa-caja="libro_facturas_emitidas"] input.aa-input', ['xlsx01_libro_emitidas.xlsx', 'xls01_libro_emitidas.xls'].map((f) => path.join(C, f)));
  const t0 = Date.now();
  await p.waitForFunction(() => {
    const v = (k) => Number(document.querySelector(`[data-aa-stat="${k}"]`)?.textContent || -1);
    return v('total') === 9 && v('working') === 0;
  }, null, { timeout: 300000, polling: 500 });
  const ms = Date.now() - t0;
  const stats = await p.evaluate(() => Object.fromEntries(['total', 'working', 'ok', 'error'].map((k) => [k, document.querySelector(`[data-aa-stat="${k}"]`)?.textContent])));
  await p.screenshot({ path: 'ui_tras_analisis.png', fullPage: false });
  const botones = await p.$$eval('button', (bs) => bs.map((x) => x.textContent.trim()).filter(Boolean));
  let descarga = null;
  const boton = p.getByRole('button', { name: /Descargar JSON/i }).first();
  if (await boton.count()) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), boton.click()]);
    descarga = path.resolve('salida/ui_descarga.json'); await dl.saveAs(descarga);
  }
  console.log(JSON.stringify({ ms, stats, descarga, botones: botones.slice(0, 40), externas: peticiones.filter((u) => !/^(http:\/\/127\.0\.0\.1:8090\/|blob:|data:)/.test(u)), log: log.slice(0, 20) }, null, 1));
  await b.close();
})();
