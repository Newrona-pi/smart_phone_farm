@echo off
cd /d "C:\Users\se_pi\Desktop\Playwright"
call npm run run -- --job androidPing >> logs\scheduler_ping.log 2>&1
