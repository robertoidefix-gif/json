/**
 * @file demo-ocr.js
 * @description Interfaz de la demostración: elegir o arrastrar una imagen, reconocer su texto en
 *   español y comprobar que no hay red externa. Todo el texto de usuario o del OCR se escribe con
 *   textContent / value (nunca innerHTML).
 *
 * Ruta: ocr-local/js/demo-ocr.js
 * Dependencias: js/cargador-verificado.js (window.CargadorVerificado) y js/ocr-local.js (window.OCRLocal).
 */
(function () {
  'use strict';

  const OCR = window.OCRLocal;
  const Cargador = window.CargadorVerificado;

  /** Confianza media (0–100) a partir de la cual el resultado se marca en verde. */
  const UMBRAL_CONFIANZA_ALTA = 85;
  /** Reparto de la barra única: la preparación de la imagen ocupa hasta el 5 %; el OCR, el resto. */
  const PROGRESO_IMAGEN = 0.03;
  const PROGRESO_INICIO_OCR = 0.05;
  /** Máximo de filas que se pintan en la tabla de líneas. */
  const MAX_FILAS_TABLA = 500;
  /** Longitud máxima con la que se muestra un nombre de archivo. */
  const MAX_NOMBRE_VISIBLE = 80;
  /** Dominio reservado (RFC 2606) que usa el autodiagnóstico para probar el bloqueo de la CSP. */
  const ORIGEN_PRUEBA_BLOQUEO = 'https://ocr-local.invalid';
  const DESTINO_PRUEBA_BLOQUEO = ORIGEN_PRUEBA_BLOQUEO + '/prueba';

  const $ = (id) => document.getElementById(id);
  const ui = {
    entrada: $('entradaImagen'),
    zona: $('zonaArrastre'),
    vistaPrevia: $('vistaPrevia'),
    imagenPrevia: $('imagenPrevia'),
    datosImagen: $('datosImagen'),
    botonReconocer: $('botonReconocer'),
    botonCancelar: $('botonCancelar'),
    botonQuitar: $('botonQuitar'),
    textoEtapa: $('textoEtapa'),
    textoPorcentaje: $('textoPorcentaje'),
    contenedorBarra: $('contenedorBarra'),
    barra: $('barraProgreso'),
    avisos: $('avisos'),
    insigniaModo: $('insigniaModo'),
    insigniaRed: $('insigniaRed'),
    insigniaConfianza: $('insigniaConfianza'),
    resumen: $('resumenResultado'),
    texto: $('textoResultado'),
    botonCopiar: $('botonCopiar'),
    cuerpoLineas: $('cuerpoLineas'),
    listaComprobacion: $('listaComprobacion'),
    botonDiagnostico: $('botonDiagnostico'),
    listaDiagnostico: $('listaDiagnostico')
  };

  const estado = {
    archivo: null,
    urlPrevia: null,
    procesando: false,
    motorListo: false,
    errorMotor: null,
    bootstrap: 'pendiente',
    recursosLocales: 0,
    recursosExternos: [],
    violacionesCSP: [],
    pruebasBloqueo: 0,
    contadorArrastre: 0
  };

  const motor = new OCR.MotorOCRLocal({ alAvisoRed: () => actualizarPanelRed() });

  // -------------------------------------------------------------------------------------------
  // Utilidades de interfaz
  // -------------------------------------------------------------------------------------------

  /**
   * Activa o desactiva un botón de forma visual y accesible.
   * @param {HTMLButtonElement} boton
   * @param {boolean} activo
   */
  function activar(boton, activo) {
    boton.disabled = !activo;
    boton.setAttribute('aria-disabled', String(!activo));
  }

  /**
   * Recorta un texto largo para mostrarlo.
   * @param {string} texto
   * @param {number} maximo
   * @returns {string}
   */
  function recortar(texto, maximo) {
    const limpio = String(texto).replace(/[\u0000-\u001f\u007f]/g, ' ');
    return limpio.length > maximo ? limpio.slice(0, maximo - 1) + '…' : limpio;
  }

  /**
   * @param {number} bytes
   * @returns {string}
   */
  function formatearTamano(bytes) {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1048576) {
      return (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
    }
    return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
  }

  /**
   * @param {number} n
   * @param {string} singular
   * @param {string} pluralTexto
   * @returns {string} «1 línea», «3 líneas»…
   */
  function plural(n, singular, pluralTexto) {
    return n + ' ' + (n === 1 ? singular : pluralTexto);
  }

  /** Elimina todos los avisos (no se acumulan entre intentos). */
  function limpiarAvisos() {
    ui.avisos.replaceChildren();
  }

  /**
   * Muestra un aviso. Los errores se anuncian con role="alert".
   * @param {'ok'|'info'|'aviso'|'error'} tipo
   * @param {string} titulo
   * @param {string} [detalle]
   * @param {string} [codigo]
   */
  function mostrarAviso(tipo, titulo, detalle, codigo) {
    const caja = document.createElement('div');
    caja.className = 'aviso aviso-' + tipo;
    caja.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    const cuerpo = document.createElement('div');
    const fuerte = document.createElement('strong');
    fuerte.textContent = titulo;
    cuerpo.appendChild(fuerte);
    if (detalle) {
      const parrafo = document.createElement('span');
      parrafo.textContent = detalle;
      cuerpo.appendChild(parrafo);
    }
    if (codigo) {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'aviso-codigo d-block mt-1';
      etiqueta.textContent = 'Código: ' + codigo;
      cuerpo.appendChild(etiqueta);
    }
    caja.appendChild(cuerpo);
    ui.avisos.appendChild(caja);
  }

  /**
   * Actualiza la barra de progreso y el texto de la etapa.
   * @param {string} etapa
   * @param {number} fraccion 0–1
   */
  function pintarProgreso(etapa, fraccion) {
    const porcentaje = Math.round(Math.min(1, Math.max(0, fraccion)) * 100);
    ui.textoEtapa.textContent = etapa;
    ui.textoPorcentaje.textContent = porcentaje + ' %';
    ui.barra.style.width = porcentaje + '%';
    ui.contenedorBarra.setAttribute('aria-valuenow', String(porcentaje));
  }

  /**
   * Traduce el progreso del motor a una sola barra.
   * @param {{fase: string, etapa: string, progreso: number}} p
   */
  function alProgreso(p) {
    if (p.fase === 'motor') {
      pintarProgreso(p.etapa, p.progreso);
    } else if (p.fase === 'imagen') {
      pintarProgreso(p.etapa, PROGRESO_IMAGEN);
    } else if (p.fase === 'reconocimiento') {
      pintarProgreso(p.etapa, PROGRESO_INICIO_OCR + p.progreso * (1 - PROGRESO_INICIO_OCR));
    }
  }

  /** Sincroniza el estado de los botones con el estado de la aplicación. */
  function actualizarBotones() {
    // Si el motor falló al arrancar, «Reconocer» vuelve a intentarlo (el motor reintenta el arranque).
    activar(ui.botonReconocer, Boolean(estado.archivo) && !estado.procesando);
    activar(ui.botonQuitar, Boolean(estado.archivo) && !estado.procesando);
    activar(ui.botonCopiar, ui.texto.value.length > 0 && !estado.procesando);
    ui.botonCancelar.hidden = !estado.procesando;
    ui.entrada.disabled = estado.procesando;
  }

  // -------------------------------------------------------------------------------------------
  // Selección de imagen
  // -------------------------------------------------------------------------------------------

  /** Quita la vista previa y libera su URL blob:. */
  function quitarVistaPrevia() {
    if (estado.urlPrevia) {
      URL.revokeObjectURL(estado.urlPrevia);
      estado.urlPrevia = null;
    }
    ui.imagenPrevia.removeAttribute('src');
    ui.vistaPrevia.hidden = true;
    ui.datosImagen.textContent = '';
  }

  /** Borra el resultado anterior. */
  function limpiarResultado() {
    ui.texto.value = '';
    ui.cuerpoLineas.replaceChildren();
    ui.resumen.textContent = 'Aún no hay resultado.';
    ui.insigniaConfianza.hidden = true;
  }

  /**
   * Comprueba rápidamente la imagen elegida y la muestra. La validación completa se repite en el
   * motor justo antes del OCR.
   * @param {File} archivo
   */
  async function elegirArchivo(archivo) {
    if (estado.procesando) {
      mostrarAviso('aviso', 'Espere a que termine el reconocimiento actual o cancélelo.');
      return;
    }
    limpiarAvisos();
    limpiarResultado();
    quitarVistaPrevia();
    estado.archivo = null;
    const nombre = recortar(archivo.name || '(sin nombre)', MAX_NOMBRE_VISIBLE);
    try {
      if (archivo.size === 0) {
        throw new OCR.ErrorOCR('ARCHIVO_VACIO', 'El archivo está vacío (0 bytes).');
      }
      if (archivo.size > OCR.LIMITES.BYTES_MAX_IMAGEN) {
        throw new OCR.ErrorOCR('TAMANO', 'El archivo ocupa ' + formatearTamano(archivo.size) + '; el máximo es ' +
          formatearTamano(OCR.LIMITES.BYTES_MAX_IMAGEN) + '.');
      }
      const cabecera = new Uint8Array(await archivo.slice(0, 64).arrayBuffer());
      const formato = OCR.detectarFormato(cabecera);
      if (!formato) {
        throw new OCR.ErrorOCR('FORMATO', 'No es una imagen PNG, JPEG, WebP ni BMP (se comprueba el contenido, no la extensión).');
      }
      estado.archivo = archivo;
      estado.urlPrevia = URL.createObjectURL(archivo);
      ui.imagenPrevia.src = estado.urlPrevia;
      ui.datosImagen.textContent = nombre + ' · ' + formato.toUpperCase() + ' · ' + formatearTamano(archivo.size);
      ui.vistaPrevia.hidden = false;
      pintarProgreso(estado.motorListo ? 'Listo para reconocer' : 'Preparando el motor OCR…', estado.motorListo ? 0 : 0.05);
    } catch (error) {
      const codigo = error && error.codigo ? error.codigo : 'FORMATO';
      mostrarAviso('error', 'No se puede usar «' + nombre + '».', error && error.message ? error.message : '', codigo);
    } finally {
      ui.entrada.value = '';
      actualizarBotones();
    }
  }

  /** Quita la imagen elegida y el resultado. */
  function quitarImagen() {
    if (estado.procesando) {
      return;
    }
    estado.archivo = null;
    quitarVistaPrevia();
    limpiarResultado();
    limpiarAvisos();
    pintarProgreso(estado.motorListo ? 'Motor OCR listo' : 'Preparando el motor OCR…', estado.motorListo ? 0 : 0.05);
    actualizarBotones();
  }

  // -------------------------------------------------------------------------------------------
  // Reconocimiento
  // -------------------------------------------------------------------------------------------

  /**
   * @param {OCRLocal.ResultadoOCR} r
   */
  function mostrarResultado(r) {
    ui.texto.value = r.texto;
    const confianza = r.confianzaMedia === null ? null : r.confianzaMedia;
    ui.insigniaConfianza.hidden = false;
    ui.insigniaConfianza.className = 'insignia ms-auto ' +
      (confianza === null ? '' : confianza >= UMBRAL_CONFIANZA_ALTA ? 'insignia-ok' : confianza >= OCR.UMBRAL_BAJA_CONFIANZA ? 'insignia-aviso' : 'insignia-error');
    ui.insigniaConfianza.textContent = confianza === null ? 'Confianza: sin dato' : 'Confianza media: ' + String(confianza).replace('.', ',') + ' %';
    ui.resumen.textContent = plural(r.lineas.length, 'línea', 'líneas') + ' · ' + plural(r.totalPalabras, 'palabra', 'palabras') + ' · ' +
      plural(r.palabrasBajaConfianza, 'dudosa', 'dudosas') + ' (confianza < ' + OCR.UMBRAL_BAJA_CONFIANZA + ') · ' +
      r.imagen.ancho + ' × ' + r.imagen.alto + ' px · ' + (r.msReconocimiento / 1000).toFixed(1).replace('.', ',') + ' s · ' + r.motor;

    const filas = document.createDocumentFragment();
    r.lineas.slice(0, MAX_FILAS_TABLA).forEach((linea, indice) => {
      const fila = document.createElement('tr');
      if (linea.confianza === null || linea.confianza < OCR.UMBRAL_BAJA_CONFIANZA || linea.palabrasDudosas > 0) {
        fila.className = 'fila-dudosa';
      }
      const celdaNumero = document.createElement('td');
      celdaNumero.textContent = String(indice + 1);
      const celdaTexto = document.createElement('td');
      celdaTexto.className = 'texto-linea';
      celdaTexto.textContent = linea.texto;
      const celdaConfianza = document.createElement('td');
      celdaConfianza.className = 'text-end';
      celdaConfianza.textContent = linea.confianza === null ? '—' : String(linea.confianza).replace('.', ',') + ' %';
      fila.append(celdaNumero, celdaTexto, celdaConfianza);
      filas.appendChild(fila);
    });
    ui.cuerpoLineas.replaceChildren(filas);
  }

  /** Lanza el OCR de la imagen elegida. */
  async function reconocer() {
    if (!estado.archivo || estado.procesando) {
      return;
    }
    estado.procesando = true;
    estado.errorMotor = null;
    limpiarAvisos();
    limpiarResultado();
    actualizarBotones();
    pintarProgreso('Preparando…', 0.01);
    try {
      const resultado = await motor.reconocer(estado.archivo, { alProgreso });
      estado.motorListo = true;
      mostrarResultado(resultado);
      pintarProgreso('Reconocimiento terminado', 1);
      if (resultado.texto.trim() === '') {
        mostrarAviso('aviso', 'No se ha reconocido texto.', 'Pruebe con una imagen más nítida, recta y con más resolución.');
      } else if (resultado.palabrasBajaConfianza > 0) {
        mostrarAviso('aviso', 'Revise las líneas resaltadas.', resultado.palabrasBajaConfianza === 1
          ? '1 palabra tiene una confianza baja.'
          : resultado.palabrasBajaConfianza + ' palabras tienen una confianza baja.');
      } else {
        mostrarAviso('ok', 'Texto reconocido.', 'Todo se ha procesado en este equipo.');
      }
    } catch (error) {
      const codigo = error && error.codigo ? error.codigo : 'DESCONOCIDO';
      if (codigo === 'CANCELADO') {
        pintarProgreso('Cancelado', 0);
        mostrarAviso('info', 'Reconocimiento cancelado.', 'Puede volver a intentarlo cuando quiera.');
      } else {
        pintarProgreso('Error', 0);
        mostrarAviso('error', 'No se pudo reconocer el texto.', error && error.message ? error.message : String(error), codigo);
      }
    } finally {
      estado.procesando = false;
      actualizarBotones();
      actualizarPanelRed();
    }
  }

  /** Cancela el reconocimiento en curso. */
  function cancelar() {
    if (motor.cancelar()) {
      ui.textoEtapa.textContent = 'Cancelando…';
    }
  }

  /** Copia el texto reconocido al portapapeles. */
  async function copiarTexto() {
    if (!ui.texto.value) {
      return;
    }
    limpiarAvisos();
    try {
      await navigator.clipboard.writeText(ui.texto.value);
      mostrarAviso('ok', 'Texto copiado al portapapeles.');
    } catch (error) {
      ui.texto.focus();
      ui.texto.select();
      mostrarAviso('aviso', 'No se pudo copiar automáticamente.', 'El texto queda seleccionado: pulse Ctrl+C.', 'PORTAPAPELES');
    }
  }

  // -------------------------------------------------------------------------------------------
  // Arrastrar y soltar
  // -------------------------------------------------------------------------------------------

  /**
   * @param {DragEvent} evento
   * @returns {boolean} true si se arrastran archivos.
   */
  function llevaArchivos(evento) {
    return Boolean(evento.dataTransfer) && Array.from(evento.dataTransfer.types || []).includes('Files');
  }

  function configurarArrastre() {
    // Fuera de la zona, el navegador no debe abrir ni navegar al archivo soltado.
    document.addEventListener('dragover', (evento) => {
      if (llevaArchivos(evento)) {
        evento.preventDefault();
        evento.dataTransfer.dropEffect = ui.zona.contains(evento.target) && !estado.procesando ? 'copy' : 'none';
      }
    });
    document.addEventListener('drop', (evento) => {
      if (llevaArchivos(evento) && !ui.zona.contains(evento.target)) {
        evento.preventDefault();
        limpiarAvisos();
        mostrarAviso('info', 'Suelte la imagen dentro del recuadro punteado.');
      }
    });
    ui.zona.addEventListener('dragenter', (evento) => {
      if (llevaArchivos(evento)) {
        estado.contadorArrastre += 1;
        ui.zona.classList.add('arrastrando');
      }
    });
    ui.zona.addEventListener('dragleave', () => {
      estado.contadorArrastre = Math.max(0, estado.contadorArrastre - 1);
      if (estado.contadorArrastre === 0) {
        ui.zona.classList.remove('arrastrando');
      }
    });
    ui.zona.addEventListener('drop', (evento) => {
      evento.preventDefault();
      estado.contadorArrastre = 0;
      ui.zona.classList.remove('arrastrando');
      const archivos = evento.dataTransfer ? Array.from(evento.dataTransfer.files) : [];
      if (archivos.length === 0) {
        return;
      }
      elegirArchivo(archivos[0]).then(() => {
        if (archivos.length > 1 && estado.archivo) {
          mostrarAviso('info', 'Se ha soltado más de un archivo.', 'Esta demostración procesa una imagen: se usa «' +
            recortar(archivos[0].name, MAX_NOMBRE_VISIBLE) + '».');
        }
      });
    });
  }

  // -------------------------------------------------------------------------------------------
  // Comprobación de red
  // -------------------------------------------------------------------------------------------

  /**
   * @param {string} url
   * @returns {boolean} true si la URL es local (file:, blob:, data: o el mismo origen).
   */
  function esLocal(url) {
    try {
      const destino = new URL(url, location.href);
      if (destino.protocol === 'file:' || destino.protocol === 'blob:' || destino.protocol === 'data:') {
        return true;
      }
      return location.protocol !== 'file:' && destino.origin === location.origin;
    } catch (error) {
      return false;
    }
  }

  function vigilarRed() {
    document.addEventListener('securitypolicyviolation', (evento) => {
      if (String(evento.blockedURI).startsWith(ORIGEN_PRUEBA_BLOQUEO)) {
        estado.pruebasBloqueo += 1;
      } else {
        estado.violacionesCSP.push(evento.effectiveDirective + ' → ' + recortar(evento.blockedURI || '(en línea)', 120));
      }
      actualizarPanelRed();
    });
    if (typeof PerformanceObserver === 'function') {
      const observador = new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries()) {
          if (esLocal(entrada.name)) {
            estado.recursosLocales += 1;
          } else {
            estado.recursosExternos.push(recortar(entrada.name, 160));
          }
        }
        actualizarPanelRed();
      });
      observador.observe({ type: 'resource', buffered: true });
    }
  }

  /**
   * Añade una fila al panel de comprobación.
   * @param {DocumentFragment} destino
   * @param {string} termino
   * @param {string|Node} valor
   */
  function filaComprobacion(destino, termino, valor) {
    const dt = document.createElement('dt');
    dt.textContent = termino;
    const dd = document.createElement('dd');
    if (typeof valor === 'string') {
      dd.textContent = valor;
    } else {
      dd.appendChild(valor);
    }
    destino.append(dt, dd);
  }

  function actualizarPanelRed() {
    const avisosWorker = motor.avisosRed;
    const externos = estado.recursosExternos.length;
    const total = externos + estado.violacionesCSP.length + avisosWorker.length;

    const modoArchivo = location.protocol === 'file:';
    ui.insigniaModo.textContent = modoArchivo ? 'file:// · sin servidor' : location.host + ' · servidor local';
    ui.insigniaRed.textContent = total === 0 ? 'Red externa: 0 peticiones' : 'Red externa: ' + total + ' intento(s), ver panel 3';
    ui.insigniaRed.className = 'insignia ' + (externos > 0 ? 'insignia-error' : total > 0 ? 'insignia-aviso' : 'insignia-ok');

    const f = document.createDocumentFragment();
    filaComprobacion(f, 'Modo de apertura', modoArchivo
      ? 'file:// (doble clic, sin servidor). Origen: ' + (location.origin === 'null' ? 'opaco' : location.origin)
      : location.origin + ' (servidor estático local)');
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    filaComprobacion(f, 'Política CSP', meta ? 'Activa: connect-src \'none\', script-src \'self\' blob:, sin \'unsafe-inline\' ni \'unsafe-eval\'' : 'NO encontrada');
    const verificados = Cargador.informeVerificacion();
    if (verificados.length === 0) {
      filaComprobacion(f, 'Bibliotecas verificadas', estado.errorMotor ? 'Ninguna (ver error)' : 'Verificando…');
    } else {
      const lista = document.createElement('div');
      verificados.forEach((v) => {
        const linea = document.createElement('div');
        const marca = document.createElement('span');
        marca.className = 'marca-ok';
        marca.textContent = '✓ ';
        const texto = document.createElement('span');
        texto.textContent = v.nombre + ' — SHA-256 ';
        const hash = document.createElement('code');
        hash.className = 'hash';
        hash.textContent = v.sha256.slice(0, 16) + '…';
        linea.append(marca, texto, hash);
        lista.appendChild(linea);
      });
      filaComprobacion(f, 'Bibliotecas verificadas', lista);
    }
    filaComprobacion(f, 'Bootstrap', estado.bootstrap);
    filaComprobacion(f, 'Núcleo WebAssembly', motor.nucleo || 'aún sin elegir');
    filaComprobacion(f, 'Recursos de la página', (modoArchivo && estado.recursosLocales === 0
      ? 'con file:// el navegador no publica los tiempos de los archivos locales · '
      : estado.recursosLocales + ' locales · ') + externos + ' externos' +
      (externos > 0 ? ': ' + estado.recursosExternos.join(', ') : ''));
    filaComprobacion(f, 'Intentos de red en el worker OCR', avisosWorker.length === 0
      ? '0 (red anulada por el preludio y por la CSP)'
      : avisosWorker.length + ' bloqueados: ' + avisosWorker.map((a) => a.api + ' ' + a.destino).join(' · '));
    filaComprobacion(f, 'Bloqueos de la CSP en la página', estado.violacionesCSP.length === 0
      ? '0' + (estado.pruebasBloqueo > 0 ? ' (más ' + estado.pruebasBloqueo + ' del autodiagnóstico, previstos)' : '')
      : estado.violacionesCSP.length + ': ' + estado.violacionesCSP.join(' · '));
    ui.listaComprobacion.replaceChildren(f);
  }

  /**
   * @param {string} nombre
   * @param {() => Promise<string>} prueba Devuelve el detalle si pasa; lanza si no.
   * @returns {Promise<{nombre: string, ok: boolean, detalle: string}>}
   */
  async function ejecutarPrueba(nombre, prueba) {
    try {
      return { nombre, ok: true, detalle: await prueba() };
    } catch (error) {
      return { nombre, ok: false, detalle: error && error.message ? error.message : String(error) };
    }
  }

  /**
   * Crea un worker blob: con el código dado y devuelve su primer mensaje.
   * @param {string} codigo
   * @returns {Promise<unknown>}
   */
  function probarWorker(codigo) {
    return new Promise((resolver, rechazar) => {
      const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
      const worker = new Worker(url);
      const terminar = () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      };
      const temporizador = setTimeout(() => {
        terminar();
        rechazar(new Error('sin respuesta en 5 s'));
      }, 5000);
      worker.onmessage = (evento) => {
        clearTimeout(temporizador);
        terminar();
        resolver(evento.data);
      };
      worker.onerror = (evento) => {
        evento.preventDefault();
        clearTimeout(temporizador);
        terminar();
        rechazar(new Error(evento.message || 'error en el worker'));
      };
    });
  }

  async function autodiagnostico() {
    activar(ui.botonDiagnostico, false);
    ui.listaDiagnostico.replaceChildren();
    const pruebas = [
      ['Contexto seguro (necesario para crypto.subtle)', async () => {
        if (!window.isSecureContext) {
          throw new Error('isSecureContext = false');
        }
        return 'sí (' + location.protocol + ')';
      }],
      ['Web Crypto (SHA-256)', async () => {
        const hex = await Cargador.sha256Hex(new TextEncoder().encode('abc'));
        if (hex !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') {
          throw new Error('resultado incorrecto');
        }
        return 'correcto';
      }],
      ['WebAssembly y SIMD', async () => {
        if (typeof WebAssembly !== 'object') {
          throw new Error('WebAssembly no disponible');
        }
        return OCR.hayWasmSimd() ? 'disponible, con SIMD' : 'disponible, sin SIMD (se usará el núcleo lento)';
      }],
      ['Worker blob: + WebAssembly dentro del worker', async () => {
        const r = await probarWorker('WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0])).then(function(){postMessage("ok")},function(e){postMessage("error: "+e.message)});');
        if (r !== 'ok') {
          throw new Error(String(r));
        }
        return 'correcto';
      }],
      ['CSP heredada por el worker (eval bloqueado)', async () => {
        const r = await probarWorker('try{eval("1");postMessage("eval PERMITIDO")}catch(e){postMessage("bloqueado")}');
        if (r !== 'bloqueado') {
          throw new Error('el worker ha podido ejecutar eval: la CSP no está activa');
        }
        return 'eval bloqueado también dentro del worker';
      }],
      ['La CSP bloquea conexiones externas (dominio reservado .invalid)', async () => {
        try {
          await fetch(DESTINO_PRUEBA_BLOQUEO, { cache: 'no-store', credentials: 'omit' });
        } catch (error) {
          return 'bloqueada antes de salir del navegador';
        }
        throw new Error('la petición NO se bloqueó');
      }],
      ['Bibliotecas locales íntegras', async () => {
        const n = Cargador.informeVerificacion().length;
        if (n === 0) {
          throw new Error(estado.errorMotor ? estado.errorMotor : 'todavía no se han verificado');
        }
        return n + ' archivo(s) con SHA-256 igual al oficial';
      }]
    ];
    for (const [nombre, prueba] of pruebas) {
      const r = await ejecutarPrueba(nombre, prueba);
      const li = document.createElement('li');
      const marca = document.createElement('span');
      marca.className = r.ok ? 'marca-ok' : 'marca-error';
      marca.textContent = r.ok ? '✓' : '✗';
      const texto = document.createElement('span');
      texto.textContent = r.nombre + ': ' + recortar(r.detalle, 200);
      li.append(marca, texto);
      ui.listaDiagnostico.appendChild(li);
    }
    activar(ui.botonDiagnostico, true);
    actualizarPanelRed();
  }

  // -------------------------------------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------------------------------------

  async function aplicarBootstrap() {
    try {
      await Cargador.aplicarHojaVerificada('bootstrap-css');
      estado.bootstrap = 'Bootstrap 5.3.8 aplicado (SHA-256 verificado)';
    } catch (error) {
      estado.bootstrap = 'NO aplicado: ' + (error && error.message ? error.message : String(error));
      mostrarAviso('aviso', 'Bootstrap no se ha aplicado.', estado.bootstrap, error && error.codigo ? error.codigo : undefined);
    } finally {
      document.documentElement.classList.add('estilos-listos');
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('transiciones')));
    }
  }

  async function prepararMotor() {
    pintarProgreso('Preparando el motor OCR…', 0.02);
    try {
      await motor.iniciar(alProgreso);
      estado.motorListo = true;
      estado.errorMotor = null;
      if (!estado.procesando) {
        pintarProgreso(estado.archivo ? 'Listo para reconocer' : 'Motor OCR listo: elija una imagen', 0);
      }
    } catch (error) {
      estado.errorMotor = error && error.message ? error.message : String(error);
      pintarProgreso('El motor OCR no ha podido arrancar', 0);
      mostrarAviso('error', 'El motor OCR no ha podido arrancar.', estado.errorMotor, error && error.codigo ? error.codigo : undefined);
    } finally {
      actualizarBotones();
      actualizarPanelRed();
    }
  }

  function iniciar() {
    vigilarRed();
    configurarArrastre();
    ui.entrada.addEventListener('change', () => {
      if (ui.entrada.files && ui.entrada.files.length > 0) {
        elegirArchivo(ui.entrada.files[0]);
      }
    });
    ui.botonReconocer.addEventListener('click', reconocer);
    ui.botonCancelar.addEventListener('click', cancelar);
    ui.botonQuitar.addEventListener('click', quitarImagen);
    ui.botonCopiar.addEventListener('click', copiarTexto);
    ui.botonDiagnostico.addEventListener('click', autodiagnostico);
    // Al salir de la página se termina el worker. Si el navegador la restaura desde la caché de
    // ida y vuelta, se recarga para crear un motor nuevo.
    window.addEventListener('pagehide', () => motor.liberar());
    window.addEventListener('pageshow', (evento) => {
      if (evento.persisted) {
        location.reload();
      }
    });
    actualizarBotones();
    actualizarPanelRed();
    aplicarBootstrap().then(prepararMotor);
  }

  iniciar();
})();
