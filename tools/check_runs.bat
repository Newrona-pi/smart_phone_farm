@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
REM Remove trailing backslash if present
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Define project root (one level up from tools)
set "ROOT=%SCRIPT_DIR%\.."

echo =========================================
echo  Step 1: Running Android Ping...
echo =========================================
call "%ROOT%\run_androidPing.bat"

echo.
echo =========================================
echo  Step 2: Running Android Recover...
echo =========================================
call "%ROOT%\run_androidRecover.bat"

echo.
echo =========================================
echo  Step 3: Checking Results...
echo =========================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\tools\show_latest_run.ps1"

IF %ERRORLEVEL% NEQ 0 (
    color 4F
    echo.
    echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    echo !!!        FAILED            !!!
    echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    echo.
) ELSE (
    color 2F
    echo.
    echo ================================
    echo           SUCCESS
    echo ================================
    echo.
)

pause
