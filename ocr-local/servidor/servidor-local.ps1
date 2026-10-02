<#
  Ruta: ocr-local/servidor/servidor-local.ps1
  Servidor estático MÍNIMO y OPCIONAL para la demostración OCR local (alternativa a abrir
  index.html con doble clic). Solo hace falta si su Chrome/Edge tiene bloqueado file:// por
  política de empresa o si prefiere recibir la CSP también como cabecera HTTP.

  - Usa System.Net.Sockets.TcpListener ligado a 127.0.0.1: no necesita permisos de
    administrador ni reservas de URL (netsh), y no es accesible desde otros equipos.
  - Sirve únicamente archivos de la carpeta ocr-local\ con extensiones permitidas.
  - Solo GET y HEAD; sin listados de carpetas; sin archivos ocultos; sin salir de la carpeta.
  - Comprueba la cabecera Host (protección frente a «DNS rebinding»).
  - Añade la misma CSP que index.html y cabeceras de seguridad.
  - No recibe, guarda ni procesa documentos: el OCR se hace en el navegador.

  Dependencias: Windows PowerShell 5.1 (incluido en Windows 10/11) o PowerShell 7.
  Uso:      powershell -NoProfile -ExecutionPolicy Bypass -File servidor-local.ps1 [-Puerto 8765] [-Navegador edge|chrome|ninguno]
            (o doble clic en iniciar-servidor-local.bat)
  Detener:  Ctrl+C
#>
[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Puerto = 8765,
  [ValidateSet('edge', 'chrome', 'ninguno')]
  [string]$Navegador = 'edge'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$IntentosDePuerto = 10
$MaxBytesCabecera = 16384
$MsTimeoutLectura = 5000
$MsEsperaMaxima = 10000
$Raiz = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$RaizConSeparador = $Raiz.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

$Tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.wasm' = 'application/wasm'
}

$Csp = "default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src blob:; " +
       "connect-src 'none'; img-src 'self' blob: data:; style-src 'self'; font-src 'none'; " +
       "media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; manifest-src 'none'; " +
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

$CabecerasSeguridad = [ordered]@{
  'Content-Security-Policy'      = $Csp
  'X-Content-Type-Options'       = 'nosniff'
  'Referrer-Policy'              = 'no-referrer'
  'X-Frame-Options'              = 'DENY'
  'Cross-Origin-Opener-Policy'   = 'same-origin'
  'Cross-Origin-Resource-Policy' = 'same-origin'
  'Permissions-Policy'           = 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), payment=()'
  'Cache-Control'                = 'no-store'
}

function Enviar-Respuesta {
  param(
    [System.Net.Sockets.NetworkStream]$Flujo,
    [int]$Codigo,
    [string]$Razon,
    [string]$TipoContenido,
    [byte[]]$Cuerpo,
    [bool]$SinCuerpo
  )
  $lineas = New-Object System.Collections.Generic.List[string]
  $lineas.Add("HTTP/1.1 $Codigo $Razon")
  $lineas.Add("Content-Type: $TipoContenido")
  $lineas.Add("Content-Length: $($Cuerpo.Length)")
  $lineas.Add('Connection: close')
  $lineas.Add('Server: OCRLocal')
  foreach ($nombre in $CabecerasSeguridad.Keys) {
    $lineas.Add("${nombre}: $($CabecerasSeguridad[$nombre])")
  }
  $cabecera = [System.Text.Encoding]::ASCII.GetBytes(($lineas -join "`r`n") + "`r`n`r`n")
  $Flujo.Write($cabecera, 0, $cabecera.Length)
  if (-not $SinCuerpo -and $Cuerpo.Length -gt 0) {
    $Flujo.Write($Cuerpo, 0, $Cuerpo.Length)
  }
  $Flujo.Flush()
}

function Enviar-Error {
  param([System.Net.Sockets.NetworkStream]$Flujo, [int]$Codigo, [string]$Razon, [string]$Texto, [bool]$SinCuerpo)
  $cuerpo = [System.Text.Encoding]::UTF8.GetBytes($Texto + "`n")
  Enviar-Respuesta -Flujo $Flujo -Codigo $Codigo -Razon $Razon -TipoContenido 'text/plain; charset=utf-8' -Cuerpo $cuerpo -SinCuerpo $SinCuerpo
}

