(async () => {
  const out = []; const r = document.getElementById('r');
  const b = (k) => Uint8Array.from(atob(window.__P[k]), (c) => c.charCodeAt(0));
  try {
    const um = URL.createObjectURL(new Blob([b('pdfmjs')], { type: 'text/javascript' }));
    const uw = URL.createObjectURL(new Blob([b('pdfworker')], { type: 'text/javascript' }));
    out.push('protocolo ' + location.protocol); window.__paso = out;
    window.__paso = out; const pdfjs = await import(um); out.push('import(blob) OK version ' + pdfjs.version);
    const port = new Worker(uw, { type: 'module', name: 'pdfjs' }); out.push('Worker módulo blob creado');
    const w = new pdfjs.PDFWorker({ port });
    const doc = await pdfjs.getDocument({ worker: w, data: b('doc'), useWorkerFetch: false, disableFontFace: true, isEvalSupported: false }).promise;
    const p = await doc.getPage(1); const t = await p.getTextContent();
    out.push('páginas ' + doc.numPages + ' · texto: ' + t.items.map((i) => i.str).join(' ').slice(0, 80));
  } catch (e) { out.push('ERROR ' + e.name + ': ' + e.message); }
  r.textContent = out.join('\n'); window.__fin = out;
})();
