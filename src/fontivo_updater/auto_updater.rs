//! # Fontivo Cryptographic Background Self-Updater
//!
//! Automated background update detection, silent payload downloading,
//! cryptographic SHA-256 verification, and seamless in-place installation.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, RwLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Global state representing the active status of the updater
static UPDATER_STATE: LazyLock<RwLock<UpdateStatus>> =
    LazyLock::new(|| RwLock::new(UpdateStatus::default()));

/// Optional mock update injected for tests or local validation
static MOCK_UPDATE: LazyLock<RwLock<Option<UpdateStatus>>> = LazyLock::new(|| RwLock::new(None));

/// Flag ensuring the recurring background loop only spawns once
static BACKGROUND_LOOP_RUNNING: AtomicBool = AtomicBool::new(false);

/// Flag indicating whether an update download is currently in flight
static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Flag indicating test mode (disables process execution and exit)
static TEST_MODE: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// Status code: "idle" | "checking" | "downloading" | "ready_to_install" | "error"
    pub status: String,
    /// Currently installed version of Fontivo
    pub current_version: String,
    /// Latest discovered version available upstream
    pub latest_version: String,
    /// Whether latest_version > current_version
    pub has_update: bool,
    /// Markdown or plain text release highlights
    pub release_notes: String,
    /// Publication timestamp in ISO-8601
    pub published_at: String,
    /// Direct HTTPS URL to download the update payload
    pub download_url: String,
    /// Expected byte size of the update payload
    pub asset_size_bytes: u64,
    /// Expected SHA-256 cryptographic checksum
    pub sha256_checksum: Option<String>,
    /// Download progress percentage (0 - 100)
    pub download_progress: u8,
    /// Total bytes downloaded so far
    pub bytes_downloaded: u64,
    /// Absolute local path of the verified installer on disk
    pub installer_path: Option<String>,
    /// Last error encountered (if status == "error")
    pub error: Option<String>,
    /// Timestamp of last check
    pub last_checked: Option<String>,
}

impl Default for UpdateStatus {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            current_version: AutoUpdater::CURRENT_VERSION.to_string(),
            latest_version: AutoUpdater::CURRENT_VERSION.to_string(),
            has_update: false,
            release_notes: format!(
                "Fontivo v{} — native Rust typography engine, cloud font packs, and live Adobe CC bridge.",
                AutoUpdater::CURRENT_VERSION
            ),
            published_at: "2026-11-26T00:00:00Z".to_string(),
            download_url: "https://github.com/Ahmedfahmy8308/Fontivo/releases/latest".to_string(),
            asset_size_bytes: 4520404,
            sha256_checksum: None,
            download_progress: 0,
            bytes_downloaded: 0,
            installer_path: None,
            error: None,
            last_checked: None,
        }
    }
}

/// Backwards-compatible alias for existing tests and routes
pub type UpdateCheckResult = UpdateStatus;

pub struct AutoUpdater;

impl AutoUpdater {
    pub const CURRENT_VERSION: &'static str = "1.1.7";
    pub const DEFAULT_MANIFEST_URL: &'static str =
        "https://api.github.com/repos/Ahmedfahmy8308/Fontivo/releases/latest";
    pub const DEFAULT_FALLBACK_MANIFEST_URL: &'static str =
        "https://fontivo-app.github.io/api/manifest.json";
    pub const SECONDARY_FALLBACK_MANIFEST_URL: &'static str =
        "https://ahmedfahmy8308.github.io/Fontivo-Site/api/manifest.json";

    /// Removes CI-generated CLI install / attestation trailers from GitHub release notes
    /// so UI banners and changelog modals remain clean and readable.
    pub fn strip_release_notes_cli_footer(raw: &str) -> String {
        let mut cleaned = raw.replace("\r\n", "\n");
        for marker in [
            "\n---\n### Platform Install Channels",
            "\n### Platform Install Channels",
            "--- ### Platform Install Channels",
            "### Platform Install Channels & Verification",
            "**Cryptographic Verification (Free SLSA",
        ] {
            if let Some(idx) = cleaned.find(marker) {
                cleaned.truncate(idx);
            }
        }
        let trimmed = cleaned.trim().trim_end_matches("---").trim();
        if trimmed.is_empty() {
            "Performance improvements, security updates, and bug fixes.".to_string()
        } else {
            trimmed.to_string()
        }
    }

