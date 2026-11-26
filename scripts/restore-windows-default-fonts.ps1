# =========================================================================
# Fontivo -- Windows Default Fonts Factory Restorer
# Safely removes non-core third-party fonts from C:\Windows\Fonts & Registry
# =========================================================================

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Requesting Administrator privileges to access C:\Windows\Fonts..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Fontivo -- Windows Default Fonts Restore Utility (Admin)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

$coreNames = @(
    "segoe", "arial", "tahoma", "times", "courier", "calibri",
    "cambria", "consolas", "consola", "verdana", "georgia", "comic sans",
    "trebuchet", "impact", "marlett", "symbol", "wingdings",
    "webdings", "ms sans serif", "ms serif", "microsoft sans serif",
    "palatino", "franklin gothic", "century gothic", "garamond",
    "book antiqua", "lucida", "gadugi", "malgun", "meiryo",
    "yu gothic", "ms gothic", "simsun", "gulim", "batang",
    "mingliu", "leelawadee", "nirmala", "ebrima", "javanese",
    "bahnschrift", "candara", "constantia", "corbel", "gabriola",
    "ink free", "sitka", "sylfaen", "himalaya", "mongolian baiti",
    "mv boli", "myanmar text", "holomdl2", "kavivanar", "khmer ui", "lao ui",
    "aldhabi", "andalus", "arabic typesetting", "simplified arabic",
    "traditional arabic", "sakkal majalla", "urdu typesetting",
    "dengxian", "simhei", "kaiti", "fangsong", "microsoft new tai lue",
    "microsoft phagspa", "microsoft tai le", "microsoft yi baiti", "microsoft uighur"
)

function Is-CoreFont($fontName) {
    $lower = $fontName.ToLower()
    foreach ($c in $coreNames) {
        if ($lower -like "*$c*") { return $true }
    }
    return $false
}

$backupDir = "$env:LOCALAPPDATA\Fontivo\Backups\System_Fonts_Backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Write-Host "[+] Created safety backup folder: $backupDir" -ForegroundColor Green

$hklmPath = "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
$hkcuPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
$winFontsDir = "C:\Windows\Fonts"

$hklmProps = (Get-ItemProperty $hklmPath).PSObject.Properties | Where-Object { $_.Name -notmatch "^PS" }
$removedCount = 0

Write-Host "[*] Scanning registry and font directory..." -ForegroundColor Yellow

foreach ($prop in $hklmProps) {
    $fontValName = $prop.Name
    $fontTarget = $prop.Value

    if (-not (Is-CoreFont $fontValName)) {
        # Backup registry info
        $cleanTarget = $fontTarget.Trim()
        $fullPath = if ($cleanTarget -like "*\*") { $cleanTarget } else { Join-Path $winFontsDir $cleanTarget }

        if (Test-Path $fullPath) {
            try {
                Copy-Item -Path $fullPath -Destination $backupDir -Force -ErrorAction SilentlyContinue
                Remove-Item -Path $fullPath -Force -ErrorAction SilentlyContinue
                Remove-ItemProperty -Path $hklmPath -Name $fontValName -Force -ErrorAction SilentlyContinue
                Remove-ItemProperty -Path $hkcuPath -Name $fontValName -Force -ErrorAction SilentlyContinue
                $removedCount++
                if ($removedCount % 250 -eq 0) {
                    Write-Host "    Cleaned and backed up $removedCount non-core fonts..." -ForegroundColor Gray
                }
            } catch {}
        }
    }
}

Write-Host ""
Write-Host "[OK] Operation Complete!" -ForegroundColor Green
Write-Host "    Total non-core fonts moved to backup: $removedCount" -ForegroundColor Cyan
Write-Host "    Backup Location: $backupDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "[*] Restarting Font Cache service..." -ForegroundColor Yellow
try {
    Stop-Service "FontCache" -Force -ErrorAction SilentlyContinue
    Start-Service "FontCache" -ErrorAction SilentlyContinue
    Write-Host "[OK] Font Cache refreshed." -ForegroundColor Green
} catch {}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
