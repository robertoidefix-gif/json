/*
  Fase F (F9): pruebas automáticas del corpus de auditoría SIN Node.js.
  Analiza con Idefix1.0 (la misma API pública que index.html) los documentos de la carpeta elegida y evalúa cada
  resultado con las mismas reglas que auditoria-lectura-idefix/herramientas/evaluar.py y consolidar.py.
  Seguridad: solo lee los archivos que el usuario elige; no hay red (CSP connect-src 'none'); todo texto procedente
  de los documentos se muestra con textContent (nunca como HTML); las expresiones de verdad-pruebas.json se usan
  solo con RegExp (nunca eval ni new Function).
*/
/* global crearAnalizadorArchivos, AnalizadorArchivos -- los define analizador-archivos.js, cargado antes */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const ESPACIOS_DUROS = new RegExp(`[${String.fromCharCode(0xA0)}${String.fromCharCode(0x202F)}]`, "g");
  const norm = s => String(s ?? "").normalize("NFC").replace(ESPACIOS_DUROS, " ").replace(/\s+/g, " ").trim();
  const textoCelda = c => {
    const v = c.raw ?? c.value;
    return v === null || v === undefined ? "" : String(v);
  };
  const valor = o => (o && typeof o === "object" && !Array.isArray(o) ? o.valor : null);
  const num = x => {
    if (typeof x === "number") return Number.isFinite(x) ? x : null;
    if (typeof x !== "string" || !x.trim()) return null;
    const n = Number(x.trim());
    return Number.isFinite(n) ? n : null;
  };
  const issues = r => r.diagnostics?.issues || [];
  const hallazgos = r => r.seguridad_contenido?.patrones_sospechosos_detectados || [];
  /** Patrón de verdad-pruebas.json; «(?i)» al principio (sintaxis de Python) pasa a la opción «i». */
  const patron = p => (String(p).startsWith("(?i)") ? new RegExp(String(p).slice(4), "i") : new RegExp(String(p)));

  /* ---------- Texto del resultado (igual que textos() de evaluar.py) ---------- */
  function textos(res) {
    const c = res.content || {};
    const tablas = new Map((c.tables || []).map(t => [t.id, t]));
    const partes = [];
    const usadas = new Set();
    const filasDe = t => t.rows.map(f => f.cells.map(textoCelda).filter(Boolean).join(" "));
    for (const b of c.blocks || []) {
      if (b.kind === "table" && tablas.has(b.tableId)) {
        const t = tablas.get(b.tableId);
        usadas.add(t.id);
        if (t.origin !== "heuristic") partes.push(...filasDe(t));
      } else if (b.text) {
        partes.push(b.text);
      }
    }
    for (const [id, t] of tablas) if (!usadas.has(id) && t.origin !== "heuristic") partes.push(...filasDe(t));
    return partes.join("\n");
  }

  const tokens = s => norm(s).match(/[\p{L}\p{N}_À-ÿ€%/.,:-]+/gu) || [];
  function recallPalabras(extraido, verdad) {
    const a = new Map();
    for (const t of tokens(extraido)) a.set(t, (a.get(t) || 0) + 1);
    const b = new Map();
    for (const t of tokens(verdad)) b.set(t, (b.get(t) || 0) + 1);
    let total = 0, acierto = 0;
    for (const [k, v] of b) { total += v; acierto += Math.min(a.get(k) || 0, v); }
    return total ? acierto / total : null;
  }
  /** Distancia de Levenshtein por puntos de código (como rapidfuzz). */
  function levenshtein(x, y) {
    const a = Array.from(x), b = Array.from(y);
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  const cer = (extraido, verdad) => levenshtein(norm(extraido), norm(verdad)) / Math.max(1, Array.from(norm(verdad)).length);

  /* ---------- Factura, tabla de líneas y libro ---------- */
  function evalFactura(res, texto, V) {
    const F = V.factura;
    const doc = res.documento || {};
    const inf = res.importes?.inferidos || {};
    const nifs = (res.partes?.nifs_mencionados || []).map(valor);
    const titular = res.partes?.titular?.nif;
    if (titular && typeof titular === "object" && valor(titular)) nifs.push(valor(titular));
    const campos = {
      numero: valor(doc.numero_documento) === F.numero,
      fecha: valor(doc.fecha_documento) === F.fecha_iso,
      nif_emisor: nifs.includes(F.nif_emisor),
      nif_cliente: nifs.includes(F.nif_cliente),
      base: num(valor(inf.base_imponible)) === F.base,
      cuota: num(valor(inf.cuota_iva)) === F.cuota,
      total: num(valor(inf.total)) === F.total
    };
    return { campos, campos_ok: Object.values(campos).filter(Boolean).length, campos_total: 7,
      recall_palabras: recallPalabras(texto, F.texto), cer: cer(texto, F.texto) };
  }

  function mejorTabla(res, verdadFilas) {
    let mejor = [0, null];
    const total = verdadFilas.reduce((a, f) => a + f.length, 0);
    for (const t of res.content?.tables || []) {
      const filas = t.rows.map(f => f.cells.map(c => norm(textoCelda(c))));
      let aciertos = 0;
      for (const vf of verdadFilas) {
        let best = 0;
        for (const f of filas) best = Math.max(best, vf.filter((v, j) => j < f.length && f[j] === norm(v)).length);
        aciertos += best;
      }
      if (aciertos / total > mejor[0]) mejor = [aciertos / total, t.id];
    }
    return mejor;
  }

  const CAMPOS_LIBRO = ["fecha_expedicion", "serie", "numero_factura", "nif_destinatario", "nombre_destinatario", "base_imponible",
    "tipo_iva", "cuota_iva", "total"];
  const NUMERICOS = new Set(["base_imponible", "tipo_iva", "cuota_iva", "total"]);
  const igual = (campo, a, b) => (NUMERICOS.has(campo) ? num(a) !== null && Math.abs(num(a) - b) < 0.005
    : a !== null && a !== undefined && norm(a) === norm(b));

  function evalLibro(res, nombre, V) {
    const de = res.datos_especificos || {};
    const regs = de.registros || [];
    const verdad = nombre === "libro60" ? V.libro60 : V.libro;
    const porNum = new Map();
    for (const r of regs) {
      const n = r.valores?.numero_factura;
      if (n !== null && n !== undefined && !porNum.has(norm(n))) porNum.set(norm(n), r);
    }
    let ok = 0;
    verdad.forEach((v, i) => {
      const r = porNum.get(norm(v.numero_factura)) ?? (i < regs.length ? regs[i] : null);
      const vals = r?.valores || {};
      for (const c of CAMPOS_LIBRO) if (igual(c, vals[c], v[c])) ok++;
    });
    const tot = de.resumen?.totales || {};
    const suma = k => verdad.reduce((a, x) => a + x[k], 0);
    const totalesOk = Object.fromEntries(["base_imponible", "cuota_iva", "total"]
      .map(k => [k, num(valor(tot[k])) !== null && Math.abs(num(valor(tot[k])) - suma(k)) < 0.01]));
    const totalCampos = verdad.length * CAMPOS_LIBRO.length;
    return { registros: regs.length, registros_esperados: verdad.length, campos_ok: ok, campos_total: totalCampos,
      exactitud_campos: ok / totalCampos, totales_ok: totalesOk };
  }

  /* ---------- Comprobaciones específicas (check() de evaluar.py) ---------- */
  function celdaBajoCabecera(ch, res) {
    for (const tb of res.content?.tables || []) {
      const ids = new Map(tb.columns.map(c => [c.id, c.label]));
      for (const f of tb.rows) {
        if (!f.cells.some(c => norm(textoCelda(c)).includes(norm(ch.fila_contiene)))) continue;
        for (const c of f.cells) {
          if (norm(ids.get(c.columnId) || "") === norm(ch.columna)) {
            return [norm(textoCelda(c)) === norm(ch.valor), `bajo «${ch.columna}» hay «${textoCelda(c)}»`];
          }
        }
        return [false, `columna «${ch.columna}» vacía en esa fila`];
      }
    }
    return [false, "fila no encontrada"];
  }

  function cadenasExactas(res, V) {
    const tb = (res.content?.tables || [])[0];
    if (!tb) return [false, "sin tabla"];
    const col1 = tb.columns[0].id;
    const vistos = [];
    for (const f of tb.rows) for (const c of f.cells) if (c.columnId === col1) vistos.push(textoCelda(c));
    const ok = V.cadenas.filter((x, i) => i < vistos.length && vistos[i] === x).length;
    return [ok === V.cadenas.length, `${ok}/${V.cadenas.length} cadenas idénticas`];
  }

  function variasFacturas(ch, res, nt) {
    const fd = res.documento?.facturas_detectadas || [];
    const nums = fd.map(f => valor(f.numero_documento));
    const tots = fd.map(f => valor(f.total));
    const ok = JSON.stringify(nums) === JSON.stringify(ch.numeros) && tots.length === ch.totales.length &&
      tots.every((a, i) => typeof a === "number" && Math.abs(a - ch.totales[i]) < 0.005);
    const presentes = ch.numeros.filter(n => nt.includes(n)).length;
    return [ok, `texto: ${presentes}/3 números presentes; facturas_detectadas=${fd.length} ${JSON.stringify(nums)} totales ${JSON.stringify(tots)}`];
  }

  const COMPROBACIONES = {
    contiene: (ch, res, nt) => [nt.includes(norm(ch.texto)), null],
    no_contiene: (ch, res, nt) => [!nt.includes(norm(ch.texto)), null],
    contiene_en_algun_sitio: (ch, res) => [norm(JSON.stringify(res.content || {})).includes(norm(ch.texto)), null],
    numeracion_lista: (ch, res, nt) => {
      const n = ch.items.filter(x => nt.includes(norm(x))).length;
      return [n === ch.items.length, `${n}/${ch.items.length} con su número`];
    },
    titulos: (ch, res) => {
      const n = (res.content?.blocks || []).filter(b => b.kind === "heading").length;
      return [n === ch.n, `${n} títulos`];
    },
    aviso_esperado: (ch, res) => [issues(res).some(i => patron(ch.patron).test(`${i.message || ""} ${i.code || ""}`)), null],
    oculto_marcado: (ch, res) => [hallazgos(res).some(h => String(h.tipo || "").startsWith("texto_oculto") &&
      String(h.fragmento_seguro || "").includes(ch.marca)), null],
    inyeccion_detectada: (ch, res) => [hallazgos(res).some(h => ["prompt_injection", "suplantacion_delimitador"].includes(h.tipo) &&
      String(h.fragmento_seguro || "").includes(ch.marca)), null],
    apariciones: (ch, res, nt) => {
      const n = norm(ch.texto) ? nt.split(norm(ch.texto)).length - 1 : 0;
      return [n === ch.n, `${n} apariciones`];
    },
    celda_bajo_cabecera: (ch, res) => celdaBajoCabecera(ch, res),
    hoja_oculta_marcada: (ch, res) => [(res.metadata?.sheets || []).some(h => h.name === ch.hoja && ["hidden", "veryHidden"].includes(h.state)), null],
    truncado_avisado: (ch, res) => {
      const cods = issues(res).map(i => i.code).filter(Boolean);
      return [cods.includes("XLSX_ROWS_TRUNCATED"), cods.join(", ")];
    },
    rechazo_controlado: (ch, res, nt, bruto) => {
      const st = res.processing?.status;
      const msgs = issues(res).map(i => i.message || "").join(" | ");
      let ok = Boolean(bruto.ok) && st === "failed" && Boolean(msgs);
      if (ok && ch.patron) ok = patron(ch.patron).test(msgs);
      return [ok, `estado=${st}; ${msgs.slice(0, 220)}`];
    },
    cadenas_exactas: (ch, res, nt, bruto, V) => cadenasExactas(res, V),
    varias_facturas: (ch, res, nt) => variasFacturas(ch, res, nt),
    sin_tablas_falsas: (ch, res) => {
      const n = (res.content?.tables || []).length;
      return [n === 0, `${n} tabla(s) detectada(s)`];
    }
  };

  function ordenLectura(texto, V) {
    const nt = norm(texto);
    const pos = V.dos_columnas.map(p => nt.indexOf(norm(p)));
    const contiguos = pos.filter(p => p >= 0).length;
    const enOrden = pos.every(p => p >= 0) && pos.every((p, i) => i === 0 || pos[i - 1] < p);
    return { parrafos_contiguos: contiguos, parrafos: pos.length, en_orden: enOrden };
  }

  /** Evaluación de un caso (bucle principal de evaluar.py). */
  function evaluar(d, bruto, V) {
    const res = bruto.resultado || {};
    const texto = textos(res);
    const nt = norm(texto);
    const e = { id: d.id, estado: res.processing?.status ?? null, ms: bruto.ms, checks: [] };
    for (const ch of d.checks) {
      if (ch === "campos_factura") e.factura = evalFactura(res, texto, V);
      else if (ch === "tabla_lineas") e.tabla_lineas = { exactitud_celdas: mejorTabla(res, V.factura.tabla)[0] };
      else if (ch === "registros") e.libro = evalLibro(res, d.verdad, V);
      else if (ch === "fila_total_excluida") e.fila_total_excluida = (res.datos_especificos?.resumen?.filas_totales_documento || []).length === 1;
      else if (ch === "orden_lectura") e.orden_lectura = ordenLectura(texto, V);
      else if (ch === "sin_mojibake") e.sin_mojibake = texto.includes("Ibáñez") && texto.includes("€") && !texto.includes("Ã");
      else if (ch && typeof ch === "object") {
        const f = COMPROBACIONES[ch.tipo];
        const [ok, detalle] = f ? f(ch, res, nt, bruto, V) : [null, `comprobación desconocida ${ch.tipo}`];
        e.checks.push({ tipo: ch.tipo, ok, detalle });
      }
    }
    if (d.verdad === "factura" && !e.factura) e.factura = evalFactura(res, texto, V);
    return e;
  }

  /* ---------- Veredicto (veredicto() de consolidar.py) ---------- */
  const pct = x => `${Math.round(x * 100)} %`;
  function veredictoHtml05(e, res) {
    const H = hallazgos(res);
    const conPrefijo = tipo => [...new Set(H.filter(h => h.tipo === tipo && String(h.fragmento_seguro || "").startsWith("OC_"))
      .map(h => h.fragmento_seguro.slice(0, 4)))];
    const marcados = conPrefijo("texto_oculto_html");
    const inyec = conPrefijo("prompt_injection");
    const txt = `datos fiscales ${e.factura.campos_ok}/7 · texto oculto marcado: ${marcados.length}/8 · instrucción detectada en ${inyec.length}/8`;
    if (e.factura.campos_ok === 7 && marcados.length === 8 && inyec.length === 8) return ["✅", txt];
    return [marcados.length || e.factura.campos_ok >= 4 ? "⚠️" : "❌", txt];
  }
  function veredictoHtml13(res, V) {
    const bloques = res.content?.blocks || [];
    const detectadas = new Set();
    for (const h of hallazgos(res)) {
      const m = /^\/content\/blocks\/(\d+)\/text$/.exec(h.campo || "");
      if (m && ["prompt_injection", "suplantacion_delimitador"].includes(h.tipo)) detectadas.add(String(bloques[Number(m[1])]?.text || "").slice(0, 5));
    }
    const n = V.inyecciones_html13.filter(([k]) => k !== "INY10" && detectadas.has(k)).length;
    return [n === 10 ? "✅" : n ? "⚠️" : "❌", `${n}/10 variantes de instrucciones detectadas`];
  }
  function veredictoFactura(e, extraOk) {
    const f = e.factura;
    const tabla = e.tabla_lineas?.exactitud_celdas ?? null;
    const ok = extraOk && e.sin_mojibake !== false;
    const txt = `datos fiscales ${f.campos_ok}/7 · texto ${pct(f.recall_palabras)}` + (tabla === null ? "" : ` · tabla de líneas ${pct(tabla)}`);
    if (f.campos_ok === 7 && f.recall_palabras >= 0.95 && (tabla === null || tabla >= 0.95) && ok) return ["✅", txt];
    return [f.campos_ok >= 4 || f.recall_palabras >= 0.8 ? "⚠️" : "❌", txt];
  }
  function veredictoLibro(e, extraOk) {
    const l = e.libro;
    const ok = extraOk && (e.fila_total_excluida === undefined || e.fila_total_excluida);
    const txt = `registros ${l.registros}/${l.registros_esperados} · campos ${(l.exactitud_campos * 100).toFixed(1)} % · ` +
      `totales ${Object.values(l.totales_ok).filter(Boolean).length}/3`;
    if (l.registros === l.registros_esperados && l.exactitud_campos === 1 && ok) return ["✅", txt];
    return [l.exactitud_campos >= 0.8 ? "⚠️" : "❌", txt];
  }
  function veredicto(e, d, res, V) {
    const checks = e.checks;
    const extraOk = checks.every(c => c.ok);
    if (d.verdad === "error" || d.verdad === "error_o_parcial") {
      const c = checks[0] || { ok: false, detalle: "" };
      const msg = c.detalle || "";
      if (c.ok && /No password given|Invalid PDF structure/.test(msg)) return ["⚠️", "rechazo controlado, pero con el mensaje técnico de PDF.js en inglés"];
      return [c.ok ? "✅" : "❌", msg.slice(0, 160)];
    }
    if (d.id === "html05") return veredictoHtml05(e, res);
    if (e.factura) return veredictoFactura(e, extraOk);
    if (e.libro) return veredictoLibro(e, extraOk);
    return veredictoResto(e, d, res, V, extraOk);
  }
  function veredictoResto(e, d, res, V, extraOk) {
    const checks = e.checks;
    if (e.orden_lectura) {
      const o = e.orden_lectura;
      if (o.parrafos_contiguos === o.parrafos && o.en_orden && extraOk) return ["✅", `${o.parrafos}/${o.parrafos} párrafos legibles y en orden`];
      return [o.parrafos_contiguos * 2 >= o.parrafos ? "⚠️" : "❌", `${o.parrafos_contiguos}/${o.parrafos} párrafos legibles seguidos`];
    }
    if (d.id === "pdf07") return [checks[0]?.ok ? "✅" : "⚠️", checks[0]?.detalle || ""];
    if (d.id === "html13") return veredictoHtml13(res, V);
    if (d.verdad === "rendimiento") return [e.estado === "complete" ? "✅" : "❌", `${e.ms} ms`];
    if (checks.length) {
      const n = checks.filter(c => c.ok).length;
      return [n === checks.length ? "✅" : n ? "⚠️" : "❌", checks.map(c => `${c.tipo}=${c.ok ? "OK" : "FALLA"}${c.detalle ? ` (${c.detalle})` : ""}`).join("; ")];
    }
    return ["?", ""];
  }

  /* ---------- Notas por formato (FAMILIAS de consolidar.py) ---------- */
  const FAMILIAS = [["pdf-digital", ["pdf-digital"]], ["pdf-escaneado", ["pdf-escaneado"]], ["pdf (global)", ["pdf-digital", "pdf-escaneado"]],
    ["docx", ["docx"]], ["xlsx", ["xlsx"]], ["xls", ["xls"]], ["html", ["html"]], ["htm", ["htm"]], ["png", ["png"]], ["jpg", ["jpg"]],
    ["jpeg", ["jpeg"]], ["imágenes png+jpg+jpeg", ["png", "jpg", "jpeg"]]];
  const PUNTOS = { "✅": 1, "⚠️": 0.5 };
  const nota = vs => (vs.length ? Math.round(10 * vs.reduce((a, v) => a + (PUNTOS[v] || 0), 0) / vs.length * 10) / 10 : null);

  /* ---------- Interfaz ---------- */
  const celda = (fila, texto, clase) => {
    const td = document.createElement("td");
    td.textContent = texto === null || texto === undefined ? "—" : String(texto);
    if (clase) td.className = clase;
    fila.appendChild(td);
  };
  const estado = t => { $("estado").textContent = t; };
  let archivos = new Map();
  let verdad = null;
  let ultimo = null;

  $("carpeta").addEventListener("change", async () => {
    archivos = new Map([...$("carpeta").files].map(f => [f.name, f]));
    verdad = null;
    $("ejecutar").disabled = true;
    const v = archivos.get("verdad-pruebas.json");
    if (!v) { estado("La carpeta elegida no contiene verdad-pruebas.json: elige auditoria-lectura-idefix/corpus."); return; }
    try {
      const datos = JSON.parse(await v.text());
      if (datos?.version !== 1 || !Array.isArray(datos.casos)) throw new Error("formato no reconocido");
      verdad = datos;
    } catch (error) {
      estado(`verdad-pruebas.json no es válido (${error.message}).`);
      return;
    }
    const presentes = verdad.casos.filter(d => archivos.has(d.archivo)).length;
    estado(`${presentes} de ${verdad.casos.length} documentos del corpus encontrados. Pulsa «Ejecutar las pruebas».`);
    $("ejecutar").disabled = presentes === 0;
  });

  const comparacion = (v, esperado) => {
    if (!esperado) return "sin referencia";
    const a = PUNTOS[v] ?? 0, b = PUNTOS[esperado] ?? 0;
    return a === b ? "igual" : a > b ? "MEJOR" : "PEOR";
  };

  function pintar(casos) {
    const tb = $("tablaCasos");
    tb.replaceChildren();
    for (const c of casos) {
      const tr = document.createElement("tr");
      celda(tr, c.id); celda(tr, c.formato); celda(tr, c.veredicto); celda(tr, c.esperado ?? null);
      celda(tr, c.comparacion, c.comparacion === "PEOR" ? "peor" : c.comparacion === "MEJOR" ? "mejor" : "");
      celda(tr, c.ms); celda(tr, c.resultado);
      tb.appendChild(tr);
    }
    const tf = $("tablaFormatos");
    tf.replaceChildren();
    for (const [nombre, miembros] of FAMILIAS) {
      const cs = casos.filter(c => miembros.includes(c.formato));
      if (!cs.length) continue;
      const tr = document.createElement("tr");
      celda(tr, nombre); celda(tr, cs.length);
      for (const v of ["✅", "⚠️", "❌"]) celda(tr, cs.filter(c => c.veredicto === v).length);
      celda(tr, nota(cs.map(c => c.veredicto)));
      celda(tr, cs.every(c => c.esperado) ? nota(cs.map(c => c.esperado)) : null);
      tf.appendChild(tr);
    }
    const cuenta = k => casos.filter(c => c.comparacion === k).length;
    $("resumenGlobal").textContent = `${casos.length} casos: ${cuenta("igual")} con el veredicto esperado, ${cuenta("MEJOR")} mejor, ` +
      `${cuenta("PEOR")} peor${cuenta("sin referencia") ? `, ${cuenta("sin referencia")} sin referencia` : ""}.`;
    $("resumen").hidden = false;
    $("detalle").hidden = false;
  }

  $("formulario").addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!verdad) return;
    $("ejecutar").disabled = true;
    $("carpeta").disabled = true;
    $("descargar").disabled = true;
    const inicio = performance.now();
    try {
      estado("Iniciando Idefix1.0 (comprobando la integridad de los componentes)…");
      const aa = await crearAnalizadorArchivos({ idContenedor: "contenedorPruebas", permitirAPIResultados: true, ocr: $("ocr").checked });
      const casos = [];
      const pendientes = verdad.casos.filter(d => archivos.has(d.archivo));
      for (const [i, d] of pendientes.entries()) {
        estado(`Analizando ${i + 1}/${pendientes.length}: ${d.id}…`);
        const f = archivos.get(d.archivo);
        const archivo = new File([await f.arrayBuffer()], d.archivo, { type: d.mime || "" });
        const t0 = performance.now();
        let bruto;
        try {
          bruto = { ok: true, resultado: await aa.analizarArchivo(archivo, { cajetilla: d.cajetilla }) };
        } catch (error) {
          bruto = { ok: false, error: String(error?.message || error), resultado: {} };
        }
        bruto.ms = Math.round(performance.now() - t0);
        const e = evaluar(d, bruto, verdad);
        const [v, resultado] = veredicto(e, d, bruto.resultado || {}, verdad);
        casos.push({ id: d.id, formato: d.formato, tipo: d.tipo, veredicto: v, esperado: d.esperado ?? null,
          comparacion: comparacion(v, d.esperado), resultado, estado: e.estado, ms: bruto.ms, evaluacion: e });
        pintar(casos);
      }
      ultimo = { generado: new Date().toISOString(), version: AnalizadorArchivos.version, ocr: $("ocr").checked,
        segundos: Math.round((performance.now() - inicio) / 1000), casos };
      window.__resultadosPruebas = ultimo;
      estado(`Terminado en ${ultimo.segundos} s. ${$("resumenGlobal").textContent}`);
      $("descargar").disabled = false;
    } catch (error) {
      estado(`No se pudieron ejecutar las pruebas: ${error?.message || error}`);
    } finally {
      $("carpeta").disabled = false;
      $("ejecutar").disabled = !verdad;
      document.body.dataset.pruebas = "terminadas";
    }
  });

  $("descargar").addEventListener("click", () => {
    if (!ultimo) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(ultimo, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pruebas-corpus-${ultimo.generado.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
