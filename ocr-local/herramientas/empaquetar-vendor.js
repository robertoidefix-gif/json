/**
 * @file empaquetar-vendor.js
 * @description Genera los paquetes de ocr-local/vendor-paquetes/ a partir de las descargas oficiales,
 *   sin Node.js ni npm: descomprime los .tgz con DecompressionStream (nativo), lee el formato tar,
 *   comprueba la huella sha512 del tarball (la publicada por registry.npmjs.org) y el SHA-256 de cada
 *   archivo (el del MANIFIESTO de cargador-verificado.js). Si algo no coincide, no genera nada.
 *
 * Ruta: ocr-local/herramientas/empaquetar-vendor.js
 * Dependencias: ../js/cargador-verificado.js (window.CargadorVerificado: MANIFIESTO y sha256Hex).
 */
(function () {
  'use strict';

  const Cargador = window.CargadorVerificado;
  const MANIFIESTO = Cargador.MANIFIESTO;

  /** Límites para no agotar la memoria con archivos inesperados. */
  const BYTES_MAX_ENTRADA = 100 * 1024 * 1024;
  const BYTES_MAX_DESCOMPRIMIDOS = 200 * 1024 * 1024;
  const MAX_ENTRADAS_TAR = 5000;

  /**
   * Tarballs oficiales. «integridad» es el campo dist.integrity que publica registry.npmjs.org.
   * «archivos» relaciona la ruta dentro del tarball con la clave del MANIFIESTO.
   */
  const TARBALLS = Object.freeze([
    Object.freeze({
      nombre: 'bootstrap@5.3.8',
      url: 'https://registry.npmjs.org/bootstrap/-/bootstrap-5.3.8.tgz',
      integridad: 'sha512-HP1SZDqaLDPwsNiqRqi5NcP0SSXciX2s9E+RyqJIIqGo+vJeN5AJVM98CXmW/Wux0nQ5L7jeWUdplCEf0Ee+tg==',
      archivos: Object.freeze({ 'package/dist/css/bootstrap.min.css': 'bootstrap-css' })
    }),
    Object.freeze({
      nombre: 'tesseract.js@7.0.0',
      url: 'https://registry.npmjs.org/tesseract.js/-/tesseract.js-7.0.0.tgz',
      integridad: 'sha512-exPBkd+z+wM1BuMkx/Bjv43OeLBxhL5kKWsz/9JY+DXcXdiBjiAch0V49QR3oAJqCaL5qURE0vx9Eo+G5YE7mA==',
      archivos: Object.freeze({
        'package/dist/tesseract.min.js': 'tesseract-main',
        'package/dist/worker.min.js': 'tesseract-worker'
      })
    }),
    Object.freeze({
      nombre: 'tesseract.js-core@7.0.0',
      url: 'https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-7.0.0.tgz',
      integridad: 'sha512-WnNH518NzmbSq9zgTPeoF8c+xmilS8rFIl1YKbk/ptuuc7p6cLNELNuPAzcmsYw450ca6bLa8j3t0VAtq435Vw==',
      archivos: Object.freeze({
        'package/tesseract-core-simd-lstm.wasm.js': 'tesseract-core-simd-lstm',
        'package/tesseract-core-lstm.wasm.js': 'tesseract-core-lstm'
      })
    }),
    Object.freeze({
      nombre: '@tesseract.js-data/spa@1.0.0',
      url: 'https://registry.npmjs.org/@tesseract.js-data/spa/-/spa-1.0.0.tgz',
      integridad: 'sha512-9Ln+QKq/TNu4Hy4aOp5b4nXo9U0C6IqJMzNDpAJZe/fNtz6jXG9G/hQgR/Irxj+RGf0M7Xy1MNx1yl4wQUIfeg==',
      archivos: Object.freeze({ 'package/4.0.0_best_int/spa.traineddata.gz': 'tessdata-spa' })
    })
  ]);

  const $ = (id) => document.getElementById(id);
  /** @type {Map<string, {texto: string, sha256Paquete: string}>} */
  const generados = new Map();
  /** @type {Map<string, string>} clave del manifiesto → URL blob: de descarga vigente */
  const urlsDescarga = new Map();

  /**
   * Codifica bytes en base64 (nativo si existe; si no, por bloques con btoa).
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  function bytesABase64(bytes) {
    if (typeof bytes.toBase64 === 'function') {
      return bytes.toBase64();
    }
    let binario = '';
    const bloque = 0x8000;
    for (let i = 0; i < bytes.length; i += bloque) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + bloque));
    }
    return btoa(binario);
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {Promise<string>} Integridad estilo npm («sha512-…» en base64).
   */
  async function integridadSha512(bytes) {
    const resumen = new Uint8Array(await crypto.subtle.digest('SHA-512', bytes));
    return 'sha512-' + bytesABase64(resumen);
  }

  /**
   * Descomprime gzip con DecompressionStream, con límite de tamaño.
   * @param {Uint8Array} bytes
   * @returns {Promise<Uint8Array>}
   */
  async function descomprimirGzip(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const lector = flujo.getReader();
    const trozos = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > BYTES_MAX_DESCOMPRIMIDOS) {
        await lector.cancel();
        throw new Error('El archivo descomprimido supera el límite de ' + (BYTES_MAX_DESCOMPRIMIDOS / 1048576) + ' MB.');
      }
      trozos.push(value);
    }
    const salida = new Uint8Array(total);
    let posicion = 0;
    for (const trozo of trozos) {
      salida.set(trozo, posicion);
      posicion += trozo.length;
    }
    return salida;
  }

  /**
   * Lee una cadena terminada en NUL de una cabecera tar.
   * @param {Uint8Array} b
   * @param {number} inicio
   * @param {number} longitud
   * @returns {string}
   */
  function cadenaTar(b, inicio, longitud) {
    let fin = inicio;
    while (fin < inicio + longitud && b[fin] !== 0) {
      fin += 1;
    }
    return new TextDecoder('utf-8').decode(b.subarray(inicio, fin));
  }

  /**
   * Recorre un archivo tar (ustar, con extensiones pax «x» y GNU «L») y devuelve sus archivos.
   * Comprueba la suma de control de cada cabecera.
   * @param {Uint8Array} tar
   * @returns {Map<string, Uint8Array>} ruta → contenido
   */
  function leerTar(tar) {
    const archivos = new Map();
    let posicion = 0;
    let rutaPax = null;
    let rutaGnu = null;
    let entradas = 0;
    while (posicion + 512 <= tar.length) {
      const cabecera = tar.subarray(posicion, posicion + 512);
      if (cabecera.every((b) => b === 0)) {
        break;
      }
      entradas += 1;
      if (entradas > MAX_ENTRADAS_TAR) {
        throw new Error('El tar tiene demasiadas entradas.');
      }
      let suma = 0;
      for (let i = 0; i < 512; i += 1) {
        suma += i >= 148 && i < 156 ? 32 : cabecera[i];
      }
      const sumaDeclarada = parseInt(cadenaTar(cabecera, 148, 8).trim(), 8);
      if (suma !== sumaDeclarada) {
        throw new Error('Cabecera tar dañada (suma de control incorrecta).');
      }
      const tamano = parseInt(cadenaTar(cabecera, 124, 12).trim() || '0', 8);
      if (!Number.isSafeInteger(tamano) || tamano < 0 || posicion + 512 + tamano > tar.length) {
        throw new Error('Tamaño de entrada tar no válido.');
      }
      const tipo = cabecera[156] === 0 ? '0' : String.fromCharCode(cabecera[156]);
      const datos = tar.subarray(posicion + 512, posicion + 512 + tamano);
      posicion += 512 + Math.ceil(tamano / 512) * 512;
      if (tipo === 'L') {
        rutaGnu = cadenaTar(datos, 0, datos.length);
        continue;
      }
      if (tipo === 'x') {
        const registros = new TextDecoder('utf-8').decode(datos).split('\n');
        for (const registro of registros) {
          const coincidencia = /^\d+ path=(.*)$/.exec(registro);
          if (coincidencia) {
            rutaPax = coincidencia[1];
          }
        }
        continue;
      }
      if (tipo === 'g') {
        continue;
      }
      const nombre = cadenaTar(cabecera, 0, 100);
      const prefijo = cadenaTar(cabecera, 345, 155);
      const ruta = rutaPax || rutaGnu || (prefijo ? prefijo + '/' + nombre : nombre);
      rutaPax = null;
      rutaGnu = null;
      if (tipo === '0' || tipo === '7') {
        archivos.set(ruta, datos);
      }
    }
    return archivos;
  }

  /**
   * Texto exacto de un paquete (idéntico byte a byte al que genera el script de referencia).
   * @param {string} clave
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  function textoPaquete(clave, bytes) {
    const entrada = MANIFIESTO[clave];
    return '/* Paquete generado por herramientas/empaquetar-vendor.html (OCR local). NO EDITAR.\n' +
      ' * Contenido: ' + entrada.origen + '\n' +
      ' * SHA-256 del archivo oficial: ' + entrada.sha256 + ' · ' + entrada.bytes + ' bytes · Licencia: ' + entrada.licencia + '\n' +
      ' */\n' +
      'OCRLocalPaquetes.registrar("' + clave + '", "' + bytesABase64(bytes) + '");\n';
  }

  /**
   * Comprueba un archivo oficial y, si es correcto, genera su paquete.
   * @param {string} clave
   * @param {Uint8Array} bytes
   * @returns {Promise<void>}
   */
  async function generarPaquete(clave, bytes) {
    const entrada = MANIFIESTO[clave];
    const sha = await Cargador.sha256Hex(bytes);
    if (bytes.length !== entrada.bytes || sha !== entrada.sha256) {
      throw new Error('«' + clave + '»: el SHA-256 no coincide con el oficial. No se genera el paquete.');
    }
    const texto = textoPaquete(clave, bytes);
    const sha256Paquete = await Cargador.sha256Hex(new TextEncoder().encode(texto));
    generados.set(clave, { texto, sha256Paquete });
  }

  /**
   * @param {'ok'|'info'|'aviso'|'error'} tipo
   * @param {string} texto
   */
  function mensaje(tipo, texto) {
    const caja = document.createElement('div');
    caja.className = 'aviso aviso-' + tipo;
    caja.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    caja.textContent = texto;
    $('mensajes').appendChild(caja);
  }

  /**
   * Procesa los archivos elegidos: tarballs oficiales o archivos sueltos oficiales.
   * @param {File[]} lista
   */
  async function procesar(lista) {
    $('mensajes').replaceChildren();
    for (const archivo of lista) {
      const nombre = String(archivo.name).slice(0, 120);
      try {
        if (archivo.size === 0 || archivo.size > BYTES_MAX_ENTRADA) {
          throw new Error('tamaño no admitido (' + archivo.size + ' bytes).');
        }
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        const sha256 = await Cargador.sha256Hex(bytes);
        const clave = Object.keys(MANIFIESTO).find((k) => MANIFIESTO[k].sha256 === sha256);
        if (clave) {
          await generarPaquete(clave, bytes);
          mensaje('ok', '«' + nombre + '» es el archivo oficial ' + MANIFIESTO[clave].origen + '.');
          continue;
        }
        const integridad = await integridadSha512(bytes);
        const tarball = TARBALLS.find((t) => t.integridad === integridad);
        if (!tarball) {
          throw new Error('no coincide con ningún archivo oficial esperado (ni por SHA-256 ni por sha512).');
        }
        const contenido = leerTar(await descomprimirGzip(bytes));
        for (const [ruta, claveManifiesto] of Object.entries(tarball.archivos)) {
          const datos = contenido.get(ruta);
          if (!datos) {
            throw new Error('falta «' + ruta + '» dentro de ' + tarball.nombre + '.');
          }
          await generarPaquete(claveManifiesto, datos);
        }
        mensaje('ok', '«' + nombre + '» es el tarball oficial ' + tarball.nombre + ' (sha512 correcto).');
      } catch (error) {
        mensaje('error', '«' + nombre + '»: ' + (error && error.message ? error.message : String(error)));
      }
    }
    pintarTabla();
  }

  /** Libera las URL blob: de descarga anteriores. */
  function liberarUrls() {
    for (const url of urlsDescarga.values()) {
      URL.revokeObjectURL(url);
    }
    urlsDescarga.clear();
  }

  /** Pinta la tabla de paquetes con su estado y el botón de descarga. */
  function pintarTabla() {
    liberarUrls();
    const filas = document.createDocumentFragment();
    for (const clave of Object.keys(MANIFIESTO)) {
      const entrada = MANIFIESTO[clave];
      const archivoSalida = entrada.archivo.split('/').pop();
      const fila = document.createElement('tr');
      const celdaNombre = document.createElement('td');
      const codigo = document.createElement('code');
      codigo.textContent = archivoSalida;
      celdaNombre.append(codigo);
      const celdaEstado = document.createElement('td');
      const celdaHash = document.createElement('td');
      const hash = document.createElement('code');
      hash.textContent = entrada.sha256;
      celdaHash.append(hash);
      const celdaAccion = document.createElement('td');
      const generado = generados.get(clave);
      if (generado) {
        celdaEstado.className = 'estado-ok';
        celdaEstado.textContent = '✓ Verificado · paquete SHA-256 ' + generado.sha256Paquete.slice(0, 12) + '…';
        const url = URL.createObjectURL(new Blob([generado.texto], { type: 'text/javascript' }));
        urlsDescarga.set(clave, url);
        const enlace = document.createElement('a');
        enlace.className = 'boton';
        enlace.href = url;
        enlace.download = archivoSalida;
        enlace.textContent = 'Descargar';
        celdaAccion.append(enlace);
      } else {
        celdaEstado.className = 'estado-pendiente';
        celdaEstado.textContent = 'Pendiente';
        celdaAccion.textContent = '—';
      }
      fila.append(celdaNombre, celdaEstado, celdaHash, celdaAccion);
      filas.appendChild(fila);
    }
    $('cuerpoPaquetes').replaceChildren(filas);
  }

  /** Pinta la lista de descargas oficiales. */
  function pintarDescargas() {
    const lista = document.createDocumentFragment();
    for (const t of TARBALLS) {
      const li = document.createElement('li');
      const fuerte = document.createElement('strong');
      fuerte.textContent = t.nombre + ': ';
      const enlace = document.createElement('a');
      enlace.href = t.url;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      enlace.textContent = t.url;
      const huella = document.createElement('div');
      const codigo = document.createElement('code');
      codigo.textContent = t.integridad;
      huella.append('Huella esperada: ', codigo);
      li.append(fuerte, enlace, huella);
      lista.appendChild(li);
    }
    $('listaDescargas').replaceChildren(lista);
  }

  function iniciar() {
    document.documentElement.classList.add('transiciones');
    pintarDescargas();
    pintarTabla();
    const entrada = $('entradaArchivos');
    const zona = $('zonaArchivos');
    entrada.addEventListener('change', () => {
      procesar(Array.from(entrada.files || []));
      entrada.value = '';
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
    zona.addEventListener('dragenter', () => zona.classList.add('arrastrando'));
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastrando'));
    zona.addEventListener('drop', (e) => {
      zona.classList.remove('arrastrando');
      procesar(Array.from(e.dataTransfer ? e.dataTransfer.files : []));
    });
    window.addEventListener('pagehide', liberarUrls);
  }

  iniciar();
})();
