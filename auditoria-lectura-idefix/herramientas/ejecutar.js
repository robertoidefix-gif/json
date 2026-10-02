// Ejecuta el corpus en la aplicación sellada (http://127.0.0.1:8090/prueba-auditoria.html), con la misma CSP que index.html.
// Uso: node ejecutar.js <dir_salida> <config: prod|spa> [ids separados por comas]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2]);
const CONFIG = process.argv[3] || 'prod';
const SOLO = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const CONFIGS = { prod: { ocr: true }, spa: { ocr: true, idiomasTesseract: ['spa'] }, latinos: { ocr: true, idiomasTesseract: ['spa', 'cat', 'eus', 'eng', 'fra'] } };
const verdad = JSON.parse(fs.readFileSync(path.join(OUT, 'verdad.json'), 'utf8'));
const DIR = path.join(OUT, 'resultados', process.env.ETIQUETA || CONFIG);
fs.mkdirSync(DIR, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const peticiones = [], consola = [];
  p.on('request', (r) => peticiones.push({ url: r.url().slice(0, 200), tipo: r.resourceType(), metodo: r.method() }));
  p.on('console', (m) => { if (!/Parameter not found/.test(m.text())) consola.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => consola.push('pageerror: ' + e.message));
  const BASE = process.env.BASE || 'http://127.0.0.1:8090/';
  await p.goto(BASE + 'prueba-auditoria.html');
  await p.waitForFunction(() => typeof window.__crear === 'function' && typeof window.crearAnalizadorArchivos === 'function', null, { timeout: 30000 });
  const t0 = Date.now();
  await p.evaluate((c) => window.__crear(c), CONFIGS[CONFIG]);
  const msInicio = Date.now() - t0;
  const resumen = [];
  for (const d of verdad) {
    if (SOLO && !SOLO.has(d.id)) continue;
    const b64 = fs.readFileSync(path.join(OUT, 'corpus', d.archivo)).toString('base64');
    const r = await p.evaluate(([b, n, t, c]) => window.__analizar(b, n, t, c), [b64, d.archivo, d.mime || '', d.cajetilla]);
    fs.writeFileSync(path.join(DIR, d.id + '.json'), JSON.stringify(r));
    resumen.push({ id: d.id, ok: r.ok, ms: r.ms, error: r.error || null, estado: r.ok ? r.resultado?.processing?.status : null });
    console.log(d.id.padEnd(8), r.ok ? 'OK ' : 'ERR', String(r.ms).padStart(6), 'ms', r.ok ? (r.resultado?.processing?.status || '') : (r.error || '').slice(0, 140));
  }
  const externas = peticiones.filter((x) => !/^(http:\/\/127\.0\.0\.1:809[0-2]\/|blob:|data:)/.test(x.url));
  fs.writeFileSync(path.join(DIR, '_ejecucion.json'), JSON.stringify({ config: CONFIGS[CONFIG], msInicio, resumen, peticiones, externas, consola,
    navegador: b.version() }, null, 1));
  console.log('inicio(ms)', msInicio, 'peticiones', peticiones.length, 'externas', externas.length, 'consola', consola.length);
  await b.close();
})();
