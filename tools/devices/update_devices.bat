@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "update_config_from_adb.ps1"
pause
