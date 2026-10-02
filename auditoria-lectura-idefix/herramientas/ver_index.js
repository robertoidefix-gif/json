const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const log = []; p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) log.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => log.push('pageerror: ' + e.message.slice(0, 300)));
  await p.goto(process.argv[2]); await p.waitForTimeout(8000);
  console.log(log.join('\n'));
  console.log((await p.evaluate(() => document.body.innerText)).slice(0, 1200));
  await p.screenshot({ path: process.argv[3], fullPage: false }); await b.close();
})();
