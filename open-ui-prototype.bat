@echo off
setlocal

set "ROOT=%~dp0"
set "TARGET=%ROOT%prototypes\ui-rebuild\index.html"

if not exist "%TARGET%" (
  echo Prototype not found:
  echo %TARGET%
  pause
  exit /b 1
)

start "" "%TARGET%"
exit /b 0
