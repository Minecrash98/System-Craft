@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "HOST=127.0.0.1"
set "PORT=30021"

if not "%~1"=="" (
  set "PORT=%~1"
)

echo [start] Checking for processes listening on TCP port %PORT%...
set "FOUND_LISTENER="

for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    if not defined KILLED_%%P (
      set "KILLED_%%P=1"
      set "FOUND_LISTENER=1"
      echo [start] Stopping PID %%P on port %PORT%...
      taskkill /pid %%P /t /f >nul 2>&1
      if errorlevel 1 (
        echo [start] Warning: failed to stop PID %%P. Try running this script as Administrator.
      )
    )
  )
)

if not defined FOUND_LISTENER (
  echo [start] No listener found on port %PORT%.
)

echo [start] Starting SystemCraft on http://%HOST%:%PORT%

if "%PORT%"=="30021" (
  npm.cmd run dev
) else (
  if exist "node_modules\.bin\next.cmd" (
    node_modules\.bin\next.cmd dev -H %HOST% -p %PORT%
  ) else (
    echo [start] node_modules not found. Run npm install first.
    exit /b 1
  )
)
