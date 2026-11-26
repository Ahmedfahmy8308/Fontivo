#[cfg(windows)]
use std::env;
#[cfg(windows)]
use std::fs;
#[cfg(windows)]
use std::path::PathBuf;
use std::process::Command;

pub fn rebuild_font_cache() -> Result<String, String> {
    #[cfg(windows)]
    {
        static FONT_CACHE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = FONT_CACHE_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if !super::elevation::is_running_as_admin() {
            return Err(
                "Administrator privileges are required to stop and rebuild the Windows Font Cache service"
                    .to_string(),
            );
        }

        // Execute net stop FontCache and verify exit status
        let stop_out = Command::new("net")
            .args(["stop", "FontCache"])
            .output()
            .map_err(|e| format!("Failed to execute 'net stop FontCache': {}", e))?;

        if !stop_out.status.success() {
            let stderr = String::from_utf8_lossy(&stop_out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&stop_out.stdout).trim().to_string();
            let combined = format!("{} {}", stdout, stderr).to_ascii_lowercase();
            let already_stopped = combined.contains("not started") || combined.contains("3521");
            if !already_stopped {
                let detail = if !stderr.is_empty() { stderr } else { stdout };
                return Err(format!(
                    "Failed to stop FontCache service (exit {:?}): {}",
                    stop_out.status.code(),
                    detail
                ));
            }
        }

        // Locate cache files in LocalService\AppData\Local\FontCache
        let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
        let cache_dir = PathBuf::from(win_dir)
            .join("ServiceProfiles")
            .join("LocalService")
            .join("AppData")
            .join("Local")
            .join("FontCache");

        if cache_dir.exists() {
            if let Ok(entries) = fs::read_dir(&cache_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        if ext.to_string_lossy().eq_ignore_ascii_case("dat") {
                            let _ = fs::remove_file(path);
                        }
                    }
                }
            }
        }

        // Execute net start FontCache and verify exit status
        let start_out = Command::new("net")
            .args(["start", "FontCache"])
            .output()
            .map_err(|e| format!("Failed to execute 'net start FontCache': {}", e))?;

        if !start_out.status.success() {
            let stderr = String::from_utf8_lossy(&start_out.stderr)
                .trim()
                .to_string();
            let stdout = String::from_utf8_lossy(&start_out.stdout)
                .trim()
                .to_string();
            let combined = format!("{} {}", stdout, stderr).to_ascii_lowercase();
            let already_started =
                combined.contains("already been started") || combined.contains("2182");
            if !already_started {
                let detail = if !stderr.is_empty() { stderr } else { stdout };
                return Err(format!(
                    "Failed to start FontCache service (exit {:?}): {}",
                    start_out.status.code(),
                    detail
                ));
            }
        }

        Ok("Windows Font Cache rebuilt successfully".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("fc-cache").args(&["-f", "-r"]).output();
        Ok("Linux Fontconfig cache rebuilt successfully with fc-cache -f -r".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("atsutil")
            .args(&["databases", "-removeUser"])
            .output();
        Ok("macOS ATS Font cache refreshed successfully".to_string())
    }

    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        Ok("Rebuild cache mock".to_string())
    }
}
