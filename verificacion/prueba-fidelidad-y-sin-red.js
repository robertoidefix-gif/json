// 1) Fidelidad campo a campo sobre imagenes/a4-grande.png (70 líneas con importe, fecha y nº conocidos).
// 2) Mismo flujo con Internet cortado: proxy inexistente y resolución DNS anulada para todo salvo 127.0.0.1.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const URL_DEMO = 'file://' + path.resolve(__dirname, '..', 'ocr-local', 'index.html');
(async () => {
  const b = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const p = await b.newPage();
  await p.goto(URL_DEMO);
  await p.waitForFunction(() => /listo|no ha podido/i.test(document.getElementById('textoEtapa').textContent), null, { timeout: 60000 });
  await p.setInputFiles('#entradaImagen', path.join(__dirname, 'imagenes', 'a4-grande.png'));
  await p.waitForTimeout(150); await p.click('#botonReconocer');
  await p.waitForFunction(() => document.getElementById('textoResultado').value.length > 0 || document.querySelector('.aviso-error'), null, { timeout: 180000 });
  const texto = await p.$eval('#textoResultado', (x) => x.value);
  const filas = await p.$$eval('#cuerpoLineas tr', (f) => f.map((x) => ({ texto: x.children[1].textContent, dudosa: x.classList.contains('fila-dudosa') })));
  const esperado = Array.from({ length: 70 }, (_, i) => ({ n: i + 1, num: String(1000 + i), importe: (i * 37.5).toFixed(2).replace('.', ','), fecha: '0' + (1 + i % 9) + '/0' + (1 + i % 9) + '/2025' }));
  const lineas = texto.split('\n').filter((l) => l.trim());
  let importes = 0, fechas = 0, numeros = 0, simboloN = 0, euro = 0, exactas = 0; const fallos = [];
  esperado.forEach((e, i) => {
    const l = lineas[i] || '';
    const ref = 'Línea ' + e.n + ': concepto de gasto deducible nº ' + e.num + ', importe ' + e.importe + ' € y fecha ' + e.fecha;
    if (l === ref) exactas++;
    if (l.includes('importe ' + e.importe + ' ')) importes++; else fallos.push('importe L' + e.n + ': ' + l);
    if (l.includes(e.fecha)) fechas++; else fallos.push('fecha L' + e.n + ': ' + l);
    if (l.includes(' ' + e.num + ',')) numeros++; else fallos.push('número L' + e.n + ': ' + l);
    if (l.includes('nº ')) simboloN++;
    if (l.includes(' € ')) euro++;
  });
  const dudosasConError = filas.filter((f, i) => f.texto !== ('Línea ' + esperado[i].n + ': concepto de gasto deducible nº ' + esperado[i].num + ', importe ' + esperado[i].importe + ' € y fecha ' + esperado[i].fecha)).map((f) => f.dudosa);
  console.log(JSON.stringify({
    condicionesDeRed: 'proxy http://127.0.0.1:9 (inexistente) + DNS anulado para todo salvo 127.0.0.1',
    insigniaRed: await p.textContent('#insigniaRed'), resumen: await p.textContent('#resumenResultado'),
    lineasReconocidas: lineas.length, lineasExactas: exactas, importesCorrectos: importes + '/70', fechasCorrectas: fechas + '/70', numerosCorrectos: numeros + '/70',
    simboloNumeroOrdinalCorrecto: simboloN + '/70', simboloEuroCorrecto: euro + '/70',
    lineasConErrorMarcadasComoDudosas: dudosasConError.filter(Boolean).length + '/' + dudosasConError.length,
    ejemplosDeFallo: fallos.slice(0, 8), muestra: lineas.slice(0, 3)
  }, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
