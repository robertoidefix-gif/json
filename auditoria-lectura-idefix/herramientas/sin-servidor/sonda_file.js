const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const log = []; p.on('console', (m) => log.push(m.type() + ': ' + m.text().slice(0, 300))); p.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  p.on('requestfailed', (r) => log.push('requestfailed: ' + r.url().slice(0, 80) + ' ' + r.failure()?.errorText));
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__fin, null, { timeout: Number(process.argv[3] || 30000) }).catch(() => log.push('(tiempo agotado)'));
  console.log(JSON.stringify(await p.evaluate(() => ({ fin: window.__fin, paso: window.__paso, P: Object.keys(window.__P || {}) }))));
  console.log(log.join('\n'));
  await b.close();
})();
