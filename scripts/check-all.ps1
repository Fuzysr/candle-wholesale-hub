# Pre-commit verification suite for candle-wholesale-hub.
#
# Runs four checks in sequence (fail-fast):
#   1. Alembic migrations (docker compose backend) up to head
#   2. TypeScript type check (tsc --noEmit)
#   3. Backend pytest (tests/test_orders.py)
#   4. Playwright e2e (Checkout describe by default)
#
# Usage:
#   npm run check              -- full run
#   npm run check:fast         -- skip e2e (fastest)
#   .\scripts\check-all.ps1 -SkipMigration -SkipBackend  -- TS + e2e only
#
# Note: ASCII-only. Windows PowerShell 5 reads BOM-less scripts in the
# system codepage; any non-ASCII character (em-dash, emoji, Russian
# comments) breaks the parser.

[CmdletBinding()]
param(
    [switch]$SkipMigration,
    [switch]$SkipTs,
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
    Write-Host ("=" * 70) -ForegroundColor DarkGray
    $stepStart = Get-Date
    try {
        & $Command
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            throw "exit code $LASTEXITCODE"
        }
        $elapsed = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1)
        Write-Host "PASS  $Name ($elapsed s)" -ForegroundColor Green
        [void]$script:results.Add([pscustomobject]@{ Step = $Name; Status = "passed"; Seconds = $elapsed })
    }
    catch {
        $elapsed = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1)
        $msg = $_.Exception.Message
        Write-Host "FAIL  $Name ($elapsed s) - $msg" -ForegroundColor Red
        [void]$script:results.Add([pscustomobject]@{ Step = $Name; Status = "failed"; Seconds = $elapsed })
        throw
    }
}

try {
    Invoke-Step -Name "1/4  Alembic upgrade head" -Skip:$SkipMigration -Command {
        docker compose exec -T backend alembic upgrade head
    }

    Invoke-Step -Name "2/4  TypeScript --noEmit" -Skip:$SkipTs -Command {
        npx --yes tsc --noEmit
    }

    Invoke-Step -Name "3/4  Backend pytest (orders)" -Skip:$SkipBackend -Command {
        docker compose exec -T backend pytest tests/test_orders.py -q
    }

    Invoke-Step -Name "4/4  Playwright e2e" -Skip:$SkipE2E -Command {
        if ($E2EAll) {
            npx --yes playwright test --reporter=list
        }
        else {
            npx --yes playwright test catalog-cart.spec.ts -g "Checkout" --reporter=list
        }
    }
}
catch {
    # Step failure already logged in Invoke-Step.
}

$totalElapsed = [math]::Round(((Get-Date) - $totalStart).TotalSeconds, 1)
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor DarkGray
Write-Host "SUMMARY (total $totalElapsed s)" -ForegroundColor White
Write-Host ("=" * 70) -ForegroundColor DarkGray
$results | Format-Table -AutoSize | Out-Host

$failed = @($results | Where-Object { $_.Status -eq "failed" })
if ($failed.Count -gt 0) {
    Write-Host "FAILED: $($failed.Count) step(s)" -ForegroundColor Red
    exit 1
}
Write-Host "OK: All checks passed" -ForegroundColor Green
exit 0
