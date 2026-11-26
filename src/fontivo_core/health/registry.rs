use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use windows::core::PCWSTR;
#[cfg(windows)]
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
    HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE,
};

use super::types::*;

pub fn normalize_windows_path_for_compare(p: &Path) -> String {
    let s = p.to_string_lossy().replace('/', "\\");
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
    stripped.trim_end_matches('\\').to_ascii_lowercase()
}

/// Returns true if the given path resides inside %WINDIR%\Fonts (requires Administrator privileges)
pub fn is_system_windows_fonts_path(path_str: &str) -> bool {
    let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let win_fonts = PathBuf::from(&win_dir).join("Fonts");
    let win_norm = normalize_windows_path_for_compare(&win_fonts);
    let target_norm = normalize_windows_path_for_compare(Path::new(path_str));
    target_norm.starts_with(&format!("{}\\", win_norm))
}

/// Strictly validates that `path_str` is a safe font file inside `%WINDIR%\Fonts` or
/// `%LOCALAPPDATA%\Microsoft\Windows\Fonts`, has no traversal components, and has a valid font extension.
pub fn validate_windows_font_path(path_str: &str) -> Result<PathBuf, String> {
    let trimmed = path_str.trim();
    if trimmed.is_empty() {
        return Err("Font path cannot be empty".to_string());
    }
    if trimmed.contains('\0') {
        return Err("Security violation: font path contains null byte".to_string());
    }

    let path = Path::new(trimmed);
    for comp in path.components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err(
                "Security violation: path traversal ('..') is forbidden in font path".to_string(),
            );
        }
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    const ALLOWED_FONT_EXTS: &[&str] = &["ttf", "otf", "ttc", "otc", "fon"];
    if !ALLOWED_FONT_EXTS.contains(&ext.as_str()) {
        return Err(format!(
            "Security violation: invalid font file extension '.{}' (allowed: .ttf, .otf, .ttc, .otc, .fon)",
            ext
        ));
    }

    let file_name = path
        .file_name()
        .and_then(|f| f.to_str())
        .filter(|f| !f.is_empty())
        .ok_or_else(|| "Security violation: font path is missing a filename".to_string())?;

    let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let win_fonts_dir = PathBuf::from(&win_dir).join("Fonts");
    let local_app_data = env::var("LOCALAPPDATA").unwrap_or_default();
    let user_fonts_dir = if !local_app_data.is_empty() {
        Some(
            PathBuf::from(&local_app_data)
                .join("Microsoft")
                .join("Windows")
                .join("Fonts"),
        )
    } else {
        None
    };

    let mut allowed_bases: Vec<String> = Vec::new();
    let win_base = win_fonts_dir
        .canonicalize()
        .unwrap_or_else(|_| win_fonts_dir.clone());
    allowed_bases.push(normalize_windows_path_for_compare(&win_base));
    if let Some(ref udir) = user_fonts_dir {
        let u_base = udir.canonicalize().unwrap_or_else(|_| udir.clone());
        allowed_bases.push(normalize_windows_path_for_compare(&u_base));
    }

    let resolved = if path.exists() {
        // Canonicalize existing path to defeat symlink/junction escapes
        path.canonicalize()
            .map_err(|e| format!("Failed to resolve font path: {}", e))?
    } else {
        let parent = path
            .parent()
            .ok_or_else(|| "Security violation: font path has no parent directory".to_string())?;
        let resolved_parent = if parent.exists() {
            parent
                .canonicalize()
                .map_err(|e| format!("Failed to resolve font parent directory: {}", e))?
        } else {
            parent.to_path_buf()
        };
        resolved_parent.join(file_name)
    };

    let resolved_norm = normalize_windows_path_for_compare(&resolved);
    let is_inside_allowed = allowed_bases
        .iter()
        .any(|base| !base.is_empty() && resolved_norm.starts_with(&format!("{}\\", base)));

    if !is_inside_allowed {
        return Err(
            "Security violation: font path must be inside %WINDIR%\\Fonts or %LOCALAPPDATA%\\Microsoft\\Windows\\Fonts"
                .to_string(),
        );
    }

    Ok(resolved)
}

