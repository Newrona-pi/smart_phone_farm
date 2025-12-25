@echo off
cd /d "C:\Users\se_pi\Desktop\Playwright"
call npm run run -- --job androidRecover >> logs\scheduler_recover.log 2>&1
