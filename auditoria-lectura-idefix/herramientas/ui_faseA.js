// Prueba de la fase A por la interfaz real (index.html): arranque, aviso del OCR y análisis de archivos.
// Uso: node ui_faseA.js <puerto> <escenario: normal|min|sinchi|alterado> <captura.png>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const C = path.resolve('salida/corpus');
const [puerto, escenario, captura] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  const consola = []; p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) consola.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => consola.push('pageerror: ' + e.message.slice(0, 300)));
  const peticiones = []; p.on('request', (r) => peticiones.push(r.url()));
  await p.goto(`http://127.0.0.1:${puerto}/index.html`);
  await p.waitForFunction(() => document.querySelector('section[data-aa-caja] input.aa-input') || document.querySelector('.aa-arranque-error'), null, { timeout: 90000 });
  const r = { escenario };
  r.errorArranque = await p.evaluate(() => document.querySelector('.aa-arranque-error')?.innerText || null);
  if (r.errorArranque) {
    await p.screenshot({ path: captura }); r.consola = consola; r.externas = peticiones.filter((u) => !/^(http:\/\/127\.0\.0\.1:\d+\/|blob:|data:)/.test(u));
    console.log(JSON.stringify(r, null, 1)); await b.close(); return;
  }
  const panel = () => p.evaluate(() => {
    const d = document.querySelector('details.aa-ocr'); const a = d?.querySelector('.aa-aviso');
    return { resumen: d?.querySelector('summary')?.textContent, abierto: d?.open, aviso: a && !a.hidden ? a.textContent : null,
      marcados: [...(d?.querySelectorAll('input[type=checkbox]') || [])].filter((x) => x.checked).map((x) => x.value) };
  });
  r.panelInicial = await panel();
  const esperar = (n) => p.waitForFunction((n) => {
    const v = (k) => Number(document.querySelector(`[data-aa-stat="${k}"]`)?.textContent || -1);
    return v('total') === n && v('working') === 0;
  }, n, { timeout: 300000, polling: 500 });
  await p.setInputFiles('section[data-aa-caja="libro_facturas_emitidas"] input.aa-input', [path.join(C, 'xlsx01_libro_emitidas.xlsx')]);
  await p.setInputFiles('section[data-aa-caja="otros"] input.aa-input', ['png01_factura.png', 'pdfE1_factura_escaneada.pdf', 'docx01_factura.docx'].map((f) => path.join(C, f)));
  await esperar(4);
  let n = 4;
  if (escenario === 'sinchi') {
    // Desmarcar el idioma que falta: el OCR se vuelve a intentar con los marcados.
    await p.evaluate(() => { document.querySelector('details.aa-ocr').open = true; });
    await p.locator('details.aa-ocr input[value="chi_sim"]').uncheck();
    r.panelTrasDesmarcar = await panel();
    await p.setInputFiles('section[data-aa-caja="otros"] input.aa-input', [path.join(C, 'jpg02_factura.jpg')]);
    n = 5; await esperar(n);
  }
  r.panelFinal = await panel();
  await p.screenshot({ path: captura, fullPage: false });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: /Descargar JSON/i }).first().click()]);
  const ruta = path.resolve(`salida/ui_faseA_${escenario}.json`); await dl.saveAs(ruta);
  const J = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  r.documentos = [];
  for (const [caj, lista] of Object.entries(J.documentos || {})) for (const e of lista) {
    const j = e.json || {};
    r.documentos.push({ archivo: j.source?.fileName, estado: j.processing?.status, ocr: j.processing?.ocr?.status || null,
      registros: (j.datos_especificos?.registros || []).length, total: j.importes?.inferidos?.total?.valor ?? null,
      avisos: (j.diagnostics?.issues || []).filter((i) => /OCR/.test(i.code)).map((i) => `${i.code}: ${i.message.slice(0, 160)}`) });
  }
  r.consola = consola.filter((c) => /warn|error/.test(c)).slice(0, 5);
  r.externas = peticiones.filter((u) => !/^(http:\/\/127\.0\.0\.1:\d+\/|blob:|data:)/.test(u));
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
