@echo off
setlocal
cd /d "%~dp0"

set "APP_PORT=8777"
set "APP_URL=http://127.0.0.1:%APP_PORT%/"
set "LISTEN_PID="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
  set "LISTEN_PID=%%P"
)

if defined LISTEN_PID (
  echo [info] Project is already running. Port: %APP_PORT%, PID: %LISTEN_PID%
  echo [info] Opening browser: %APP_URL%
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "start_windows_dev.bat" (
  echo [error] start_windows_dev.bat was not found. Put this script in the project root.
  pause
  exit /b 1
)

echo [info] Starting project...
start "Huanying Server" cmd /k ""%~dp0start_windows_dev.bat""

exit /b 0
