@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "stop_views_debug.ps1"
echo.
echo Check logs in tools\views\logs\ for details.
pause
