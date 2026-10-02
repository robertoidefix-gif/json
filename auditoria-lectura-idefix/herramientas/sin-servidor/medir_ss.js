// Tiempo desde que se abre index.html hasta que la interfaz está lista (con OCR), 5 veces cada una.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [nombre, url] of process.argv.slice(2).map((x) => x.split('|'))) {
    const t = [];
    for (let i = 0; i < 5; i++) {
      const ctx = await b.newContext(); const p = await ctx.newPage();
      const t0 = Date.now();
      await p.goto(url);
      await p.waitForFunction(() => document.querySelector('section[data-aa-caja] input.aa-input') || document.querySelector('.aa-arranque-error'), null, { timeout: 120000 });
      t.push(Date.now() - t0);
      const mem = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
      t.push(`${mem} MB`);
      await ctx.close();
    }
    console.log(nombre.padEnd(28), JSON.stringify(t));
  }
  await b.close();
})();
