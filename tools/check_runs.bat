@echo off
cd /d "%~dp0"
echo =========================================
echo  Step 1: Running Android Ping...
echo =========================================
call ..\run_androidPing.bat

echo.
echo =========================================
echo  Step 2: Running Android Recover...
echo =========================================
call ..\run_androidRecover.bat

echo.
echo =========================================
echo  Step 3: Checking Results...
echo =========================================
powershell -NoProfile -ExecutionPolicy Bypass -File "show_latest_run.ps1"

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
