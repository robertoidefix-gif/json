(async () => {
  const out = []; window.__paso = out;
  const b = (k) => Uint8Array.from(atob(window.__P[k]), (c) => c.charCodeAt(0));
  const uw = URL.createObjectURL(new Blob([b('pdfworker')], { type: 'text/javascript' }));
  const prueba = (nombre, crear) => new Promise((res) => {
    let w; try { w = crear(); } catch (e) { out.push(nombre + ': excepción ' + e.message); return res(); }
    const t = setTimeout(() => { out.push(nombre + ': sin respuesta'); w.terminate(); res(); }, 4000);
    w.onerror = (e) => { clearTimeout(t); out.push(nombre + ': error «' + (e.message || 'sin mensaje') + '»'); w.terminate(); res(); };
    w.onmessage = (e) => { clearTimeout(t); out.push(nombre + ': mensaje ' + JSON.stringify(e.data).slice(0, 80)); w.terminate(); res(); };
    w.postMessage({ sourceName: 'x', targetName: 'y', action: 'test', data: new Uint8Array([1]) });
  });
  await prueba('módulo blob (pdf.worker.mjs)', () => new Worker(uw, { type: 'module' }));
  const um2 = URL.createObjectURL(new Blob(['postMessage("hola módulo")'], { type: 'text/javascript' }));
  await prueba('módulo blob trivial', () => new Worker(um2, { type: 'module' }));
  const uc = URL.createObjectURL(new Blob(['postMessage("hola clásico")'], { type: 'text/javascript' }));
  await prueba('clásico blob trivial', () => new Worker(uc));
  window.__fin = out;
})();
