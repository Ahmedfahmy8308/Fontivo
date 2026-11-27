# Changelog

All notable changes to the **Fontivo** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.5] - 2026-11-27

### Added & Improved
- **Folder Import Preview & Custom Slice Naming (`ImportPreviewModal`)**: Added dry-run folder scanning (`POST /api/fonts/preview-folder`, `POST /api/dialog/pick-folder-preview`) that validates OpenType headers and checks SHA-256 duplicates before copying, letting users inspect new/duplicate/invalid counts, total MB, and sample families, and customize the slice name (`customFolderName`) before copying into `%LOCALAPPDATA%\Fontivo\Fonts\Imported\<name>\`.
- **Imported Folder Slice Rename & ZIP Export**: Added safe direct-child folder renaming (`POST /api/fonts/rename-folder`) updating disk paths, indexed font records, and collections, plus sandboxed ZIP export (`GET /api/fonts/export-folder?folderPath=...`) for user folders under `Fonts/Imported/` and `Fonts/Custom/`.
- **Storage Breakdown & Safe Cache Cleanup**: Added `GET /api/system/storage-breakdown` (exact byte sizes and file counts across `Imported`, `Custom`, `Google`, `Packs`, `Workspaces`, `Backups`, and `Cache`) and 1-click `POST /api/system/cleanup-cache` to safely purge temporary `.zip`/`.part`/`.tmp` files in `Cache/PackArchives`.
- **Workspace Handover ZIP Bundle, Logo Palette Auto-Extractor & Live `@font-face` Specimen**: Added `GET /api/workspaces/:id/export-bundle` (`<workspace-id>-handover.zip` packaging `Fonts/`, `Palettes/palette.ase`, `Guidelines/styleguide.html`, and `Designs/`), pure Canvas 5-color logo palette extraction (`extractPaletteFromImageData`), and live `@font-face` interactive typography specimen previews with adjustable size (`16px–44px`) and editable text.
- **Performance & Canonical Website Migration**: Split heavy secondary views via `React.lazy` + `<Suspense>` for faster initial bundle load, and migrated canonical website & CDN manifest fallback URLs to `https://fontivo-app.github.io` while preserving GitHub repository links on `Ahmedfahmy8308/Fontivo` and `Ahmedfahmy8308/Fontivo-Fonts`.

---

## [1.1.4] - 2026-11-27

### Fixed & Improved
- **Full-Width Studio Architecture for `WorkspacesView`**: Promoted the Project Color Palette (`Palettes/palette.ase`) to a dedicated full-width studio section using `grid-cols-[repeat(auto-fill,minmax(240px,1fr))]` so color swatch cards stay spacious (`>= 240px`) with zero overlap across `1280px`, `1440px`, `1920px`, and ultra-wide monitors; restructured Typography Pairing + Project Fonts (`xl:col-span-5` / `xl:col-span-7`), full-width Design Assets & Brand Folders (`Designs/` with 2-column asset grid and search filter), and balanced Delivery Tasks + Brand Guidelines (`Guidelines/`, `xl:col-span-7` / `xl:col-span-5`) into cohesive studio sections.
- **Complete Project Fonts Visibility & Live Full-Library Font Search**: Fixed `resolvedProjectFonts` to merge disk `Fonts/`, `projectFonts`, `typography` slots (`headingFont`, `bodyFont`, `accentFont`, `codeFont`), and `customFonts` with deduplication, localized role badges, and 1-click RAM activation; replaced the 180-item `<select>` cap with a real-time debounced full-library font search (`GET /api/fonts?search=<query>&limit=60`) plus instant linked-font and design-file search filters.

---

## [1.1.3] - 2026-11-26

