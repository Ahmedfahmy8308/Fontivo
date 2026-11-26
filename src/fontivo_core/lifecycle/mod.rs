pub mod backend;
pub mod fallback;
pub mod linux;
pub mod macos;
pub mod windows;

pub use backend::{
    ActivationResult, BatchFailureItem, BatchSummary, DeactivationResult, FontLifecycleBackend,
    FontLifecycleError, InstallResult, UninstallResult,
};

use std::env;
use std::path::PathBuf;

/// Resolve operating-system specific application data directory:
/// - Honors `FONTIVO_DATA_DIR` environment override when non-empty (great for isolated tests/portable setups)
/// - Windows: %LOCALAPPDATA%\Fontivo (unified root for fonts, workspaces, index, backups & WebView2)
/// - macOS: ~/Library/Application Support/Fontivo
/// - Linux: $XDG_DATA_HOME/Fontivo or ~/.local/share/Fontivo
pub fn get_app_data_dir() -> PathBuf {
    if let Ok(custom) = env::var("FONTIVO_DATA_DIR") {
        if !custom.trim().is_empty() {
            return PathBuf::from(custom.trim());
        }
    }

    #[cfg(windows)]
    {
        env::var("LOCALAPPDATA")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| {
                env::var("USERPROFILE")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
                    .map(|p| PathBuf::from(p).join("AppData").join("Local"))
            })
            .or_else(|| {
                env::var("APPDATA")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
                    .map(PathBuf::from)
            })
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Fontivo")
    }

    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME")
            .or_else(|_| env::var("USER").map(|u| format!("/Users/{}", u)))
            .unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Fontivo")
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg) = env::var("XDG_DATA_HOME") {
            PathBuf::from(xdg).join("Fontivo")
        } else if let Ok(home) = env::var("HOME") {
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("Fontivo")
        } else if let Ok(user) = env::var("USER") {
            PathBuf::from("/home")
                .join(user)
                .join(".local")
                .join("share")
                .join("Fontivo")
        } else {
            PathBuf::from(".").join("Fontivo")
        }
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        PathBuf::from(".").join("Fontivo")
    }
}

/// Legacy Windows Roaming AppData directory (`%APPDATA%\Fontivo`) used in v1.0.0-v1.0.2
/// before unifying under `%LOCALAPPDATA%\Fontivo`. Returns `None` if `FONTIVO_DATA_DIR` is set.
pub fn get_legacy_roaming_app_data_dir() -> Option<PathBuf> {
    if env::var("FONTIVO_DATA_DIR")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
    {
        return None;
    }

    #[cfg(windows)]
    {
        let current = get_app_data_dir();
        let roaming = env::var("APPDATA")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| {
                env::var("USERPROFILE")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
                    .map(|p| PathBuf::from(p).join("AppData").join("Roaming"))
            })?
            .join("Fontivo");
        if roaming
            .to_string_lossy()
            .eq_ignore_ascii_case(&current.to_string_lossy())
        {
            None
        } else {
            Some(roaming)
        }
    }

    #[cfg(not(windows))]
    {
        None
    }
}

/// Resolve operating-system specific user fonts directory:
/// - Windows: %LOCALAPPDATA%\Microsoft\Windows\Fonts
/// - macOS: ~/Library/Fonts
/// - Linux: ~/.local/share/fonts/Fontivo or $XDG_DATA_HOME/fonts/Fontivo
pub fn get_user_fonts_dir() -> Result<PathBuf, FontLifecycleError> {
    #[cfg(windows)]
    {
        let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| {
            env::var("USERPROFILE")
                .map(|p| format!("{}\\AppData\\Local", p))
                .unwrap_or_else(|_| "C:\\".to_string())
        });
        Ok(PathBuf::from(local_app_data)
            .join("Microsoft")
            .join("Windows")
            .join("Fonts"))
    }

    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME")
            .or_else(|_| env::var("USER").map(|u| format!("/Users/{}", u)))
            .unwrap_or_else(|_| ".".to_string());
        Ok(PathBuf::from(home).join("Library").join("Fonts"))
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg) = env::var("XDG_DATA_HOME") {
            Ok(PathBuf::from(xdg).join("fonts").join("Fontivo"))
        } else if let Ok(home) = env::var("HOME") {
            Ok(PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("fonts")
                .join("Fontivo"))
        } else if let Ok(user) = env::var("USER") {
            Ok(PathBuf::from("/home")
                .join(user)
                .join(".local")
                .join("share")
                .join("fonts")
                .join("Fontivo"))
        } else {
            Ok(PathBuf::from(".local/share/fonts/Fontivo"))
        }
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        Err(FontLifecycleError::UnsupportedPlatform(
            "User fonts directory resolution is not supported on this platform".into(),
        ))
    }
}

/// Factory to construct the active platform font backend
pub fn create_platform_backend() -> Box<dyn FontLifecycleBackend + Send + Sync> {
    #[cfg(windows)]
    {
        Box::new(windows::WindowsBackend::new())
    }

    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacosBackend::new())
    }

    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxBackend::new())
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        Box::new(fallback::FallbackBackend::new())
    }
}
