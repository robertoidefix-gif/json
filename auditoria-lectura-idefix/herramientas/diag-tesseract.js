window.__diag = async (b64, idiomas, psm) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const w = await Tesseract.createWorker(idiomas, 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract-core/', langPath: 'vendor/tessdata/', gzip: true, cacheMethod: 'none' });
  if (psm) await w.setParameters({ tessedit_pageseg_mode: String(psm) });
  const r = await w.recognize(new Blob([u]), {}, { text: true, blocks: true });
  await w.terminate();
  const bloques = (r.data.blocks || []).map(b => ({ tipo: b.blocktype, conf: b.confidence, lineas: b.paragraphs.flatMap(p => p.lines.map(l => l.text.trim())) }));
  return { texto: r.data.text, bloques };
};
