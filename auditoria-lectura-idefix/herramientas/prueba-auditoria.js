// Arnés de auditoría: crea el analizador con la API pública (mismo código sellado que index.html).
window.__crear = async (opciones) => {
  window.__aa = await crearAnalizadorArchivos(Object.assign({ idContenedor: 'contenedorPrueba', permitirAPIResultados: true }, opciones || {}));
  return true;
};
window.__analizar = async (b64, nombre, tipo, cajetilla) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const archivo = new File([u], nombre, { type: tipo || '' });
  const t0 = performance.now();
  try { const r = await window.__aa.analizarArchivo(archivo, { cajetilla }); return { ok: true, ms: Math.round(performance.now() - t0), resultado: r }; }
  catch (e) { return { ok: false, ms: Math.round(performance.now() - t0), error: String(e && e.message || e) }; }
};
