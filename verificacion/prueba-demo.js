// Prueba E2E de la demo: abre index.html (file:// o http), elige la imagen, reconoce y recoge evidencias.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
(async () => {
  const url = process.argv[2];
  const imagen = process.argv[3];
  const netlog = process.argv[4];
  const args = netlog ? ['--log-net-log=' + netlog, '--net-log-capture-mode=Everything'] : [];
  const b = await chromium.launch({ args });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const consola = [];
  p.on('console', (m) => consola.push(m.type() + ': ' + m.text().slice(0, 300)));
  p.on('pageerror', (e) => consola.push('pageerror: ' + e.message.slice(0, 300)));
  const peticiones = [];
  ctx.on('request', (r) => peticiones.push(r.url().slice(0, 120)));
  ctx.on('requestfailed', (r) => consola.push('requestfailed: ' + r.url().slice(0, 120) + ' ' + (r.failure() && r.failure().errorText)));
  const t0 = Date.now();
  await p.goto(url);
  await p.waitForFunction(() => /listo/i.test(document.getElementById('textoEtapa').textContent) || /no ha podido/i.test(document.getElementById('textoEtapa').textContent), null, { timeout: 120000 });
  const tMotor = Date.now() - t0;
  const etapaMotor = await p.textContent('#textoEtapa');
  await p.setInputFiles('#entradaImagen', imagen);
  await p.waitForFunction(() => !document.getElementById('botonReconocer').disabled, null, { timeout: 10000 });
  const t1 = Date.now();
  await p.click('#botonReconocer');
  await p.waitForFunction(() => document.getElementById('textoResultado').value.length > 0 || document.querySelector('.aviso-error'), null, { timeout: 180000 });
  const tOcr = Date.now() - t1;
  const res = await p.evaluate(() => ({
    texto: document.getElementById('textoResultado').value,
    resumen: document.getElementById('resumenResultado').textContent,
    confianza: document.getElementById('insigniaConfianza').textContent,
    avisos: Array.from(document.querySelectorAll('.aviso')).map((a) => a.className + ' | ' + a.textContent),
    panel: Array.from(document.querySelectorAll('#listaComprobacion dt')).map((dt) => dt.textContent + ': ' + dt.nextElementSibling.textContent),
    insignias: [document.getElementById('insigniaModo').textContent, document.getElementById('insigniaRed').textContent],
    bootstrapAplicado: getComputedStyle(document.querySelector('.btn-primary')).backgroundColor,
    filas: document.querySelectorAll('#cuerpoLineas tr').length,
    dudosas: document.querySelectorAll('#cuerpoLineas tr.fila-dudosa').length
  }));
  await p.click('#botonDiagnostico');
  await p.waitForFunction(() => document.querySelectorAll('#listaDiagnostico li').length >= 7, null, { timeout: 30000 });
  const diag = await p.evaluate(() => Array.from(document.querySelectorAll('#listaDiagnostico li')).map((li) => li.textContent));
  await p.screenshot({ path: process.argv[5] || '/dev/null', fullPage: true });
  console.log(JSON.stringify({ url, tMotorMs: tMotor, etapaMotor, tOcrMs: tOcr, ...res, diag, peticionesVistasPorPlaywright: peticiones.filter((u) => !/^(file|blob|data):/.test(u)), totalPeticiones: peticiones.length, consola: consola.slice(0, 40) }, null, 1));
  await b.close();
})().catch((e) => { console.error('FALLO PRUEBA', e); process.exit(1); });
