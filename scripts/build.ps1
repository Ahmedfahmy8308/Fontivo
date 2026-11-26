<#
.SYNOPSIS
  Fontivo Unified Build Script for Windows

.DESCRIPTION
  Builds the React 19 Frontend UI, compiles the Native Rust Core, and optionally
  packages the Windows Inno Setup or NSIS installer.

.PARAMETER Release
  Compile Rust core in release mode with optimizations.
.PARAMETER SkipUI
  Skip the Vite / TypeScript frontend build step.
.PARAMETER SkipCore
  Skip the Cargo / Rust backend build step.
.PARAMETER BuildInstaller
  Compile Windows installer (using Inno Setup ISCC.exe or NSIS makensis.exe).
.PARAMETER Clean
  Clean previous build artifacts before starting.

.EXAMPLE
  .\scripts\build.ps1 -Release -BuildInstaller
#>

[CmdletBinding()]
param(
  [switch]$Release,
  [switch]$SkipUI,
  [switch]$SkipCore,
  [switch]$BuildInstaller,
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = if (Test-Path (Join-Path $repoRoot "Cargo.toml")) { $repoRoot } elseif (Test-Path (Join-Path $repoRoot "Fontivo-App")) { Join-Path $repoRoot "Fontivo-App" } else { $repoRoot }
$uiDir = if (Test-Path (Join-Path $appDir "src\ui")) { Join-Path $appDir "src\ui" } else { Join-Path $appDir "ui" }
$installerDir = Join-Path $appDir "installer"
$releaseDir = Join-Path $appDir "release"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Fontivo Build Pipeline" -ForegroundColor Cyan
Write-Host "  Mode: $(if ($Release) { 'Release (Optimized)' } else { 'Debug (Fast)' })" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 0. Clean if requested
if ($Clean) {
  Write-Host "`n[0/4] Cleaning previous build targets..." -ForegroundColor Yellow
  if (Test-Path "$uiDir\dist") { Remove-Item "$uiDir\dist" -Recurse -Force }
  if (Test-Path "$releaseDir") { Remove-Item "$releaseDir\*" -Exclude "*.iss","*.nsi" -Recurse -Force -ErrorAction SilentlyContinue }
  Push-Location $appDir
  cargo clean
  Pop-Location
  Write-Host "[ok] Clean complete." -ForegroundColor Green
}

# 1. Check for running Fontivo instance to prevent binary file lock
$running = Get-Process -Name "Fontivo" -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "`n[Notice] Found running Fontivo process ($($running.Count) instance(s)). Stopping before build..." -ForegroundColor Yellow
  $running | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

# 2. Build Frontend UI
if (-not $SkipUI) {
  Write-Host "`n[1/3] Compiling React 19 / TypeScript UI (Vite)..." -ForegroundColor Yellow
  Push-Location $uiDir
  try {
    if (-not (Test-Path "node_modules")) {
      Write-Host "Installing UI node_modules..." -ForegroundColor DarkGray
      npm install --no-audit --no-fund
    }
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "UI compilation failed with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
  Write-Host "[ok] UI built successfully into Fontivo-App/ui/dist" -ForegroundColor Green
} else {
  Write-Host "`n[1/3] Skipping UI build as requested." -ForegroundColor DarkGray
}

# 3. Build Native Rust Engine
if (-not $SkipCore) {
  Write-Host "`n[2/3] Compiling Native Rust Engine..." -ForegroundColor Yellow
  Push-Location $appDir
  try {
    $cargoArgs = @("build")
    if ($Release) {
      $cargoArgs += "--release"
    }
    & cargo @cargoArgs
    if ($LASTEXITCODE -ne 0) {
      throw "Cargo build failed with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  $targetSubDir = if ($Release) { "release" } else { "debug" }
  $builtBinary = Join-Path $appDir "target\$targetSubDir\Fontivo.exe"
  if (-not (Test-Path $builtBinary)) {
    throw "Built binary not found at $builtBinary"
  }

  if (-not (Test-Path $releaseDir)) {
    $null = New-Item -ItemType Directory -Path $releaseDir -Force
  }

  Copy-Item $builtBinary (Join-Path $releaseDir "Fontivo.exe") -Force
  $binSize = (Get-Item (Join-Path $releaseDir "Fontivo.exe")).Length
  Write-Host "[ok] Rust binary compiled: $releaseDir\Fontivo.exe ($([math]::Round($binSize / 1MB, 2)) MB)" -ForegroundColor Green
} else {
  Write-Host "`n[2/3] Skipping Rust core build as requested." -ForegroundColor DarkGray
}

# 4. Compile Installer if requested
if ($BuildInstaller) {
  Write-Host "`n[3/3] Compiling Windows Installer..." -ForegroundColor Yellow

  # Check Inno Setup
  $iscc = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
  if (-not $iscc) {
    $isccDefault = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    if (Test-Path $isccDefault) { $iscc = $isccDefault }
  }

  $innoSuccess = $false
  $issFile = if (Test-Path "$installerDir\Setup_Fontivo.iss") { "$installerDir\Setup_Fontivo.iss" } else { "$installerDir\Setup_Fontivo_Pro.iss" }

  if ($iscc -and (Test-Path $issFile)) {
    Write-Host "Compiling with Inno Setup: $iscc" -ForegroundColor DarkGray
    & $iscc $issFile
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[ok] Inno Setup installer generated in Fontivo-App/release" -ForegroundColor Green
      $innoSuccess = $true
    } else {
      Write-Host "[warn] Inno Setup compilation returned exit code $LASTEXITCODE" -ForegroundColor Yellow
    }
  }

  if (-not $iscc) {
    Write-Host "[warn] Inno Setup (ISCC.exe) was not found on this system." -ForegroundColor Yellow
  }
}

$stopwatch.Stop()
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Build Pipeline Finished in $($stopwatch.Elapsed.TotalSeconds.ToString('F2')) seconds" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
