const G = ["window","document","self","globalThis","console","crypto","TextDecoder","TextEncoder","Blob","File","URL","Worker","fetch","performance",
"setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame","cancelAnimationFrame","navigator","location","HTMLElement","HTMLCanvasElement",
"HTMLInputElement","OffscreenCanvas","createImageBitmap","DecompressionStream","CompressionStream","Response","Request","Headers","AbortController","AbortSignal",
"DOMException","CSSStyleSheet","MutationObserver","structuredClone","queueMicrotask","atob","btoa","postMessage","importScripts","FileReader","CustomEvent","Event",
"EventTarget","Node","getComputedStyle","matchMedia","ResizeObserver","Intl","WebAssembly","SharedArrayBuffer","ReadableStream","WritableStream","TransformStream",
"DataTransfer","KeyboardEvent","MouseEvent","Image","ImageData","Element","DocumentFragment","NodeFilter","HTMLScriptElement","XMLHttpRequest","WorkerGlobalScope",
"DedicatedWorkerGlobalScope","FileList","ProgressEvent","ErrorEvent","PromiseRejectionEvent","MessageChannel","MessagePort","BroadcastChannel","Notification",
"localStorage","sessionStorage","indexedDB","caches","history","screen","innerWidth","innerHeight","devicePixelRatio","isSecureContext","origin","close","name",
"addEventListener","removeEventListener","dispatchEvent","onmessage","reportError","trustedTypes","HTMLAnchorElement","HTMLButtonElement","SVGElement","Text",
"Range","Selection","getSelection","ClipboardItem","alert","confirm","prompt","open","print","scrollTo","FormData","URLSearchParams","WeakRef","FinalizationRegistry",
"Atomics","BigInt64Array","BigUint64Array","Float16Array","Iterator","AggregateError","CSS"];
export default [{
  files: ["**/*.js"],
  languageOptions: { ecmaVersion: "latest", sourceType: "script", globals: Object.fromEntries(G.map(g => [g, "readonly"])) },
  linterOptions: { reportUnusedDisableDirectives: "off" },
  rules: {
    // recomendadas de ESLint (equivalente a @eslint/js recommended)
    "constructor-super": "error","for-direction": "error","getter-return": "error","no-async-promise-executor": "error","no-case-declarations": "error",
    "no-class-assign": "error","no-compare-neg-zero": "error","no-cond-assign": "error","no-const-assign": "error","no-constant-binary-expression": "error",
    "no-constant-condition": "error","no-control-regex": "error","no-debugger": "error","no-delete-var": "error","no-dupe-args": "error","no-dupe-class-members": "error",
    "no-dupe-else-if": "error","no-dupe-keys": "error","no-duplicate-case": "error","no-empty": "error","no-empty-character-class": "error","no-empty-pattern": "error",
    "no-empty-static-block": "error","no-ex-assign": "error","no-extra-boolean-cast": "error","no-fallthrough": "error","no-func-assign": "error","no-global-assign": "error",
    "no-import-assign": "error","no-invalid-regexp": "error","no-irregular-whitespace": "error","no-loss-of-precision": "error","no-misleading-character-class": "error",
    "no-new-native-nonconstructor": "error","no-nonoctal-decimal-escape": "error","no-obj-calls": "error","no-octal": "error","no-prototype-builtins": "error",
    "no-redeclare": "error","no-regex-spaces": "error","no-self-assign": "error","no-self-compare": "error","no-setter-return": "error","no-shadow-restricted-names": "error",
    "no-sparse-arrays": "error","no-this-before-super": "error","no-undef": "error","no-unexpected-multiline": "error","no-unreachable": "error",
    "no-unsafe-finally": "error","no-unsafe-negation": "error","no-unsafe-optional-chaining": "error","no-unused-labels": "error","no-unused-private-class-members": "error",
    "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],"no-useless-backreference": "error","no-useless-catch": "error","no-useless-escape": "error",
    "no-with": "error","require-yield": "error","use-isnan": "error","valid-typeof": "error","no-unassigned-vars": "error","preserve-caught-error": "off",
    // seguridad y robustez adicionales
    "no-eval": "error","no-implied-eval": "error","no-new-func": "error","no-script-url": "error","eqeqeq": ["warn", "smart"],
    "no-await-in-loop": "off","no-promise-executor-return": "warn","no-template-curly-in-string": "warn","require-atomic-updates": "off",
    "complexity": ["warn", 25],"max-depth": ["warn", 6],"max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
    "max-params": ["warn", 6],"no-shadow": "warn","no-param-reassign": "off","consistent-return": "warn","default-case-last": "warn","no-else-return": "off"
  }
}];
