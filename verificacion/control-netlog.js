const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => { const b = await chromium.launch({ args: ['--log-net-log=' + process.argv[3], '--net-log-capture-mode=Everything'] }); const p = await b.newPage(); await p.goto('file://' + process.argv[2]); console.log('resultado fetch:', await p.evaluate(() => window.__r)); await b.close(); })();
