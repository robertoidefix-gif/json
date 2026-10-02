const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ deviceScaleFactor: 2, viewport: { width: 1150, height: 800 } });
  const p = await ctx.newPage(); await p.goto('file://' + path.resolve('salida/fuentes/libro_sin_bordes.html'));
  await p.screenshot({ path: path.resolve('salida/tmp/libro_sin_bordes_2x.png'), fullPage: true }); await b.close();
})();
