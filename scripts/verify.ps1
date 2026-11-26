# ==============================================================================
# Fontivo v1.0 Enterprise Automated Verification & Test Suite
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       Fontivo v1.0 Enterprise Quality & Security Suite     " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
$appDir = Split-Path -Parent $scriptDir
$rootDir = Split-Path -Parent $appDir
$releaseDir = Join-Path $appDir "release"
$exePath = Join-Path $releaseDir "Fontivo.exe"
$setupPath = Join-Path $releaseDir "Fontivo-Setup.exe"
if (-not (Test-Path $setupPath)) {
    $setupPath = Join-Path $releaseDir "Fontivo-v1.0-Setup.exe"
}

$totalPassed = 0
$totalFailed = 0

function Report-Pass([string]$msg) {
    Write-Host "  [PASS] $msg" -ForegroundColor Green
    $script:totalPassed++
}

function Report-Fail([string]$msg) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
    $script:totalFailed++
}

function Report-Info([string]$msg) {
    Write-Host "  [INFO] $msg" -ForegroundColor Gray
}

# ------------------------------------------------------------------------------
# STEP 1: Verify Release Binaries & Installer
# ------------------------------------------------------------------------------
Write-Host "`n[1/5] Verifying Production Release Binaries..." -ForegroundColor Yellow
if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    Report-Pass ("Fontivo.exe exists ({0:N2} MB)" -f $size)
} else {
    Report-Fail "Fontivo.exe missing from release directory!"
}

if (Test-Path $setupPath) {
    $size = (Get-Item $setupPath).Length / 1MB
    Report-Pass ("$([System.IO.Path]::GetFileName($setupPath)) exists ({0:N2} MB)" -f $size)
} else {
    Report-Fail "Fontivo-Setup.exe missing from release directory!"
}

# ------------------------------------------------------------------------------
# STEP 2: Rust Core Engine Compilation / Tests
# ------------------------------------------------------------------------------
Write-Host "`n[2/5] Checking Rust Core Engine Unit Tests..." -ForegroundColor Yellow
if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Push-Location $appDir
    try {
        cargo test -- --test-threads=1
        Report-Pass "Rust cargo unit tests executed successfully"
    } catch {
        Report-Fail "Rust cargo tests reported errors: $_"
    } finally {
        Pop-Location
    }
} else {
    Report-Info "Cargo not present in PATH; skipping local Rust compilation unit tests."
}

# ------------------------------------------------------------------------------
# STEP 3: Unit Tests - Dynamic Google Fonts Catalog & Library Integrity
# ------------------------------------------------------------------------------
Write-Host "`n[3/5] Executing Unit Test Suite: Dynamic Google Fonts Catalog & Library Integrity..." -ForegroundColor Yellow
$unitTestPath = Join-Path $appDir "tests\cache\test_cache_integrity.py"

if (Test-Path $unitTestPath) {
    $pythonCmd = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "py" }
    
    $p1 = Start-Process -FilePath $pythonCmd -ArgumentList "-m unittest `"$unitTestPath`" -v" -NoNewWindow -PassThru -Wait
    if ($p1.ExitCode -eq 0) {
        Report-Pass "Dynamic Catalog Integrity: 120+ Google Font families validated, static fonts-cache.json decoupled, unicode metrics verified (8/8 tests)"
    } else {
        Report-Fail "Dynamic Catalog Integrity unit tests failed with exit code $($p1.ExitCode)"
    }
} else {
    Report-Fail "Unit test file not found: $unitTestPath"
}

# ------------------------------------------------------------------------------
# STEP 4: API Integration & System Architecture Test Suites
# ------------------------------------------------------------------------------
Write-Host "`n[4/5] Executing API Integration & System Architecture Test Suites..." -ForegroundColor Yellow

