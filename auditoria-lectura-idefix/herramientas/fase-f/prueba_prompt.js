// Fase F (F9): equivalencia del prompt fiscal (aaConstruirPromptFiscal) antes y después de dividirla.
// Con la API pública: analiza documentos del corpus, fija el contexto (IVA, IRPF, IS, IRNR), genera el prompt en
// modo compacto y completo, con y sin «Contexto del análisis», y guarda cada prompt con los datos variables
// normalizados (fechas y horas ISO, UUID, identificador aleatorio del bloque de datos, marca de tiempo de los id_procesamiento y milisegundos). Dos ejecuciones con código distinto se comparan con
//   node prueba_prompt.js comparar <a.json> <b.json>
// Uso: BASE=file:///…/ node prueba_prompt.js generar <dir_corpus> <salida.json>
const fs = require('fs'), path = require('path');
const [modo, A, B] = process.argv.slice(2);
const IDS = ['xlsx01', 'xlsx03', 'xls01', 'pdf04', 'pdf06', 'docx03', 'pdf01', 'docx01', 'html01', 'pdf07', 'xlsx06'];
const IMPUESTOS = ['IVA', 'IRPF', 'IS', 'IRNR'];
const normalizar = (s) => s
  .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<FECHA-HORA>')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
  .replace(/\b[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}\b/g, '<ID-BLOQUE>')
  .replace(/\baa_\d{10,}_(\d+)\b/g, 'aa_<MARCA>_$1')
  .replace(/\d+(?:[.,]\d+)?\s?ms\b/g, '<N> ms')
  .replace(/\b\d{1,2}\/\d{1,2}\/\d{4},? \d{1,2}:\d{2}(?::\d{2})?/g, '<FECHA-LOCAL>');

if (modo === 'comparar') {
  const leer = (f) => Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(f, 'utf8'))).map(([k, v]) => [k, normalizar(v)]));
  const a = leer(A), b = leer(B);
  const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const distintos = claves.filter((k) => a[k] !== b[k]);
  for (const k of distintos.slice(0, 10)) {
    const x = a[k] || '', y = b[k] || '';
    let i = 0; while (i < x.length && x[i] === y[i]) i++;
    console.log('DISTINTO', k, 'en el carácter', i, JSON.stringify(x.slice(Math.max(0, i - 100), i + 100)), '→', JSON.stringify(y.slice(Math.max(0, i - 100), i + 100)));
  }
  console.log(`comparados ${claves.length} prompts: ${claves.length - distintos.length} idénticos, ${distintos.length} distintos`);
  process.exit(distintos.length ? 1 : 0);
}

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(process.env.BASE + 'prueba-auditoria.html');
  await p.waitForFunction(() => typeof window.__crear === 'function' && typeof window.crearAnalizadorArchivos === 'function', null, { timeout: 30000 });
  await p.evaluate(() => window.__crear({ ocr: false }));
  const verdad = JSON.parse(fs.readFileSync(path.join(A, 'verdad.json'), 'utf8'));
  for (const d of verdad.filter((x) => IDS.includes(x.id))) {
    const b64 = fs.readFileSync(path.join(A, 'corpus', d.archivo)).toString('base64');
    const r = await p.evaluate(([x, n, t, c]) => window.__analizar(x, n, t, c), [b64, d.archivo, d.mime || '', d.cajetilla]);
    console.log(d.id.padEnd(8), d.cajetilla.padEnd(26), r.ok ? r.resultado.processing.status : r.error);
  }
  const salida = {};
  for (const imp of IMPUESTOS) {
    for (const ctxU of ['', 'Cliente con dos actividades; revisar la prorrata del IVA.']) {
      for (const modoPrompt of ['compacto', 'completo']) {
        const clave = `${imp}|${modoPrompt}|${ctxU ? 'contexto' : 'sin-contexto'}`;
        salida[clave] = normalizar(await p.evaluate(async ([i, c, m]) => {
          try {
            window.__aa.establecerContextoAnalisis({ impuesto: i, ejercicio_fiscal: 2025,
              cliente: { nif: 'B12345674', nombre: 'Construcciones Muñoz Ibáñez, S.L.' } });
            window.__aa.establecerContextoUsuario(c);
            await window.__aa.generarPromptFiscal({ modo: m, impuesto: i });
            return JSON.stringify(window.__aa.obtenerPromptFiscal());
          } catch (e) {
            return 'ERROR: ' + String(e && e.message || e);
          }
        }, [imp, ctxU, modoPrompt]));
      }
    }
  }
  fs.writeFileSync(B, JSON.stringify(salida));
  const n = Object.keys(salida).length;
  const conError = Object.values(salida).filter((x) => x.startsWith('ERROR')).length;
  console.log(`generados ${n} prompts (${conError} con error), ${Object.values(salida).reduce((a, x) => a + x.length, 0)} caracteres; errores de página: ${errores.length}`);
  await b.close();
})();
