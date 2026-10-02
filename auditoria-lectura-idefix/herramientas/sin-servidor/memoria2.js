const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const p = await (await b.newContext()).newPage();
  await p.goto(process.argv[2]);
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(async () => {
    const m = () => Math.round(performance.memory.usedJSHeapSize / 1048576);
    gc(); const conCola = m();
    self.IdefixPaquetes.length = 0; gc(); gc(); const sinCola = m();
    await new Promise((r) => setTimeout(r, 3000)); gc(); gc();
    return { conCola, sinCola, tras3s: m() };
  }));
  await b.close();
})();