function Leer-Cabecera {
  param([System.Net.Sockets.NetworkStream]$Flujo)
  $Flujo.ReadTimeout = $MsTimeoutLectura
  $memoria = New-Object System.IO.MemoryStream
  $bufer = New-Object byte[] 4096
  while ($memoria.Length -lt $MaxBytesCabecera) {
    $leidos = $Flujo.Read($bufer, 0, $bufer.Length)
    if ($leidos -le 0) { break }
    $memoria.Write($bufer, 0, $leidos)
    $texto = [System.Text.Encoding]::ASCII.GetString($memoria.ToArray())
    if ($texto.Contains("`r`n`r`n")) { return $texto }
  }
  return $null
}

function Resolver-Ruta {
  param([string]$RutaUrl)
  $sinConsulta = $RutaUrl.Split('?')[0].Split('#')[0]
  try {
    $ruta = [System.Uri]::UnescapeDataString($sinConsulta)
  } catch {
    return $null
  }
  if ($ruta.Contains([char]0) -or $ruta.Contains('\') -or $ruta.Contains(':')) { return $null }
  if (-not $ruta.StartsWith('/')) { return $null }
  if ($ruta -eq '/') { $ruta = '/index.html' }
  $partes = @($ruta.Split('/') | Where-Object { $_ -ne '' })
  if ($partes.Count -eq 0) { return $null }
  foreach ($parte in $partes) {
    if ($parte.StartsWith('.')) { return $null }
  }
  $absoluta = [System.IO.Path]::GetFullPath((Join-Path $Raiz ($partes -join [System.IO.Path]::DirectorySeparatorChar)))
  if (-not $absoluta.StartsWith($RaizConSeparador, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  $extension = [System.IO.Path]::GetExtension($absoluta).ToLowerInvariant()
  if (-not $Tipos.ContainsKey($extension)) { return $null }
  if (-not [System.IO.File]::Exists($absoluta)) { return $null }
  $atributos = [System.IO.File]::GetAttributes($absoluta)
  if (($atributos -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return $null }
  return $absoluta
}

function Atender-Cliente {
  param([System.Net.Sockets.TcpClient]$Cliente, [int]$PuertoActivo)
  $flujo = $Cliente.GetStream()
  try {
    $cabecera = Leer-Cabecera -Flujo $flujo
    if ($null -eq $cabecera) { return }
    $lineas = @($cabecera -split "`r`n" | Where-Object { $_ -ne '' })
    $peticion = $lineas[0].Split(' ')
    if ($peticion.Count -ne 3) {
      Enviar-Error -Flujo $flujo -Codigo 400 -Razon 'Bad Request' -Texto 'Petición no válida.' -SinCuerpo $false
      return
    }
    $metodo = $peticion[0]
    $rutaUrl = $peticion[1]
    $sinCuerpo = ($metodo -eq 'HEAD')
    $host_ = ''
    foreach ($linea in $lineas) {
      if ($linea -match '^(?i)host:\s*(.+)$') { $host_ = $Matches[1].Trim().ToLowerInvariant() }
    }
    $estado = 0
    if ($metodo -ne 'GET' -and $metodo -ne 'HEAD') {
      Enviar-Error -Flujo $flujo -Codigo 405 -Razon 'Method Not Allowed' -Texto 'Método no permitido.' -SinCuerpo $false
      $estado = 405
    } elseif ($host_ -ne "127.0.0.1:$PuertoActivo" -and $host_ -ne "localhost:$PuertoActivo") {
      Enviar-Error -Flujo $flujo -Codigo 421 -Razon 'Misdirected Request' -Texto 'Host no permitido.' -SinCuerpo $sinCuerpo
      $estado = 421
    } else {
      $absoluta = Resolver-Ruta -RutaUrl $rutaUrl
      if ($null -eq $absoluta) {
        Enviar-Error -Flujo $flujo -Codigo 404 -Razon 'Not Found' -Texto 'No encontrado.' -SinCuerpo $sinCuerpo
        $estado = 404
      } else {
        $bytes = [System.IO.File]::ReadAllBytes($absoluta)
        $tipo = $Tipos[[System.IO.Path]::GetExtension($absoluta).ToLowerInvariant()]
        Enviar-Respuesta -Flujo $flujo -Codigo 200 -Razon 'OK' -TipoContenido $tipo -Cuerpo $bytes -SinCuerpo $sinCuerpo
        $estado = 200
      }
    }
    $rutaVisible = $rutaUrl
    if ($rutaVisible.Length -gt 120) { $rutaVisible = $rutaVisible.Substring(0, 120) + '…' }
    Write-Host ("[{0}] {1} {2} {3}" -f (Get-Date -Format 'HH:mm:ss'), $metodo, $rutaVisible, $estado)
  } catch {
    Write-Host ("[{0}] Error atendiendo una petición: {1}" -f (Get-Date -Format 'HH:mm:ss'), $_.Exception.Message)
  } finally {
    $flujo.Dispose()
    $Cliente.Close()
  }
}

$escucha = $null
$puertoActivo = 0
for ($i = 0; $i -lt $IntentosDePuerto; $i++) {
  try {
    $candidato = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, ($Puerto + $i))
    $candidato.ExclusiveAddressUse = $true
    $candidato.Start()
    $escucha = $candidato
    $puertoActivo = $Puerto + $i
    break
  } catch {
    continue
  }
}
if ($null -eq $escucha) {
  Write-Host "No hay ningún puerto libre entre $Puerto y $($Puerto + $IntentosDePuerto - 1)."
  exit 1
}

$url = "http://127.0.0.1:$puertoActivo/"
Write-Host "OCR local · servidor estático en $url (solo este equipo)"
Write-Host "Carpeta servida: $Raiz"
Write-Host 'Pulse Ctrl+C para detener.'

if ($Navegador -ne 'ninguno') {
  $ejecutable = 'msedge.exe'
  if ($Navegador -eq 'chrome') { $ejecutable = 'chrome.exe' }
  try {
    Start-Process -FilePath $ejecutable -ArgumentList $url
  } catch {
    Write-Host "No se pudo abrir $ejecutable automáticamente. Abra $url en Chrome o Edge."
  }
}

# Bucle sin bloqueos: los navegadores abren conexiones «de reserva» sin enviar nada; si se
# esperase en cada una, las demás peticiones quedarían paradas. Solo se atiende una conexión
# cuando ya tiene datos, y las que llevan más de $MsEsperaMaxima ms sin enviar nada se cierran.
$enEspera = New-Object System.Collections.Generic.List[object]
try {
  while ($true) {
    $actividad = $false
    while ($escucha.Pending()) {
      $enEspera.Add([pscustomobject]@{ Cliente = $escucha.AcceptTcpClient(); Desde = [DateTime]::UtcNow })
      $actividad = $true
    }
    for ($j = $enEspera.Count - 1; $j -ge 0; $j--) {
      $entrada = $enEspera[$j]
      if ($entrada.Cliente.Available -gt 0) {
        $enEspera.RemoveAt($j)
        Atender-Cliente -Cliente $entrada.Cliente -PuertoActivo $puertoActivo
        $actividad = $true
      } elseif (([DateTime]::UtcNow - $entrada.Desde).TotalMilliseconds -gt $MsEsperaMaxima -or
                ($entrada.Cliente.Client.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead) -and $entrada.Cliente.Available -eq 0)) {
        # Sin datos durante demasiado tiempo, o conexión cerrada por el navegador.
        $enEspera.RemoveAt($j)
        $entrada.Cliente.Close()
      }
    }
    if (-not $actividad) {
      Start-Sleep -Milliseconds 10
    }
  }
} finally {
  foreach ($entrada in $enEspera) { $entrada.Cliente.Close() }
  $escucha.Stop()
  Write-Host 'Servidor detenido.'
}
