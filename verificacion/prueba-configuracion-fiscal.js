// Pruebas 1–10 del bloque «Configuración para análisis fiscal» sobre su HTML de prueba (file://).
// Herramienta de verificación (Node.js + Playwright); la aplicación no la necesita.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL_PRUEBA = 'file://' + path.resolve(__dirname, '..', 'configuracion-fiscal', 'prueba-configuracion-fiscal.html');
const R = { pruebas: {}, red: {}, errores: [] };
const fallo = (n, m) => { R.pruebas[n].ok = false; R.pruebas[n].fallos.push(m); };
const exige = (n, cond, m) => { if (!cond) fallo(n, m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const peticiones = [];
  ctx.on('request', (r) => peticiones.push(r.url()));
  p.on('pageerror', (e) => R.errores.push(e.message));
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.effectiveDirective + ' ' + e.blockedURI)); });
  await p.goto(URL_PRUEBA);
  await p.waitForFunction(() => document.documentElement.classList.contains('estilos-listos'));
  let pid = await p.$eval('section.aacf input[type=text]', (x) => x.id.replace(/-nif$/, ''));
  const S = (s) => '#' + pid + '-' + s;

  const rellenarCliente = async (nif, nombre) => { await p.fill(S('nif'), nif); await p.fill(S('nombre'), nombre); };
  const impuesto = async (v) => p.selectOption(S('impuesto'), v);
  const regimen = async (imp, valores) => { for (const v of valores) await p.click(S('regimen-' + imp.toLowerCase()) + ' option[value="' + v + '"]'); };
  const anadirFila = async (boton, valores) => {
    await p.click('section.aacf button:has-text("' + boton + '")');
    const tabla = boton === 'Añadir régimen' ? 0 : -1;
    const tablas = await p.$$('section.aacf .aacf-zona-impuesto table');
    const t = tabla === 0 ? tablas[0] : tablas[tablas.length - 1];
    const inputs = await t.$$('tbody tr:last-child input');
    for (let i = 0; i < valores.length; i++) await inputs[i].fill(valores[i]);
  };
  const marcar = async (texto) => p.check('section.aacf label.aacf-doc:has-text("' + texto + '") input');
  const generar = async () => {
    await p.click('section.aacf button:has-text("Generar prompt para IA fiscal")');
    return p.evaluate((pid) => ({
      prompt: document.getElementById(pid + '-prompt').value,
      mensajes: Array.from(document.querySelectorAll('.aacf-mensajes > div')).map((d) => d.className + ': ' + d.textContent),
      revision: Array.from(document.querySelectorAll('.aacf-revision li')).map((l) => l.className + ' ' + l.textContent),
      invalidos: Array.from(document.querySelectorAll('section.aacf [aria-invalid="true"]')).map((x) => x.id.replace(pid + '-', '')),
      erroresCampo: Array.from(document.querySelectorAll('section.aacf .aacf-error')).map((x) => x.textContent).filter(Boolean),
      copiarActivo: !Array.from(document.querySelectorAll('section.aacf button')).find((x) => x.textContent === 'Copiar prompt').disabled
    }), pid);
  };
  const zonaVacia = () => p.evaluate(() => {
    const z = document.querySelector('.aacf-zona-impuesto');
    return { filas: z.querySelectorAll('tbody tr').length, marcadas: z.querySelectorAll('input[type=checkbox]:checked').length, seleccionadas: Array.from(z.querySelectorAll('select[multiple] option')).filter((o) => o.selected).length, selectores: z.querySelectorAll('select[multiple]').length, valoresTexto: Array.from(z.querySelectorAll('input[type=text]')).map((i) => i.value).join('') };
  });
  const instrucciones = (prompt) => prompt.split('\n').filter((l) => !/^(Fila \d+ · |Régimen \d+: |NIF: |Nombre: |│ )/.test(l)).join('\n').split('===== INICIO DOCUMENT_DATA')[0];
  const contiene = (texto, termino) => new RegExp('(^|[^\\p{L}\\p{N}])' + termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}\\p{N}])', 'u').test(texto);
  const nueva = async () => { await p.reload(); await p.waitForFunction(() => document.documentElement.classList.contains('estilos-listos')); return p.$eval('section.aacf input[type=text]', (x) => x.id.replace(/-nif$/, '')); };
  const reiniciar = async () => { pid = await nueva(); return pid; };
  const todosLosPrompts = [];

  // ---------- Prueba 1: IRPF ----------
  R.pruebas.P1 = { ok: true, fallos: [] };
  await rellenarCliente('12345678Z', 'María López García');
  await impuesto('IRPF');
  await regimen('IRPF', ['EDS', 'EDN']);
  await anadirFila('Añadir epígrafe', ['Actividad profesional', '123.4']);
  await anadirFila('Añadir epígrafe', ['Comercio minorista', '456.7']);
  for (const d of ['Se aporta facturas Recibidas', 'Libro Facturas Recibidas', 'Cuentas Bancarias']) await marcar(d);
  let g = await generar(); todosLosPrompts.push(g.prompt);
  exige('P1', g.prompt.length > 0 && g.copiarActivo, 'no se generó el prompt: ' + g.mensajes.join(' | '));
  exige('P1', g.prompt.includes('\nNIF: 12345678Z\n') && g.prompt.includes('\nNombre: María López García\n'), 'NIF/nombre no literales');
  exige('P1', g.prompt.includes('Régimen de IRPF (selección del usuario, literal): EDS; EDN'), 'regímenes IRPF');
  exige('P1', g.prompt.includes('Fila 1 · Epígrafe: Actividad profesional · Código de epígrafe: 123.4') && g.prompt.includes('Fila 2 · Epígrafe: Comercio minorista · Código de epígrafe: 456.7'), 'epígrafes o códigos mezclados');
  const docs1 = g.prompt.split('10. DOCUMENTACIÓN DECLARADA COMO APORTADA')[1].split('11. DOCUMENTACIÓN REALMENTE')[0];
  exige('P1', docs1.includes('- Se aporta facturas Recibidas') && docs1.includes('- Libro Facturas Recibidas') && docs1.includes('- Cuentas Bancarias') && !docs1.includes('- Contabilidad') && !docs1.includes('- DUAs'), 'documentación');
  exige('P1', g.prompt.includes('Ley 35/2006') && g.prompt.includes('Real Decreto 439/2007') && g.prompt.includes('Ley 58/2003') && !g.prompt.includes('Ley 37/1992'), 'normativa IRPF');
  exige('P1', g.revision.every((l) => l.startsWith('aacf-ok')), 'autorrevisión');
  R.pruebas.P1.extracto = g.prompt.split('7. RÉGIMEN')[1].split('11. DOCUMENTACIÓN REALMENTE')[0].split('\n').filter(Boolean).slice(0, 18);

  // ---------- Prueba 2: IVA ----------
  R.pruebas.P2 = { ok: true, fallos: [] };
  await reiniciar();
  await rellenarCliente('B12345674', 'Construcciones Muñoz Ibáñez, S.L.');
  await impuesto('IVA');
  await regimen('IVA', ['Regimen Oro', 'Regimen Bienes usados', 'Regimen General']);
  await anadirFila('Añadir epígrafe', ['Construcción completa', '501.1']);
  await anadirFila('Añadir epígrafe', ['Comercio de joyería', '659.5']);
  for (const d of ['Libro Facturas Emitidas', 'Libro Facturas Recibidas', 'DUAs']) await marcar(d);
  g = await generar(); todosLosPrompts.push(g.prompt);
  exige('P2', g.prompt.includes('Régimen de IVA (selección del usuario, literal): Regimen Oro; Regimen Bienes usados; Regimen General'), 'regímenes IVA');
  for (const t of ['EDS', 'EDN', 'Ley 35/2006', 'Real Decreto 439/2007', 'Régimen de IRPF']) exige('P2', !contiene(instrucciones(g.prompt), t), 'aparece «' + t + '» en un prompt de IVA');
  exige('P2', g.prompt.includes('Ley 37/1992') && g.prompt.includes('Real Decreto 1624/1992'), 'normativa IVA');
  exige('P2', g.revision.every((l) => l.startsWith('aacf-ok')), 'autorrevisión');

  // ---------- Prueba 3: IRNR ----------
  R.pruebas.P3 = { ok: true, fallos: [] };
  await reiniciar();
  await rellenarCliente('X1234567L', 'John Smith');
  await impuesto('IRNR');
  const z3 = await zonaVacia();
  exige('P3', z3.selectores === 0, 'IRNR muestra un selector de régimen');
  await anadirFila('Añadir epígrafe', ['Arrendamiento de inmueble', '861.1']);
  for (const d of ['Cuentas Bancarias', 'otros Informes']) await marcar(d);
  g = await generar(); todosLosPrompts.push(g.prompt);
  exige('P3', g.prompt.includes('Impuesto indicado: IRNR. No hay selector de régimen para este impuesto.'), 'texto IRNR');
  exige('P3', g.prompt.includes('Real Decreto Legislativo 5/2004') && g.prompt.includes('Real Decreto 1776/2004'), 'normativa IRNR');
  for (const t of ['EDS', 'EDN', 'Estimación Objetiva', 'Regimen General', 'Ley 37/1992', 'Ley 35/2006', 'Ley 27/2014']) exige('P3', !contiene(instrucciones(g.prompt), t), 'aparece «' + t + '» en IRNR');
  exige('P3', g.revision.every((l) => l.startsWith('aacf-ok')), 'autorrevisión');

  // ---------- Prueba 4: IS ----------
  R.pruebas.P4 = { ok: true, fallos: [] };
  await reiniciar();
  await rellenarCliente('B87654323', 'Inversiones Ejemplo, S.A.');
  await impuesto('IS');
  const regimenesIS = ['Régimen especial de entidades de reducida dimensión', 'Régimen de consolidación fiscal (grupo 12/25)', 'Régimen especial X — art. 101 «literal»'];
  for (const r of regimenesIS) await anadirFila('Añadir régimen', [r]);
  await anadirFila('Añadir epígrafe', ['Promoción inmobiliaria', '833.2']);
  for (const d of ['Contabilidad', 'Cuentas Bancarias']) await marcar(d);
  g = await generar(); todosLosPrompts.push(g.prompt);
  regimenesIS.forEach((r, i) => exige('P4', g.prompt.includes('Régimen ' + (i + 1) + ': ' + r), 'régimen IS no literal: ' + r));
  exige('P4', g.prompt.includes('Ley 27/2014') && g.prompt.includes('Real Decreto 634/2015'), 'normativa IS');
  for (const t of ['EDS', 'EDN', 'Estimación Objetiva', 'Regimen General', 'Ley 37/1992']) exige('P4', !contiene(instrucciones(g.prompt), t), 'aparece «' + t + '» en IS');
  exige('P4', g.revision.every((l) => l.startsWith('aacf-ok')), 'autorrevisión');

  // ---------- Prueba 5: cambios IRPF → IVA → IRNR → IS → IRPF ----------
  R.pruebas.P5 = { ok: true, fallos: [], pasos: [] };
  await reiniciar();
  await rellenarCliente('12345678Z', 'María López García');
  await impuesto('IRPF');
  await regimen('IRPF', ['EDS']);
  await anadirFila('Añadir epígrafe', ['Actividad A', '111.1']);
  await anadirFila('Añadir epígrafe', ['Actividad B', '222.2']);
  for (const d of ['Contabilidad', 'DUAs', 'Factura Emitidas']) await marcar(d);
  for (const imp of ['IVA', 'IRNR', 'IS', 'IRPF']) {
    await impuesto(imp);
    const z = await zonaVacia();
    const mensajes = await p.$$eval('.aacf-mensajes > div', (d) => d.map((x) => x.textContent));
    R.pruebas.P5.pasos.push({ impuesto: imp, zona: z, mensajes });
    exige('P5', z.filas === 0 && z.marcadas === 0 && z.seleccionadas === 0 && z.valoresTexto === '', 'datos arrastrados al pasar a ' + imp);
    g = await generar(); todosLosPrompts.push(g.prompt);
    if (imp !== 'IRPF') for (const t of ['EDS', 'EDN', 'Actividad A', '111.1']) exige('P5', !g.prompt.includes(t), '«' + t + '» en ' + imp);
    if (imp === 'IVA') { await regimen('IVA', ['Regimen Agencia Viaje']); await marcar('Contabilidad'); }
  }
  exige('P5', g.prompt.includes('Régimen IRPF no indicado') && g.prompt.includes('Epígrafes: no indicados') && g.prompt.includes('Documentación aportada: no indicada'), 'al volver a IRPF reaparecen datos antiguos');
  exige('P5', !g.prompt.includes('Regimen Agencia Viaje'), 'el régimen de IVA se arrastró a IRPF');

  // ---------- Prueba 6: todo vacío ----------
  R.pruebas.P6 = { ok: true, fallos: [] };
  await reiniciar();
  g = await generar();
  exige('P6', g.prompt === '' && !g.copiarActivo, 'se generó con campos vacíos');
  exige('P6', ['nif', 'nombre', 'impuesto'].every((c) => g.invalidos.includes(c)), 'campos no marcados: ' + g.invalidos.join(','));
  R.pruebas.P6.erroresJuntoAlCampo = g.erroresCampo;

  // ---------- Prueba 7: marcadores {{…}} ----------
  R.pruebas.P7 = { ok: true, fallos: [] };
  await rellenarCliente('B12345674', 'Cliente {{nombre_cliente}}');
  await impuesto('IVA');
  await anadirFila('Añadir epígrafe', ['{{epigrafe}}', '{{codigo_epigrafe}}']);
  g = await generar();
  exige('P7', g.prompt === '', 'se generó un prompt con marcadores del usuario');
  exige('P7', g.invalidos.includes('nombre') && g.invalidos.some((x) => x.startsWith('epigrafe-')) && g.invalidos.some((x) => x.startsWith('codigo-')), 'no se identificó el campo con el marcador');
  R.pruebas.P7.mensajes = g.mensajes.map((m) => m.slice(0, 260));
  const directo = await p.evaluate(() => {
    const CF = window.AAConfiguracionFiscal;
    const estado = CF.crearEstadoInicial();
    estado.cliente = { nif: 'B12345674', nombre: 'Prueba' };
    estado.impuesto = 'IVA';
    estado.configuracion = CF.crearConfiguracionImpuesto('IVA');
    const datos = { documentos: [{ nombre_archivo: 'plantilla.docx', estado: 'completado', contenido_extraido: 'Estimado {{nif_cliente}}, {{{impuesto}}} y texto oculto ‮abc', sourceRef: 'aa://document/1' }] };
    const r = CF.construirPrompt({ estado, datosExtraccion: datos });
    const bloque = r.prompt.split(/===== INICIO DOCUMENT_DATA \[[^\]]+\] =====\n/)[1].split(/\n===== FIN DOCUMENT_DATA/)[0];
    return { ok: r.ok, marcadoresEnPrompt: (r.prompt.match(/\{\{/g) || []).length, invisiblesEnPrompt: /‮/.test(r.prompt), equivalente: JSON.stringify(JSON.parse(bloque)) === JSON.stringify(datos), revision: r.revision.map((x) => x.nombre + ':' + x.ok) };
  });
  R.pruebas.P7.documentoConMarcadores = directo;
  exige('P7', directo.ok && directo.marcadoresEnPrompt === 0 && !directo.invisiblesEnPrompt && directo.equivalente, 'los «{{» del documento no se escaparon sin pérdida');
  exige('P7', todosLosPrompts.every((t) => !/\{\{/.test(t)), 'algún prompt de las pruebas contiene «{{»');

  // ---------- Prueba 8: el JSON de extracción no cambia (archivo no congelado) ----------
  R.pruebas.P8 = { ok: true, fallos: [] };
  await reiniciar();
  const ejemplo = await p.evaluate(() => JSON.stringify(window.AACF_EJEMPLO_EXTRACCION));
  const rutaJSON = path.join(os.tmpdir(), 'extraccion-prueba-aacf.json');
  fs.writeFileSync(rutaJSON, ejemplo);
  await p.check('#origenArchivo');
  await p.setInputFiles('#archivoJSON', rutaJSON);
  await p.waitForFunction(() => /JSON cargado/.test(document.getElementById('estadoDatos').textContent));
  await rellenarCliente('B12345674', 'Construcciones Muñoz Ibáñez, S.L.');
  await impuesto('IVA');
  await marcar('Libro Facturas Emitidas');
  g = await generar(); todosLosPrompts.push(g.prompt);
  const intacto = await p.evaluate((original) => {
    // El JSON del archivo vive en el cierre de la página de prueba; se compara a través del prompt y de una segunda generación.
    const bloque = document.querySelector('.aacf-prompt').value.split(/===== INICIO DOCUMENT_DATA \[[^\]]+\] =====\n/)[1].split(/\n===== FIN DOCUMENT_DATA/)[0];
    return JSON.stringify(JSON.parse(bloque)) === original;
  }, ejemplo);
  const g2 = await generar();
  const bloque2 = g2.prompt.split(/===== INICIO DOCUMENT_DATA \[[^\]]+\] =====\n/)[1].split(/\n===== FIN DOCUMENT_DATA/)[0];
  exige('P8', intacto && JSON.stringify(JSON.parse(bloque2)) === ejemplo, 'el JSON de extracción cambió');
  exige('P8', g.revision.some((l) => l.includes('json_extraccion_intacto') && l.startsWith('aacf-ok')), 'autorrevisión json_extraccion_intacto');
  const congelado = await p.evaluate(() => { const CF = window.AAConfiguracionFiscal; const e = CF.crearEstadoInicial(); e.cliente = { nif: 'B12345674', nombre: 'X' }; e.impuesto = 'IS'; e.configuracion = CF.crearConfiguracionImpuesto('IS'); const r = CF.construirPrompt({ estado: e, datosExtraccion: window.AACF_EJEMPLO_EXTRACCION }); return { ok: r.ok, sigueCongelado: Object.isFrozen(window.AACF_EJEMPLO_EXTRACCION.documentos[0]) }; });
  exige('P8', congelado.ok && congelado.sigueCongelado, 'falló con el ejemplo congelado (intentó modificarlo)');
  R.pruebas.P8.detalle = { intacto, congelado };

  // ---------- Prueba 9: referencias sourceRef / nativeRef / aa:// ----------
  R.pruebas.P9 = { ok: true, fallos: [] };
  const contarRef = (texto) => ({ aa: (texto.match(/aa:\/\/document\//g) || []).length, sourceRef: (texto.match(/"sourceRef"/g) || []).length, nativeRef: (texto.match(/"nativeRef"/g) || []).length });
  const enOriginal = contarRef(ejemplo);
  const enDatos = contarRef(JSON.stringify(JSON.parse(bloque2)));
  exige('P9', JSON.stringify(enOriginal) === JSON.stringify(enDatos), 'se perdieron referencias en DOCUMENT_DATA');
  exige('P9', g2.prompt.includes('/documentos/2/sourceRef = "aa://document/c41d09"') && g2.prompt.includes('/documentos/3/registros/1/nativeRef = "Recibidas!A3:I3"'), 'la sección de trazabilidad no cita las referencias');
  R.pruebas.P9.recuento = { original: enOriginal, documentData: enDatos };

  // ---------- Prueba 10: documentos parciales, baja confianza o advertencias ----------
  R.pruebas.P10 = { ok: true, fallos: [] };
  const filas = g2.prompt.split('\n').filter((l) => /^\d+ \| "/.test(l));
  const fila = (nombre) => filas.find((l) => l.includes('"' + nombre + '"')) || '';
  exige('P10', fila('ticket-restaurante.jpg').includes('NO completamente fiable'), 'el ticket parcial y de baja confianza aparece como fiable');
  exige('P10', fila('extracto-banco-enero-2025.pdf').includes('NO completamente fiable'), 'el extracto con advertencia aparece como fiable');
  exige('P10', fila('contrato-con-macros.docm').includes('NO completamente fiable'), 'el documento bloqueado aparece como fiable');
  exige('P10', fila('libro-emitidas-1T-2025.xlsx').includes('completa según el analizador'), 'el libro completo no se reconoce como completo');
  R.pruebas.P10.filas = filas.map((l) => l.slice(0, 220));

  // ---------- Red y errores ----------
  R.red.peticionesNoLocales = peticiones.filter((u) => !/^(file|data|blob):/.test(u));
  R.red.violacionesCSP = await p.evaluate(() => window.__csp);
  R.resumen = Object.fromEntries(Object.entries(R.pruebas).map(([k, v]) => [k, v.ok ? 'OK' : 'FALLA: ' + v.fallos.join(' | ')]));
  R.todoOK = Object.values(R.pruebas).every((v) => v.ok) && R.red.peticionesNoLocales.length === 0 && R.errores.length === 0;
  await p.screenshot({ path: process.argv[2] || path.join(os.tmpdir(), 'aacf.png'), fullPage: true });
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})().catch((e) => { console.error('FALLO DEL ARNÉS', e); process.exit(1); });
