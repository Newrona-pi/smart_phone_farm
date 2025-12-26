
$configPath = "..\..\config\config.json"
$resolvedConfigPath = Resolve-Path $configPath

Write-Host "Checking connected ADB devices..." -ForegroundColor Cyan

# Get ADB devices output
$adbOutput = adb devices

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to execute 'adb devices'. Please ensure ADB is in PATH." -ForegroundColor Red
    exit 1
}

$validDevices = @()
$ignoredDevices = @()

# Parse output (Skip first line "List of devices attached")
$lines = $adbOutput -split "`n" | Where-Object { $_ -match "\S" } | Select-Object -Skip 1

foreach ($line in $lines) {
    $parts = $line -split "\s+"
    if ($parts.Count -ge 2) {
        $id = $parts[0]
        $status = $parts[1]

        if ($status -eq "device") {
            $validDevices += $id
        } else {
            $ignoredDevices += [PSCustomObject]@{ Id = $id; Status = $status }
        }
    }
}

# Report status
if ($ignoredDevices.Count -gt 0) {
    Write-Host "`n[Ignored Devices]" -ForegroundColor Yellow
    $ignoredDevices | ForEach-Object { Write-Host "  $($_.Id): $($_.Status)" -ForegroundColor Gray }
}

if ($validDevices.Count -eq 0) {
    Write-Host "`nNo valid 'device' state devices found." -ForegroundColor Red
    Write-Host "Config file will NOT be updated."
    exit 1
}

Write-Host "`n[Valid Devices Found]" -ForegroundColor Green
$validDevices | ForEach-Object { Write-Host "  $_" }

# Load existing config
$json = Get-Content $resolvedConfigPath -Raw | ConvertFrom-Json

# Update devices list
$newDeviceList = @()
$counter = 1
foreach ($id in $validDevices) {
    $name = "Android-{0:D2}" -f $counter
    $newDeviceList += [PSCustomObject]@{
        id = $id
        name = $name
    }
    $counter++
}

$json.android.devices = $newDeviceList

# Save config
$json | ConvertTo-Json -Depth 10 | Set-Content $resolvedConfigPath -Encoding UTF8

Write-Host "`nUPDATED: $resolvedConfigPath" -ForegroundColor Cyan
Write-Host "---------------------------------------------------"
$newDeviceList | Format-Table -AutoSize
Write-Host "---------------------------------------------------"
Write-Host "Done."
