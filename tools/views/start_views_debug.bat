@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "start_views_debug.ps1"

IF %ERRORLEVEL% NEQ 0 (
    color 4F
    echo.
    echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    echo !!!        FAILED            !!!
    echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
) ELSE (
    color 2F
    echo.
    echo ================================
    echo           SUCCESS
    echo ================================
)

echo.
echo Check logs in tools\views\logs\ for details.
pause
