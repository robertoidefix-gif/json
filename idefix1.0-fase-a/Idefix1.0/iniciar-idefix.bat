@echo off
rem Idefix1.0 - arranca el servidor local (PowerShell incluido en Windows) y abre la aplicacion.
rem No instala nada. Para parar el servidor, cierra la ventana negra de PowerShell.
cd /d "%~dp0"
start "Idefix1.0 - servidor local" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-local.ps1" -Puerto 8080
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/"
