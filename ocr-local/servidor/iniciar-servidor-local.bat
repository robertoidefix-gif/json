@echo off
rem Ruta: ocr-local/servidor/iniciar-servidor-local.bat
rem Arranca el servidor estatico OPCIONAL (solo 127.0.0.1) y abre la demo en Microsoft Edge.
rem Para usar Chrome: iniciar-servidor-local.bat chrome
rem Dependencias: servidor-local.ps1 en esta misma carpeta; Windows PowerShell 5.1 (incluido en Windows).
rem -ExecutionPolicy Bypass afecta solo a este proceso; revise servidor-local.ps1 antes de ejecutarlo.
setlocal
set "NAVEGADOR=%~1"
if "%NAVEGADOR%"=="" set "NAVEGADOR=edge"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-local.ps1" -Navegador "%NAVEGADOR%"
endlocal
