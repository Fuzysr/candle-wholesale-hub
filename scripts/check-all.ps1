# Local quality gate. Runs only tools that are present in this repository.
# Backend tests apply Alembic migrations themselves. They use a temporary
# SQLite database unless DATABASE_URL / DATABASE_URL_SYNC are provided.
# Playwright expects the API to be running at VITE_API_URL (localhost:8000 by
# default); the Vite frontend is started automatically by Playwright.

[CmdletBinding()]
param(
    [switch]$SkipBackend,
    [switch]$SkipE2E,
    [switch]$E2EAll
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$results = [System.Collections.ArrayList]::new()
$totalStart = Get-Date

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Command,
        [switch]$Skip
    )

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor DarkGray
    if ($Skip) {
        Write-Host "SKIP  $Name" -ForegroundColor Yellow
        [void]$script:results.Add([pscustomobject]@{ Step = $Name; Status = "skipped"; Seconds = 0 })
        return
    }

    Write-Host "RUN   $Name" -ForegroundColor Cyan
    $stepStart = Get-Date
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) {
            throw "exit code $LASTEXITCODE"
        }
        $elapsed = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1)
        Write-Host "PASS  $Name ($elapsed s)" -ForegroundColor Green
        [void]$script:results.Add([pscustomobject]@{ Step = $Name; Status = "passed"; Seconds = $elapsed })
    }
    catch {
        $elapsed = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1)
        Write-Host "FAIL  $Name ($elapsed s) - $($_.Exception.Message)" -ForegroundColor Red
        [void]$script:results.Add([pscustomobject]@{ Step = $Name; Status = "failed"; Seconds = $elapsed })
        throw
    }
}

function Get-BackendPython {
    $venvPython = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    throw "Python not found. Create backend/.venv and install backend with: pip install -e '.[dev]'"
}

$backendPython = $null
if (-not $SkipBackend) {
    $backendPython = Get-BackendPython
}

try {
    Invoke-Step -Name "Frontend lint" -Command { npm.cmd run lint }
    Invoke-Step -Name "Frontend typecheck" -Command { npx.cmd tsc --noEmit }
    Invoke-Step -Name "Frontend unit tests" -Command { npm.cmd test }
    Invoke-Step -Name "Frontend production build" -Command { npm.cmd run build }
    Invoke-Step -Name "Backend Ruff" -Skip:$SkipBackend -Command {
        Push-Location backend
        try { & $backendPython -m ruff check app tests }
        finally { Pop-Location }
    }
    Invoke-Step -Name "Backend pytest" -Skip:$SkipBackend -Command {
        $temporaryDatabase = $null
        if (-not $env:DATABASE_URL -and -not $env:DATABASE_URL_SYNC) {
            $temporaryDatabase = Join-Path $repoRoot "backend\.check.sqlite3"
            $sqlitePath = $temporaryDatabase.Replace("\", "/")
            $env:DATABASE_URL = "sqlite+aiosqlite:///$sqlitePath"
            $env:DATABASE_URL_SYNC = "sqlite:///$sqlitePath"
        }

        Push-Location backend
        try {
            & $backendPython -m pytest -q
        }
        finally {
            Pop-Location
            if ($temporaryDatabase) {
                Remove-Item -LiteralPath $temporaryDatabase -Force -ErrorAction SilentlyContinue
            }
        }
    }
    Invoke-Step -Name "Playwright e2e" -Skip:$SkipE2E -Command {
        if ($E2EAll) {
            npx.cmd playwright test --reporter=list
        }
        else {
            npx.cmd playwright test catalog-cart.spec.ts -g "Checkout" --reporter=list
        }
    }
}
catch {
    # Invoke-Step already recorded and printed the failure.
}

$totalElapsed = [math]::Round(((Get-Date) - $totalStart).TotalSeconds, 1)
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor DarkGray
Write-Host "SUMMARY (total $totalElapsed s)" -ForegroundColor White
$results | Format-Table -AutoSize | Out-Host

$failed = @($results | Where-Object { $_.Status -eq "failed" })
if ($failed.Count -gt 0) {
    Write-Host "FAILED: $($failed.Count) step(s)" -ForegroundColor Red
    exit 1
}

Write-Host "OK: All checks passed" -ForegroundColor Green
exit 0
