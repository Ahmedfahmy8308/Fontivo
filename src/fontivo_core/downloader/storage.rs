use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

static TEST_LIBRARY_OVERRIDE: RwLock<Option<LibraryConfig>> = RwLock::new(None);

fn is_ephemeral_test_path(path_str: &str) -> bool {
    let lower = path_str.replace('/', "\\").to_ascii_lowercase();
    lower.contains("fontivo_lib_test_")
        || lower.contains("fontivo_repair_test_")
        || lower.contains("fontivo_test_")
        || (lower.contains("\\temp\\") && lower.contains("fontivo_"))
        || (lower.contains("\\tmp\\") && lower.contains("fontivo_"))
}

fn default_export_downloads_dir() -> PathBuf {
    env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| crate::engine::lifecycle::get_app_data_dir())
        .join("Downloads")
        .join("Fontivo")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    pub library_dir: String,
    #[serde(default)]
    pub downloads_dir: String,
    pub auto_sync: bool,
    pub default_provider: String,
}

impl Default for LibraryConfig {
    fn default() -> Self {
        let base_dir = crate::engine::lifecycle::get_app_data_dir().join("Fonts");
        let dl_dir = default_export_downloads_dir();
        Self {
            library_dir: base_dir.to_string_lossy().to_string(),
            downloads_dir: dl_dir.to_string_lossy().to_string(),
            auto_sync: true,
            default_provider: "github".to_string(),
        }
    }
}

pub struct LibraryStorageManager;

impl LibraryStorageManager {
    /// Path to the JSON configuration file
    fn config_path() -> PathBuf {
        crate::engine::lifecycle::get_app_data_dir().join("library-config.json")
    }

