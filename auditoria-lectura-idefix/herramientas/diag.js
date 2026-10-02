const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) console.log('consola:', m.text().slice(0, 200)); });
  await p.goto('http://127.0.0.1:8090/diag-tesseract.html');
  const b64 = fs.readFileSync(process.argv[2]).toString('base64');
  const r = await p.evaluate(([b, l, psm]) => window.__diag(b, l, psm), [b64, process.argv[3].split(','), process.argv[4] || null]);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