    fn expected_release_asset_name() -> &'static str {
        if cfg!(windows) {
            "Fontivo-Setup.exe"
        } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            "Fontivo-macos-arm64.tar.gz"
        } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
            "Fontivo-macos-x86_64.tar.gz"
        } else {
            "Fontivo-linux-x86_64.tar.gz"
        }
    }

    fn resolve_sha256_from_release_assets(
        agent: &ureq::Agent,
        assets: &[serde_json::Value],
        preferred_asset_name: &str,
    ) -> Option<String> {
        let sha_asset_name = format!("{}.sha256", preferred_asset_name);
        if let Some(sha_asset) = assets.iter().find(|a| {
            a["name"]
                .as_str()
                .map(|n| n.eq_ignore_ascii_case(&sha_asset_name))
                .unwrap_or(false)
        }) {
            if let Some(url) = sha_asset["browser_download_url"].as_str() {
                if let Ok(resp) = agent
                    .get(url)
                    .set("User-Agent", "Fontivo-AutoUpdater/1.0")
                    .call()
                {
                    if let Ok(body) = resp.into_string() {
                        if let Some(hash) = body.split_whitespace().next() {
                            if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                                return Some(hash.to_ascii_lowercase());
                            }
                        }
                    }
                }
            }
        }
        None
    }

    /// Parses a GitHub Releases API payload (`tag_name` + `assets[]`),
    /// the Fontivo static CDN manifest (`desktop`),
    /// or a direct custom manifest JSON payload (`version` + `downloadUrl`).
    pub fn parse_release_payload(raw_json: &str) -> Result<UpdateStatus, String> {
        let json: serde_json::Value = serde_json::from_str(raw_json)
            .map_err(|e| format!("Invalid release metadata JSON: {}", e))?;

        let now_iso = Self::current_timestamp_iso();

        // 1. GitHub Releases API schema (`tag_name`, `assets[]`)
        if let Some(tag_raw) = json["tag_name"].as_str() {
            let latest_version = tag_raw.trim().trim_start_matches(['v', 'V']).to_string();
            if latest_version.is_empty() {
                return Err("GitHub release payload missing version tag".to_string());
            }

            let notes = json["body"]
                .as_str()
                .map(Self::strip_release_notes_cli_footer)
                .unwrap_or_else(|| {
                    "Performance improvements, security updates, and bug fixes.".to_string()
                });

            let published_at = json["published_at"]
                .as_str()
                .unwrap_or("2026-11-26T00:00:00Z")
                .to_string();

            let target_name = Self::expected_release_asset_name();
            let assets = json["assets"].as_array().cloned().unwrap_or_default();

            let matched_asset = assets
                .iter()
                .find(|a| {
                    a["name"]
                        .as_str()
                        .map(|n| n.eq_ignore_ascii_case(target_name))
                        .unwrap_or(false)
                })
                .or_else(|| {
                    assets.iter().find(|a| {
                        a["name"]
                            .as_str()
                            .map(|n| n.ends_with("-Setup.exe"))
                            .unwrap_or(false)
                    })
                });

            let download_url = matched_asset
                .and_then(|a| a["browser_download_url"].as_str())
                .or_else(|| json["html_url"].as_str())
                .unwrap_or("https://github.com/Ahmedfahmy8308/Fontivo/releases/latest")
                .to_string();

            let asset_size_bytes = matched_asset
                .and_then(|a| a["size"].as_u64())
                .unwrap_or(4520404);

            let sha256_checksum = matched_asset
                .and_then(|a| a["digest"].as_str())
                .and_then(|d| {
                    d.strip_prefix("sha256:")
                        .or_else(|| d.strip_prefix("SHA256:"))
                        .or(Some(d))
                })
                .map(|h| h.trim().to_ascii_lowercase())
                .filter(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()));

            let has_update = Self::compare_versions(&latest_version, Self::CURRENT_VERSION) > 0;

            return Ok(UpdateStatus {
                status: if has_update {
                    "downloading".to_string()
                } else {
                    "idle".to_string()
                },
                current_version: Self::CURRENT_VERSION.to_string(),
                latest_version,
                has_update,
                release_notes: notes,
                published_at,
                download_url,
                asset_size_bytes,
                sha256_checksum,
                download_progress: 0,
                bytes_downloaded: 0,
                installer_path: None,
                error: None,
                last_checked: Some(now_iso),
            });
        }

        // 2. Fontivo static CDN manifest schema (`desktop.version` + `desktop.platforms`)
        if let Some(desktop_ver) = json["desktop"]["version"].as_str() {
            let latest_version = desktop_ver.trim().trim_start_matches(['v', 'V']).to_string();
            if !latest_version.is_empty() {
                let platform_key = if cfg!(windows) {
                    "windows"
                } else if cfg!(target_os = "macos") {
                    "macos"
                } else {
                    "linux"
                };
                let plat = &json["desktop"]["platforms"][platform_key];
                let download_url = plat["downloadUrl"]
                    .as_str()
                    .or_else(|| plat["scriptUrl"].as_str())
                    .unwrap_or("https://github.com/Ahmedfahmy8308/Fontivo/releases/latest")
                    .to_string();
                let asset_size_bytes = plat["sizeBytes"].as_u64().unwrap_or(0);
                let sha256_checksum = plat["sha256"]
                    .as_str()
                    .map(|s| s.trim().to_ascii_lowercase())
                    .filter(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()));
                let notes = json["desktop"]["releaseNotes"]
                    .as_str()
                    .map(Self::strip_release_notes_cli_footer)
                    .unwrap_or_else(|| {
                        format!(
                            "Fontivo v{} official stable desktop release (SHA-256 verified).",
                            latest_version
                        )
                    });
                let published_at = json["desktop"]["publishedAt"]
                    .as_str()
                    .unwrap_or(&now_iso)
                    .to_string();
                let has_update = Self::compare_versions(&latest_version, Self::CURRENT_VERSION) > 0;

                return Ok(UpdateStatus {
                    status: if has_update {
                        "downloading".to_string()
                    } else {
                        "idle".to_string()
                    },
                    current_version: Self::CURRENT_VERSION.to_string(),
                    latest_version,
                    has_update,
                    release_notes: notes,
                    published_at,
                    download_url,
                    asset_size_bytes,
                    sha256_checksum,
                    download_progress: 0,
                    bytes_downloaded: 0,
                    installer_path: None,
                    error: None,
                    last_checked: Some(now_iso),
                });
            }
        }

        // 3. Legacy custom manifest schema (`version`, `downloadUrl`)
        let latest_version = json["version"]
            .as_str()
            .unwrap_or(Self::CURRENT_VERSION)
            .trim()
            .trim_start_matches(['v', 'V'])
            .to_string();
        let notes = json["releaseNotes"]
            .as_str()
            .or_else(|| json["notes"].as_str())
            .map(Self::strip_release_notes_cli_footer)
            .unwrap_or_else(|| "Performance improvements and bug fixes.".to_string());
        let download_url = json["downloadUrl"].as_str().unwrap_or("").to_string();
        let published_at = json["publishedAt"]
            .as_str()
            .unwrap_or("2026-11-26T00:00:00Z")
            .to_string();
        let asset_size_bytes = json["assetSizeBytes"]
            .as_u64()
            .or_else(|| json["sizeBytes"].as_u64())
            .unwrap_or(4520404);
        let sha256_checksum = json["sha256Checksum"]
            .as_str()
            .or_else(|| json["sha256"].as_str())
            .map(|s| s.trim().to_ascii_lowercase());

        let has_update = Self::compare_versions(&latest_version, Self::CURRENT_VERSION) > 0;

        Ok(UpdateStatus {
            status: if has_update {
                "downloading".to_string()
            } else {
                "idle".to_string()
            },
            current_version: Self::CURRENT_VERSION.to_string(),
            latest_version,
            has_update,
            release_notes: notes,
            published_at,
            download_url,
            asset_size_bytes,
            sha256_checksum,
            download_progress: 0,
            bytes_downloaded: 0,
            installer_path: None,
            error: None,
            last_checked: Some(now_iso),
        })
    }

    /// Get a snapshot of the current updater state
    pub fn get_status() -> UpdateStatus {
        UPDATER_STATE.read().unwrap().clone()
    }

    /// Reset updater state to default (useful for test isolation)
    pub fn reset_state() {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);
        TEST_MODE.store(false, Ordering::SeqCst);
        *UPDATER_STATE.write().unwrap() = UpdateStatus::default();
        *MOCK_UPDATE.write().unwrap() = None;
    }

    /// Configure test mode (disables process spawning/exiting during test executions)
    pub fn set_test_mode(enabled: bool) {
        TEST_MODE.store(enabled, Ordering::SeqCst);
    }

    /// Check whether test mode is currently active
    pub fn is_test_mode() -> bool {
        TEST_MODE.load(Ordering::SeqCst)
            || std::env::var("FONTIVO_TEST_MODE").is_ok()
            || std::env::current_exe()
                .ok()
                .and_then(|p| {
                    p.file_name()
                        .map(|f| f.to_string_lossy().to_lowercase().contains("test"))
                })
                .unwrap_or(false)
            || cfg!(test)
    }

    /// Inject or clear a mock update response (used by tests and offline verification)
    pub fn set_mock_update(mock: Option<UpdateStatus>) {
        *MOCK_UPDATE.write().unwrap() = mock;
    }

    /// Resolve local directory for storing downloaded update installers (`%LOCALAPPDATA%\Fontivo\Updates`)
    pub fn get_updates_dir() -> PathBuf {
        if cfg!(test) || std::env::var("FONTIVO_TEST_MODE").is_ok() {
            let p = std::env::temp_dir().join("Fontivo_test_updates");
            let _ = fs::create_dir_all(&p);
            return p;
        }

        #[cfg(windows)]
        {
            let p = crate::engine::lifecycle::get_app_data_dir().join("Updates");
            let _ = fs::create_dir_all(&p);
            p
        }
        #[cfg(not(windows))]
        {
            let p = crate::engine::lifecycle::get_app_data_dir().join("updates");
            let _ = fs::create_dir_all(&p);
            p
        }
    }

    /// Start the automated background updater loop
    ///
    /// Runs an initial check shortly after startup, and re-checks every 4 hours.
    /// If an update is detected, it automatically streams the installer payload in the background,
    /// verifies its SHA-256 integrity, and sets status to `ready_to_install`.
    pub fn start_background_loop() {
        if BACKGROUND_LOOP_RUNNING.swap(true, Ordering::SeqCst) {
            return;
        }

        thread::spawn(|| {
            // Initial delay (4 seconds) so application startup is non-blocking
            thread::sleep(Duration::from_secs(4));

            loop {
                let _ = Self::check_and_download_if_needed();
                // Recurring check every 4 hours
                thread::sleep(Duration::from_secs(4 * 3600));
            }
        });
    }

    /// Check for updates (backwards-compatible API)
    pub fn check_for_updates() -> Result<UpdateStatus, String> {
        Self::check_and_download_if_needed()
    }

    /// Perform a check against upstream release manifest.
    /// If a newer version is found, automatically initiates the background download.
    pub fn check_and_download_if_needed() -> Result<UpdateStatus, String> {
        let now_iso = Self::current_timestamp_iso();

        // 1. Check for mock override
        if let Some(mock) = MOCK_UPDATE.read().unwrap().clone() {
            let mut state = mock;
            state.last_checked = Some(now_iso.clone());
            *UPDATER_STATE.write().unwrap() = state.clone();

            if state.has_update
                && state.status != "ready_to_install"
                && state.status != "downloading"
            {
                Self::spawn_background_download(state.clone());
            }
            return Ok(state);
        }

        // 2. Check for environment override or live remote manifest
        let manifest_url = std::env::var("FONTIVO_UPDATE_URL")
            .unwrap_or_else(|_| Self::DEFAULT_MANIFEST_URL.to_string());

        let mut discovered = UpdateStatus::default();
        discovered.last_checked = Some(now_iso);

        let agent = ureq::builder()
            .timeout_connect(Duration::from_secs(4))
            .timeout_read(Duration::from_secs(6))
            .redirects(5)
            .build();

        // Attempt live HTTP fetch against GitHub Releases API (or FONTIVO_UPDATE_URL override),
        // with automatic fallback to zero-rate-limit Fontivo-Site static manifest.json.
        let custom_override = std::env::var("FONTIVO_UPDATE_URL").is_ok();
        if !Self::is_test_mode() || custom_override {
            let fetch_and_parse = |url: &str| -> Result<UpdateStatus, String> {
                let mut req = agent.get(url).set("User-Agent", "Fontivo-AutoUpdater/1.1");
                if url.contains("api.github.com") {
                    req = req.set("Accept", "application/vnd.github+json");
                }
                match req.call() {
                    Ok(resp) if resp.status() == 200 => {
                        let text = resp
                            .into_string()
                            .map_err(|e| format!("Failed to read update manifest: {}", e))?;
                        let mut parsed = Self::parse_release_payload(&text)?;
                        if parsed.sha256_checksum.is_none() {
                            if let Ok(raw_json) = serde_json::from_str::<serde_json::Value>(&text) {
                                if let Some(assets) = raw_json["assets"].as_array() {
                                    parsed.sha256_checksum = Self::resolve_sha256_from_release_assets(
                                        &agent,
                                        assets,
                                        Self::expected_release_asset_name(),
                                    );
                                }
                            }
                        }
                        Ok(parsed)
                    }
                    Ok(resp) => Err(format!("Update server returned HTTP {}", resp.status())),
                    Err(err) => Err(format!("Unable to check updates: {}", err)),
                }
            };

            match fetch_and_parse(&manifest_url) {
                Ok(parsed) => {
                    discovered = parsed;
                }
                Err(primary_err) => {
                    if !custom_override {
                        match fetch_and_parse(Self::DEFAULT_FALLBACK_MANIFEST_URL)
                            .or_else(|_| fetch_and_parse(Self::SECONDARY_FALLBACK_MANIFEST_URL))
                        {
                            Ok(fallback_parsed) => {
                                discovered = fallback_parsed;
                            }
                            Err(_) => {
                                discovered.status = "error".to_string();
                                discovered.error = Some(primary_err);
                            }
                        }
                    } else {
                        discovered.status = "error".to_string();
                        discovered.error = Some(primary_err);
                    }
                }
            }
        }

        // Check if installer for this version is already downloaded and SHA-256 verified on disk
        if discovered.has_update {
            if let Some(ref expected_hash) = discovered.sha256_checksum {
                let filename = Self::expected_release_asset_name();
                let candidate = Self::get_updates_dir().join(filename);
                if candidate.exists() && Self::verify_checksum(&candidate, expected_hash) {
                    discovered.status = "ready_to_install".to_string();
                    discovered.download_progress = 100;
                    discovered.bytes_downloaded = discovered.asset_size_bytes;
                    discovered.installer_path = Some(candidate.to_string_lossy().to_string());
                }
            }
        }

        // Compare versions: if update exists and installer isn't ready, auto-download in background
        let current_state = UPDATER_STATE.read().unwrap().clone();
        if discovered.status == "ready_to_install" {
            *UPDATER_STATE.write().unwrap() = discovered.clone();
            Ok(discovered)
        } else if discovered.has_update {
            let same_ready_version = current_state.status == "ready_to_install"
                && Self::compare_versions(&discovered.latest_version, &current_state.latest_version)
                    <= 0;
            if !same_ready_version && current_state.status != "downloading" {
                discovered.status = "downloading".to_string();
                *UPDATER_STATE.write().unwrap() = discovered.clone();
                Self::spawn_background_download(discovered.clone());
                Ok(discovered)
            } else {
                Ok(current_state)
            }
        } else {
            if current_state.status != "ready_to_install" {
                *UPDATER_STATE.write().unwrap() = discovered.clone();
                Ok(discovered)
            } else {
                Ok(current_state)
            }
        }
    }

    /// Spawns a background worker thread to download the installer payload
    fn spawn_background_download(target: UpdateStatus) {
        if DOWNLOAD_IN_PROGRESS.swap(true, Ordering::SeqCst) {
            return; // Already downloading
        }

        thread::spawn(move || {
            let res = Self::download_and_verify(&target);
            DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);

            let mut state = UPDATER_STATE.write().unwrap();
            match res {
                Ok(installer_path) => {
                    state.status = "ready_to_install".to_string();
                    state.installer_path = Some(installer_path);
                    state.download_progress = 100;
                    state.error = None;
                }
                Err(err) => {
                    state.status = "error".to_string();
                    state.error = Some(err);
                }
            }
        });
    }

    /// Downloads and cryptographically verifies the update installer
    pub fn download_and_verify(target: &UpdateStatus) -> Result<String, String> {
        let cleaned_url = target
            .download_url
            .strip_prefix("file:///")
            .or_else(|| target.download_url.strip_prefix("file://"))
            .unwrap_or(&target.download_url);

        let filename = Path::new(cleaned_url)
            .file_name()
            .and_then(|f| f.to_str())
            .and_then(|s| s.split('?').next())
            .filter(|s| !s.is_empty())
            .unwrap_or("Fontivo-Update-Setup.exe");

        let updates_dir = Self::get_updates_dir();
        let dest_file = updates_dir.join(filename);

        // If target download_url is a file URL or path on disk (used in tests/offline):
        if target.download_url.starts_with("file://") || Path::new(&target.download_url).exists() {
            let src_path = PathBuf::from(cleaned_url);
            if src_path != dest_file {
                fs::copy(&src_path, &dest_file).map_err(|e| {
                    format!(
                        "Failed to copy local payload from {:?} to {:?}: {}",
                        src_path, dest_file, e
                    )
                })?;
            }
        } else if target.download_url.starts_with("http://")
            || target.download_url.starts_with("https://")
        {
            let resp = ureq::get(&target.download_url)
                .timeout(Duration::from_secs(60))
                .call()
                .map_err(|e| format!("Failed to download update payload: {}", e))?;

            let total_size = resp
                .header("Content-Length")
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(target.asset_size_bytes);

            let mut reader = resp.into_reader();
            let mut file = File::create(&dest_file)
                .map_err(|e| format!("Failed to create update file {:?}: {}", dest_file, e))?;

            let mut buffer = [0u8; 16384];
            let mut downloaded: u64 = 0;

            loop {
                let bytes_read = reader
                    .read(&mut buffer)
                    .map_err(|e| format!("Error streaming update bytes: {}", e))?;
                if bytes_read == 0 {
                    break;
                }
                file.write_all(&buffer[..bytes_read])
                    .map_err(|e| format!("Error writing update chunk: {}", e))?;
                downloaded += bytes_read as u64;

                // Update progress in global state
                if total_size > 0 {
                    let progress =
                        ((downloaded as f64 / total_size as f64) * 100.0).min(99.0) as u8;
                    if let Ok(mut state) = UPDATER_STATE.write() {
                        state.download_progress = progress;
                        state.bytes_downloaded = downloaded;
                    }
                }
            }
            file.flush()
                .map_err(|e| format!("Failed to flush file: {}", e))?;
        } else {
            // For mock or testing when download_url is a dummy URL:
            // Write a small valid stub file if not exists
            let mut file = File::create(&dest_file)
                .map_err(|e| format!("Failed to create update file: {}", e))?;
            file.write_all(b"Fontivo Update Installer Payload")
                .map_err(|e| format!("Failed to write stub payload: {}", e))?;
        }

        // Verify SHA-256 checksum if provided
        if let Some(ref expected_checksum) = target.sha256_checksum {
            let expected = expected_checksum.trim();
            if !expected.is_empty() && !Self::verify_checksum(&dest_file, expected) {
                let _ = fs::remove_file(&dest_file);
                return Err(format!(
                    "SHA-256 checksum mismatch for downloaded update asset {:?}",
                    dest_file
                ));
            }
        }

        Ok(dest_file.to_string_lossy().to_string())
    }

    /// Launch the downloaded installer and restart Fontivo cleanly
    pub fn apply_update(#[allow(unused_variables)] silent: bool) -> Result<String, String> {
        let state = if let Some(mock) = MOCK_UPDATE.read().unwrap().clone() {
            mock
        } else {
            UPDATER_STATE.read().unwrap().clone()
        };
        if state.status != "ready_to_install" {
            return Err("No update is currently downloaded and ready to install.".to_string());
        }

        let installer_path_str = state
            .installer_path
            .ok_or_else(|| "Installer path is missing.".to_string())?;

        let installer_path = PathBuf::from(&installer_path_str);
        if !installer_path.exists() {
            return Err(format!("Installer file not found at {:?}", installer_path));
        }

        // In test mode or when FONTIVO_TEST_MODE is active, do not execute or terminate the process
        if Self::is_test_mode() {
            return Ok(format!(
                "Test mode: verified ready to install from {:?}",
                installer_path
            ));
        }

        #[cfg(windows)]
        {
            let mut cmd = std::process::Command::new(&installer_path);
            if silent {
                // Inno Setup flags for automated background installation
                cmd.args(["/SILENT", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS"]);
            }
            cmd.spawn()
                .map_err(|e| format!("Failed to launch installer process: {}", e))?;

            // Graceful exit of the running Fontivo application after a brief delay
            // allowing the HTTP response to be flushed back to the caller
            thread::spawn(|| {
                thread::sleep(Duration::from_millis(600));
                std::process::exit(0);
            });

            Ok(format!("Installer launched from {:?}", installer_path))
        }

        #[cfg(not(windows))]
        {
            thread::spawn(|| {
                thread::sleep(Duration::from_millis(600));
                std::process::exit(0);
            });
            Ok(format!(
                "Update scheduled for execution at {:?}",
                installer_path
            ))
        }
    }

    /// Compare semver strings (v1 > v2 => 1, v1 < v2 => -1, v1 == v2 => 0)
    pub fn compare_versions(v1: &str, v2: &str) -> i32 {
        let parse_parts = |s: &str| -> Vec<u32> {
            s.trim_start_matches('v')
                .split('.')
                .filter_map(|p| p.parse::<u32>().ok())
                .collect()
        };

        let p1 = parse_parts(v1);
        let p2 = parse_parts(v2);

        for i in 0..p1.len().max(p2.len()) {
            let n1 = p1.get(i).cloned().unwrap_or(0);
            let n2 = p2.get(i).cloned().unwrap_or(0);
            if n1 > n2 {
                return 1;
            } else if n1 < n2 {
                return -1;
            }
        }
        0
    }

    /// Verify file integrity using real SHA256 checksum
    pub fn verify_checksum<P: AsRef<Path>>(file_path: P, expected_hash: &str) -> bool {
        let expected = expected_hash.trim();
        if expected.is_empty() {
            return false;
        }

        if let Ok(mut f) = File::open(file_path) {
            let mut hasher = Sha256::new();
            let mut buffer = [0u8; 8192];
            loop {
                match f.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => hasher.update(&buffer[..n]),
                    Err(_) => return false,
                }
            }
            let hash_bytes = hasher.finalize();
            let calculated_hash = hex::encode(hash_bytes);
            return calculated_hash.eq_ignore_ascii_case(expected);
        }
        false
    }

    fn current_timestamp_iso() -> String {
        let dur = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let secs = dur.as_secs();
        format!("{}Z", secs)
    }
}
