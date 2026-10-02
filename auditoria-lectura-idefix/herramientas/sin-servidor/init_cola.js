// Ataque: un script de la página mete en la cola un pdf.mjs falso ANTES que el oficial.
(self.IdefixPaquetes = self.IdefixPaquetes || []).push(["vendor/pdfjs-legacy/build/pdf.mjs", btoa("globalThis.__pwned = 1; export const version = '6.2.108';")]);
(self.IdefixPaquetes = self.IdefixPaquetes || []).push(["vendor/tessdata/spa.traineddata.gz", btoa("falso")]);
