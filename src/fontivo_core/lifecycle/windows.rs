#[cfg(windows)]
use windows::core::PCWSTR;
#[cfg(windows)]
use windows::Win32::Foundation::{LPARAM, WPARAM};
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{AddFontResourceW, RemoveFontResourceW};
#[cfg(windows)]
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    PostMessageW, SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_FONTCHANGE,
};

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use super::backend::{FontLifecycleBackend, FontLifecycleError};
use super::get_user_fonts_dir;

pub struct WindowsBackend;

impl Default for WindowsBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowsBackend {
    pub fn new() -> Self {
        Self
    }

    /// Returns the Adobe CC shared font directory (%APPDATA%\Adobe\Fonts)
    pub fn get_adobe_fonts_dir() -> Option<PathBuf> {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let p = PathBuf::from(appdata).join("Adobe").join("Fonts");
            let _ = fs::create_dir_all(&p);
            Some(p)
        } else {
            None
        }
    }

    /// Links a font into %APPDATA%\Adobe\Fonts so Adobe Photoshop / Illustrator / InDesign
    /// detect it dynamically in real time without needing app restart or prompt
    pub fn link_to_adobe_fonts(source: &Path) {
        if let Some(adobe_dir) = Self::get_adobe_fonts_dir() {
            if let Some(fname) = source.file_name() {
                let target = adobe_dir.join(fname);
                if !target.exists() && fs::hard_link(source, &target).is_err() {
                    let _ = fs::copy(source, &target);
                }
            }
        }
    }

    /// Unlinks an activated font from %APPDATA%\Adobe\Fonts upon deactivation
    pub fn unlink_from_adobe_fonts(source: &Path) {
        if let Some(adobe_dir) = Self::get_adobe_fonts_dir() {
            if let Some(fname) = source.file_name() {
                let target = adobe_dir.join(fname);
                if target.exists() {
                    let _ = fs::remove_file(target);
                }
            }
        }
    }

    /// Verifies font format compatibility and magic bytes before invoking Windows GDI
    fn validate_file_for_gdi(path: &Path) -> Result<(), FontLifecycleError> {
        if !path.exists() || !path.is_file() {
            return Err(FontLifecycleError::FileNotFound(path.to_path_buf()));
        }

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        // Windows GDI AddFontResourceW only natively accepts TTF, OTF, and TTC.
        // It strictly rejects WOFF and WOFF2 (compressed web font wrappers).
        if ext == "woff" || ext == "woff2" {
            return Err(FontLifecycleError::UnsupportedFormat {
                format: ext.to_uppercase(),
                reason: "WOFF and WOFF2 are compressed web font formats and cannot be activated natively in Windows GDI without decompression to TTF/OTF".into(),
            });
        }

        if ext != "ttf" && ext != "otf" && ext != "ttc" && ext != "fon" {
            return Err(FontLifecycleError::UnsupportedFormat {
                format: ext,
                reason: "Windows font engine only natively supports TrueType (.ttf), OpenType (.otf), and collections (.ttc)".into(),
            });
        }

        // Verify font file header
        let mut f = fs::File::open(path).map_err(|e| {
            FontLifecycleError::IoError(format!("Cannot open font file for validation: {}", e))
        })?;
        let mut header = [0u8; 4];
        let bytes_read = f
            .read(&mut header)
            .map_err(|e| FontLifecycleError::IoError(format!("Cannot read font header: {}", e)))?;

        if bytes_read < 4 {
            return Err(FontLifecycleError::CorruptedFontFile(
                "Font file is truncated or 0 bytes".into(),
            ));
        }

        let is_valid_font = header == [0x00, 0x01, 0x00, 0x00] // TTF
            || &header == b"OTTO"                             // OTF
            || &header == b"ttcf"; // TTC

        if !is_valid_font {
            return Err(FontLifecycleError::CorruptedFontFile(
                "Binary header does not match valid TrueType or OpenType signature".into(),
            ));
        }

        Ok(())
    }
}

impl FontLifecycleBackend for WindowsBackend {
    fn is_format_supported(&self, ext: &str) -> bool {
        let e = ext.trim_start_matches('.').to_ascii_lowercase();
        e == "ttf" || e == "otf" || e == "ttc" || e == "fon"
    }

    fn activate_ram(&self, path: &Path) -> Result<u32, FontLifecycleError> {
        Self::validate_file_for_gdi(path)?;

        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let wide: Vec<u16> = path
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let count = unsafe { AddFontResourceW(PCWSTR(wide.as_ptr())) };
            if count > 0 {
                Self::link_to_adobe_fonts(path);
                self.broadcast_change();
                Ok(count as u32)
            } else {
                let err = std::io::Error::last_os_error();
                let os_code = err.raw_os_error().unwrap_or(0) as u32;
                Err(FontLifecycleError::NativeActivationFailed {
                    os_code,
                    message: format!(
                        "GDI AddFontResourceW returned 0 for file {:?} ({})",
                        path, err
                    ),
                })
            }
        }

