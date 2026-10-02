// Escenario de la versión sin servidor por la interfaz real.
// Uso: node escenario_ss.js <url index.html> <nombre> <archivos separados por comas> [init.js] [marcarIdioma]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const C = path.resolve('salida/corpus');
const [url, nombre, archivos, init, marcar] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  if (init && init !== '-') await ctx.addInitScript({ path: path.resolve(init) });
  const p = await ctx.newPage();
  const consola = []; p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) consola.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => consola.push('pageerror: ' + e.message.slice(0, 300)));
  const peticiones = []; p.on('request', (r) => peticiones.push(r.url()));
  p.on('requestfailed', (r) => consola.push('requestfailed: ' + r.url().slice(-70) + ' ' + r.failure()?.errorText));
  const t0 = Date.now();
  await p.goto(url);
  await p.waitForFunction(() => document.querySelector('section[data-aa-caja] input.aa-input') || document.querySelector('.aa-arranque-error'), null, { timeout: 120000 });
  const r = { nombre, msArranque: Date.now() - t0 };
  r.errorArranque = await p.evaluate(() => document.querySelector('.aa-arranque-error')?.innerText || null);
  const panel = () => p.evaluate(() => {
    const d = document.querySelector('details.aa-ocr'); const a = d?.querySelector('.aa-aviso');
    return d ? { resumen: d.querySelector('summary')?.textContent, aviso: a && !a.hidden ? a.textContent : null,
      marcados: [...d.querySelectorAll('input[type=checkbox]')].filter((x) => x.checked).map((x) => x.value) } : null;
  });
  if (!r.errorArranque) {
    r.panelInicial = await panel();
    if (marcar) {
      await p.evaluate(() => { document.querySelector('details.aa-ocr').open = true; });
      for (const v of marcar.split(',')) await p.locator(`details.aa-ocr input[value="${v}"]`).check();
    }
    const lista = archivos ? archivos.split(',') : [];
    if (lista.length) {
      await p.setInputFiles('section[data-aa-caja="otros"] input.aa-input', lista.map((f) => path.join(C, f)));
      await p.waitForFunction((n) => {
        const v = (k) => Number(document.querySelector(`[data-aa-stat="${k}"]`)?.textContent || -1);
        return v('total') === n && v('working') === 0;
      }, lista.length, { timeout: 300000, polling: 500 });
      r.panelFinal = await panel();
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: /Descargar JSON/i }).first().click()]);
      const ruta = path.resolve(`salida/escenario_ss_${nombre}.json`); await dl.saveAs(ruta);
      const J = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      r.documentos = [];
      for (const lista2 of Object.values(J.documentos || {})) for (const e of lista2) {
        const j = e.json || {};
        r.documentos.push({ archivo: j.source?.fileName, estado: j.processing?.status, ocr: j.processing?.ocr?.status || null,
          idiomas: j.processing?.ocr?.languages || j.processing?.ocr?.idiomas || null, total: j.importes?.inferidos?.total?.valor ?? null,
          texto: (j.content?.text || j.contenido?.texto || '').slice(0, 80),
          avisos: (j.diagnostics?.issues || []).filter((i) => /OCR|PDF|INTEGR/i.test(i.code)).map((i) => `${i.code}: ${i.message.slice(0, 200)}`) });
      }
    }
  }
  await p.screenshot({ path: path.resolve(`capturas_ss/${nombre}.png`) });
  r.pwned = await p.evaluate(() => globalThis.__pwned ?? null);
  r.paquetes = peticiones.filter((u) => /vendor-paquetes/.test(u)).map((u) => u.split('/').pop());
  r.externas = peticiones.filter((u) => !/^(file:\/\/|http:\/\/127\.0\.0\.1:\d+\/|blob:|data:)/.test(u));
  r.consola = consola.filter((c) => /warn|error|failed/.test(c)).slice(0, 8);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
