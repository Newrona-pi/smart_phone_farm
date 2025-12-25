@echo off
setlocal
set "ROOT=%~dp0"
set "LOGDIR=%ROOT%bat_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

set "LOG=%LOGDIR%\androidPing_%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log"
set "LOG=%LOG: =0%"

echo ===== androidPing BAT start ===== > "%LOG%"
echo Time: %date% %time% >> "%LOG%"
echo ROOT: %ROOT% >> "%LOG%"

cd /d "%ROOT%" >> "%LOG%" 2>&1
echo CurrentDir: %cd% >> "%LOG%"

echo --- where node/npm --- >> "%LOG%"
where node >> "%LOG%" 2>&1
where npm  >> "%LOG%" 2>&1

echo --- npm run androidPing --- >> "%LOG%"
call npm run run -- --job androidPing >> "%LOG%" 2>&1

echo ExitCode: %errorlevel% >> "%LOG%"
echo ===== androidPing BAT end ===== >> "%LOG%"

REM ここで止める（もし閉じるなら、ログだけ見れば原因が分かる）
exit
endlocal
