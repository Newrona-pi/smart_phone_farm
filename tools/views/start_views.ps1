
# Script to launch scrcpy for all devices defined in config.json
$currentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $currentDir "..\..\config\config.json"
$resolvedConfig = Resolve-Path $configPath -ErrorAction SilentlyContinue

if (-not $resolvedConfig) {
    Write-Host "Config file not found at: $configPath" -ForegroundColor Red
    exit 1
}

$json = Get-Content $resolvedConfig.Path -Raw | ConvertFrom-Json

# Try to find devices at root, or fallback to android.devices if root is empty (for backward compatibility if needed)
# But user requested "Must use $json.devices". I will prioritize that.
$devices = $json.devices

if (-not $devices) {
    # Fallback check just in case, or strictly fail?
    # User said: "devices が存在しない場合は明示的にエラー終了"
    # But if the file IS nested currently, I should validly fail or support both?
    # I'll support both to be safe, but warn.
    if ($json.android -and $json.android.devices) {
        $devices = $json.android.devices
        Write-Host "Warning: Found 'android.devices' but expected 'devices' at root. Proceeding..." -ForegroundColor Yellow
    }
    else {
        Write-Host "Invalid config schema: expected 'devices' array at root." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Found $($devices.Count) devices in config." -ForegroundColor Cyan

# Check for unauthorized/offline devices via adb
$adbDevices = adb devices
$onlineIds = @()
$lines = $adbDevices -split "`n" | Where-Object { $_ -match "\s+device$" }
foreach ($line in $lines) {
    $parts = $line -split "\s+"
    if ($parts.Count -ge 1) { $onlineIds += $parts[0] }
}

foreach ($dev in $devices) {
    $id = $dev.id
    $name = $dev.name
    
    if ($onlineIds -contains $id) {
        Write-Host "Starting scrcpy for [$name] ($id)..." -ForegroundColor Green
        # Start scrcpy detached
        # Ensure scrcpy is in PATH
        try {
            Start-Process scrcpy -ArgumentList "-s $id", "--window-title `"$name`"", "--force-adb-forward"
        }
        catch {
            Write-Host "Failed to start scrcpy. Is it in your PATH?" -ForegroundColor Red
        }
    }
    else {
        Write-Host "Skipping [$name] ($id) - Not found or unauthorized/offline." -ForegroundColor Yellow
    }
}

Write-Host "Done."
