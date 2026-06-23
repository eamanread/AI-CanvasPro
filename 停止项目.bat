@echo off
setlocal
cd /d "%~dp0"

set "APP_PORT=8777"
set "FOUND="

echo [info] Looking for process listening on port %APP_PORT%...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo [info] Stopping PID: %%P
  taskkill /PID %%P /T /F >nul 2>nul
  if errorlevel 1 (
    echo [warn] Failed to stop PID %%P. Try running this script as administrator.
  ) else (
    echo [ok] Stopped PID: %%P
  )
)

if not defined FOUND (
  echo [info] No process is listening on port %APP_PORT%.
)

pause
