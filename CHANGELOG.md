# Changelog

All notable changes to the **Fontivo** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-23

### Highlights

- **First Official Production Release of Fontivo**: The ultimate high-performance, open-source font management, brand identity, and creative asset suite for Windows, macOS, and Linux.
- **Ultra-Lightweight Native Rust Core**: Idles at **~38.5 MB RAM** (85% lower memory usage than Electron alternatives) with instant 0.35s cold launch.
- **Zero Windows Registry Bloat**: In-memory font virtualization via Win32 `AddFontResourceExW(FR_PRIVATE)` without writing permanent registry keys or locking files on disk.
- **Built-in Permanent Adobe Creative Cloud Bridge**: Real-time raw TCP socket bridge on `127.0.0.1:27715` activating missing document fonts in Adobe Photoshop, Illustrator, and InDesign in under 10ms.
- **Brand Identity Hub & Client Handoff**: Pure Rust binary Adobe Swatch Exchange (`.ASE`) generator, CSS/Tailwind design tokens, and self-contained interactive `Brand-StyleGuide.html`.

---

### Added

#### Native Rust Core Engine (`src/fontivo_*` / `Cargo.toml`)
- **Transient Memory Loader**: Implemented `font_activator.rs` utilizing Win32 `AddFontResourceExW` with `FR_PRIVATE` flags and OS-wide `WM_FONTCHANGE` broadcasting.
- **Adobe CC Socket Server**: Asynchronous loopback listener on `127.0.0.1:27715` communicating with Adobe CEP extensions and ExtendScript automation.
- **Design File Inspector**: Integrated parser extracting text layers and font metadata from `.psd`, `.ai`, `.indd`, and `.pdf` files without buffering heavy raster layers.
- **Binary Adobe Swatch Exchange Generator**: Native Rust `.ASE` generator creating Big-Endian IEEE 754 floating-point RGB palettes compatible with Photoshop, Illustrator, and InDesign.
- **Pre-Indexed Font Database**: Embedded database indexing **11,207 fonts** across **4,438 families** with balanced Arabic and Latin scripts.
- **Asynchronous Downloader & Safe Extractor**: Multi-threaded HTTP Range resumption engine coupled with `SafeZipExtractor` featuring Zip Slip protection, 200:1 compression ratio limits, 4 GB size ceilings, and font binary signature validation.
- **System Health & Registry Optimizer**: Audits and purges orphaned font registry keys in `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`, creates automatic timestamped `.reg` backups in `%APPDATA%\Fontivo\Backups\`, and executes working set RAM trimming (`EmptyWorkingSet`).

#### Desktop User Interface (`src/ui/`)
- **Virtualized Specimen Artboard**: Ultra-fast React 19 canvas rendering thousands of font cards with zero UI stutter.
- **4 Distinct View Modes**: Family Grouped, Masonry Grid, Compact List, and Editorial Specimen.
- **Bilingual Internationalization (i18n)**: Seamless English and Arabic localization with comprehensive RTL/LTR layout transitions.
- **Color Studio & Screen Eyedropper**: System-wide Win32 crosshair eyedropper (`/api/color/pick-screen`) with a live 5x5 pixel Loupe, WCAG 2.1 contrast calculations (AAA/AA ratings), and six mathematical color harmonies.
- **UI/UX Typography Laboratory**: Interactive component testing (buttons, form fields, user cards, pricing tiers) paired with **Tabular Figures & Accounting Numerals Verification** and geometric **Type Scale Generator**.
- **Real-Time 2-Second Telemetry**: Live RAM and CPU streaming monitor with active working set memory optimization.

#### Packaging & Distribution
- **Inno Setup 6 Installer (`Fontivo-v1.0-Setup.exe`)**: Non-elevated least-privilege installation (`PrivilegesRequired=lowest`) into `{autopf}\Fontivo` with `fontivo://` protocol handler registration (~3.89 MB).
- **Standalone Portable Binary (`Fontivo.exe`)**: Self-contained executable requiring zero installation (~6.94 MB).
- **1-Click PowerShell Installer**: Automated download and installation script (`iwr ... | iex`).

---

### Security Hardening

- **Loopback Binding**: Rebound all HTTP and TCP socket listeners strictly to IPv4 `127.0.0.1` (mitigates CWE-668 / CWE-200).
- **Strict CORS Protection**: Implemented strict Origin header validation, rejecting foreign browser requests with `403 Forbidden` (mitigates CWE-346).
- **Path Traversal Elimination**: Enforced cryptographic canonicalization containment checks across all static and file streaming endpoints (mitigates CWE-22).
- **Request Body Capping**: Implemented hard 10 MB payload limits on all incoming HTTP POST requests to prevent OOM denial-of-service (mitigates CWE-400).
- **Directory Traversal Limiter**: Capped recursive folder scanning depth at 12 levels and 50,000 files maximum (mitigates CWE-674).
- **Least Privilege Execution**: Embedded Windows manifest specifying `requestedExecutionLevel level="asInvoker"`.
- **System Font Isolation**: Ensured Windows system fonts are excluded from bulk RAM activation, preventing registry and GDI table pollution.

---

## [Unreleased]

### Planned Features
- Variable font continuous axis sliders (Weight, Width, Slant, Optical Size).
- Web font subsetter with WOFF2 compilation and glyph optimization.
- Figma Desktop local font helper integration.
- macOS CoreText and Linux Fontconfig memory font virtualization backends.
