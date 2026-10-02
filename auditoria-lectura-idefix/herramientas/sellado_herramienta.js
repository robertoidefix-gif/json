// Prueba la herramienta de sellado (herramientas/generar-manifiesto.html) eligiendo una carpeta, como el usuario.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [puerto, carpeta] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`http://127.0.0.1:${puerto}/herramientas/generar-manifiesto.html`);
  await p.setInputFiles('#carpeta', carpeta);
  await p.waitForFunction(() => /Manifiesto listo|No se genera|corrige|vacía|no parece/.test(document.getElementById('estado').textContent), null, { timeout: 120000 });
  const r = await p.evaluate(() => ({
    estado: document.getElementById('estado').textContent,
    errores: [...document.querySelectorAll('#errores li')].map((li) => li.textContent),
    avisos: [...document.querySelectorAll('#avisos li')].map((li) => li.textContent),
    filas: [...document.querySelectorAll('#comprobaciones tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.slice(0, 70)).join(' | '))
  }));
  console.log(JSON.stringify({ ...r, erroresPagina: errores }, null, 1));
  await b.close();
})();
