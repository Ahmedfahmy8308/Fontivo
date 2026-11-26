<#
.SYNOPSIS
    Fontivo Brand Assets Single Source of Truth (SSOT) Synchronizer
.DESCRIPTION
    Synchronizes canonical brand icons, logos, and social assets from
    Fontivo-App/assets/ to Fontivo-App/icon.ico, Fontivo-App/src/ui/public/,
    Fontivo-Site/public/, and Fontivo-Fonts/assets/.
#>

$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $appRoot
$assetsRoot = Join-Path $appRoot "assets"
$appIconsDir = Join-Path $assetsRoot "app-icons"
$brandDir = Join-Path $assetsRoot "brand"
$socialDir = Join-Path $assetsRoot "social"

$uiPublicDir = Join-Path $appRoot "src\ui\public"
$sitePublicDir = Join-Path $workspaceRoot "Fontivo-Site\public"
$siteBrandDir = Join-Path $sitePublicDir "brand"
$fontsAssetsDir = Join-Path $workspaceRoot "Fontivo-Fonts\assets"

foreach ($dir in @($uiPublicDir, $sitePublicDir, $siteBrandDir, $fontsAssetsDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# 1. Desktop App Root Icon (embedded into Fontivo.exe via build.rs)
Copy-Item (Join-Path $appIconsDir "icon.ico") (Join-Path $appRoot "icon.ico") -Force

# 2. Desktop React UI Public Assets
Copy-Item (Join-Path $appIconsDir "icon.ico") (Join-Path $uiPublicDir "favicon.ico") -Force
foreach ($f in @("fontivo-icon.svg", "fontivo-icon.png", "fontivo-mark.svg", "fontivo-mark-animated.svg", "fontivo-logo.svg", "fontivo-logo.png")) {
    Copy-Item (Join-Path $appIconsDir $f) (Join-Path $uiPublicDir $f) -Force
}

# 3. Marketing Site Public Assets
Copy-Item (Join-Path $appIconsDir "icon.ico") (Join-Path $sitePublicDir "favicon.ico") -Force
Copy-Item (Join-Path $appIconsDir "icon.ico") (Join-Path $siteBrandDir "icon.ico") -Force
foreach ($f in @("fontivo-icon.svg", "fontivo-icon.png", "fontivo-mark.svg", "fontivo-mark-animated.svg", "fontivo-logo.svg", "fontivo-logo.png", "fontivo-logo-dark.svg", "fontivo-logo-light.svg", "fontivo-mark.png")) {
    Copy-Item (Join-Path $appIconsDir $f) (Join-Path $siteBrandDir $f) -Force
}
Copy-Item (Join-Path $brandDir "fontivo-palette.ase") (Join-Path $siteBrandDir "fontivo-palette.ase") -Force
Copy-Item (Join-Path $socialDir "og-image.png") (Join-Path $siteBrandDir "og-image.png") -Force
Copy-Item (Join-Path $socialDir "og-image.svg") (Join-Path $siteBrandDir "og-image.svg") -Force

# 4. Fontivo-Fonts Repository Assets (for README display)
Copy-Item (Join-Path $appIconsDir "fontivo-icon.png") (Join-Path $fontsAssetsDir "fontivo-icon.png") -Force
Copy-Item (Join-Path $appIconsDir "fontivo-logo-dark.svg") (Join-Path $fontsAssetsDir "fontivo-logo-dark.svg") -Force
Copy-Item (Join-Path $socialDir "og-image.png") (Join-Path $fontsAssetsDir "fontivo-banner.png") -Force

Write-Host "[ok] Brand SSOT synchronized across Fontivo-App, Fontivo-Site, and Fontivo-Fonts." -ForegroundColor Green
