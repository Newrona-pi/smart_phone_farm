
$currentScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $currentScriptDir "..\runs"
$logDir = Resolve-Path $logDir -ReturnValue -ErrorAction SilentlyContinue

if (-not $logDir -or -not (Test-Path $logDir)) {
    Write-Host "Runs directory not found at: $logDir" -ForegroundColor Red
    exit 1
}

$runs = Get-ChildItem -Path $logDir -Directory | Sort-Object LastWriteTime -Descending

if ($runs.Count -eq 0) {
    Write-Host "No runs found." -ForegroundColor Red
    exit 1
}

$latestRun = $runs[0]
$jsonPath = Join-Path $latestRun.FullName "run.json"

Write-Host "`n[Latest Run: $($latestRun.Name)]" -ForegroundColor Cyan

if (Test-Path $jsonPath) {
    try {
        $data = Get-Content $jsonPath -Raw | ConvertFrom-Json
        
        $statusColor = if ($data.status -eq "success") { "Green" } else { "Red" }
        
        Write-Host "Status: " -NoNewline
        Write-Host $data.status -ForegroundColor $statusColor
        Write-Host "RetryCount: $($data.retryCount)"
        
        if ($data.error) {
            Write-Host "Error: $($data.error)" -ForegroundColor Red
        }
        else {
            Write-Host "Error: (None)" -ForegroundColor Gray
        }

        # Check for summary artifact
        $summaryPath = Join-Path $latestRun.FullName "artifacts\summary.json"
        if (Test-Path $summaryPath) {
            $summary = Get-Content $summaryPath -Raw | ConvertFrom-Json
            Write-Host "`n[Device Summary]" -ForegroundColor Yellow
            Write-Host "  Recovered: $($summary.recoveredCount)"
            Write-Host "  Failed:    $($summary.unrecoveredCount)"
        }

        if ($data.status -ne "success") {
            Write-Host "`nFAILED RUN DETECTED." -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "Error reading JSON: $_" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "run.json not found in $($latestRun.Name)" -ForegroundColor Yellow
}
