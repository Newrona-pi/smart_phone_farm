
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $scriptDir "logs"
If (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $logDir "start_views_$timestamp.log"

Function Log-Write([string]$msg, [string]$color = "White") {
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $formattedMsg = "[$time] $msg"
    Write-Host $msg -ForegroundColor $color
    Add-Content -Path $logFile -Value $formattedMsg
}

Log-Write "=== START DEBUG SESSION: $timestamp ===" "Cyan"
Log-Write "Script Dir: $scriptDir"

# Load Config
$configPath = Join-Path $scriptDir "..\..\config\config.json"
$resolvedConfig = Resolve-Path $configPath -ErrorAction SilentlyContinue
if (-not $resolvedConfig) {
    Log-Write "ERROR: Config file not found at: $configPath" "Red"
    exit 1
}

Log-Write "Config Path: $($resolvedConfig.Path)"
try {
    $json = Get-Content $resolvedConfig.Path -Raw | ConvertFrom-Json
}
catch {
    Log-Write "ERROR: Failed to parse config.json: $_" "Red"
    exit 1
}

# Resolve devices
$devices = $json.devices
if (-not $devices) {
    if ($json.android -and $json.android.devices) {
        $devices = $json.android.devices
        Log-Write "Warning: Using legacy 'android.devices' schema." "Yellow"
    }
    else {
        Log-Write "ERROR: Invalid config schema. Expected 'devices' or 'android.devices'." "Red"
        exit 1
    }
}
Log-Write "Configured Devices Count: $($devices.Count)"

# Check ADB
Log-Write "Executing 'adb devices'..."
$adbOutput = adb devices 2>&1
Log-Write "--- ADB OUTPUT START ---"
$adbOutput | ForEach-Object { Add-Content -Path $logFile -Value $_; Write-Host $_ -ForegroundColor Gray }
Log-Write "--- ADB OUTPUT END ---"

$onlineIds = @()
if ($adbOutput) {
    $lines = $adbOutput -split "`n" | Where-Object { $_ -match "\s+device$" }
    foreach ($line in $lines) {
        $parts = $line -split "\s+"
        if ($parts.Count -ge 1) { $onlineIds += $parts[0] }
    }
}
Log-Write "Online Device IDs: $($onlineIds -join ', ')"

# Launch Loop
$basePort = 27183
$i = 0
$attemptedCount = 0

foreach ($dev in $devices) {
    $id = $dev.id
    $name = $dev.name
    
    Log-Write "Processing [$name] ($id)..." "White"
    
    if ($onlineIds -contains $id) {
        $port = $basePort + $i
        $argsList = "-s $id", "--window-title `"$name`"", "--port $port"
        
        Log-Write "  -> Status: ONLINE" "Green"
        Log-Write "  -> Launching scrcpy on Port $port"
        Log-Write "  -> Command: Start-Process scrcpy -ArgumentList $($argsList -join ' ')"
        
        try {
            Start-Process scrcpy -ArgumentList $argsList
            $attemptedCount++
        }
        catch {
            Log-Write "  -> ERROR: Failed to start process: $_" "Red"
        }
        $i++
    }
    else {
        Log-Write "  -> Status: SKIPPED (Not found or Unauthorized/Offline)" "Yellow"
    }
}

Start-Sleep -Seconds 2

Log-Write "Checking active scrcpy processes..."
$procs = Get-Process scrcpy -ErrorAction SilentlyContinue
if ($procs) {
    Log-Write "Active scrcpy instances: $($procs.Count)"
    $procs | ForEach-Object { Log-Write "  PID: $($_.Id), Name: $($_.ProcessName)" }
}
else {
    Log-Write "Active scrcpy instances: 0"
}

# Validation
$exitCode = 0
if ($attemptedCount -gt 0 -and ($null -eq $procs -or $procs.Count -lt $attemptedCount)) {
    Log-Write "WARNING: Launched $attemptedCount instances but fewer are running. Some may have crashed immediately." "Red"
    # Not strictly failing exit code unless 0 running? User asked for mismatch check.
    # "if mismatch -> EXITCODE=1"
    if ($procs.Count -ne $attemptedCount) {
        $exitCode = 1
        Log-Write "FAIL: Process count mismatch." "Red"
    }
}
elseif ($attemptedCount -eq 0) {
    Log-Write "WARNING: No devices were launched." "Yellow"
}
else {
    Log-Write "SUCCESS: All attempted instances seem running." "Green"
}

Log-Write "=== END DEBUG SESSION ==="
exit $exitCode
