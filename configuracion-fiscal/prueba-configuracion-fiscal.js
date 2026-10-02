/**
 * @file prueba-configuracion-fiscal.js
 * @description Página de prueba: simula los datos que aportaría AnalizadorArchivos (ninguno, el ejemplo
 *   ficticio o un JSON real cargado desde un archivo) y monta el bloque «Configuración para análisis
 *   fiscal». No usa red: el JSON se lee con FileReader desde el equipo.
 *
 * Ruta: configuracion-fiscal/prueba-configuracion-fiscal.js
 * Dependencias: configuracion-fiscal.js (window.AAConfiguracionFiscal), ejemplo-extraccion.js
 *   (window.AACF_EJEMPLO_EXTRACCION), ../ocr-local/js/cargador-verificado.js (Bootstrap verificado).
 */
(function () {
  'use strict';

  /** Tamaño máximo del JSON que se acepta en la prueba. */
  const BYTES_MAX_JSON = 50 * 1024 * 1024;

  const $ = (id) => document.getElementById(id);
  let datosArchivo = null;

  /** @returns {string} Origen elegido: ninguno | ejemplo | archivo. */
  function origen() {
    const marcado = document.querySelector('input[name="origenDatos"]:checked');
    return marcado ? marcado.value : 'ninguno';
  }

  /** @returns {unknown} Datos de extracción según el origen elegido (sin copiarlos ni modificarlos). */
  function obtenerDatosExtraccion() {
    if (origen() === 'ejemplo') {
      return window.AACF_EJEMPLO_EXTRACCION;
    }
    if (origen() === 'archivo') {
      return datosArchivo;
    }
    return null;
  }

  function pintarEstado() {
    const o = origen();
    $('archivoJSON').disabled = o !== 'archivo';
    $('estadoDatos').textContent = o === 'ninguno'
      ? 'El prompt indicará que no hay datos de extracción disponibles.'
      : o === 'ejemplo'
        ? 'Se usará el ejemplo ficticio (congelado: si el bloque intentara modificarlo, fallaría).'
        : datosArchivo === null ? 'Elija el JSON descargado de Idefix.' : 'JSON cargado desde el archivo.';
  }

  document.querySelectorAll('input[name="origenDatos"]').forEach((r) => r.addEventListener('change', pintarEstado));
  $('archivoJSON').addEventListener('change', () => {
    const archivo = $('archivoJSON').files && $('archivoJSON').files[0];
    datosArchivo = null;
    if (!archivo) {
      pintarEstado();
      return;
    }
    if (archivo.size > BYTES_MAX_JSON) {
      $('estadoDatos').textContent = 'El archivo supera ' + (BYTES_MAX_JSON / 1048576) + ' MB.';
      return;
    }
    archivo.text().then((texto) => {
      datosArchivo = JSON.parse(texto);
      $('estadoDatos').textContent = 'JSON cargado: ' + archivo.name.slice(0, 120) + ' (' + archivo.size + ' bytes).';
    }).catch((error) => {
      datosArchivo = null;
      $('estadoDatos').textContent = 'No es un JSON válido: ' + String(error && error.message || error).slice(0, 200);
    });
  });

  const controlador = window.AAConfiguracionFiscal.montar($('contenedorConfiguracionFiscal'), {
    obtenerDatosExtraccion,
    obtenerContextoSistema: () => ({ ejercicio: $('simEjercicio').value.trim(), periodo: $('simPeriodo').value.trim() })
  });
  ['simEjercicio', 'simPeriodo'].forEach((id) => $(id).addEventListener('input', () => controlador.refrescarSistema()));
  window.__controladorConfiguracionFiscal = controlador;
  pintarEstado();

  window.CargadorVerificado.configurar({ rutaBase: '../ocr-local/' });
  window.CargadorVerificado.aplicarHojaVerificada('bootstrap-css')
    .catch((error) => {
      $('estadoDatos').textContent = 'Bootstrap no se ha aplicado: ' + String(error && error.message || error);
    })
    .finally(() => {
      document.documentElement.classList.add('estilos-listos');
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('transiciones')));
    });
})();
