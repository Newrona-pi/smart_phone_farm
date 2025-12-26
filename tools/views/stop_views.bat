@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "stop_views.ps1"
if %errorlevel% neq 0 pause
