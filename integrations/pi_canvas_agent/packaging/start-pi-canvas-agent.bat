@echo off
setlocal
set "PACKAGING_DIR=%~dp0"
set "PACKAGE_ROOT=%PACKAGING_DIR%..\"
set "PROJECT_ROOT=%PACKAGE_ROOT%..\..\"
set "NODE_EXE=%PROJECT_ROOT%vendor\node\windows-x64\node.exe"
set "RUNNER_JS=%PACKAGE_ROOT%dist\runner.js"
if not exist "%NODE_EXE%" (
  echo Missing bundled Node runtime: %NODE_EXE% 1>&2
  exit /b 2
)
if not exist "%RUNNER_JS%" (
  echo Missing Pi Canvas Agent runner: %RUNNER_JS% 1>&2
  exit /b 3
)
cd /d "%PACKAGE_ROOT%dist"
"%NODE_EXE%" "%RUNNER_JS%" %*
