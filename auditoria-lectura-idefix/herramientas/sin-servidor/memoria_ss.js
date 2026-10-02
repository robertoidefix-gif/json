const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  for (const [nombre, url] of process.argv.slice(2).map((x) => x.split('|'))) {
    const p = await (await b.newContext()).newPage();
    await p.goto(url);
    await p.waitForFunction(() => document.querySelector('section[data-aa-caja] input.aa-input'), null, { timeout: 120000 });
    await p.waitForTimeout(2000);
    const r = await p.evaluate(() => { const a = performance.memory.usedJSHeapSize; gc(); gc(); return [Math.round(a / 1048576), Math.round(performance.memory.usedJSHeapSize / 1048576),
      (globalThis.IdefixPaquetes || []).map((e) => `${e[0]} (${Math.round(e[1].length / 1048576 * 10) / 10} MB)`)]; });
    console.log(nombre.padEnd(28), 'antes de GC', r[0], 'MB · tras GC', r[1], 'MB · cola pendiente:', JSON.stringify(r[2]));
  }
  await b.close();
})();
