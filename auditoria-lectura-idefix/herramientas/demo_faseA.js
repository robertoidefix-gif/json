const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
  const peticiones = []; p.on('request', (r) => peticiones.push(r.url()));
  await p.goto(`http://127.0.0.1:${process.argv[2]}/demo-ocr.html`);
  await p.waitForSelector('#panel:not([hidden])', { timeout: 30000 });
  await p.setInputFiles('#archivo', path.resolve('salida/corpus/png01_factura.png'));
  await p.waitForSelector('#reconocer:not([disabled])', { timeout: 30000 });
  await p.click('#reconocer');
  await p.waitForFunction(() => document.getElementById('resultado').value.length > 50, null, { timeout: 120000 });
  const texto = await p.$eval('#resultado', (t) => t.value);
  console.log(JSON.stringify({ lineas: texto.split('\n').length, contieneTabla: /Sustitución de canalón/.test(texto), total: /1\.639,07/.test(texto),
    externas: peticiones.filter((u) => !/^(http:\/\/127\.0\.0\.1:\d+\/|blob:|data:)/.test(u)), errores, idiomas: peticiones.filter((u) => /tessdata/.test(u)).map((u) => u.split('/').pop()) }));
  await b.close();
})();
