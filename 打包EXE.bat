@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_CMD="
set "BUILD_VENV=%TEMP%\huanying-build-venv"
set "BUILD_PYTHON=%BUILD_VENV%\Scripts\python.exe"

where py >nul 2>nul
if not errorlevel 1 (
  py -3.12 -c "import sys" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=py -3.12"
  )
)

if not defined PYTHON_CMD (
  if exist "C:\Python312\python.exe" (
    "C:\Python312\python.exe" -c "import sys" >nul 2>nul
    if not errorlevel 1 (
      set "PYTHON_CMD=C:\Python312\python.exe"
    )
  )
)

if not defined PYTHON_CMD (
  if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" -c "import sys" >nul 2>nul
    if not errorlevel 1 (
      set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    )
  )
)

if not defined PYTHON_CMD (
  where python >nul 2>nul
  if errorlevel 1 (
    echo [error] Python 3.12 or newer was not found on PATH.
    pause
    exit /b 1
  )
  python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul
  if errorlevel 1 (
    echo [error] Python 3.12 or newer is required.
    pause
    exit /b 1
  )
  set "PYTHON_CMD=python"
)

echo [info] Using interpreter: %PYTHON_CMD%

if not exist "%BUILD_PYTHON%" (
  echo [setup] Creating temporary build environment...
  %PYTHON_CMD% -m venv "%BUILD_VENV%"
  if errorlevel 1 (
    echo [error] Failed to create the temporary build environment.
    pause
    exit /b 1
  )
)

echo [info] Checking packaging dependencies...
if not exist "%BUILD_VENV%\.deps_installed" (
  echo [setup] Installing build dependencies. The first run may take a while...
  "%BUILD_PYTHON%" -m pip install --upgrade pip
  if errorlevel 1 (
    echo [error] Failed to upgrade pip.
    pause
    exit /b 1
  )
  "%BUILD_PYTHON%" -m pip install pyinstaller -r requirements.txt
  if errorlevel 1 (
    echo [error] Failed to install build dependencies.
    pause
    exit /b 1
  )
  type nul > "%BUILD_VENV%\.deps_installed"
)

echo [info] Building the onefile EXE...
"%BUILD_PYTHON%" tools\build_windows_onefile.py
if errorlevel 1 (
  echo.
  echo [error] Build failed. Check the output above.
  pause
  exit /b 1
)

echo.
echo [ok] Build finished successfully.
echo [ok] Output folder: release\windows
pause