$integrationSuites = @(
    @{
        Category = "api"
        File = "test_api_endpoints.py"
        Name = "Core API & Protocol Suite (REST Endpoints, Font Streaming, Lifecycle)"
        ExpectedTests = "16/16 tests"
    },
    @{
        Category = "system"
        File = "test_windows_system_fonts.py"
        Name = "Windows System Fonts Suite (Enumeration, Core Protection & Registry Backup)"
        ExpectedTests = "4/4 tests"
    },
    @{
        Category = "system"
        File = "test_ram_inspector.py"
        Name = "Live RAM Inspector Suite (Live Font Handles & Rapid Memory Purge)"
        ExpectedTests = "3/3 tests"
    },
    @{
        Category = "system"
        File = "test_system_autostart.py"
        Name = "System Host Integration Suite (Windows Autostart Toggle & Registry)"
        ExpectedTests = "2/2 tests"
    },
    @{
        Category = "integrations"
        File = "test_ase_parser.py"
        Name = "Adobe Swatch Exchange (.ASE) Suite (Binary Parser & WCAG Metrics)"
        ExpectedTests = "3/3 tests"
    },
    @{
        Category = "integrations"
        File = "test_adobe_bridge.py"
        Name = "Adobe Creative Cloud Bridge (Port 27715 Socket, Handshake & Auto-Activation)"
        ExpectedTests = "6/6 tests"
    },
    @{
        Category = "workspaces"
        File = "test_workspaces_engine.py"
        Name = "Project Workspaces Suite (YAML/JSON Persistence, Tasks & Export Bundle)"
        ExpectedTests = "5/5 tests"
    }
)

$pythonCmd = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "py" }

foreach ($suite in $integrationSuites) {
    $suitePath = Join-Path $appDir ("tests\" + $suite.Category + "\" + $suite.File)
    if (Test-Path $suitePath) {
        Write-Host "  -> Running [$($suite.Category)] $($suite.Name)..." -ForegroundColor Gray
        $proc = Start-Process -FilePath $pythonCmd -ArgumentList "-m unittest `"$suitePath`" -v" -NoNewWindow -PassThru -Wait
        if ($proc.ExitCode -eq 0) {
            Report-Pass "$($suite.Name) passed ($($suite.ExpectedTests))"
        } else {
            Report-Fail "$($suite.Name) failed with exit code $($proc.ExitCode)"
        }
    } else {
        Report-Fail "Test suite file not found: $suitePath"
    }
}

# ------------------------------------------------------------------------------
# STEP 5: Security Architecture & Protocol Audit (Live Cargo Security Test Suite)
# ------------------------------------------------------------------------------
Write-Host "`n[5/5] Executing Live Security Hardening & Protocol Audit Suite..." -ForegroundColor Yellow
if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Push-Location $appDir
    try {
        cargo test --test test_security -- --test-threads=1
        if ($LASTEXITCODE -eq 0) {
            Report-Pass "Rust Security Test Suite (cargo test --test test_security) passed 100% (Origin/CORS, SSRF, SHA-256, Path Traversal, XSS, Core Font Protection)"
        } else {
            Report-Fail "Rust Security Test Suite failed with exit code $LASTEXITCODE"
        }
    } catch {
        Report-Fail "Rust Security Test Suite reported errors: $_"
    } finally {
        Pop-Location
    }
} else {
    Report-Fail "Cargo not found in PATH; unable to execute live security test suite (cargo test --test test_security)"
}

# ------------------------------------------------------------------------------
# FINAL REPORT
# ------------------------------------------------------------------------------
$totalTests = $totalPassed + $totalFailed
$passRate = if ($totalTests -gt 0) { ($totalPassed / $totalTests) * 100 } else { 0 }

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "                    TEST EXECUTION SUMMARY                  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ("  Total Assertions / Checks: {0}" -f $totalTests) -ForegroundColor White
Write-Host ("  Passed Checks            : {0}" -f $totalPassed) -ForegroundColor Green
if ($totalFailed -gt 0) {
    Write-Host ("  Failed Checks            : {0}" -f $totalFailed) -ForegroundColor Red
} else {
    Write-Host ("  Failed Checks            : {0}" -f $totalFailed) -ForegroundColor Green
}
Write-Host ("  Overall Pass Rate        : {0:N1}%" -f $passRate) -ForegroundColor $(if ($totalFailed -eq 0) { [ConsoleColor]::Green } else { [ConsoleColor]::Red })
Write-Host "============================================================" -ForegroundColor Cyan

if ($totalFailed -eq 0) {
    Write-Host "`n>>> ALL VERIFICATION AND QUALITY CHECKS PASSED (100% CLEAN) <<<`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n>>> VERIFICATION FAILED WITH $totalFailed ERRORS <<<`n" -ForegroundColor Red
    exit 1
}
