/**
 * @file ejemplo-extraccion.js
 * @description EJEMPLO FICTICIO de JSON de extracción con la forma que describe la documentación de
 *   Idefix1.0 (documentos por cajetilla, valores raw y normalizados, baja confianza, ambigüedad, OCR,
 *   advertencias, errores parciales, seguridad y trazabilidad aa://document/…). Solo sirve para la
 *   página de prueba. NO son datos reales y no es el esquema oficial de AnalizadorArchivos: para
 *   probar con datos reales, cargue en la página el JSON descargado con «Descargar JSON».
 *   Contiene a propósito descuadres (facturación 100,00 € frente a cobros con tarjeta 101,00 €;
 *   Modelo 303 frente a libros) y gastos de dudosa deducibilidad (joyería, restaurante, vehículo).
 *
 * Ruta: configuracion-fiscal/ejemplo-extraccion.js
 * Dependencias: ninguna. Expone: window.AACF_EJEMPLO_EXTRACCION (congelado).
 */
(function () {
  'use strict';

  /** Congela en profundidad para que cualquier intento de modificarlo falle de forma visible. */
  function congelar(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.values(o).forEach(congelar);
      Object.freeze(o);
    }
    return o;
  }

  window.AACF_EJEMPLO_EXTRACCION = congelar({
    esquema: 'ejemplo-ficticio-1',
    generado_por: 'AnalizadorArchivos (EJEMPLO FICTICIO para pruebas)',
    ejercicio: 2025,
    periodo: '1T',
    documentos: [
      {
        id: 'aa://document/7f3a1c',
        nombre_archivo: 'libro-emitidas-1T-2025.xlsx',
        tipo_archivo: 'xlsx',
        cajetilla: 'Libro de facturas emitidas',
        estado: 'completado',
        hojas: ['Emitidas'],
        sourceRef: 'aa://document/7f3a1c',
        metadatos_extraccion: { confianza_global: 0.97, campos_baja_confianza: [] },
        registros: [
          {
            fila: 2,
            fecha_expedicion: { raw: '15/01/2025', normalizado: '2025-01-15' },
            numero: { raw: 'F-2025-001', normalizado: 'F-2025-001' },
            nif_destinatario: { raw: 'B12345674', normalizado: 'B12345674' },
            base_imponible: { raw: '82,64 €', normalizado: 82.64, moneda: 'EUR' },
            cuota_iva: { raw: '17,36 €', normalizado: 17.36, moneda: 'EUR' },
            total: { raw: '100,00 €', normalizado: 100, moneda: 'EUR' },
            nativeRef: 'Emitidas!A2:H2',
            sourceRef: 'aa://document/7f3a1c#hoja=Emitidas&fila=2'
          }
        ],
        totales: { base_imponible: 82.64, cuota_iva: 17.36, total: 100 },
        advertencias: []
      },
      {
        id: 'aa://document/2b9e44',
        nombre_archivo: 'extracto-banco-enero-2025.pdf',
        tipo_archivo: 'pdf',
        cajetilla: 'Cuentas bancarias',
        estado: 'completado',
        paginas: 2,
        sourceRef: 'aa://document/2b9e44',
        metadatos_extraccion: { confianza_global: 0.93, campos_baja_confianza: [] },
        movimientos: [
          {
            fecha: { raw: '16/01/2025', normalizado: '2025-01-16' },
            concepto: { raw: 'ABONO TPV TARJETAS', normalizado: 'ABONO TPV TARJETAS' },
            importe: { raw: '101,00', normalizado: 101, moneda: 'EUR' },
            saldo: { raw: '1.501,00', normalizado: 1501 },
            nativeRef: 'pagina=1;linea=14',
            sourceRef: 'aa://document/2b9e44#p=1&l=14'
          },
          {
            fecha: { raw: '20/01/2025', normalizado: '2025-01-20' },
            concepto: { raw: 'PAGO JOYERIA ORO FINO SL', normalizado: 'PAGO JOYERIA ORO FINO SL' },
            importe: { raw: '-2.420,00', normalizado: -2420, moneda: 'EUR' },
            saldo: { raw: '-919,00', normalizado: -919 },
            nativeRef: 'pagina=1;linea=18',
            sourceRef: 'aa://document/2b9e44#p=1&l=18'
          }
        ],
        advertencias: ['Página 2 sin movimientos reconocibles']
      },
      {
        id: 'aa://document/c41d09',
        nombre_archivo: 'ticket-restaurante.jpg',
        tipo_archivo: 'jpeg',
        cajetilla: 'Otros',
        estado: 'incompleto',
        paginas: 1,
        sourceRef: 'aa://document/c41d09',
        ocr: { motor: 'Tesseract.js 7.0.0', idioma: 'spa', confianza_media: 61.4 },
        metadatos_extraccion: {
          confianza_global: 0.52,
          campos_baja_confianza: ['total', 'nif_emisor']
        },
        contenido_extraido: 'BAR RESTAURANTE LA PLAZA\nMenú degustación x4\nTOTAL 186,30 €',
        campos: {
          proveedor: { raw: 'BAR RESTAURANTE LA PLAZA', normalizado: 'BAR RESTAURANTE LA PLAZA' },
          nif_emisor: { raw: 'B8765432?', normalizado: null, valor_propuesto: 'B87654323', ambiguo: true },
          total: { raw: '186,30 €', normalizado: 186.3, ambiguo: true, lectura_alternativa: 186.8 },
          cuota_iva: { raw: null, normalizado: null }
        },
        errores_parciales: ['No se reconoce el desglose de IVA'],
        advertencias: ['Imagen con baja resolución']
      },
      {
        id: 'aa://document/9e0f71',
        nombre_archivo: 'libro-recibidas-1T-2025.xlsx',
        tipo_archivo: 'xlsx',
        cajetilla: 'Libro de facturas recibidas',
        estado: 'completado',
        hojas: ['Recibidas'],
        sourceRef: 'aa://document/9e0f71',
        metadatos_extraccion: { confianza_global: 0.95, campos_baja_confianza: [] },
        registros: [
          {
            fila: 2,
            proveedor: { raw: 'Joyería Oro Fino, S.L.', normalizado: 'Joyería Oro Fino, S.L.' },
            concepto: { raw: 'Reloj de oro', normalizado: 'Reloj de oro' },
            base_imponible: { raw: '2.000,00', normalizado: 2000 },
            cuota_iva: { raw: '420,00', normalizado: 420 },
            cuota_deducible: { raw: '420,00', normalizado: 420 },
            nativeRef: 'Recibidas!A2:I2',
            sourceRef: 'aa://document/9e0f71#hoja=Recibidas&fila=2'
          },
          {
            fila: 3,
            proveedor: { raw: 'Automóviles Premium, S.A.', normalizado: 'Automóviles Premium, S.A.' },
            concepto: { raw: 'Renting vehículo deportivo', normalizado: 'Renting vehículo deportivo' },
            base_imponible: { raw: '1.500,00', normalizado: 1500 },
            cuota_iva: { raw: '315,00', normalizado: 315 },
            cuota_deducible: { raw: '315,00', normalizado: 315 },
            nativeRef: 'Recibidas!A3:I3',
            sourceRef: 'aa://document/9e0f71#hoja=Recibidas&fila=3'
          }
        ]
      },
      {
        id: 'aa://document/5a3b2d',
        nombre_archivo: 'modelo-303-1T-2025.pdf',
        tipo_archivo: 'pdf',
        cajetilla: 'Modelo 303',
        estado: 'completado',
        paginas: 3,
        sourceRef: 'aa://document/5a3b2d',
        cabecera: { ejercicio: 2025, periodo: '1T', nif_declarante: 'B12345674' },
        casillas: {
          '27': { descripcion: 'Total cuota devengada', raw: '15,00', normalizado: 15, nativeRef: 'pagina=1;casilla=27' },
          '45': { descripcion: 'Total a deducir', raw: '735,00', normalizado: 735, nativeRef: 'pagina=2;casilla=45' }
        },
        metadatos_extraccion: { confianza_global: 0.9, campos_baja_confianza: [] }
      },
      {
        id: 'aa://document/e11b6a',
        nombre_archivo: 'contrato-con-macros.docm',
        tipo_archivo: 'docm',
        cajetilla: 'Otros',
        estado: 'rechazado',
        sourceRef: 'aa://document/e11b6a',
        seguridad_contenido: { bloqueado: true, motivo: 'Formato con macros no admitido' },
        contenido_extraido: null
      }
    ],
    informe_completitud: {
      documentos_totales: 6,
      completos: 4,
      incompletos: 1,
      rechazados: 1,
      truncado: false
    }
  });
})();
