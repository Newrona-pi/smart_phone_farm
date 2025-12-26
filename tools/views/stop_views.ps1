
Write-Host "Stopping all scrcpy processes..." -ForegroundColor Yellow
Stop-Process -Name scrcpy -ErrorAction SilentlyContinue
Write-Host "All scrcpy views closed." -ForegroundColor Green
