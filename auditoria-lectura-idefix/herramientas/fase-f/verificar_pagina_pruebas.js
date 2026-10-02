// Fase F (F9): ejecuta Idefix1.0/pruebas-corpus.html como lo haría una persona (elige la carpeta y pulsa el botón)
// y comprueba que los veredictos de la página coinciden con los de evaluar.py + consolidar.py.
// Uso: node verificar_pagina_pruebas.js <url_de_la_carpeta_Idefix/> <carpeta_corpus> [sin-ocr]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [BASE, CORPUS, MODO] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const peticiones = [], consola = [];
  p.on('request', (r) => peticiones.push(r.url()));
  p.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => consola.push('pageerror: ' + e.message));
  await p.goto(BASE + 'pruebas-corpus.html');
  await p.setInputFiles('#carpeta', CORPUS);
  await p.waitForFunction(() => !document.getElementById('ejecutar').disabled, null, { timeout: 30000 });
  console.log('estado:', await p.textContent('#estado'));
  if (MODO === 'sin-ocr') await p.uncheck('#ocr');
  const t0 = Date.now();
  await p.click('#ejecutar');
  await p.waitForFunction(() => document.body.dataset.pruebas === 'terminadas', null, { timeout: 1200000 });
  const r = await p.evaluate(() => window.__resultadosPruebas);
  console.log('estado:', await p.textContent('#estado'));
  if (!r) { console.log('SIN RESULTADOS'); await b.close(); process.exit(1); }
  const distintos = r.casos.filter((c) => c.comparacion !== 'igual');
  for (const c of distintos) console.log('DISTINTO', c.id, c.veredicto, 'esperado', c.esperado, '·', c.resultado.slice(0, 160));
  const filas = await p.$$eval('#tablaFormatos tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')));
  for (const f of filas) console.log('  ', f);
  const externas = peticiones.filter((u) => !/^(file:|blob:|data:)/.test(u));
  console.log(`casos ${r.casos.length}, iguales ${r.casos.length - distintos.length}, distintos ${distintos.length}; ` +
    `peticiones externas ${externas.length}; errores de consola ${consola.length}; ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const c of consola.slice(0, 5)) console.log('  consola:', c);
  await b.close();
})();
