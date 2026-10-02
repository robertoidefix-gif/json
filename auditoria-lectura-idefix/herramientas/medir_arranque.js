const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [nombre, base, cfg] of [['original 8090 (7 idiomas, 6 núcleos)', 'http://127.0.0.1:8090/', { ocr: true }],
    ['fase A 8092 (5 idiomas, 3 núcleos)', 'http://127.0.0.1:8092/', { ocr: true }]]) {
    const t = [];
    for (let i = 0; i < 4; i++) {
      const ctx = await b.newContext(); const p = await ctx.newPage();
      let bytes = 0; p.on('response', async (r) => { try { const h = await r.headerValue('content-length'); bytes += Number(h || 0); } catch {} });
      await p.goto(base + 'prueba-auditoria.html');
      await p.waitForFunction(() => typeof window.__crear === 'function');
      const t0 = Date.now(); await p.evaluate((c) => window.__crear(c), cfg); t.push([Date.now() - t0, Math.round(bytes / 1048576)]);
      await ctx.close();
    }
    console.log(nombre, JSON.stringify(t));
  }
  await b.close();
})();
