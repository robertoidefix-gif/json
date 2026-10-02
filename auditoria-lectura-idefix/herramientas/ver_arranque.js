const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const log = []; p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) log.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => log.push('pageerror: ' + e.message.slice(0, 300)));
  const t0 = Date.now();
  await p.goto(process.argv[2]);
  const espera = Number(process.argv[3] || 30000);
  let estado = '';
  while (Date.now() - t0 < espera) {
    estado = await p.evaluate(() => (document.querySelector('.aa-arranque')?.innerText || (document.querySelector('section[data-aa-caja]') ? 'UI CARGADA' : '?')).replace(/\n/g, ' / '));
    if (/UI CARGADA|no se ha iniciado/.test(estado)) break;
    await p.waitForTimeout(1000);
  }
  console.log(`${Math.round((Date.now() - t0) / 1000)} s ->`, estado.slice(0, 500));
  console.log(log.slice(0, 8).join('\n'));
  await b.close();
})();