/// Validates a backup folder ID (no path traversal)
pub fn validate_backup_id(backup_id: &str) -> Result<&str, String> {
    let trimmed = backup_id.trim();
    if trimmed.is_empty() || trimmed.len() > 128 {
        return Err("Invalid backup ID length".to_string());
    }
    if trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(format!(
            "Invalid backup ID '{}': forbidden characters",
            backup_id
        ));
    }
    Ok(trimmed)
}

/// Pure matching predicate for Windows Fonts registry value deletion.
/// Uses STRICT exact matching (never substring `.contains()`), preventing collateral deletion of unrelated fonts.
pub fn registry_value_matches_font(
    val_name: &str,
    val_data: &str,
    name: Option<&str>,
    path_str: &str,
) -> bool {
    let val_name_trim = val_name.trim();
    let val_data_trim = val_data.trim();
    let path_trim = path_str.trim();

    // 1. Exact registry value name match (case-insensitive, with standard Windows font suffixes)
    if let Some(raw_name) = name {
        let n_trim = raw_name.trim();
        if !n_trim.is_empty() {
            let mut base = n_trim.to_string();
            for suffix in [
                " (TrueType & OpenType)",
                " (TrueType)",
                " (OpenType)",
                " (All types)",
            ] {
                if base.len() > suffix.len() {
                    let split_idx = base.len() - suffix.len();
                    if base.is_char_boundary(split_idx)
                        && base[split_idx..].eq_ignore_ascii_case(suffix)
                    {
                        base.truncate(split_idx);
                        base = base.trim().to_string();
                        break;
                    }
                }
            }

            if val_name_trim.eq_ignore_ascii_case(n_trim)
                || val_name_trim.eq_ignore_ascii_case(&base)
                || val_name_trim.eq_ignore_ascii_case(&format!("{} (TrueType)", base))
                || val_name_trim.eq_ignore_ascii_case(&format!("{} (OpenType)", base))
                || val_name_trim.eq_ignore_ascii_case(&format!("{} (TrueType & OpenType)", base))
                || val_name_trim.eq_ignore_ascii_case(&format!("{} (All types)", base))
            {
                return true;
            }
        }
    }

    // 2. Exact full path match (case-insensitive, slash-normalized)
    if !val_data_trim.is_empty() && !path_trim.is_empty() {
        let norm_data = val_data_trim.replace('/', "\\");
        let norm_path = path_trim.replace('/', "\\");
        if norm_data.eq_ignore_ascii_case(&norm_path) {
            return true;
        }

        // 3. Exact bare filename match (how HKLM stores files in C:\Windows\Fonts)
        if !val_data_trim.contains('\\') && !val_data_trim.contains('/') {
            if let Some(target_fname) = Path::new(path_trim).file_name().and_then(|f| f.to_str()) {
                if val_data_trim.eq_ignore_ascii_case(target_fname) {
                    return true;
                }
            }
        }
    }

    false
}

pub fn scan_registry_fonts() -> (usize, Vec<DeadFontEntry>) {
    #[allow(unused_mut)]
    let mut total_registered = 0;
    #[allow(unused_mut)]
    let mut dead_entries = Vec::new();

    #[cfg(windows)]
    {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();

        let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
        let win_fonts_dir = PathBuf::from(&win_dir).join("Fonts");
        let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".to_string());
        let user_fonts_dir = PathBuf::from(&local_app_data)
            .join("Microsoft")
            .join("Windows")
            .join("Fonts");

        // Scan HKCU
        scan_hive(
            HKEY_CURRENT_USER,
            &subkey,
            "HKCU",
            &win_fonts_dir,
            &user_fonts_dir,
            &mut total_registered,
            &mut dead_entries,
        );

        // Scan HKLM (read-only)
        scan_hive(
            HKEY_LOCAL_MACHINE,
            &subkey,
            "HKLM",
            &win_fonts_dir,
            &user_fonts_dir,
            &mut total_registered,
            &mut dead_entries,
        );
    }

    (total_registered, dead_entries)
}

