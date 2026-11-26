use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::backend::{FontLifecycleBackend, FontLifecycleError};
use super::get_user_fonts_dir;

pub struct LinuxBackend;

impl Default for LinuxBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl LinuxBackend {
    pub fn new() -> Self {
        Self
    }

    fn validate_file(path: &Path) -> Result<(), FontLifecycleError> {
        if !path.exists() || !path.is_file() {
            return Err(FontLifecycleError::FileNotFound(path.to_path_buf()));
        }
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if ext == "woff" || ext == "woff2" {
            return Err(FontLifecycleError::UnsupportedFormat {
                format: ext.to_uppercase(),
                reason: "Linux fontconfig/X11 engines do not natively support direct activation of WOFF/WOFF2 web fonts without decompression".into(),
            });
        }

        if ext != "ttf" && ext != "otf" && ext != "ttc" && ext != "otc" {
            return Err(FontLifecycleError::UnsupportedFormat {
                format: ext,
                reason: "Linux natively supports TrueType (.ttf), OpenType (.otf), and font collections (.ttc, .otc)".into(),
            });
        }

        Ok(())
    }

    /// Non-blocking execution of 'fc-cache -f' targeting only the Fontivo font directory
    /// Spawns a detached worker thread so API responses and GUI events never stutter or block.
    fn refresh_fc_cache_async(target_dir: &Path) {
        let dir = target_dir.to_path_buf();
        std::thread::Builder::new()
            .name("fontivo-fc-cache".into())
            .spawn(move || {
                let _ = Command::new("fc-cache")
                    .arg("-f")
                    .arg(&dir)
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();
            })
            .ok();
    }
}

impl FontLifecycleBackend for LinuxBackend {
    fn is_format_supported(&self, ext: &str) -> bool {
        let e = ext.trim_start_matches('.').to_ascii_lowercase();
        e == "ttf" || e == "otf" || e == "ttc" || e == "otc"
    }

    fn activate_ram(&self, path: &Path) -> Result<u32, FontLifecycleError> {
        Self::validate_file(path)?;

        let fonts_dir = get_user_fonts_dir()?;
        fs::create_dir_all(&fonts_dir).map_err(|e| {
            FontLifecycleError::IoError(format!(
                "Failed to create Linux fonts directory (~/.local/share/fonts/Fontivo): {}",
                e
            ))
        })?;

        let file_name = path
            .file_name()
            .ok_or_else(|| FontLifecycleError::IoError("Invalid source filename".into()))?;
        let dest = fonts_dir.join(file_name);

        // Ensure canonical absolute path for symlink target so fontconfig can resolve it from ~/.local/share/fonts
        let abs_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

        #[cfg(unix)]
        {
            // Idempotency: if already symlinked to this exact target, return success immediately
            if dest.exists() || fs::symlink_metadata(&dest).is_ok() {
                if let Ok(target) = fs::read_link(&dest) {
                    if target == abs_path || target == path {
                        return Ok(1);
                    }
                }
                let _ = fs::remove_file(&dest);
            }

            // Safe atomic font linking: symlink to temporary file, then rename atomically
            let tmp_name = format!(
                ".fontivo_tmp_{}_{}",
                std::process::id(),
                file_name.to_string_lossy()
            );
            let tmp_dest = fonts_dir.join(&tmp_name);
            if fs::symlink_metadata(&tmp_dest).is_ok() {
                let _ = fs::remove_file(&tmp_dest);
            }

            std::os::unix::fs::symlink(&abs_path, &tmp_dest).map_err(|e| {
                FontLifecycleError::NativeActivationFailed {
                    os_code: e.raw_os_error().unwrap_or(0) as u32,
                    message: format!("Failed to create font symlink in Linux fonts dir: {}", e),
                }
            })?;

            if let Err(_rename_err) = fs::rename(&tmp_dest, &dest) {
                // Fallback: direct removal and symlink if rename across mount boundaries fails
                let _ = fs::remove_file(&tmp_dest);
                let _ = fs::remove_file(&dest);
                std::os::unix::fs::symlink(&abs_path, &dest).map_err(|e| {
                    FontLifecycleError::NativeActivationFailed {
                        os_code: e.raw_os_error().unwrap_or(0) as u32,
                        message: format!("Failed to link font into Linux fonts directory: {}", e),
                    }
                })?;
            }
        }

        #[cfg(not(unix))]
        {
            let _ = &dest;
            let _ = &abs_path;
        }

        Self::refresh_fc_cache_async(&fonts_dir);
        Ok(1)
    }

    fn deactivate_ram(&self, path: &Path) -> Result<bool, FontLifecycleError> {
        let fonts_dir = get_user_fonts_dir()?;
        let file_name = path
            .file_name()
            .ok_or_else(|| FontLifecycleError::IoError("Invalid source filename".into()))?;
        let dest = fonts_dir.join(file_name);

        if dest.exists() || fs::symlink_metadata(&dest).is_ok() {
            fs::remove_file(&dest).map_err(|e| {
                FontLifecycleError::NativeDeactivationFailed(format!(
                    "Failed to remove symlink from Linux fonts directory: {}",
                    e
                ))
            })?;
            Self::refresh_fc_cache_async(&fonts_dir);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn install_permanent(
        &self,
        src: &Path,
        _font_name: &str,
    ) -> Result<PathBuf, FontLifecycleError> {
        Self::validate_file(src)?;

        let fonts_dir = get_user_fonts_dir()?;
        fs::create_dir_all(&fonts_dir).map_err(|e| {
            FontLifecycleError::IoError(format!("Failed to create Linux fonts directory: {}", e))
        })?;

        let file_name = src
            .file_name()
            .ok_or_else(|| FontLifecycleError::IoError("Invalid source filename".into()))?;
        let dest = fonts_dir.join(file_name);

        if fs::symlink_metadata(&dest).is_ok() {
            let _ = fs::remove_file(&dest);
        }

        // Atomic write: copy to temporary file then rename
        let tmp_dest = fonts_dir.join(format!(
            ".fontivo_inst_{}_{}",
            std::process::id(),
            file_name.to_string_lossy()
        ));
        fs::copy(src, &tmp_dest).map_err(|e| {
            FontLifecycleError::IoError(format!(
                "Failed to copy font to Linux fonts directory: {}",
                e
            ))
        })?;

        fs::rename(&tmp_dest, &dest).map_err(|e| {
            let _ = fs::remove_file(&tmp_dest);
            FontLifecycleError::IoError(format!("Failed to finalize font installation: {}", e))
        })?;

        Self::refresh_fc_cache_async(&fonts_dir);
        Ok(dest)
    }

    fn uninstall_permanent(
        &self,
        font_name: &str,
        file_name: Option<&str>,
    ) -> Result<bool, FontLifecycleError> {
        let fonts_dir = get_user_fonts_dir()?;
        let mut removed = false;

        if let Some(fname) = file_name {
            let dest = fonts_dir.join(fname);
            if (dest.exists() || fs::symlink_metadata(&dest).is_ok())
                && fs::remove_file(&dest).is_ok()
            {
                removed = true;
            }
        } else if let Ok(entries) = fs::read_dir(&fonts_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                    if stem.eq_ignore_ascii_case(font_name) && fs::remove_file(&p).is_ok() {
                        removed = true;
                        break;
                    }
                }
            }
        }

        if removed {
            Self::refresh_fc_cache_async(&fonts_dir);
        }
        Ok(removed)
    }

    fn broadcast_change(&self) {
        if let Ok(fonts_dir) = get_user_fonts_dir() {
            Self::refresh_fc_cache_async(&fonts_dir);
        }
    }
}
