# =====================================================================================================
# Idefix1.0 — servidor estático LOCAL mínimo para Windows (PowerShell 5.1 incluido en Windows 10/11).
# No hay que instalar nada: ni Node.js, ni npm, ni Python.
#
# Por qué hace falta: Chrome y Edge no permiten, en páginas abiertas como archivo (file://), cargar con
# fetch los archivos que la aplicación verifica (manifiesto, PDF.js, núcleo y modelos de Tesseract), ni
# crear un Worker desde un archivo local, y no comprueban el atributo «integrity» de un script en file://.
#
# Qué hace y qué no:
#   - Escucha solo en http://localhost:<puerto>/ (no es accesible desde la red local ni desde Internet).
#   - Solo GET y HEAD; no recibe datos, no procesa nada y no guarda nada.
#   - No sirve archivos ocultos (.algo) ni nada fuera de esta carpeta.
#   - Envía las cabeceras de seguridad (CSP incluida) de herramientas/cabeceras-http-recomendadas.txt.
#
# Uso: clic derecho → «Ejecutar con PowerShell», o desde una consola en esta carpeta:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\servidor-local.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\servidor-local.ps1 -Puerto 8123
# Para pararlo: Ctrl+C (o cerrar la ventana).
# =====================================================================================================
param([int]$Puerto = 8080)

$ErrorActionPreference = 'Stop'
$Raiz = [System.IO.Path]::GetFullPath($PSScriptRoot)

$Csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src 'self'; " +
       "style-src 'self'; img-src 'none'; font-src 'none'; media-src 'none'; manifest-src 'none'; object-src 'none'; " +
       "frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
$Cabeceras = [ordered]@{
  'Content-Security-Policy'      = $Csp
  'Cross-Origin-Opener-Policy'   = 'same-origin'
  'Cross-Origin-Resource-Policy' = 'same-origin'
  'X-Content-Type-Options'       = 'nosniff'
  'Referrer-Policy'              = 'no-referrer'
  'Permissions-Policy'           = 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), payment=(), clipboard-read=()'
  'Cache-Control'                = 'no-store'
}
$Tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.wasm' = 'application/wasm'; '.gz' = 'application/gzip'; '.txt' = 'text/plain; charset=utf-8'
  '.bcmap' = 'application/octet-stream'; '.pfb' = 'application/octet-stream'; '.ttf' = 'font/ttf'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.pdf' = 'application/pdf'
}

function Responder-Error($Respuesta, [int]$Codigo, [string]$Texto) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Texto)
  $Respuesta.StatusCode = $Codigo
  $Respuesta.ContentType = 'text/plain; charset=utf-8'
  foreach ($k in $Cabeceras.Keys) { $Respuesta.Headers[$k] = $Cabeceras[$k] }
  $Respuesta.ContentLength64 = $bytes.Length
  $Respuesta.OutputStream.Write($bytes, 0, $bytes.Length)
  $Respuesta.Close()
}

$Escucha = New-Object System.Net.HttpListener
# «localhost» (no «+» ni «*»): solo conexiones desde este ordenador y sin permisos de administrador.
$Escucha.Prefixes.Add("http://localhost:$Puerto/")
try { $Escucha.Start() } catch {
  Write-Host "No se pudo abrir el puerto $Puerto ($($_.Exception.Message)). Prueba otro: -Puerto 8123" -ForegroundColor Red
  exit 1
}
Write-Host "Idefix1.0 — sirviendo $Raiz"
Write-Host "Abre en Chrome o Edge: http://localhost:$Puerto/   (demo OCR: http://localhost:$Puerto/demo-ocr.html)"
Write-Host "Solo accesible desde este ordenador. Ctrl+C para parar."

try {
  while ($Escucha.IsListening) {
    $Contexto = $Escucha.GetContext()
    $Peticion = $Contexto.Request
    $Respuesta = $Contexto.Response
    try {
      if (-not $Peticion.IsLocal) { Responder-Error $Respuesta 403 'Solo acceso local'; continue }
      if ($Peticion.HttpMethod -ne 'GET' -and $Peticion.HttpMethod -ne 'HEAD') { Responder-Error $Respuesta 405 'Método no permitido'; continue }

      $Ruta = [System.Uri]::UnescapeDataString($Peticion.Url.AbsolutePath)
      if ($Ruta -eq '/' -or $Ruta -eq '') { $Ruta = '/index.html' }
      $Partes = $Ruta.Split('/') | Where-Object { $_ -ne '' }
      $Mala = $false
      foreach ($p in $Partes) { if ($p.StartsWith('.') -or $p.Contains('\') -or $p.Contains(':')) { $Mala = $true } }
      if ($Mala) { Responder-Error $Respuesta 404 'No encontrado'; continue }

      $Destino = [System.IO.Path]::GetFullPath((Join-Path $Raiz ($Partes -join '\')))
      if (-not $Destino.StartsWith($Raiz + '\', [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $Destino -PathType Leaf)) {
        Responder-Error $Respuesta 404 'No encontrado'; continue
      }

      $Ext = [System.IO.Path]::GetExtension($Destino).ToLowerInvariant()
      $Tipo = $Tipos[$Ext]; if (-not $Tipo) { $Tipo = 'application/octet-stream' }
      $Bytes = [System.IO.File]::ReadAllBytes($Destino)
      $Respuesta.StatusCode = 200
      $Respuesta.ContentType = $Tipo
      foreach ($k in $Cabeceras.Keys) { $Respuesta.Headers[$k] = $Cabeceras[$k] }
      $Respuesta.ContentLength64 = $Bytes.Length
      if ($Peticion.HttpMethod -eq 'GET') { $Respuesta.OutputStream.Write($Bytes, 0, $Bytes.Length) }
      $Respuesta.Close()
      Write-Host ("{0:HH:mm:ss}  {1} {2}  200" -f (Get-Date), $Peticion.HttpMethod, $Ruta)
    } catch {
      try { Responder-Error $Respuesta 500 'Error interno' } catch { }
      Write-Host ("Error: " + $_.Exception.Message) -ForegroundColor Yellow
    }
  }
} finally {
  $Escucha.Stop()
  $Escucha.Close()
}
