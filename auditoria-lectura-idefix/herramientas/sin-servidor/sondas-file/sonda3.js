(async () => {
  const out = []; window.__paso = out;
  const b = (k) => Uint8Array.from(atob(window.__P[k]), (c) => c.charCodeAt(0));
  try {
    const um = URL.createObjectURL(new Blob([b('pdfmjs')], { type: 'text/javascript' }));
    const pdfjs = await import(um); out.push('import(blob) OK ' + pdfjs.version);
    let texto = new TextDecoder().decode(b('pdfworker'));
    const nMeta = texto.split('import.meta.url').length - 1;
    texto = texto.split('import.meta.url').join('self.location.href').replace(/\nexport \{ WorkerMessageHandler \};\n/, '\n');
    out.push('import.meta sustituidos: ' + nMeta + ' · export quitado: ' + !/\nexport \{/.test(texto));
    const uw = URL.createObjectURL(new Blob([texto], { type: 'text/javascript' }));
    const port = new Worker(uw, { name: 'pdfjs' });
    port.onerror = (e) => out.push('error worker: ' + e.message);
    const w = new pdfjs.PDFWorker({ port });
    const doc = await pdfjs.getDocument({ worker: w, data: b('doc'), useWorkerFetch: false, disableFontFace: true }).promise;
    const p = await doc.getPage(1); const t = await p.getTextContent();
    out.push('páginas ' + doc.numPages + ' · texto: ' + t.items.map((i) => i.str).join(' ').slice(0, 90));
  } catch (e) { out.push('ERROR ' + e.name + ': ' + e.message); }
  window.__fin = out;
})();
