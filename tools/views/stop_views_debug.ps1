
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $scriptDir "logs"
If (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $logDir "stop_views_$timestamp.log"

Function Log-Write([string]$msg, [string]$color = "White") {
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $formattedMsg = "[$time] $msg"
    Write-Host $msg -ForegroundColor $color
    Add-Content -Path $logFile -Value $formattedMsg
}

Log-Write "=== STOP VIEW DEBUG: $timestamp ===" "Cyan"

$procs = Get-Process scrcpy -ErrorAction SilentlyContinue
if ($procs) {
    Log-Write "Found $($procs.Count) active scrcpy processes."
    foreach ($p in $procs) {
        Log-Write "  Stopping PID: $($p.Id)..."
        try {
            Stop-Process -Id $p.Id -Force -ErrorAction Stop
            Log-Write "    -> Stopped." "Green"
        }
        catch {
            Log-Write "    -> ERROR: $_" "Red"
        }
    }
}
else {
    Log-Write "No scrcpy processes found." "Yellow"
}

Log-Write "=== END STOP SESSION ==="
