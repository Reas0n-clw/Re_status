@echo off
chcp 65001 >nul 2>&1
REM Re_status Startup Script - Windows Version
REM Usage:
REM   1. Direct run: double-click start.bat or run start.bat in command line
REM   2. Silent run: start.bat silent
REM   3. Install auto-start: start.bat install
REM   4. Uninstall auto-start: start.bat uninstall

setlocal enabledelayedexpansion

REM Get project root directory (script is in scripts folder, need to go up one level)
set SCRIPT_DIR=%~dp0
set PROJECT_NAME=Re_status
set NODE_EXE=node
set START_CMD=npm run deploy:native

REM Switch to project root directory
cd /d "%SCRIPT_DIR%"
cd /d ".."
set PROJECT_ROOT=%CD%

REM Check if Node.js is installed
where %NODE_EXE% >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Node.js not found, please install Node.js first
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] npm not found, please install Node.js first
    pause
    exit /b 1
)

REM Process command line arguments
if "%1"=="silent" goto :silent
if "%1"=="install" goto :install
if "%1"=="uninstall" goto :uninstall
if "%1"=="start" goto :start
goto :normal

:normal
echo [Info] Starting %PROJECT_NAME%...
echo [Info] Working directory: %PROJECT_ROOT%
echo.
call %START_CMD%
goto :end

:silent
echo [Info] Starting %PROJECT_NAME% in silent mode...
REM Use VBScript to create hidden window
set VBS_SCRIPT=%TEMP%\start_%PROJECT_NAME%_hidden.vbs
(
    echo Set WshShell = CreateObject^("WScript.Shell"^)
    echo WshShell.CurrentDirectory = "%PROJECT_ROOT%"
    echo WshShell.Run "cmd /c ""%START_CMD%""", 0, False
    echo Set WshShell = Nothing
) > "%VBS_SCRIPT%"
wscript.exe "%VBS_SCRIPT%"
timeout /t 2 /nobreak >nul
del "%VBS_SCRIPT%" >nul 2>&1
echo [Info] Service started in background
goto :end

:install
echo [Info] Installing auto-start...
REM Check administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Administrator privileges required, please run as administrator
    pause
    exit /b 1
)

REM Check if already installed
schtasks /query /tn "%PROJECT_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [Warning] Auto-start task already exists, updating...
    schtasks /delete /tn "%PROJECT_NAME%" /f >nul 2>&1
)

REM Create scheduled task
schtasks /create /tn "%PROJECT_NAME%" /tr "\"%SCRIPT_DIR%start.bat\" silent" /sc onlogon /ru "SYSTEM" /rl highest /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [Success] Auto-start installed
    echo [Info] Task name: %PROJECT_NAME%
    echo [Info] Run as: SYSTEM account (highest privileges)
    echo [Info] Startup: Auto-start on user login
) else (
    echo [Error] Installation failed, please check if running as administrator
    pause
    exit /b 1
)
goto :end

:uninstall
echo [Info] Uninstalling auto-start...
REM Check administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Administrator privileges required, please run as administrator
    pause
    exit /b 1
)

schtasks /query /tn "%PROJECT_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [Warning] Auto-start task not found
) else (
    schtasks /delete /tn "%PROJECT_NAME%" /f >nul 2>&1
    if %errorlevel% equ 0 (
        echo [Success] Auto-start uninstalled
    ) else (
        echo [Error] Uninstallation failed, please check if running as administrator
        pause
        exit /b 1
    )
)
goto :end

:start
REM For scheduled task startup
cd /d "%PROJECT_ROOT%"
call %START_CMD%
goto :end

:end
endlocal
