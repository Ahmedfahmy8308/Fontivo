# Fontivo Configuration & Runtime Environment

This document provides a comprehensive technical guide to configuring Fontivo, managing disk locations, setting environment variables, and customizing daemon options.

---

## 1. Filesystem Paths & Storage Hierarchy

Fontivo stores its state, settings, backups, and cached metadata strictly in user-space without polluting system directories or requiring administrator privileges.

### Standard Storage Paths

| Operating System | Base Application Directory |
| :--- | :--- |
| **Windows 10 / 11** | `%APPDATA%\Fontivo\` (`C:\Users\<User>\AppData\Roaming\Fontivo\`) |
| **macOS** | `~/Library/Application Support/Fontivo/` |
| **Linux** | `~/.config/fontivo/` (or `$XDG_CONFIG_HOME/fontivo/`) |

### Directory Breakdown

```text
%APPDATA%\Fontivo\
├── config/
│ └── settings.json # Main user configuration & preferences
├── cache/
│ ├── fonts-cache.json # Serialized index of 11,207 fonts & metadata
│ └── google-fonts.json # Google Fonts catalog cache
├── Backups/
│ ├── fontivo_registry_backup_20261121_143022.reg # Automated Windows Registry backups
│ └── fontivo_registry_backup_20261122_091510.reg
├── downloads/
│ └── staging/ # Resumable partial font downloads (.part)
└── logs/
 └── fontivo.log # Rolling local daemon diagnostics log
```

---

## 2. Configuration Settings (`settings.json`)

The primary configuration file is located at `%APPDATA%\Fontivo\config\settings.json`. It is automatically generated with secure defaults on first launch.

### Example Configuration

```json
{
 "version": "1.0.0",
 "server": {
 "host": "127.0.0.1",
 "port": 3920,
 "adobe_port": 27715,
 "request_timeout_ms": 15000,
 "max_payload_bytes": 10485760
 },
 "ui": {
 "theme": "dark",
 "language": "en",
 "view_mode": "family",
 "font_size_preview": 32,
 "auto_refresh_interval_ms": 2000
 },
 "activation": {
 "auto_activate_on_adobe_open": true,
 "auto_clean_on_exit": true,
 "max_ram_fonts_warning_threshold": 500
 },
 "library": {
 "custom_font_directories": [
 "D:\\DesignAssets\\StudioFonts",
 "E:\\ClientProjects\\BrandFonts"
 ],
 "auto_watch_directories": true,
 "scan_depth_limit": 12
 }
}
```

### Configuration Options Reference

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `server.host` | `string` | `"127.0.0.1"` | Binding IP. Must remain loopback for security. |
| `server.port` | `number` | `3920` | Localhost HTTP REST daemon listening port. |
| `server.adobe_port` | `number` | `27715` | Adobe Creative Cloud socket listener port. |
| `ui.theme` | `string` | `"dark"` | Active theme (`"dark"` or `"light"`). |
| `ui.language` | `string` | `"en"` | Interface locale (`"en"` or `"ar"`). |
| `ui.auto_refresh_interval_ms` | `number` | `2000` | Telemetry polling frequency for RAM & CPU status. |
| `activation.auto_clean_on_exit` | `boolean` | `true` | Automatically drops all RAM font handles when exiting. |
| `library.scan_depth_limit` | `number` | `12` | Maximum folder nesting depth when importing directories. |

---

## 3. Environment Variables

Fontivo allows overriding runtime configurations via environment variables. This is particularly useful for containerized testing, CI pipelines, or headless installations:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `FONTIVO_PORT` | Integer | `3920` | Overrides the HTTP REST daemon listening port. |
| `FONTIVO_ADOBE_PORT` | Integer | `27715` | Overrides the Adobe CC socket server listening port. |
| `FONTIVO_DATA_DIR` | Path String | System default | Specifies a custom root directory for state and cache files. |
| `FONTIVO_LOG_LEVEL` | String | `"info"` | Log level verbosity (`"error"`, `"warn"`, `"info"`, `"debug"`). |
| `FONTIVO_HEADLESS` | Boolean (`1`/`0`) | `0` | When set to `1`, starts the daemon without rendering the GUI window. |

---

## 4. CLI Arguments & Startup Flags

When launching `Fontivo.exe` from PowerShell or Command Prompt, the following flags are supported:

```powershell
# Launch Fontivo in headless background daemon mode (ideal for CI or external tools)
.\Fontivo.exe --headless

# Specify custom listening ports
.\Fontivo.exe --port 3925 --adobe-port 27720

# Run with verbose diagnostic logging
.\Fontivo.exe --verbose

# Check version and exit
.\Fontivo.exe --version
```

---

## 5. Automated Windows Registry Backups

When using the built-in **System Health & Font Registry Optimizer** (`/api/system/clean-registry` or `/api/system/factory-reset`), Fontivo **always creates an automatic, timestamped `.reg` backup** before executing any modifications.

Backups are saved to:
`%APPDATA%\Fontivo\Backups\fontivo_registry_backup_YYYYMMDD_HHMMSS.reg`

To restore your registry state at any time:
1. Navigate to `%APPDATA%\Fontivo\Backups\`.
2. Double-click the desired `.reg` file.
3. Confirm the Windows Registry Editor prompt to restore original keys instantly.
