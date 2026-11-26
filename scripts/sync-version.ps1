<#
.SYNOPSIS
    Fontivo Unified Workspace Version Synchronization Tool
.DESCRIPTION
    Single Source of Truth (SSOT) version management utility.
    Synchronizes semantic version across Cargo.toml, React UI, Marketing Site,
    Inno Setup installer script, and centralized TypeScript configuration.
.PARAMETER NewVersion
    The target semantic version string (e.g., "1.0.1", "1.1.0", "2.0.0").
.EXAMPLE
    .\scripts\sync-version.ps1 -NewVersion "1.1.0"
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$NewVersion
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom($path, $content) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$workspaceRoot\Fontivo-App")) {
    $workspaceRoot = Split-Path -Parent $PSScriptRoot
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Fontivo Unified Version Synchronizer -> $NewVersion" -ForegroundColor Cyan
Write-Host "  Workspace Root: $workspaceRoot" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$majorMinor = ($NewVersion.Split('.')[0..1]) -join '.'
$releaseDate = Get-Date -Format "yyyy-MM-dd"

# 1. Update Fontivo-App/Cargo.toml
$cargoPath = "$workspaceRoot\Fontivo-App\Cargo.toml"
if (Test-Path $cargoPath) {
    $cargoContent = [System.IO.File]::ReadAllText($cargoPath)
    $cargoContent = $cargoContent -replace '(?m)^version = "\d+\.\d+\.\d+"', "version = `"$NewVersion`""
    Write-Utf8NoBom $cargoPath $cargoContent
    Write-Host "[ok] Synchronized: Fontivo-App\Cargo.toml -> $NewVersion" -ForegroundColor Green
}

# 2. Update Fontivo-App/src/ui/package.json
$appUiPkg = "$workspaceRoot\Fontivo-App\src\ui\package.json"
if (Test-Path $appUiPkg) {
    $pkgJson = [System.IO.File]::ReadAllText($appUiPkg) | ConvertFrom-Json
    $pkgJson.version = $NewVersion
    $newJson = $pkgJson | ConvertTo-Json -Depth 10
    Write-Utf8NoBom $appUiPkg $newJson
    Write-Host "[ok] Synchronized: Fontivo-App\src\ui\package.json -> $NewVersion" -ForegroundColor Green
}

# 3. Update Fontivo-Site/package.json
$sitePkg = "$workspaceRoot\Fontivo-Site\package.json"
if (Test-Path $sitePkg) {
    $pkgJson = [System.IO.File]::ReadAllText($sitePkg) | ConvertFrom-Json
    $pkgJson.version = $NewVersion
    $newJson = $pkgJson | ConvertTo-Json -Depth 10
    Write-Utf8NoBom $sitePkg $newJson
    Write-Host "[ok] Synchronized: Fontivo-Site\package.json -> $NewVersion" -ForegroundColor Green
}

# 4. Update Fontivo-Site/src/config/version.ts (SSOT for website)
$siteVersionTs = "$workspaceRoot\Fontivo-Site\src\config\version.ts"
if (Test-Path $siteVersionTs) {
    $versionContent = [System.IO.File]::ReadAllText($siteVersionTs)
    $versionContent = $versionContent -replace 'export const FONTIVO_VERSION = "[^"]+"', "export const FONTIVO_VERSION = `"$NewVersion`""
    $versionContent = $versionContent -replace 'export const FONTIVO_RELEASE_DATE = "[^"]+"', "export const FONTIVO_RELEASE_DATE = `"$releaseDate`""
    Write-Utf8NoBom $siteVersionTs $versionContent
    Write-Host "[ok] Synchronized: Fontivo-Site\src\config\version.ts -> $NewVersion" -ForegroundColor Green
}

# 5. Update Fontivo-App/installer/Setup_Fontivo.iss
$innoPath = "$workspaceRoot\Fontivo-App\installer\Setup_Fontivo.iss"
if (Test-Path $innoPath) {
    $innoContent = [System.IO.File]::ReadAllText($innoPath)
    $innoContent = $innoContent -replace '(?m)^#define MyAppVersion "[^"]+"', "#define MyAppVersion `"$majorMinor`""
    Write-Utf8NoBom $innoPath $innoContent
    Write-Host "[ok] Synchronized: Fontivo-App\installer\Setup_Fontivo.iss -> $majorMinor" -ForegroundColor Green
}

Write-Host "`n[SUCCESS] Version $NewVersion successfully synchronized across all project targets without BOM!" -ForegroundColor Green