### Added & Improved
- **Ergonomic Workspace Brand Builder (`WorkspacesView`)**: Upgraded Create & Edit Workspace modals with RTL-safe grid layout (`pe-9` & `!appearance-none` select styling), brand logo upload/preview, project target `deadline`, dynamic custom font roles (`customFonts` synced into `Fonts/` and activated in RAM via `activate_workspace_ram`), library font picker with `/api/fonts` fallback fetch, and an inline dynamic color palette builder in both Create and Edit modes.
- **Redesigned Brand Palette, Tasks & Asset Studio**: Rebuilt Color Swatch Cards (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-3`) so swatch names, `dir="ltr"` hex codes, and WCAG badges never clip behind action buttons; added task `dueDate` countdowns, `priority`, and `category` with `font-sans` Arabic filter pills and `dir="auto"` text alignment; added 7 one-click brand folder templates, `pinnedAssets` bookmarking, Image Lightbox preview, `Guidelines/styleguide.html` viewer button, `POST /api/workspaces/:id/open-file`, and `DELETE /api/workspaces/:id/folders?path=...` (protecting root folders and traversal).
- **Segmented `Local & Custom` Library & Safe Folder Deletion**: Added `source=local_all`, `bucket` (`custom`, `imported`, `cloud`, `google`), and `folderPath` filtering across `/api/fonts`, `/api/families`, `/api/fonts/custom-buckets`, and `/api/stats` (`localAllCount`/`customBuckets`), paired with segmented sub-category filter tabs, clickable grouped folder chips, and sandboxed `POST /api/fonts/delete-folder` cleanup with inline confirmation.
- **Balanced `UpdaterModal` Status & Action Toolbar**: Restructured the App & Fonts status banners into two balanced sections with aligned header pills, `leading-normal` single-line metadata, high-contrast progress/toast styling, and `whitespace-nowrap` single-line `h-10 px-4` action buttons across English and Arabic RTL.

---

## [1.1.2] - 2026-11-26

### Fixed & Improved
- **Zero-Mock Updater & Resilient CDN Mirror**: Removed hardcoded `v1.0.0`/`1.0.2`/`Today` strings across `LicensesView`, `SettingsView`, `UpdaterModal`, `AboutDeveloperModal`, and `HelpModal`; added fallback to `Fontivo-Site/api/manifest.json` when GitHub API rate-limits or drops TLS, stripped raw CLI trailers from release notes, rebuilt `UpdaterModal` via React Portal with formatted changelog items, and cleaned `App.tsx` ready banner.
- **End-to-End Persistent Project Workspaces (`WorkspacesView`)**: Removed mock fallback fonts/PSDs and connected full real CRUD persistence across creating/editing/deleting workspaces (`DELETE /api/workspaces/:id`), adding/editing/deleting swatches (`POST /api/workspaces/save-palette` + `palette.ase`), linking/copying project fonts (`projectFonts` synced to `Fonts/` & activated in RAM), uploading/scanning/deleting design files (`DELETE /api/workspaces/:id/design-file`), task checklists, and inline brand guidelines editing.
- **Responsive & RTL-Safe Workspace & Settings Layout**: Redesigned `WorkspacesView` subfolder cards, color swatch tiles, hero header, action toolbars, and `%LOCALAPPDATA%` `dir="ltr"` path displays for clean zero-overlap visual order across desktop and narrow viewports.

---

## [1.1.1] - 2026-11-26

### Fixed & Improved
- **Windows Fonts Backup Counting, Delete & Pending-Reboot Tracking**: Fixed `manifest.json` `totalFonts` counting so locked fonts queued for Windows reboot deletion (`PendingFileRenameOperations`) are accurately counted alongside immediately removed fonts, added `pendingRebootDelete` badges/notices in `WindowsFontsView`, skipped redundant re-backups for already queued fonts, and added backup deletion (`POST/DELETE /api/system/windows-fonts/backups`).
- **Fully Responsive Backup & Restore Modals**: Rebuilt Windows Restore and Backup History modals via React Portal with sticky header/footer, clean overflow wrapping for long backup IDs, and fluid breakpoints across mobile/tablet/desktop screens.
- **Unified Windows AppData & Installer Directory Layout**: Consolidated Updates (`%LOCALAPPDATA%\Fontivo\Updates`), Downloads (`%LOCALAPPDATA%\Fontivo\Downloads`), Imported Fonts (`%LOCALAPPDATA%\Fontivo\Fonts\Imported`), Roaming preferences anchor (`%APPDATA%\Fontivo`), and `[Dirs]` creation inside `Setup_Fontivo.iss`; fixed Cloud Packs folder button to open `%LOCALAPPDATA%\Fontivo\Fonts\Packs`, implemented `GET /api/system/info`, and removed empty stray `Downloads\Fontivo` creation.
- **Methodical Font & Folder Import Pipeline**: Unified folder picking and API folder import into `ingest_font_folder_into_library` with OpenType header pre-validation, SHA-256 deduplication, clean organization under `Fonts\Imported\<Folder>\<Family>\`, automatic collection creation, and unified import summary notifications.

---

## [1.0.3] - 2026-11-26

### Fixed & Improved
- **Clean Installer Naming (`Fontivo-Setup.exe`) & Live Website Auto-Sync**: Standardized Windows setup installer filename to `Fontivo-Setup.exe` (keeping version in GitHub Release tags), updated `AutoUpdater` to query GitHub Releases latest API (`tag_name` + `assets[]`), and wired live client-side release sync into `Fontivo-Site`.
- **Unified AppData Storage Architecture**: Consolidated split `AppData\Roaming\Fontivo` and `AppData\Local\Fontivo` directories into one clean `%LOCALAPPDATA%\Fontivo\` hierarchy (`Fonts/{Google,Packs,Custom}`, `Workspaces/`, `Backups/`, `WebView2/`) with idempotent migration, automatic cleanup of empty/duplicate folders, and removal of redundant `.zip` archives after extraction.
- **Large Library Performance & Complete Family Deletion**: Switched library index to single-file compact JSON, eliminated full-vector `FontRecord` cloning in `/api/fonts` and `/api/families`, cached recursive disk usage checks, added batched/memoized `@font-face` card loading, and added `POST /api/fonts/delete-family` to cleanly delete entire font families and prune empty family folders.
- **Smart Duplicate Font Detection**: Implemented SHA-256 content hash, normalized path, and identity metadata duplicate detection on single/multi font uploads (`POST /api/fonts/import-file`), folder import (`POST /api/import-folder`), and folder picker (`POST /api/dialog/pick-folder`) with detailed bilingual skip notifications.
- **Project Workspaces Overhaul**: Expanded Workspaces canvas with collapsible sidebar, Project Logo upload/preview, localized Arabic/English project categories, client & campaign metadata, real library font role pickers, unlimited nested subfolders (`Folder inside Folder`), and direct design file uploads (`.psd`, `.ai`, `.indd`, `.pdf`, `.svg`, `.png`, `.jpg`, `.webp`) with automatic font scanning.

---

## [1.0.2] - 2026-11-26

### Fixed
- **Windows 10/11 Inbox & Codepage System Fonts Classification**: Added missing TrustedInstaller inbox fonts (`msgothic.ttc`, `SimsunExtG.ttf`, `LeelaUIb.ttf`, `SansSerifCollection.ttf`, `CascadiaCode.ttf`, `CascadiaMono.ttf`) and regional `.FON` raster system fonts (`COUE1256.FON`, `COUF1256.FON`, `SERE1256.FON`, `SERF1256.FON`, etc.) to `is_protected_system_font` and `CORE_WINDOWS_FONT_FAMILIES` so they are protected under Windows Core Fonts instead of misclassified as external user fonts.
- **Locked External & Duplicate Font Removal (`FontCache` + `MoveFileExW`)**: Stops Windows `FontCache` service and broadcasts `WM_FONTCHANGE` *before* moving non-system fonts during Windows font reset, and safely backs up + schedules `MOVEFILE_DELAY_UNTIL_REBOOT` deletion (removing stale Registry entries cleanly) for any third-party/duplicate fonts still locked in memory (`os error 32`), with accurate feedback counts in `WindowsFontsView`.

---

## [1.0.1] - 2026-11-26

### Fixed
- **Cloud Font Packs Redirect Allowlist (`release-assets.githubusercontent.com`)**: Added GitHub's official release asset CDN hosts (`release-assets.githubusercontent.com`, `github-releases.githubusercontent.com`, `codeload.github.com`, `media.githubusercontent.com`) to `TRUSTED_DOWNLOAD_DOMAINS` in `security.rs` so `DownloadManager` cleanly follows `302 Redirect` responses from `Fontivo-Fonts v1.0.3` releases while preserving strict SSRF protection.
- **Cloud Packs Batch Queue & Real-Time UI Sync**: Fixed `CloudPacksView` (`handleDownloadAll` reading `res.queued` instead of `res.queuedJobs`), normalized lowercase `camelCase` Rust `JobPhase` values across `CloudPacksView` and `OperationsCenter`, and aligned `/api/catalog/packages` responses with `libraryVersion` & `releaseTag`.

### Improved
- **Live Animated Pack Cards & Aggregate Queue Telemetry**: Added a real-time aggregate download bar (`Active / Queued / Completed`, speed, MB downloaded / total, and active pack + `v1.0.3` tag) plus per-card animated progress bars, speed/MB readouts, retry buttons on failure, and `dir="ltr"` isolation on numeric sizes in Arabic RTL mode.

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
- **Pre-Indexed Font Database**: Synchronized with `Fontivo-Fonts v1.0.3` indexing **10,939 unique fonts** across **4,430 families** in **15 SHA-256 verified packs**.
- **Asynchronous Downloader & Safe Extractor**: Multi-threaded HTTP Range resumption engine coupled with `SafeZipExtractor` featuring Zip Slip protection, 200:1 compression ratio limits, 4 GB size ceilings, and font binary signature validation.
- **System Health & Registry Optimizer**: Audits and purges orphaned font registry keys in `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`, creates automatic timestamped `.reg` backups in `%APPDATA%\Fontivo\Backups\`, and executes working set RAM trimming (`EmptyWorkingSet`).

#### Desktop User Interface (`src/ui/`)
- **Virtualized Specimen Artboard**: Ultra-fast React 19 canvas rendering thousands of font cards with zero UI stutter.
- **4 Distinct View Modes**: Family Grouped, Masonry Grid, Compact List, and Editorial Specimen.
- **Bilingual Internationalization (i18n)**: Seamless English and Arabic localization with comprehensive RTL/LTR layout transitions.
- **Color Studio & Screen Eyedropper**: System-wide Win32 crosshair eyedropper (`/api/color/pick-screen`) with circular lens feedback, WCAG 2.1 contrast calculations (AAA/AA ratings), and six mathematical color harmonies.
- **UI/UX Typography Laboratory**: Interactive component testing paired with **Tabular Figures verification** and geometric **Type Scale Generator**.
- **Real-Time 2-Second Telemetry**: Live RAM and CPU streaming monitor with active working set memory optimization.

#### Packaging & Distribution
- **Inno Setup 6 Installer (`Fontivo-v1.0-Setup.exe`)**: Non-elevated least-privilege installation (`PrivilegesRequired=lowest`) into `{autopf}\Fontivo` with complete PE VersionInfo metadata and `SHA256SUMS` verification (`4.30 MB`).
- **macOS & Linux Release Channels**: Precompiled SHA-256 verified release tarballs (`Fontivo-macos-arm64.tar.gz`, `Fontivo-macos-x86_64.tar.gz`, `Fontivo-linux-x86_64.tar.gz`) installed safely via `raw.githubusercontent.com/.../scripts/install.sh` with `--from-source` compilation support.
- **GitHub Artifact Attestations**: Free cryptographic SLSA build provenance (`actions/attest-build-provenance`) generated for every official release asset.

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
