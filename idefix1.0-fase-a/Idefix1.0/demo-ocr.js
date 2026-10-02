/* ==========================================================================
   Idefix1.0 — demo-ocr.js
   Demostración: cargar una imagen y reconocer su texto en español con
   Tesseract.js 7.0.0 LOCAL, mediante AnalizadorArchivosAPI.crearOCRLocal
   (la misma carga verificada por SHA-256 que usa la aplicación).
   Dependencias: analizador-archivos.js (cargado antes, sin autoarranque),
   vendor/manifiesto-integridad.json, vendor/tesseract/*, vendor/tesseract-core/*,
   vendor/tessdata/spa.traineddata.gz.
   Solo JavaScript nativo. Ningún texto de la imagen se inserta como HTML.
   ========================================================================== */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const ui = {
    sinArrancar: $("sin-arrancar"), panel: $("panel"), red: $("red"), origen: $("estado-origen"), motor: $("estado-motor"),
    zona: $("zona"), archivo: $("archivo"), vista: $("vista"), lienzo: $("lienzo"), vistaDatos: $("vista-datos"),
    reconocer: $("reconocer"), cancelar: $("cancelar"), copiar: $("copiar"), mensaje: $("mensaje"), progreso: $("progreso"),
    resultado: $("resultado"), tablaLineas: $("tabla-lineas").tBodies[0], redResumen: $("red-resumen"), tablaRed: $("tabla-red").tBodies[0],
    redCsp: $("red-csp")
  };
  let ocr = null;          // instancia de crearOCRLocal (se crea al primer uso y se reutiliza)
  let imagen = null;       // File elegido
  let control = null;      // AbortController del reconocimiento en curso

  const mensaje = (texto, tipo = "") => { ui.mensaje.className = `mensaje ${tipo}`.trim(); ui.mensaje.textContent = texto; };
  const progreso = activo => { ui.progreso.hidden = !activo; };

  // ---------- Comprobación de red (página) ----------
  const vistos = new Set();
  let externas = 0;
  const bloqueos = [];
  const registrarRecurso = url => {
    if (vistos.has(url)) return;
    vistos.add(url);
    let origen;
    try { origen = new URL(url, location.href).origin; } catch { origen = "?"; }
    const propio = origen === location.origin || url.startsWith("blob:") || url.startsWith("data:");
    if (!propio) externas++;
    const tr = document.createElement("tr");
    const a = document.createElement("td"); a.textContent = url.length > 110 ? `${url.slice(0, 107)}…` : url; a.title = url;
    const b = document.createElement("td"); b.textContent = propio ? "este servidor local" : `EXTERNO (${origen})`;
    b.className = propio ? "ok" : "mal";
    tr.append(a, b);
    ui.tablaRed.appendChild(tr);
    actualizarResumenRed();
  };
  const actualizarResumenRed = () => {
    ui.redResumen.className = `red-resumen ${externas ? "mal" : "ok"}`;
    ui.redResumen.textContent = `${vistos.size} recurso(s) pedidos por la página · peticiones externas: ${externas}` +
      ` · intentos bloqueados por la CSP: ${bloqueos.length}`;
  };
  try {
    for (const e of performance.getEntriesByType("resource")) registrarRecurso(e.name);
    new PerformanceObserver(lista => { for (const e of lista.getEntries()) registrarRecurso(e.name); })
      .observe({ type: "resource", buffered: true });
  } catch { /* Resource Timing no disponible: queda la CSP y DevTools */ }
  document.addEventListener("securitypolicyviolation", e => {
    bloqueos.push(`${e.effectiveDirective}: ${e.blockedURI || "(en línea)"}`);
    ui.redCsp.textContent = `Bloqueado por la CSP: ${bloqueos.slice(-5).join(" · ")}`;
    actualizarResumenRed();
  });

  // ---------- Arranque ----------
  if (typeof globalThis.AnalizadorArchivosAPI?.crearOCRLocal !== "function") {
    // analizador-archivos.js no se cargó (file://, integrity distinta o archivo ausente): el aviso estático sigue visible.
    return;
  }
  ui.sinArrancar.hidden = true;
  ui.panel.hidden = false;
  ui.red.hidden = false;
  ui.origen.textContent = `Servido desde ${location.origin}`;
  ui.origen.className = `pastilla ${/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? "ok" : ""}`;
  actualizarResumenRed();

  // ---------- Elegir imagen ----------
  const elegir = async file => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) {
      mensaje("Elige una imagen PNG o JPEG.", "error");
      return;
    }
    imagen = file;
    ui.resultado.value = "";
    ui.tablaLineas.replaceChildren();
    ui.copiar.disabled = true;
    ui.reconocer.disabled = false;
    mensaje(`Imagen lista: ${file.name} (${(file.size / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} KB).`);
    // Vista previa con un lienzo (createImageBitmap no hace ninguna petición y la CSP no necesita img-src).
    try {
      const bmp = await createImageBitmap(file);
      const escala = Math.min(1, 720 / bmp.width);
      ui.lienzo.width = Math.max(1, Math.round(bmp.width * escala));
      ui.lienzo.height = Math.max(1, Math.round(bmp.height * escala));
      ui.lienzo.getContext("2d").drawImage(bmp, 0, 0, ui.lienzo.width, ui.lienzo.height);
      ui.vistaDatos.textContent = `${bmp.width} × ${bmp.height} píxeles`;
      bmp.close();
      ui.vista.hidden = false;
    } catch {
      ui.vista.hidden = true;
      mensaje("El navegador no puede decodificar esta imagen; puedes intentar el OCR igualmente.", "aviso");
    }
  };
  ui.zona.addEventListener("click", () => ui.archivo.click());
  ui.zona.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ui.archivo.click(); } });
  ui.archivo.addEventListener("change", () => { elegir(ui.archivo.files?.[0]); ui.archivo.value = ""; });
  ui.zona.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; ui.zona.classList.add("encima"); });
  ui.zona.addEventListener("dragleave", () => ui.zona.classList.remove("encima"));
  ui.zona.addEventListener("drop", e => { e.preventDefault(); ui.zona.classList.remove("encima"); elegir(e.dataTransfer.files?.[0]); });
  // Soltar fuera de la zona no abre la imagen en la pestaña.
  addEventListener("dragover", e => e.preventDefault());
  addEventListener("drop", e => { if (!ui.zona.contains(e.target)) e.preventDefault(); });

  // ---------- Reconocer ----------
  ui.reconocer.addEventListener("click", async () => {
    if (!imagen) return;
    ui.reconocer.disabled = true;
    ui.cancelar.disabled = false;
    progreso(true);
    control = new AbortController();
    try {
      if (!ocr) {
        mensaje("Cargando Tesseract.js, su núcleo WebAssembly y el modelo de español (se verifica el SHA-256 de cada archivo)…");
        ui.motor.textContent = "Motor OCR: cargando…";
        ocr = await AnalizadorArchivosAPI.crearOCRLocal({ idiomas: ["spa"] });
        ui.motor.textContent = "Motor OCR: Tesseract.js local · español (spa) · verificado";
        ui.motor.className = "pastilla ok";
      }
      mensaje("Reconociendo el texto…");
      const r = await ocr.reconocer(imagen, { signal: control.signal });
      ui.resultado.value = r.texto;
      ui.tablaLineas.replaceChildren(...r.lineas.map((l, i) => {
        const tr = document.createElement("tr");
        for (const v of [String(i + 1), l.texto, l.confianza === null ? "—" : `${Math.round(l.confianza * 100)} %`]) {
          const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
        }
        return tr;
      }));
      ui.copiar.disabled = !r.texto;
      mensaje(r.texto
        ? `Listo: ${r.lineas.length} línea(s) en ${(r.ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} s · confianza media ${r.confianza_media === null ? "—" : Math.round(r.confianza_media * 100) + " %"}.`
        : "No se ha reconocido texto en la imagen.", r.texto ? "ok" : "aviso");
    } catch (error) {
      const cancelado = error?.name === "AbortError";
      if (!cancelado && !ocr) { ui.motor.textContent = "Motor OCR: no disponible"; ui.motor.className = "pastilla mal"; }
      mensaje(cancelado ? "Reconocimiento cancelado." : `No se pudo hacer el OCR: ${String(error?.message || error).slice(0, 600)}`, cancelado ? "aviso" : "error");
    } finally {
      control = null;
      progreso(false);
      ui.cancelar.disabled = true;
      ui.reconocer.disabled = !imagen;
    }
  });
  ui.cancelar.addEventListener("click", () => control?.abort());
  ui.copiar.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(ui.resultado.value); mensaje("Texto copiado al portapapeles.", "ok"); }
    catch { ui.resultado.select(); mensaje("No se pudo copiar automáticamente: el texto está seleccionado, usa Ctrl+C.", "aviso"); }
  });
  addEventListener("pagehide", () => { ocr?.terminar().catch(() => {}); });
})();
