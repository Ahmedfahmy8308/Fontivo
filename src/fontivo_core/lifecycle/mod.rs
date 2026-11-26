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
/// - Windows: %APPDATA%\Fontivo
/// - macOS: ~/Library/Application Support/Fontivo
/// - Linux: $XDG_DATA_HOME/Fontivo or ~/.local/share/Fontivo
pub fn get_app_data_dir() -> PathBuf {
    #[cfg(windows)]
    {
        env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                env::var("USERPROFILE")
                    .map(|p| PathBuf::from(p).join("AppData").join("Roaming"))
                    .unwrap_or_else(|_| PathBuf::from("."))
            })
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
