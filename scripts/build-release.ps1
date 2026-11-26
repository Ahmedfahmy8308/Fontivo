<#
.SYNOPSIS
  Fontivo Production Release Build & Packaging Automation

.DESCRIPTION
  Executes an end-to-end deterministic release build:
  1. Compiles React UI bundle (Vite)
  2. Compiles Rust Core in Release mode (LTO / stripped)
  3. Builds Inno Setup / NSIS Windows Installer
  4. Packages Portable ZIP Distribution
  5. Computes and generates SHA-256 checksums and SHA256SUMS manifest

.EXAMPLE
  .\scripts\build-release.ps1
#>

[CmdletBinding()]
param(
  [string]$Version = "1.0.0"
)

$ErrorActionPreference = 'Stop'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = if (Test-Path (Join-Path $repoRoot "Cargo.toml")) { $repoRoot } elseif (Test-Path (Join-Path $repoRoot "Fontivo-App")) { Join-Path $repoRoot "Fontivo-App" } else { $repoRoot }
$uiDir = if (Test-Path (Join-Path $appDir "src\ui")) { Join-Path $appDir "src\ui" } else { Join-Path $appDir "ui" }
$installerDir = Join-Path $appDir "installer"
$releaseDir = Join-Path $appDir "release"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Fontivo v$Version - Production Release Packaging Pipeline" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Stop running Fontivo process if active
$running = Get-Process -Name "Fontivo" -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "Terminating running Fontivo process to avoid binary locking..." -ForegroundColor Yellow
  $running | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 600
}

# 2. Ensure release directory exists
if (-not (Test-Path $releaseDir)) {
  $null = New-Item -ItemType Directory -Path $releaseDir -Force
}

# 3. Compile UI
Write-Host "`n[1/5] Building React 19 Frontend UI..." -ForegroundColor Yellow
Push-Location $uiDir
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "UI production build failed" }
} finally {
  Pop-Location
}
Write-Host "[ok] UI build complete: Fontivo-App/ui/dist" -ForegroundColor Green

# 4. Compile Native Rust Binary
Write-Host "`n[2/5] Compiling Native Rust Binary in Release Mode..." -ForegroundColor Yellow
Push-Location $appDir
try {
  $env:FONTIVO_RELEASE_BUILD = "1"
  & cargo build --release --locked --bin Fontivo
  if ($LASTEXITCODE -ne 0) { throw "Rust release compilation failed" }
} finally {
  Pop-Location
}

$builtTargetBin = Join-Path $appDir "target\release\Fontivo.exe"
$releaseBin = Join-Path $releaseDir "Fontivo.exe"
Copy-Item $builtTargetBin $releaseBin -Force
Write-Host "[ok] Binary compiled to: $releaseBin" -ForegroundColor Green

# 5. Compile Windows Installer
Write-Host "`n[3/5] Compiling Windows Installer (Inno Setup)..." -ForegroundColor Yellow
$installerCompiled = $false

# Locate Inno Setup
$iscc = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
if (-not $iscc) {
  $isccDefault = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
  if (Test-Path $isccDefault) { $iscc = $isccDefault }
}

$issFile = if (Test-Path "$installerDir\Setup_Fontivo.iss") { "$installerDir\Setup_Fontivo.iss" } else { "$installerDir\Setup_Fontivo_Pro.iss" }

if ($iscc -and (Test-Path $issFile)) {
  Write-Host "Compiling with Inno Setup: $iscc" -ForegroundColor DarkGray
  & $iscc $issFile
  if ($LASTEXITCODE -eq 0 -and (Test-Path "$releaseDir\Fontivo-Setup.exe")) {
    $installerCompiled = $true
    Write-Host "[ok] Inno Setup installer created: Fontivo-Setup.exe" -ForegroundColor Green
  }
}

if (-not $installerCompiled) {
  Write-Host "[warn] Inno Setup (ISCC.exe) not found. Skipping setup executable generation." -ForegroundColor Yellow
}

# 6. Package ZIP Distribution
Write-Host "`n[4/5] Packaging Portable ZIP Distribution..." -ForegroundColor Yellow
$zipName = "Fontivo-windows-x86_64.zip"
$zipPath = Join-Path $releaseDir $zipName

$stageDir = Join-Path ([System.IO.Path]::GetTempPath()) ("fontivo-stage-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

try {
  Copy-Item $releaseBin $stageDir -Force
  if (Test-Path "$appDir\icon.ico") { Copy-Item "$appDir\icon.ico" $stageDir -Force }
  if (Test-Path "$appDir\README.md") { Copy-Item "$appDir\README.md" $stageDir -Force }
  if (Test-Path "$appDir\LICENSE") { Copy-Item "$appDir\LICENSE" $stageDir -Force }
  if (Test-Path "$uiDir\dist") { Copy-Item "$uiDir\dist" (Join-Path $stageDir "dist") -Recurse -Force }
  if (Test-Path "$appDir\data") { Copy-Item "$appDir\data" (Join-Path $stageDir "data") -Recurse -Force }

  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "[ok] Portable ZIP package created: $zipPath" -ForegroundColor Green
} finally {
  if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
}

# 7. Checksum Generation
Write-Host "`n[5/5] Calculating SHA-256 Checksums..." -ForegroundColor Yellow
$releaseArtifacts = @("Fontivo.exe", "Fontivo-Setup.exe", $zipName)
$manifestLines = @()
$summaryRows = @()

foreach ($artifact in $releaseArtifacts) {
  $artPath = Join-Path $releaseDir $artifact
  if (Test-Path $artPath) {
    $fileItem = Get-Item $artPath
    $hash = (Get-FileHash -Path $artPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $sizeMB = [math]::Round($fileItem.Length / 1MB, 2)

    # Write individual .sha256 file
    Set-Content -Path "$artPath.sha256" -Value "$hash  $artifact`n" -NoNewline
    $manifestLines += "$hash  $artifact"

    $summaryRows += [PSCustomObject]@{
      Artifact = $artifact
      Size_MB  = $sizeMB
      SHA256   = $hash
    }
  }
}

$sumsFile = Join-Path $releaseDir "SHA256SUMS"
$manifestLines -join "`r`n" | Set-Content -Path $sumsFile
Write-Host "[ok] Master SHA256SUMS generated at: $sumsFile" -ForegroundColor Green

$sw.Stop()
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Release Build Summary (Duration: $([math]::Round($sw.Elapsed.TotalSeconds, 1))s)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$summaryRows | Format-Table -AutoSize
Write-Host ""
