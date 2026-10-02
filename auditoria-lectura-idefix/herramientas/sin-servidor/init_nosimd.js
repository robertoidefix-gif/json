// Simula un navegador sin SIMD de WebAssembly: rechaza cualquier módulo con el prefijo de SIMD (0xfd).
(() => {
  const original = WebAssembly.validate;
  WebAssembly.validate = function (bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes);
    if (u.length < 64 && u.includes(0xfd)) return false;
    return original.call(WebAssembly, bytes);
  };
})();
