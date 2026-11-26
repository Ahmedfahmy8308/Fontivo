<#
.SYNOPSIS
  Fontivo automated one-liner installer for Windows.

.DESCRIPTION
  Downloads, verifies, and installs Fontivo Desktop Font Manager.
  Configures user PATH, desktop integration, and protocol handlers.

.EXAMPLE
  irm https://raw.githubusercontent.com/Ahmedfahmy8308/Fontivo/main/scripts/install.ps1 | iex
#>

[CmdletBinding()]
param(
  [string]$Version            = $(if ($env:FONTIVO_VERSION) { $env:FONTIVO_VERSION } else { 'latest' }),
  [string]$Repo               = $(if ($env:FONTIVO_REPO) { $env:FONTIVO_REPO } else { 'Ahmedfahmy8308/Fontivo' }),
  [string]$Prefix             = $env:FONTIVO_PREFIX,
  [string]$BinDir             = $env:FONTIVO_BIN_DIR,
  [ValidateSet('User', 'Machine')]
  [string]$Scope              = $(if ($env:FONTIVO_SCOPE) { $env:FONTIVO_SCOPE } else { 'User' }),
  [switch]$NoPath,
  [switch]$PathDryRun,
  [switch]$FromSource,
  [switch]$NoShortcuts,
  [switch]$NoDesktopShortcut
)

# Ensure TLS 1.2 is enabled for Windows PowerShell 5.1
try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

# Send network proxy credentials if required by corporate proxy
try {
  [System.Net.WebRequest]::DefaultWebProxy.Credentials =
    [System.Net.CredentialCache]::DefaultNetworkCredentials
} catch { }

