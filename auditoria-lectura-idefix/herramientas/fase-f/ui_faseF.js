// Fase F: comprueba por la interfaz (index.html, file://) lo que ve el usuario con pdf11a, pdf12 y pdf14.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [URL, ...ARCHIVOS] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1400 } });
  const externas = [];
  const consola = [];
  p.on('request', (r) => { if (!/^(file:|blob:|data:)/.test(r.url())) externas.push(r.url()); });
  p.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 200)); });
  await p.goto(URL);
  await p.waitForFunction(() => window.analizadorArchivos && document.querySelector('#analizadorArchivos input[type=file]'), null, { timeout: 60000 });
  await p.setInputFiles('#analizadorArchivos input[type=file]', ARCHIVOS);
  await p.waitForFunction((n) => window.analizadorArchivos.obtenerResultados?.().length >= n ||
    [...document.querySelectorAll('#analizadorArchivos *')].filter((e) => /Rechazado|Completado|Parcial|Error/.test(e.textContent || '')).length >= n, ARCHIVOS.length, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const texto = await p.evaluate(() => document.querySelector('#analizadorArchivos').innerText);
  for (const clave of ['PDF PROTEGIDO CON CONTRASEÑA', 'PDF DAÑADO O INCOMPLETO', 'No password given', 'Invalid PDF structure', 'byte(s) antes de su cabecera', 'alineación geométrica', 'pdf14_bytes_previos', 'Completado']) {
    console.log(`${texto.includes(clave) ? 'SÍ' : 'no'} aparece en la interfaz: «${clave}»`);
  }
  await p.screenshot({ path: 'capturas_ss/faseF-ui-pdf.png', fullPage: false });
  console.log(`peticiones externas ${externas.length} · errores de consola ${consola.length}`);
  await b.close();
})();
