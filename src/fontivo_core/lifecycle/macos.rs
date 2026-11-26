use std::fs;
use std::path::{Path, PathBuf};

use super::backend::{FontLifecycleBackend, FontLifecycleError};
use super::get_user_fonts_dir;

pub struct MacosBackend;

impl Default for MacosBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl MacosBackend {
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
                reason: "macOS CoreText does not support direct activation of raw WOFF/WOFF2 web fonts without decompression".into(),
            });
        }

        if ext != "ttf" && ext != "otf" && ext != "ttc" && ext != "dfont" && ext != "otc" {
            return Err(FontLifecycleError::UnsupportedFormat {
                format: ext,
                reason: "macOS natively supports TrueType (.ttf), OpenType (.otf), Collections (.ttc, .otc), and Datafork TrueType (.dfont)".into(),
            });
        }

        Ok(())
    }
}

impl FontLifecycleBackend for MacosBackend {
    fn is_format_supported(&self, ext: &str) -> bool {
        let e = ext.trim_start_matches('.').to_ascii_lowercase();
        e == "ttf" || e == "otf" || e == "ttc" || e == "dfont" || e == "otc"
    }

    fn activate_ram(&self, path: &Path) -> Result<u32, FontLifecycleError> {
        Self::validate_file(path)?;

        let fonts_dir = get_user_fonts_dir()?;
        fs::create_dir_all(&fonts_dir).map_err(|e| {
            FontLifecycleError::IoError(format!(
                "Failed to create ~/Library/Fonts directory: {}",
                e
            ))
        })?;

        let file_name = path
            .file_name()
            .ok_or_else(|| FontLifecycleError::IoError("Invalid source filename".into()))?;
        let dest = fonts_dir.join(file_name);

        // Ensure canonical absolute path for symlink target so macOS CoreText resolves it reliably
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

            // Safe atomic symlinking: link to a temporary path, then rename over target
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
                    message: format!("Failed to create font symlink in ~/Library/Fonts: {}", e),
                }
            })?;

            if let Err(rename_err) = fs::rename(&tmp_dest, &dest) {
                // Fallback: direct removal and symlink if rename across boundaries fails
                let _ = fs::remove_file(&tmp_dest);
                let _ = fs::remove_file(&dest);
                std::os::unix::fs::symlink(&abs_path, &dest).map_err(|e| {
                    FontLifecycleError::NativeActivationFailed {
                        os_code: e.raw_os_error().unwrap_or(0) as u32,
                        message: format!("Failed to link font into ~/Library/Fonts: {}", e),
                    }
                })?;
            }
        }

        #[cfg(not(unix))]
        {
            let _ = &dest;
            let _ = &abs_path;
        }

        self.broadcast_change();
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
                    "Failed to remove symlink from ~/Library/Fonts: {}",
                    e
                ))
            })?;
            self.broadcast_change();
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
            FontLifecycleError::IoError(format!("Failed to create ~/Library/Fonts: {}", e))
        })?;

        let file_name = src
            .file_name()
            .ok_or_else(|| FontLifecycleError::IoError("Invalid source filename".into()))?;
        let dest = fonts_dir.join(file_name);

        // Remove old symlink or existing file if present before copying full file
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
            FontLifecycleError::IoError(format!("Failed to copy font to ~/Library/Fonts: {}", e))
        })?;

        fs::rename(&tmp_dest, &dest).map_err(|e| {
            let _ = fs::remove_file(&tmp_dest);
            FontLifecycleError::IoError(format!("Failed to finalize font installation: {}", e))
        })?;

        self.broadcast_change();
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
            self.broadcast_change();
        }
        Ok(removed)
    }

    /// Complete macOS CoreText / ATSFontNotify broadcast:
    /// 1. ApplicationServices ATSFontNotify broadcast (kATSFontNotifyActionFontsChanged = 1)
    /// 2. CoreFoundation Distributed Notification Center: AppleFontsChangedNotification
    /// 3. Updates mtime on ~/Library/Fonts to trigger system fontd FSEvents daemon
    fn broadcast_change(&self) {
        #[cfg(target_os = "macos")]
        {
            // 1. ApplicationServices ATSFontNotify
            #[link(name = "ApplicationServices", kind = "framework")]
            extern "C" {
                fn ATSFontNotify(action: u32, payload: *const std::os::raw::c_void) -> u32;
            }
            unsafe {
                // kATSFontNotifyActionFontsChanged = 1
                let _ = ATSFontNotify(1, std::ptr::null());
            }

            // 2. CoreFoundation Distributed Notification Center for Cocoa/CoreText apps
            #[link(name = "CoreFoundation", kind = "framework")]
            extern "C" {
                type CFStringRef;
                type CFNotificationCenterRef;
                type CFDictionaryRef;
                fn CFNotificationCenterGetDistributedCenter() -> CFNotificationCenterRef;
                fn CFNotificationCenterPostNotification(
                    center: CFNotificationCenterRef,
                    name: CFStringRef,
                    object: *const std::os::raw::c_void,
                    user_info: CFDictionaryRef,
                    deliver_immediately: u8,
                );
                fn CFStringCreateWithCString(
                    alloc: *const std::os::raw::c_void,
                    c_str: *const std::os::raw::c_char,
                    encoding: u32,
                ) -> CFStringRef;
                fn CFRelease(cf: *const std::os::raw::c_void);
            }
            unsafe {
                let center = CFNotificationCenterGetDistributedCenter();
                if !center.is_null() {
                    // kCFStringEncodingUTF8 = 0x08000100
                    let notif_name = CFStringCreateWithCString(
                        std::ptr::null(),
                        b"AppleFontsChangedNotification\0".as_ptr() as *const _,
                        0x08000100,
                    );
                    if !notif_name.is_null() {
                        CFNotificationCenterPostNotification(
                            center,
                            notif_name,
                            std::ptr::null(),
                            std::ptr::null(),
                            1,
                        );
                        CFRelease(notif_name as *const _);
                    }
                }
            }

            // 3. Touch user font directory to trigger macOS fontd FSEvents daemon rescan
            if let Ok(fonts_dir) = get_user_fonts_dir() {
                let _ = std::process::Command::new("touch")
                    .arg(&fonts_dir)
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();
            }
        }
    }
}
