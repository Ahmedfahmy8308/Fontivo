<#
.SYNOPSIS
  Fontivo Local Pre-Push & Developer Verification Script

.DESCRIPTION
  Executes quality gates locally before pushing code:
  Rust formatting, Cargo check, Unit tests, Clippy linting,
  Frontend UI Vitest & TypeScript verification, and Marketing Site checks.

.PARAMETER Gate
  Quality gate to execute: 'all', 'fmt', 'check', 'test', 'clippy', 'ui', 'site'.

.EXAMPLE
  .\scripts\dev-check.ps1 -Gate all
  .\scripts\dev-check.ps1 -Gate test
  .\scripts\dev-check.ps1 -Gate ui
#>

[CmdletBinding()]
param(
  [ValidateSet('all', 'fmt', 'check', 'test', 'clippy', 'ui', 'site')]
  [string]$Gate = 'all'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = if (Test-Path (Join-Path $repoRoot "Cargo.toml")) { $repoRoot } elseif (Test-Path (Join-Path $repoRoot "Fontivo-App")) { Join-Path $repoRoot "Fontivo-App" } else { $repoRoot }
$uiDir = if (Test-Path (Join-Path $appDir "src\ui")) { Join-Path $appDir "src\ui" } else { Join-Path $appDir "ui" }
$siteDir = Join-Path (Split-Path -Parent $appDir) "Fontivo-Site"

function Write-GateStart([string]$Name) {
  Write-Host "`n>>> [GATE: $Name] Starting..." -ForegroundColor Cyan
}

function Write-GateOk([string]$Name) {
  Write-Host "[ok] [GATE: $Name] PASSED" -ForegroundColor Green
}

function Invoke-GateCommand([string]$Description, [scriptblock]$Action) {
  Write-Host "Running: $Description" -ForegroundColor DarkGray
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "Gate failed on: $Description (Exit Code: $LASTEXITCODE)"
  }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Fontivo Developer Quality Gate: $Gate" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$timer = [System.Diagnostics.Stopwatch]::StartNew()

try {
  # 1. Rust Formatting
  if ($Gate -in @('all', 'fmt')) {
    Write-GateStart "Rust Format"
    Push-Location $appDir
    try {
      Invoke-GateCommand "cargo fmt -- --check" {
        cargo fmt --all -- --check
      }
    } finally { Pop-Location }
    Write-GateOk "Rust Format"
  }

  # 2. Cargo Check
  if ($Gate -in @('all', 'check')) {
    Write-GateStart "Cargo Check"
    Push-Location $appDir
    try {
      Invoke-GateCommand "cargo check --all-targets" {
        cargo check --all-targets
      }
    } finally { Pop-Location }
    Write-GateOk "Cargo Check"
  }

  # 3. Cargo Clippy
  if ($Gate -in @('all', 'clippy')) {
    Write-GateStart "Cargo Clippy"
    Push-Location $appDir
    try {
      Invoke-GateCommand "cargo clippy -- -A clippy::all" {
        cargo clippy --all-targets -- -A clippy::all
      }
    } finally { Pop-Location }
    Write-GateOk "Cargo Clippy"
  }

  # 4. Cargo Tests
  if ($Gate -in @('all', 'test')) {
    Write-GateStart "Rust Tests"
    Push-Location $appDir
    try {
      Invoke-GateCommand "cargo test" {
        cargo test -- --nocapture --test-threads=4
      }
    } finally { Pop-Location }
    Write-GateOk "Rust Tests"
  }

  # 5. UI Tests & TypeScript
  if ($Gate -in @('all', 'ui')) {
    Write-GateStart "React UI Verification"
    Push-Location $uiDir
    try {
      Invoke-GateCommand "npm test (Vitest)" {
        npm test
      }
      Invoke-GateCommand "npx tsc --noEmit" {
        npx tsc --noEmit
      }
      Invoke-GateCommand "npm run build" {
        npm run build
      }
    } finally { Pop-Location }
    Write-GateOk "React UI Verification"
  }

  # 6. Site Tests (if Fontivo-Site repository is present)
  if (($Gate -eq 'site') -or ($Gate -eq 'all' -and (Test-Path $siteDir))) {
    Write-GateStart "Site Tests"
    Push-Location $siteDir
    try {
      Invoke-GateCommand "npm test in Fontivo-Site" {
        npm test
      }
      Invoke-GateCommand "npx tsc --noEmit in Fontivo-Site" {
        npx tsc --noEmit
      }
    } finally { Pop-Location }
    Write-GateOk "Site Tests"
  }

  $timer.Stop()
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Green
  Write-Host "  ALL REQUESTED GATES PASSED in $([math]::Round($timer.Elapsed.TotalSeconds, 2))s" -ForegroundColor Green
  Write-Host "============================================================" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Red
  Write-Host "  GATE FAILURE: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "============================================================" -ForegroundColor Red
  exit 1
}
