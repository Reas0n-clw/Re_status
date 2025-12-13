# Windows Data Collector Startup Script - PowerShell Version
# Usage:
#   1. Direct run: .\start.ps1
#   2. Silent run: .\start.ps1 -Silent
#   3. Install auto-start: .\start.ps1 -Install
#   4. Uninstall auto-start: .\start.ps1 -Uninstall

param(
    [switch]$Silent,
    [switch]$Install,
    [switch]$Uninstall
)

# Set console encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
if ($PSVersionTable.PSVersion.Major -ge 5) {
    $PSDefaultParameterValues['*:Encoding'] = 'utf8'
}

$ErrorActionPreference = "Stop"
$ProjectName = "Windows-Collector"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CollectorDir = $ScriptDir

# Check if Node.js is installed
try {
    $null = Get-Command node -ErrorAction Stop
} catch {
    Write-Host '[Error] Node.js not found, please install Node.js first' -ForegroundColor Red
    exit 1
}

# Check if npm is installed
try {
    $null = Get-Command npm -ErrorAction Stop
} catch {
    Write-Host '[Error] npm not found, please install Node.js first' -ForegroundColor Red
    exit 1
}

Set-Location $CollectorDir

# Check if dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host '[Warning] node_modules directory not found, installing dependencies...' -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[Error] Failed to install dependencies' -ForegroundColor Red
        exit 1
    }
}

# Process parameters
if ($Install) {
    Write-Host 'Info: Installing auto-start...' -ForegroundColor Yellow
    
    # Check administrator privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host '[Error] Administrator privileges required, please run PowerShell as administrator' -ForegroundColor Red
        exit 1
    }
    
    # Check if task already exists
    $task = Get-ScheduledTask -TaskName $ProjectName -ErrorAction SilentlyContinue
    if ($task) {
        Write-Host '[Warning] Auto-start task already exists, updating...' -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $ProjectName -Confirm:$false
    }
    
    # Create scheduled task
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptDir\start.ps1`" -Silent" -WorkingDirectory $CollectorDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName $ProjectName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Windows Data Collector Auto-start Service" | Out-Null
    
    Write-Host '[Success] Auto-start installed' -ForegroundColor Green
    Write-Host ("Info: Task name: {0}" -f $ProjectName) -ForegroundColor Cyan
    Write-Host 'Info: Run as: SYSTEM account (highest privileges)' -ForegroundColor Cyan
    Write-Host 'Info: Startup: Auto-start on user login' -ForegroundColor Cyan
    exit 0
}

if ($Uninstall) {
    Write-Host 'Info: Uninstalling auto-start...' -ForegroundColor Yellow
    
    # Check administrator privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host '[Error] Administrator privileges required, please run PowerShell as administrator' -ForegroundColor Red
        exit 1
    }
    
    $task = Get-ScheduledTask -TaskName $ProjectName -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host '[Warning] Auto-start task not found' -ForegroundColor Yellow
    } else {
        Unregister-ScheduledTask -TaskName $ProjectName -Confirm:$false
        Write-Host '[Success] Auto-start uninstalled' -ForegroundColor Green
    }
    exit 0
}

if ($Silent) {
    Write-Host "Info: Starting Windows Data Collector in silent mode..." -ForegroundColor Yellow
    
    # Use cmd.exe to execute npm command in hidden window
    # This works reliably with npm.cmd files
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start" -WorkingDirectory $CollectorDir -WindowStyle Hidden -PassThru
    
    Start-Sleep -Seconds 2
    
    if ($process -and -not $process.HasExited) {
        Write-Host ("Info: Collector started in background (PID: {0})" -f $process.Id) -ForegroundColor Green
    } else {
        Write-Host '[Warning] Collector might have failed to start, please check logs' -ForegroundColor Yellow
    }
    exit 0
}

# Normal startup
Write-Host "Info: Starting Windows Data Collector..." -ForegroundColor Yellow
Write-Host ("Info: Working directory: {0}" -f $CollectorDir) -ForegroundColor Cyan
Write-Host ''

& npm start