#[cfg(windows)]
fn scan_hive(
    root_key: HKEY,
    subkey: &[u16],
    hive_name: &str,
    win_fonts_dir: &Path,
    user_fonts_dir: &Path,
    total: &mut usize,
    dead: &mut Vec<DeadFontEntry>,
) {
    let mut hkey = HKEY::default();
    unsafe {
        if RegOpenKeyExW(root_key, PCWSTR(subkey.as_ptr()), None, KEY_READ, &mut hkey).is_ok() {
            let mut index = 0;
            let mut name_buf = vec![0u16; 512];
            let mut data_buf = vec![0u8; 1024];

            loop {
                let mut name_len = name_buf.len() as u32;
                let mut data_len = data_buf.len() as u32;
                let mut val_type = 0u32;

                let res = RegEnumValueW(
                    hkey,
                    index,
                    Some(windows::core::PWSTR(name_buf.as_mut_ptr())),
                    &mut name_len,
                    None,
                    Some(&mut val_type),
                    Some(data_buf.as_mut_ptr()),
                    Some(&mut data_len),
                );

                if res.is_err() {
                    break;
                }

                *total += 1;
                let name_str = String::from_utf16_lossy(&name_buf[..name_len as usize]);

                // Parse data as utf-16 string
                let data_u16_slice = std::slice::from_raw_parts(
                    data_buf.as_ptr() as *const u16,
                    (data_len / 2) as usize,
                );
                let target_raw = String::from_utf16_lossy(data_u16_slice)
                    .trim_end_matches('\0')
                    .to_string();

                // Check if file exists
                let exists = if target_raw.contains('\\') || target_raw.contains('/') {
                    Path::new(&target_raw).exists()
                } else {
                    win_fonts_dir.join(&target_raw).exists()
                        || user_fonts_dir.join(&target_raw).exists()
                };

                if !exists && !target_raw.is_empty() {
                    dead.push(DeadFontEntry {
                        name: name_str,
                        target_path: target_raw,
                        hive: hive_name.to_string(),
                    });
                }

                index += 1;
            }

            let _ = RegCloseKey(hkey);
        }
    }
}

/// Clean dead entries from HKCU
pub fn clean_dead_registry_fonts() -> usize {
    #[allow(unused_mut)]
    let mut cleaned = 0;

    #[cfg(windows)]
    {
        let (_, dead_entries) = scan_registry_fonts();
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();
        let mut hkey = HKEY::default();

        unsafe {
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                None,
                KEY_SET_VALUE,
                &mut hkey,
            )
            .is_ok()
            {
                for entry in dead_entries {
                    if entry.hive == "HKCU" {
                        let name_w: Vec<u16> = entry
                            .name
                            .encode_utf16()
                            .chain(std::iter::once(0))
                            .collect();
                        if RegDeleteValueW(hkey, PCWSTR(name_w.as_ptr())).is_ok() {
                            cleaned += 1;
                        }
                    }
                }
                let _ = RegCloseKey(hkey);
            }
        }
    }

    cleaned
}