function Write-FontivoInfo([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-FontivoOk  ([string]$Message) { Write-Host "[ok] $Message" -ForegroundColor Green }
function Write-FontivoWarn([string]$Message) { Write-Host "[warn] $Message" -ForegroundColor Yellow }
function Stop-FontivoInstall([string]$Message) {
  throw [System.InvalidOperationException]::new($Message)
}

function Invoke-FontivoInstall {
  $origErrorAction = $ErrorActionPreference
  $origProgress = $ProgressPreference
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  try {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  Fontivo Desktop Font Manager - Automated Installer" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan

    # 1. Platform validation
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
      Stop-FontivoInstall "This installer is designed for Windows NT platforms (Windows 10 / 11)."
    }

    # 2. Resolve destination directory
    $targetDir = $Prefix
    if ([string]::IsNullOrWhiteSpace($targetDir)) {
      if ($Scope -eq 'Machine') {
        $targetDir = Join-Path $env:ProgramFiles "Fontivo"
      } else {
        $targetDir = Join-Path $env:LOCALAPPDATA "Programs\Fontivo"
      }
    }

    Write-FontivoInfo "Installation target directory: $targetDir"
    if (-not (Test-Path $targetDir)) {
      $null = New-Item -ItemType Directory -Path $targetDir -Force
    }

    # 3. Check for running Fontivo instances
    $runningProcesses = Get-Process -Name "Fontivo" -ErrorAction SilentlyContinue
    if ($runningProcesses) {
      Write-FontivoWarn "Found running Fontivo process. Terminating before update..."
      $runningProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
    }

    # 4. Acquire release assets
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("fontivo-install-" + [System.Guid]::NewGuid().ToString("N"))
    $null = New-Item -ItemType Directory -Path $tempDir -Force

    try {
      if ($FromSource) {
        Write-FontivoInfo "Building Fontivo directly from source repository..."
        if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
          Stop-FontivoInstall "Rust toolchain (cargo) is required to build from source."
        }
        $sourceDir = Join-Path $tempDir "source"
        & git clone --depth 1 "https://github.com/$Repo.git" $sourceDir
        if ($LASTEXITCODE -ne 0) { Stop-FontivoInstall "Failed to clone repository from GitHub." }

        $appRoot = if (Test-Path (Join-Path $sourceDir "Cargo.toml")) { $sourceDir } elseif (Test-Path (Join-Path $sourceDir "Fontivo-App\Cargo.toml")) { Join-Path $sourceDir "Fontivo-App" } else { Stop-FontivoInstall "Cargo.toml not found in cloned repository." }
        $srcUiDir = Join-Path $appRoot "src\ui"

        if ((Test-Path $srcUiDir) -and (Get-Command npm -ErrorAction SilentlyContinue)) {
          Push-Location $srcUiDir
          try {
            & npm ci --no-audit --no-fund
            & npm run build
          } finally { Pop-Location }
        }

        Push-Location $appRoot
        try {
          $env:FONTIVO_RELEASE_BUILD = "1"
          & cargo build --release --locked --bin Fontivo
          if ($LASTEXITCODE -ne 0) { Stop-FontivoInstall "Cargo build failed." }
        } finally { Pop-Location }

        Copy-Item (Join-Path $appRoot "target\release\Fontivo.exe") (Join-Path $targetDir "Fontivo.exe") -Force
        if (Test-Path (Join-Path $srcUiDir "dist")) {
          Copy-Item (Join-Path $srcUiDir "dist") (Join-Path $targetDir "dist") -Recurse -Force
        }
        if (Test-Path (Join-Path $appRoot "icon.ico")) {
          Copy-Item (Join-Path $appRoot "icon.ico") (Join-Path $targetDir "icon.ico") -Force
        }
      } else {
        # Determine download URL
        $releaseTag = $Version
        $zipAssetUrl = ""
        $exeAssetUrl = ""
        $exeShaUrl = ""

        if ($releaseTag -eq 'latest') {
          Write-FontivoInfo "Querying latest release from https://api.github.com/repos/$Repo/releases/latest ..."
          try {
            $headers = @{ "User-Agent" = "Fontivo-Installer" }
            $apiResp = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers -Method Get
            $releaseTag = $apiResp.tag_name
            foreach ($asset in $apiResp.assets) {
              if ($asset.name -like "*windows-x86_64.zip") { $zipAssetUrl = $asset.browser_download_url }
              if ($asset.name -eq "Fontivo.exe") { $exeAssetUrl = $asset.browser_download_url }
              if ($asset.name -eq "Fontivo.exe.sha256") { $exeShaUrl = $asset.browser_download_url }
            }
          } catch {
            Write-FontivoWarn "GitHub API lookup failed or rate-limited; falling back to direct release URLs."
            $releaseTag = "v1.0.0"
          }
        }

        if ([string]::IsNullOrWhiteSpace($exeAssetUrl)) {
          $exeAssetUrl = "https://github.com/$Repo/releases/download/$releaseTag/Fontivo.exe"
        }
        if ([string]::IsNullOrWhiteSpace($exeShaUrl)) {
          $exeShaUrl = "$exeAssetUrl.sha256"
        }

        $zipLocalPath = Join-Path $tempDir "Fontivo-windows-x86_64.zip"
        $downloadSuccess = $false

        if (-not [string]::IsNullOrWhiteSpace($zipAssetUrl)) {
          Write-FontivoInfo "Attempting to download release package: $zipAssetUrl"
          try {
            Invoke-WebRequest -Uri $zipAssetUrl -OutFile $zipLocalPath -UseBasicParsing
            if ((Test-Path $zipLocalPath) -and (Get-Item $zipLocalPath).Length -gt 1000) {
              $downloadSuccess = $true
            }
          } catch {
            Write-FontivoWarn "ZIP archive unavailable; using verified Fontivo.exe binary."
          }
        }

        if ($downloadSuccess) {
          Write-FontivoInfo "Extracting distribution archive to: $targetDir"
          $extractDir = Join-Path $tempDir "extracted"
          Expand-Archive -Path $zipLocalPath -DestinationPath $extractDir -Force
          Copy-Item -Path "$extractDir\*" -Destination $targetDir -Recurse -Force
        } else {
          $exeLocalPath = Join-Path $targetDir "Fontivo.exe"
          $shaLocalPath = Join-Path $tempDir "Fontivo.exe.sha256"
          Write-FontivoInfo "Downloading executable: $exeAssetUrl"
          Invoke-WebRequest -Uri $exeAssetUrl -OutFile $exeLocalPath -UseBasicParsing
          if (-not (Test-Path $exeLocalPath) -or (Get-Item $exeLocalPath).Length -lt 1000) {
            Stop-FontivoInstall "Failed to download Fontivo release asset."
          }
          try {
            Invoke-WebRequest -Uri $exeShaUrl -OutFile $shaLocalPath -UseBasicParsing
            $expectedHash = ((Get-Content $shaLocalPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
            $actualHash = (Get-FileHash -Path $exeLocalPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($expectedHash -and ($expectedHash -ne $actualHash)) {
              Remove-Item $exeLocalPath -Force -ErrorAction SilentlyContinue
              Stop-FontivoInstall "SHA-256 verification failed for Fontivo.exe (expected $expectedHash, got $actualHash)"
            }
            Write-FontivoOk "Verified SHA-256 checksum: $actualHash"
          } catch {
            if ($_.Exception.Message -like "SHA-256 verification failed*") { throw }
            Write-FontivoWarn "Could not fetch Fontivo.exe.sha256 sidecar; continuing without sidecar match."
          }
        }
      }

      # 5. Verify installed executable
      $installedExe = Join-Path $targetDir "Fontivo.exe"
      if (-not (Test-Path $installedExe)) {
        Stop-FontivoInstall "Fontivo.exe was not found in target directory after extraction."
      }
      Write-FontivoOk "Installed executable verified at: $installedExe"

      # 6. Configure Windows PATH
      if (-not $NoPath) {
        $regPathKey = if ($Scope -eq 'Machine') {
          "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
        } else {
          "HKCU:\Environment"
        }

        $currentPath = [System.Environment]::GetEnvironmentVariable('Path', [System.EnvironmentVariableTarget]::$Scope)
        if ($null -eq $currentPath) { $currentPath = "" }
        $segments = $currentPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

        $alreadyPresent = $false
        foreach ($seg in $segments) {
          $trimmed = $seg.Trim().TrimEnd('\')
          if ($trimmed -eq $targetDir.TrimEnd('\')) {
            $alreadyPresent = $true
            break
          }
        }

        if ($alreadyPresent) {
          Write-FontivoOk "Install directory is already registered in $($Scope) PATH."
        } else {
          if ($PathDryRun) {
            Write-FontivoInfo "[DryRun] Would append '$targetDir' to $($Scope) PATH."
          } else {
            Write-FontivoInfo "Registering Fontivo directory in $($Scope) PATH..."
            $newPath = if ([string]::IsNullOrWhiteSpace($currentPath)) { $targetDir } else { "$currentPath;$targetDir" }
            [System.Environment]::SetEnvironmentVariable('Path', $newPath, [System.EnvironmentVariableTarget]::$Scope)

            # Update current process PATH
            $env:Path = "$targetDir;$env:Path"

            # Broadcast WM_SETTINGCHANGE so other applications and new terminals notice
            try {
              $sendTimeoutCode = @'
using System;
using System.Runtime.InteropServices;
public class Win32Notifier {
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
}
'@
              Add-Type -TypeDefinition $sendTimeoutCode -ErrorAction SilentlyContinue
              $nullResult = [UIntPtr]::Zero
              [Win32Notifier]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, "Environment", 2, 2000, [ref]$nullResult)
            } catch { }
            Write-FontivoOk "Successfully updated $($Scope) PATH and notified Windows subsystem."
          }
        }
      }

      # 7. Create Start Menu and Desktop Shortcuts
      if (-not $NoShortcuts) {
        try {
          $wshShell = New-Object -ComObject WScript.Shell
          $programsPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)
          $shortcutDir = Join-Path $programsPath "Fontivo"
          if (-not (Test-Path $shortcutDir)) { $null = New-Item -ItemType Directory -Path $shortcutDir -Force }

          $shortcutFile = Join-Path $shortcutDir "Fontivo.lnk"
          $shortcut = $wshShell.CreateShortcut($shortcutFile)
          $shortcut.TargetPath = $installedExe
          $shortcut.WorkingDirectory = $targetDir
          $shortcut.Description = "Fontivo - Next-Generation Desktop Font Manager"
          $iconFile = Join-Path $targetDir "icon.ico"
          if (Test-Path $iconFile) { $shortcut.IconLocation = "$iconFile,0" }
          $shortcut.Save()
          Write-FontivoOk "Created Start Menu shortcut."

          if (-not $NoDesktopShortcut) {
            $desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
            $desktopShortcutFile = Join-Path $desktopPath "Fontivo.lnk"
            $desktopShortcut = $wshShell.CreateShortcut($desktopShortcutFile)
            $desktopShortcut.TargetPath = $installedExe
            $desktopShortcut.WorkingDirectory = $targetDir
            $desktopShortcut.Description = "Fontivo - Next-Generation Desktop Font Manager"
            if (Test-Path $iconFile) { $desktopShortcut.IconLocation = "$iconFile,0" }
            $desktopShortcut.Save()
            Write-FontivoOk "Created Desktop shortcut."
          }
        } catch {
          Write-FontivoWarn "Could not create Windows desktop shortcuts: $($_.Exception.Message)"
        }
      }

      # 8. Register fontivo:// URL Protocol in HKCU
      try {
        $protocolKey = "HKCU:\Software\Classes\Fontivo"
        New-Item -Path $protocolKey -Force | Out-Null
        Set-ItemProperty -Path $protocolKey -Name "(Default)" -Value "URL:Fontivo Protocol" | Out-Null
        Set-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" | Out-Null

        $cmdKey = "$protocolKey\shell\open\command"
        New-Item -Path $cmdKey -Force | Out-Null
        Set-ItemProperty -Path $cmdKey -Name "(Default)" -Value "`"$installedExe`" `"%1`"" | Out-Null
        Write-FontivoOk "Registered 'fontivo://' browser URL protocol handler."
      } catch {
        Write-FontivoWarn "URL protocol registration skipped: $($_.Exception.Message)"
      }

      Write-Host ""
      Write-Host "============================================================" -ForegroundColor Green
      Write-Host "  Fontivo installed successfully!" -ForegroundColor Green
      Write-Host "============================================================" -ForegroundColor Green
      Write-Host "Location : $installedExe"
      Write-Host "To run   : Simply type 'Fontivo' in any terminal or launch from Start Menu."
      Write-Host ""
    } finally {
      if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    Write-Host ""
    Write-Host "[FAIL] Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    throw
  } finally {
    $ErrorActionPreference = $origErrorAction
    $ProgressPreference = $origProgress
  }
}

Invoke-FontivoInstall
