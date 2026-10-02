// Fase D por la interfaz real (index.html, file://): el recuadro «Contenido sospechoso» de cada tarjeta.
// Uso: node ui_faseD.js <url index.html> <captura.png> <archivo1> <archivo2> ...
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [url, captura, ...archivos] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 1800 } });
  const p = await ctx.newPage();
  const externas = []; p.on('request', (r) => { if (!/^(file:|blob:|data:)/.test(r.url())) externas.push(r.url()); });
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => document.querySelector('section[data-aa-caja] input.aa-input'), null, { timeout: 120000 });
  await p.setInputFiles('section[data-aa-caja="otros"] input.aa-input', archivos);
  await p.waitForFunction((n) => {
    const v = (k) => Number(document.querySelector(`[data-aa-stat="${k}"]`)?.textContent || -1);
    return v('total') === n && v('working') === 0;
  }, archivos.length, { timeout: 300000, polling: 500 });
  await p.evaluate(() => document.querySelectorAll('details.aa-seguridad').forEach((d) => { d.open = true; }));
  const tarjetas = await p.evaluate(() => [...document.querySelectorAll('details.aa-seguridad')].map((d) => ({
    resumen: d.querySelector('summary')?.textContent, muestra: [...d.querySelectorAll('li')].slice(0, 3).map((li) => li.textContent.slice(0, 140)) })));
  await p.screenshot({ path: captura, fullPage: true });
  console.log(JSON.stringify({ tarjetas, externas, errores }, null, 1));
  await b.close();
})();