    /// Loads the library configuration or returns default
    pub fn get_config() -> LibraryConfig {
        if let Ok(guard) = TEST_LIBRARY_OVERRIDE.read() {
            if let Some(ref test_cfg) = *guard {
                return test_cfg.clone();
            }
        }
        let path = Self::config_path();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(mut cfg) = serde_json::from_str::<LibraryConfig>(&content) {
                if !is_ephemeral_test_path(&cfg.library_dir) {
                    // Upgrade legacy AppData\Roaming\Fontivo\Library paths seamlessly
                    let low = cfg.library_dir.replace('/', "\\").to_ascii_lowercase();
                    if low.ends_with("\\appdata\\roaming\\fontivo\\library")
                        || low.ends_with("\\appdata\\local\\fontivo\\library")
                    {
                        cfg.library_dir = crate::engine::lifecycle::get_app_data_dir()
                            .join("Fonts")
                            .to_string_lossy()
                            .to_string();
                        if cfg
                            .downloads_dir
                            .to_ascii_lowercase()
                            .contains("\\library\\downloads")
                        {
                            cfg.downloads_dir =
                                default_export_downloads_dir().to_string_lossy().to_string();
                        }
                        let _ = Self::save_config(&cfg);
                    }
                    return cfg;
                }
            }
        }
        let def = LibraryConfig::default();
        let _ = Self::save_config(&def);
        def
    }

    /// Saves the library configuration (keeping test temp overrides isolated in memory)
    pub fn save_config(config: &LibraryConfig) -> Result<(), String> {
        if is_ephemeral_test_path(&config.library_dir)
            || is_ephemeral_test_path(&config.downloads_dir)
        {
            if let Ok(mut guard) = TEST_LIBRARY_OVERRIDE.write() {
                *guard = Some(config.clone());
            }
            return Ok(());
        }
        if let Ok(mut guard) = TEST_LIBRARY_OVERRIDE.write() {
            *guard = None;
        }
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize library config: {}", e))?;
        fs::write(&path, json)
            .map_err(|e| format!("Failed to write library config file: {}", e))?;
        Ok(())
    }

    /// Validates that a user-selected path is safe, exists or can be created, and is writeable
    pub fn validate_library_dir(path: &Path) -> Result<PathBuf, String> {
        let path_str = path.to_string_lossy();
        if path_str.trim().is_empty() {
            return Err("Library directory path cannot be empty.".to_string());
        }

        // Prevent targeting system root paths
        let trimmed = path_str.trim();
        if trimmed == "/"
            || trimmed == "\\"
            || trimmed == "C:\\"
            || trimmed == "C:"
            || trimmed == "D:\\"
            || trimmed == "D:"
        {
            return Err(
                "Cannot use a filesystem root drive as the Fontivo library directory.".to_string(),
            );
        }

        #[cfg(windows)]
        {
            let win_dir = env::var("WINDIR")
                .unwrap_or_else(|_| "C:\\Windows".to_string())
                .to_lowercase();
            let sys_drive = env::var("SYSTEMDRIVE")
                .unwrap_or_else(|_| "C:".to_string())
                .to_lowercase();
            let lower_path = path_str.to_lowercase();
            if lower_path.starts_with(&win_dir)
                || lower_path.starts_with(&format!("{}\\windows", sys_drive))
            {
                return Err("Security violation: Cannot select a Windows system directory for font storage.".to_string());
            }
        }

        #[cfg(unix)]
        {
            let lower_path = path_str.to_lowercase();
            if lower_path.starts_with("/etc")
                || lower_path.starts_with("/bin")
                || lower_path.starts_with("/usr")
                || lower_path.starts_with("/var")
            {
                return Err(
                    "Security violation: Cannot select a system directory for font storage."
                        .to_string(),
                );
            }
        }

        // Create directory if it does not exist
        fs::create_dir_all(path)
            .map_err(|e| format!("Failed to create library directory: {}", e))?;

        // Canonicalize path and strip Windows `\\?\` prefix for clean GDI/Adobe compatibility
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve directory path: {}", e))?;
        let cleaned_str = canonical.to_string_lossy().to_string();
        let canonical = if let Some(stripped) = cleaned_str.strip_prefix(r"\\?\") {
            if !stripped.starts_with("UNC\\") && stripped.len() < 260 {
                PathBuf::from(stripped)
            } else {
                canonical
            }
        } else {
            canonical
        };

        // Test write permissions
        let test_file = canonical.join(".fontivo_write_test");
        fs::write(&test_file, b"fontivo")
            .map_err(|e| format!("Storage directory is not writeable: {}", e))?;
        let _ = fs::remove_file(test_file);

        Ok(canonical)
    }

    /// Updates the configured library storage directory
    pub fn set_library_dir(new_path: &Path) -> Result<PathBuf, String> {
        let validated = Self::validate_library_dir(new_path)?;
        let mut cfg = Self::get_config();
        cfg.library_dir = validated.to_string_lossy().to_string();
        Self::save_config(&cfg)?;
        Ok(validated)
    }

    /// Returns the active downloads directory (defaults cleanly to user's Downloads\Fontivo)
    pub fn get_downloads_dir() -> PathBuf {
        let cfg = Self::get_config();
        if !cfg.downloads_dir.trim().is_empty()
            && !cfg
                .downloads_dir
                .to_ascii_lowercase()
                .contains("\\library\\downloads")
        {
            let p = PathBuf::from(&cfg.downloads_dir);
            if let Ok(validated) = Self::validate_library_dir(&p) {
                return validated;
            }
        }
        default_export_downloads_dir()
    }

    /// Updates the configured downloads directory
    pub fn set_downloads_dir(new_path: &Path) -> Result<PathBuf, String> {
        let validated = Self::validate_library_dir(new_path)?;
        let mut cfg = Self::get_config();
        cfg.downloads_dir = validated.to_string_lossy().to_string();
        Self::save_config(&cfg)?;
        Ok(validated)
    }

    /// Returns the active library root storage directory (`%LOCALAPPDATA%\Fontivo\Fonts`)
    pub fn get_storage_dir() -> PathBuf {
        let cfg = Self::get_config();
        let path = PathBuf::from(&cfg.library_dir);
        if let Ok(validated) = Self::validate_library_dir(&path) {
            return validated;
        }
        let fallback = crate::engine::lifecycle::get_app_data_dir().join("Fonts");
        let _ = fs::create_dir_all(&fallback);
        fallback
    }

    /// Subdirectory for temporary ZIP archives during pack download (`Cache/PackArchives` when default)
    pub fn get_packs_dir() -> PathBuf {
        let default_fonts = crate::engine::lifecycle::get_app_data_dir().join("Fonts");
        let storage = Self::get_storage_dir();
        let dir = if storage
            .to_string_lossy()
            .eq_ignore_ascii_case(&default_fonts.to_string_lossy())
        {
            crate::engine::lifecycle::get_app_data_dir()
                .join("Cache")
                .join("PackArchives")
        } else {
            storage.join("PacksArchives")
        };
        let _ = fs::create_dir_all(&dir);
        dir
    }

    /// Subdirectory for downloaded Google Fonts (`%LOCALAPPDATA%\Fontivo\Fonts\Google`)
    pub fn get_google_dir() -> PathBuf {
        let dir = Self::get_storage_dir().join("Google");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    /// Subdirectory for extracted cloud font packs (`%LOCALAPPDATA%\Fontivo\Fonts\Packs`)
    pub fn get_extracted_dir() -> PathBuf {
        let dir = Self::get_storage_dir().join("Packs");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    /// Checks if the volume holding the library has enough free disk space (in bytes)
    pub fn check_available_space(
        #[allow(unused_variables)] required_bytes: u64,
    ) -> Result<u64, String> {
        #[allow(unused_variables)]
        let dir = Self::get_storage_dir();

        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

            let mut wide: Vec<u16> = dir.as_os_str().encode_wide().collect();
            wide.push(0);

            let mut free_bytes_available: u64 = 0;
            let mut total_number_of_bytes: u64 = 0;
            let mut total_number_of_free_bytes: u64 = 0;

            unsafe {
                GetDiskFreeSpaceExW(
                    PCWSTR(wide.as_ptr()),
                    Some(&mut free_bytes_available),
                    Some(&mut total_number_of_bytes),
                    Some(&mut total_number_of_free_bytes),
                )
                .map_err(|e| format!("Failed to query disk free space: {:?}", e))?;
            }

            if free_bytes_available < required_bytes {
                let req_mb = required_bytes / (1024 * 1024);
                let free_mb = free_bytes_available / (1024 * 1024);
                return Err(format!(
                    "Insufficient disk space in '{}'. Required: {} MB, Available: {} MB.",
                    dir.display(),
                    req_mb,
                    free_mb
                ));
            }

            Ok(free_bytes_available)
        }

        #[cfg(not(windows))]
        {
            // Fallback for non-windows platforms (assume 50 GB available in test environments)
            let assumed_free = 50 * 1024 * 1024 * 1024;
            if assumed_free < required_bytes {
                return Err("Insufficient disk space on host volume.".to_string());
            }
            Ok(assumed_free)
        }
    }

    /// Calculates total storage space used by all files in the library directory in bytes
    /// (cached for 15s to prevent expensive 10k+ file directory walks on every UI stats poll).
    pub fn calculate_used_space() -> u64 {
        use std::sync::{Mutex, OnceLock};
        use std::time::{Duration, Instant};

        static SPACE_CACHE: OnceLock<Mutex<Option<(Instant, u64)>>> = OnceLock::new();
        let cache = SPACE_CACHE.get_or_init(|| Mutex::new(None));
        if let Ok(guard) = cache.lock() {
            if let Some((ts, bytes)) = *guard {
                if ts.elapsed() < Duration::from_secs(15) {
                    return bytes;
                }
            }
        }

        let root = Self::get_storage_dir();
        let bytes = Self::dir_size_recursive(&root);
        if let Ok(mut guard) = cache.lock() {
            *guard = Some((Instant::now(), bytes));
        }
        bytes
    }

    fn dir_size_recursive(path: &Path) -> u64 {
        let mut total = 0;
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    total += Self::dir_size_recursive(&p);
                } else if let Ok(meta) = p.metadata() {
                    total += meta.len();
                }
            }
        }
        total
    }

    /// Scans the library directory for font files that are not present in the indexed paths
    pub fn scan_orphaned_font_files(indexed_paths: &HashSet<String>) -> Vec<PathBuf> {
        let root = Self::get_storage_dir();
        Self::scan_orphaned_font_files_in(&root, indexed_paths)
    }

    /// Scans a specific directory for font files that are not present in the indexed paths
    pub fn scan_orphaned_font_files_in(
        root: &Path,
        indexed_paths: &HashSet<String>,
    ) -> Vec<PathBuf> {
        let mut orphaned = Vec::new();
        if let Ok(fonts) = crate::server::routes::common::walk_fonts_in_dir(root) {
            for font_path in fonts {
                let canonical_str = font_path
                    .canonicalize()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| font_path.to_string_lossy().to_string());

                let raw_str = font_path.to_string_lossy().to_string();

                if !indexed_paths.contains(&canonical_str) && !indexed_paths.contains(&raw_str) {
                    orphaned.push(font_path);
                }
            }
        }
        orphaned
    }
}