/// Rebuild Windows Font Cache service safely
pub fn enumerate_windows_fonts() -> Vec<WindowsFontItem> {
    #[allow(unused_mut)]
    let mut results: Vec<WindowsFontItem> = Vec::new();
    #[allow(unused_variables, unused_mut)]
    let mut seen_paths: std::collections::HashSet<String> = std::collections::HashSet::new();

    #[cfg(windows)]
    {
        let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
        let win_fonts_dir = PathBuf::from(&win_dir).join("Fonts");
        let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".to_string());
        let user_fonts_dir = PathBuf::from(&local_app_data)
            .join("Microsoft")
            .join("Windows")
            .join("Fonts");

        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();

        // 1. Scan HKCU (User Fonts)
        scan_registry_font_hive(
            HKEY_CURRENT_USER,
            &subkey,
            "HKCU",
            &win_fonts_dir,
            &user_fonts_dir,
            &mut results,
            &mut seen_paths,
        );

        // 2. Scan HKLM (System Fonts)
        scan_registry_font_hive(
            HKEY_LOCAL_MACHINE,
            &subkey,
            "HKLM",
            &win_fonts_dir,
            &user_fonts_dir,
            &mut results,
            &mut seen_paths,
        );

        // 3. Scan user fonts directory for files on disk
        if user_fonts_dir.exists() {
            if let Ok(entries) = fs::read_dir(&user_fonts_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        let e = ext.to_lowercase();
                        if e == "ttf" || e == "otf" || e == "ttc" {
                            let norm_path = path.to_string_lossy().to_string();
                            if seen_paths.insert(norm_path.to_lowercase()) {
                                let stem = path
                                    .file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("Font")
                                    .to_string();
                                let size = entry.metadata().map(|m| m.len() as usize).unwrap_or(0);
                                let is_core = super::protected::is_protected_system_font(
                                    &stem, &stem, &norm_path,
                                );
                                results.push(WindowsFontItem {
                                    id: String::new(),
                                    name: stem.clone(),
                                    family: stem.clone(),
                                    path: norm_path,
                                    size,
                                    hive: "HKCU".to_string(),
                                    is_system_core: is_core,
                                    is_uninstallable: !is_core,
                                });
                            }
                        }
                    }
                }
            }
        }

        // 4. Scan Windows\Fonts directory for files on disk
        if win_fonts_dir.exists() {
            if let Ok(entries) = fs::read_dir(&win_fonts_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        let e = ext.to_lowercase();
                        if e == "ttf" || e == "otf" || e == "ttc" {
                            let norm_path = path.to_string_lossy().to_string();
                            if seen_paths.insert(norm_path.to_lowercase()) {
                                let stem = path
                                    .file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("Font")
                                    .to_string();
                                let size = entry.metadata().map(|m| m.len() as usize).unwrap_or(0);
                                let is_core = super::protected::is_protected_system_font(
                                    &stem, &stem, &norm_path,
                                );
                                results.push(WindowsFontItem {
                                    id: String::new(),
                                    name: stem.clone(),
                                    family: stem.clone(),
                                    path: norm_path,
                                    size,
                                    hive: "HKLM".to_string(),
                                    is_system_core: is_core,
                                    is_uninstallable: !is_core,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        results.push(WindowsFontItem {
            id: String::new(),
            name: "Segoe UI".to_string(),
            family: "Segoe UI".to_string(),
            path: "/usr/share/fonts/segoeui.ttf".to_string(),
            size: 892300,
            hive: "HKLM".to_string(),
            is_system_core: true,
            is_uninstallable: false,
        });
        results.push(WindowsFontItem {
            id: String::new(),
            name: "Arial".to_string(),
            family: "Arial".to_string(),
            path: "/usr/share/fonts/arial.ttf".to_string(),
            size: 782400,
            hive: "HKLM".to_string(),
            is_system_core: true,
            is_uninstallable: false,
        });
        results.push(WindowsFontItem {
            id: String::new(),
            name: "Tahoma".to_string(),
            family: "Tahoma".to_string(),
            path: "/usr/share/fonts/tahoma.ttf".to_string(),
            size: 654200,
            hive: "HKLM".to_string(),
            is_system_core: true,
            is_uninstallable: false,
        });
        results.push(WindowsFontItem {
            id: String::new(),
            name: "Custom User Font".to_string(),
            family: "Custom User Font".to_string(),
            path: "/home/user/.fonts/custom.ttf".to_string(),
            size: 154200,
            hive: "HKCU".to_string(),
            is_system_core: false,
            is_uninstallable: true,
        });
    }

    for (idx, item) in results.iter_mut().enumerate() {
        item.id = format!("win-{}", idx + 1);
    }

    results
}

#[cfg(windows)]
fn scan_registry_font_hive(
    root_key: HKEY,
    subkey: &[u16],
    hive_name: &str,
    win_fonts_dir: &Path,
    user_fonts_dir: &Path,
    results: &mut Vec<WindowsFontItem>,
    seen_paths: &mut std::collections::HashSet<String>,
) {
    let mut hkey = HKEY::default();
    unsafe {
        if RegOpenKeyExW(root_key, PCWSTR(subkey.as_ptr()), None, KEY_READ, &mut hkey).is_ok() {
            let mut index = 0;
            let mut name_buf = vec![0u16; 512];
            let mut data_buf = vec![0u8; 1024];

            loop {
                let mut name_len = name_buf.len() as u32;
                let mut data_len = data_buf.len() as u32;
                let mut val_type = 0u32;

                let res = RegEnumValueW(
                    hkey,
                    index,
                    Some(windows::core::PWSTR(name_buf.as_mut_ptr())),
                    &mut name_len,
                    None,
                    Some(&mut val_type),
                    Some(data_buf.as_mut_ptr()),
                    Some(&mut data_len),
                );

                if res.is_err() {
                    break;
                }

                let raw_val_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                let data_u16_slice = std::slice::from_raw_parts(
                    data_buf.as_ptr() as *const u16,
                    (data_len / 2) as usize,
                );
                let raw_target = String::from_utf16_lossy(data_u16_slice)
                    .trim_end_matches('\0')
                    .trim()
                    .to_string();

                let clean_name = super::protected::strip_registry_font_suffix(&raw_val_name);

                let family = clean_name
                    .split(" Regular")
                    .next()
                    .unwrap_or(&clean_name)
                    .split(" Bold")
                    .next()
                    .unwrap_or(&clean_name)
                    .split(" Italic")
                    .next()
                    .unwrap_or(&clean_name)
                    .split(" Light")
                    .next()
                    .unwrap_or(&clean_name)
                    .split(" SemiBold")
                    .next()
                    .unwrap_or(&clean_name)
                    .split(" Black")
                    .next()
                    .unwrap_or(&clean_name)
                    .split(" Medium")
                    .next()
                    .unwrap_or(&clean_name)
                    .split(" Thin")
                    .next()
                    .unwrap_or(&clean_name)
                    .trim()
                    .to_string();

                let full_path = if raw_target.contains('\\') || raw_target.contains('/') {
                    PathBuf::from(&raw_target)
                } else if hive_name == "HKCU" && user_fonts_dir.join(&raw_target).exists() {
                    user_fonts_dir.join(&raw_target)
                } else {
                    win_fonts_dir.join(&raw_target)
                };

                let path_str = full_path.to_string_lossy().to_string();
                let path_lower = path_str.to_lowercase();

                if seen_paths.insert(path_lower) {
                    let size = fs::metadata(&full_path)
                        .map(|m| m.len() as usize)
                        .unwrap_or(0);
                    let is_core =
                        super::protected::is_protected_system_font(&clean_name, &family, &path_str);
                    let is_uninstallable = !is_core;

                    results.push(WindowsFontItem {
                        id: String::new(),
                        name: clean_name,
                        family,
                        path: path_str,
                        size,
                        hive: hive_name.to_string(),
                        is_system_core: is_core,
                        is_uninstallable,
                    });
                }

                index += 1;
            }

            let _ = RegCloseKey(hkey);
        }
    }
}

pub fn uninstall_windows_font(name: Option<&str>, path_str: &str) -> Result<String, String> {
    // Strict path & extension validation BEFORE touching registry or filesystem
    let validated_path = validate_windows_font_path(path_str)?;
    let path = validated_path.as_path();
    let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let query_name = name.unwrap_or(file_stem);
    let validated_str = validated_path.to_string_lossy();

    if super::protected::is_protected_system_font(query_name, file_stem, path_str)
        || super::protected::is_protected_system_font(query_name, file_stem, &validated_str)
    {
        return Err(format!(
            "Cannot uninstall protected Windows core font: {}",
            query_name
        ));
    }

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{LPARAM, WPARAM};
        use windows::Win32::Graphics::Gdi::{AddFontResourceW, RemoveFontResourceW};
        use windows::Win32::UI::WindowsAndMessaging::{
            SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_FONTCHANGE,
        };

        let canonical_str = path.to_string_lossy().to_string();
        let clean_path_str = canonical_str
            .strip_prefix(r"\\?\")
            .unwrap_or(&canonical_str);

        // 1. Unregister from GDI RAM
        let wide_path: Vec<u16> = clean_path_str
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let _ = RemoveFontResourceW(PCWSTR(wide_path.as_ptr()));
        }

        // 2. Delete font file from disk FIRST (already verified inside allowed Windows Fonts dirs)
        //    Never delete the Registry value if the file cannot be removed.
        if path.exists() {
            if let Err(e) = fs::remove_file(path) {
                unsafe {
                    let _ = AddFontResourceW(PCWSTR(wide_path.as_ptr()));
                }
                if is_system_windows_fonts_path(clean_path_str) {
                    return Err(format!(
                        "يتطلب حذف هذا الخط من مجلد نظام ويندوز تشغيل البرنامج كمسؤول (Run as administrator): {}",
                        e
                    ));
                } else {
                    return Err(format!(
                        "Failed to delete font file '{}': {}",
                        clean_path_str, e
                    ));
                }
            }
        }

        // 3. Remove registry value from HKCU and HKLM
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();

        unsafe {
            let mut hkey_cu = HKEY::default();
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                None,
                KEY_READ | KEY_SET_VALUE,
                &mut hkey_cu,
            )
            .is_ok()
            {
                delete_matching_font_registry_values(hkey_cu, name, clean_path_str, query_name);
                let _ = RegCloseKey(hkey_cu);
            }

            let mut hkey_lm = HKEY::default();
            if RegOpenKeyExW(
                HKEY_LOCAL_MACHINE,
                PCWSTR(subkey.as_ptr()),
                None,
                KEY_READ | KEY_SET_VALUE,
                &mut hkey_lm,
            )
            .is_ok()
            {
                delete_matching_font_registry_values(hkey_lm, name, clean_path_str, query_name);
                let _ = RegCloseKey(hkey_lm);
            }
        }

        // 4. Broadcast WM_FONTCHANGE
        unsafe {
            let mut result = 0usize;
            let _ = SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_FONTCHANGE,
                WPARAM(0),
                LPARAM(0),
                SMTO_ABORTIFHUNG,
                1500,
                Some(&mut result),
            );
        }

        Ok(format!("Successfully uninstalled font '{}'", query_name))
    }

    #[cfg(not(windows))]
    {
        if path.exists() {
            let _ = fs::remove_file(path);
        }
        Ok(format!("Successfully uninstalled font '{}'", query_name))
    }
}

#[cfg(windows)]
fn delete_matching_font_registry_values(
    hkey: HKEY,
    name: Option<&str>,
    path_str: &str,
    _query_name: &str,
) {
    unsafe {
        let mut index = 0;
        let mut name_buf = vec![0u16; 512];
        let mut data_buf = vec![0u8; 1024];
        let mut keys_to_delete: Vec<String> = Vec::new();

        loop {
            let mut name_len = name_buf.len() as u32;
            let mut data_len = data_buf.len() as u32;
            let mut val_type = 0u32;

            let res = RegEnumValueW(
                hkey,
                index,
                Some(windows::core::PWSTR(name_buf.as_mut_ptr())),
                &mut name_len,
                None,
                Some(&mut val_type),
                Some(data_buf.as_mut_ptr()),
                Some(&mut data_len),
            );

            if res.is_err() {
                break;
            }

            let val_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
            let data_u16_slice = std::slice::from_raw_parts(
                data_buf.as_ptr() as *const u16,
                (data_len / 2) as usize,
            );
            let val_data = String::from_utf16_lossy(data_u16_slice)
                .trim_end_matches('\0')
                .to_string();

            if registry_value_matches_font(&val_name, &val_data, name, path_str) {
                keys_to_delete.push(val_name);
            }

            index += 1;
        }

        for k in keys_to_delete {
            let k_w: Vec<u16> = k.encode_utf16().chain(std::iter::once(0)).collect();
            let _ = RegDeleteValueW(hkey, PCWSTR(k_w.as_ptr()));
        }
    }
}
