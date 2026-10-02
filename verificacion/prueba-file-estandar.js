const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const c = []; p.on('console', (m) => c.push(m.type() + ': ' + m.text().slice(0, 200)));
 await p.goto('file://' + __dirname + '/prueba-file-estandar.html'); console.log((await p.evaluate(() => window.__run())).join('\n')); console.log(c.join('\n')); await b.close(); })();