        #[cfg(not(windows))]
        {
            Err(FontLifecycleError::UnsupportedPlatform(
                "Windows GDI activation can only run on Windows".into(),
            ))
        }
    }

    fn deactivate_ram(&self, path: &Path) -> Result<bool, FontLifecycleError> {
        if !path.exists() {
            return Err(FontLifecycleError::FileNotFound(path.to_path_buf()));
        }

        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let wide: Vec<u16> = path
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let removed = unsafe { RemoveFontResourceW(PCWSTR(wide.as_ptr())) };
            let was_removed = removed.as_bool();
            if was_removed {
                Self::unlink_from_adobe_fonts(path);
                self.broadcast_change();
            }
            Ok(was_removed)
        }

        #[cfg(not(windows))]
        {
            Err(FontLifecycleError::UnsupportedPlatform(
                "Windows GDI deactivation can only run on Windows".into(),
            ))
        }
    }

    fn install_permanent(
        &self,
        src: &Path,
        font_name: &str,
    ) -> Result<PathBuf, FontLifecycleError> {
        Self::validate_file_for_gdi(src)?;

        // Guard against colliding with protected Windows system fonts
        if crate::engine::health::SystemHealthChecker::is_protected_system_font(
            font_name,
            font_name,
            &src.to_string_lossy(),
        ) {
            return Err(FontLifecycleError::UnsupportedFormat {
                format: "SYSTEM_FONT_COLLISION".into(),
                reason: format!(
                    "Refused permanent installation of '{}' because it collides with a protected Windows system font",
                    font_name
                ),
            });
        }

        let dest_dir = get_user_fonts_dir()?;
        fs::create_dir_all(&dest_dir).map_err(|e| {
            FontLifecycleError::IoError(format!("Failed to create user fonts directory: {}", e))
        })?;

        let file_name = src
            .file_name()
            .ok_or_else(|| FontLifecycleError::IoError("Invalid source filename".into()))?;
        let dest_file = dest_dir.join(file_name);

        // Copy file to Windows user fonts directory
        if src != dest_file {
            fs::copy(src, &dest_file).map_err(|e| {
                FontLifecycleError::IoError(format!(
                    "Failed to copy font file to user directory: {}",
                    e
                ))
            })?;
        }

        #[cfg(windows)]
        {
            // Register in HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts
            let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
                .encode_utf16()
                .collect();
            let mut hkey = HKEY::default();

            unsafe {
                let open_res = RegCreateKeyW(HKEY_CURRENT_USER, PCWSTR(subkey.as_ptr()), &mut hkey);
                if open_res.is_err() {
                    return Err(FontLifecycleError::RegistryError(
                        "Failed to open/create HKCU Fonts registry key".into(),
                    ));
                }

                // Suffix matches Windows convention: "(TrueType)" or "(OpenType)"
                let ext = dest_file
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_ascii_uppercase();
                let type_suffix = if ext == "OTF" {
                    "(OpenType)"
                } else {
                    "(TrueType)"
                };
                let val_name = format!("{} {}\0", font_name, type_suffix);
                let val_name_w: Vec<u16> = val_name.encode_utf16().collect();

                let val_data = format!("{}\0", dest_file.to_string_lossy());
                let val_data_w: Vec<u16> = val_data.encode_utf16().collect();

                let set_res = RegSetValueExW(
                    hkey,
                    PCWSTR(val_name_w.as_ptr()),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        val_data_w.as_ptr() as *const u8,
                        val_data_w.len() * 2,
                    )),
                );

                let _ = RegCloseKey(hkey);

                if set_res.is_err() {
                    return Err(FontLifecycleError::RegistryError(format!(
                        "Failed to write registry value for font '{}'",
                        font_name
                    )));
                }
            }

            // Also register in GDI for immediate application availability
            let _ = self.activate_ram(&dest_file);
            self.broadcast_change();
        }

        Ok(dest_file)
    }

    fn uninstall_permanent(
        &self,
        font_name: &str,
        file_name: Option<&str>,
    ) -> Result<bool, FontLifecycleError> {
        let mut any_removed = false;

        #[cfg(windows)]
        {
            let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
                .encode_utf16()
                .collect();
            let mut hkey = HKEY::default();

            unsafe {
                let open_res = RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(subkey.as_ptr()),
                    None,
                    KEY_SET_VALUE,
                    &mut hkey,
                );
                if open_res.is_ok() {
                    for suffix in &["(TrueType)", "(OpenType)"] {
                        let val_name = format!("{} {}\0", font_name, suffix);
                        let val_name_w: Vec<u16> = val_name.encode_utf16().collect();
                        if RegDeleteValueW(hkey, PCWSTR(val_name_w.as_ptr())).is_ok() {
                            any_removed = true;
                        }
                    }
                    let _ = RegCloseKey(hkey);
                }
            }
        }

        // Clean up copied font file if specified
        if let Some(fname) = file_name {
            if let Ok(fonts_dir) = get_user_fonts_dir() {
                let target = fonts_dir.join(fname);
                if target.exists() && target.is_file() {
                    let _ = self.deactivate_ram(&target);
                    if fs::remove_file(&target).is_ok() {
                        any_removed = true;
                    }
                }
            }
        }

        self.broadcast_change();
        Ok(any_removed)
    }

    fn broadcast_change(&self) {
        #[cfg(windows)]
        {
            std::thread::spawn(|| unsafe {
                let _ = PostMessageW(Some(HWND_BROADCAST), WM_FONTCHANGE, WPARAM(0), LPARAM(0));
                let mut result: usize = 0;
                let _ = SendMessageTimeoutW(
                    HWND_BROADCAST,
                    WM_FONTCHANGE,
                    WPARAM(0),
                    LPARAM(0),
                    SMTO_ABORTIFHUNG,
                    500,
                    Some(&mut result),
                );
            });
        }
    }
}
