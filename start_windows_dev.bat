@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_CMD="

where py >nul 2>nul
if not errorlevel 1 (
  py -3.12 -c "import sys" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=py -3.12"
  )
)

if not defined PYTHON_CMD (
  where python >nul 2>nul
  if errorlevel 1 (
    echo [error] Python 3.12+ not found. Install Python 3.12 or newer first.
    pause
    exit /b 1
  )
  python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul
  if errorlevel 1 (
    echo [error] Python 3.12+ is required.
    pause
    exit /b 1
  )
  set "PYTHON_CMD=python"
)

if not exist "venv\Scripts\python.exe" (
  echo [setup] Creating virtual environment...
  %PYTHON_CMD% -m venv venv
  if errorlevel 1 (
    echo [error] Failed to create venv.
    pause
    exit /b 1
  )
)

call "venv\Scripts\activate.bat"
if errorlevel 1 (
  echo [error] Failed to activate venv.
  pause
  exit /b 1
)

if not exist "venv\.deps_installed" (
  echo [setup] Installing Python dependencies...
  python -m pip install --upgrade pip
  if errorlevel 1 (
    echo [error] Failed to upgrade pip.
    pause
    exit /b 1
  )
  pip install -r requirements.txt
  if errorlevel 1 (
    echo [error] Failed to install Python dependencies.
    pause
    exit /b 1
  )
  type nul > "venv\.deps_installed"
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [warn] ffmpeg is not on PATH. The app can start, but local audio/video processing features may fail.
)

echo [info] Starting server at http://127.0.0.1:8777/
start "" cmd /c "timeout /t 2 /nobreak >nul && start \"\" http://127.0.0.1:8777/"
python server.py
