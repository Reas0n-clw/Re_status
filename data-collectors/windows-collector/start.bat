@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Force English/basic output to avoid codepage issues
chcp 65001 >nul 2>&1

REM Resolve script dir so it can run from any location
set "SCRIPT_DIR=%~dp0"
set "PROJECT_NAME=Windows-Collector"
set "COLLECTOR_DIR=%SCRIPT_DIR%"
set "NODE_EXE=node"
set "START_CMD=npm start"

REM Move to collector directory
pushd "%COLLECTOR_DIR%" || (
  echo [ERROR] Failed to change to collector dir: %COLLECTOR_DIR%
  exit /b 1
)

REM Check Node.js
where "%NODE_EXE%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js.
  popd
  exit /b 1
)

REM Check npm
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Please install Node.js.
  popd
  exit /b 1
)

REM Install deps if missing
if not exist "node_modules\" (
  echo [INFO] node_modules not found, installing...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    popd
    exit /b 1
  )
)

REM Args
if /i "%~1"=="silent"     goto silent
if /i "%~1"=="install"    goto install
if /i "%~1"=="uninstall"  goto uninstall
if /i "%~1"=="start"      goto start
goto normal

:normal
echo [INFO] Starting Windows Data Collector...
echo [INFO] Working dir: %COLLECTOR_DIR%
echo.
call %START_CMD%
goto end

:silent
echo [INFO] Starting collector in silent mode...
set "VBS_SCRIPT=%TEMP%\start_%PROJECT_NAME%_hidden.vbs"
(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%COLLECTOR_DIR%"
  echo WshShell.Run "cmd /c ""%START_CMD%""", 0, False
  echo Set WshShell = Nothing
) > "%VBS_SCRIPT%"
wscript.exe "%VBS_SCRIPT%"
timeout /t 2 /nobreak >nul
del "%VBS_SCRIPT%" >nul 2>&1
echo [INFO] Collector started in background.
goto end

:install
echo [INFO] Installing auto-start...
net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Admin privileges required. Please run as administrator.
  popd
  exit /b 1
)

REM Remove old task if exists
schtasks /query /tn "%PROJECT_NAME%" >nul 2>&1 && (
  echo [INFO] Updating existing task...
  schtasks /delete /tn "%PROJECT_NAME%" /f >nul 2>&1
)

schtasks /create /tn "%PROJECT_NAME%" ^
  /tr "\"%SCRIPT_DIR%start.bat\" silent" ^
  /sc onlogon /ru "SYSTEM" /rl highest /f >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Failed to install auto-start. Run as administrator.
  popd
  exit /b 1
)
echo [SUCCESS] Auto-start installed.
goto end

:uninstall
echo [INFO] Uninstalling auto-start...
net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Admin privileges required. Please run as administrator.
  popd
  exit /b 1
)

schtasks /query /tn "%PROJECT_NAME%" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Auto-start task not found.
) else (
  schtasks /delete /tn "%PROJECT_NAME%" /f >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Failed to uninstall auto-start.
    popd
    exit /b 1
  ) else (
    echo [SUCCESS] Auto-start removed.
  )
)
goto end

:start
REM For scheduled task launches
call %START_CMD%
goto end

:end
popd
endlocal
