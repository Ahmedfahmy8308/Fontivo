#[cfg(windows)]
use std::env;
#[cfg(windows)]
use std::fs;

#[cfg(windows)]
use windows::core::PCWSTR;
#[cfg(windows)]
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, REG_SZ,
};

use super::types::*;

pub fn is_running_as_admin() -> bool {
    #[cfg(windows)]
    {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();
        unsafe {
            let mut test_key = HKEY::default();
            if RegOpenKeyExW(
                HKEY_LOCAL_MACHINE,
                PCWSTR(subkey.as_ptr()),
                None,
                KEY_SET_VALUE,
                &mut test_key,
            )
            .is_ok()
            {
                let _ = RegCloseKey(test_key);
                true
            } else {
                false
            }
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn quote_windows_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '\n', '"']) {
        return arg.to_string();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for ch in arg.chars() {
        if ch == '\\' {
            backslashes += 1;
        } else if ch == '"' {
            out.push_str(&"\\".repeat(backslashes * 2 + 1));
            out.push('"');
            backslashes = 0;
        } else {
            out.push_str(&"\\".repeat(backslashes));
            out.push(ch);
            backslashes = 0;
        }
    }
    out.push_str(&"\\".repeat(backslashes * 2));
    out.push('"');
    out
}

/// Launches the current Fontivo.exe binary with Windows UAC elevation directly via Win32 `ShellExecuteExW` (`runas`),
/// passing `--result-file <temp_json>` so the elevated worker writes structured JSON output back.
pub fn run_elevated_worker(worker_args: &[&str]) -> Result<serde_json::Value, ElevatedError> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{CloseHandle, ERROR_CANCELLED};
        use windows::Win32::System::Threading::{
            GetExitCodeProcess, WaitForSingleObject, INFINITE,
        };
        use windows::Win32::UI::Shell::{
            ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
        };
        use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

        let current_exe = env::current_exe()
            .map_err(|e| ElevatedError::Failed(format!("Failed to locate executable: {}", e)))?;

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let result_file = env::temp_dir().join(format!(
            "fontivo_uac_result_{}_{}.json",
            std::process::id(),
            ts
        ));

        let result_file_str = result_file.to_string_lossy().to_string();
        let mut full_args: Vec<String> = worker_args.iter().map(|s| s.to_string()).collect();
        full_args.push("--result-file".to_string());
        full_args.push(result_file_str);

        let params_str = full_args
            .iter()
            .map(|a| quote_windows_arg(a))
            .collect::<Vec<_>>()
            .join(" ");

        let verb_w: Vec<u16> = "runas\0".encode_utf16().collect();
        let file_w: Vec<u16> = format!("{}\0", current_exe.to_string_lossy())
            .encode_utf16()
            .collect();
        let params_w: Vec<u16> = format!("{}\0", params_str).encode_utf16().collect();

        let mut sei = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            lpVerb: PCWSTR(verb_w.as_ptr()),
            lpFile: PCWSTR(file_w.as_ptr()),
            lpParameters: PCWSTR(params_w.as_ptr()),
            nShow: SW_HIDE.0,
            ..Default::default()
        };

        let mut exit_code: u32 = 1;
        let exec_res = unsafe { ShellExecuteExW(&mut sei) };
        if let Err(e) = exec_res {
            if e.code() == ERROR_CANCELLED.to_hresult() {
                return Err(ElevatedError::Cancelled(
                    "UAC elevation was cancelled by the user".to_string(),
                ));
            }
            return Err(ElevatedError::Failed(format!(
                "Failed to invoke UAC elevation: {}",
                e
            )));
        }

        if !sei.hProcess.is_invalid() {
            unsafe {
                let _ = WaitForSingleObject(sei.hProcess, INFINITE);
                let _ = GetExitCodeProcess(sei.hProcess, &mut exit_code);
                let _ = CloseHandle(sei.hProcess);
            }
        }

        if result_file.exists() {
            let content = fs::read_to_string(&result_file).unwrap_or_default();
            let _ = fs::remove_file(&result_file);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                return Ok(val);
            }
        }

        if exit_code == 1223 {
            return Err(ElevatedError::Cancelled(
                "UAC elevation was cancelled by the user".to_string(),
            ));
        }

        Err(ElevatedError::Failed(format!(
            "Elevated helper exited with code {}",
            exit_code
        )))
    }

    #[cfg(not(windows))]
    {
        let _ = worker_args;
        Err(ElevatedError::Failed(
            "UAC elevation is only supported on Windows".to_string(),
        ))
    }
}

/// Runs restore_windows_fonts_with_profile, automatically triggering on-demand UAC elevation
/// when not running as Administrator so system fonts in C:\Windows\Fonts can be cleaned seamlessly.
pub fn restore_windows_fonts_with_profile_elevated(
    profile: &str,
) -> Result<serde_json::Value, ElevatedError> {
    let clean_profile = if profile.to_lowercase().contains("essential")
        || profile.to_lowercase().contains("creative")
    {
        "essential_creative"
    } else {
        "pure_windows"
    };

    #[cfg(windows)]
    {
        if !is_running_as_admin() {
            let mut val = run_elevated_worker(&["--elevated-restore", clean_profile])?;
            if let Some(obj) = val.as_object_mut() {
                obj.insert("elevated".to_string(), serde_json::json!(true));
            }
            return Ok(val);
        }
    }

    match super::backup::restore_windows_fonts_with_profile(clean_profile) {
        Ok(res) => {
            let mut val = serde_json::to_value(res)
                .unwrap_or_else(|_| serde_json::json!({ "success": true }));
            if let Some(obj) = val.as_object_mut() {
                obj.insert("elevated".to_string(), serde_json::json!(false));
            }
            Ok(val)
        }
        Err(e) => Err(ElevatedError::Failed(e)),
    }
}

/// Runs uninstall_windows_font, validating path strictly first and automatically triggering
/// on-demand UAC elevation when removing a font from %WINDIR%\Fonts without Admin privileges.
pub fn uninstall_windows_font_elevated(
    name: Option<&str>,
    path_str: &str,
) -> Result<serde_json::Value, ElevatedError> {
    // Always validate path & core protection BEFORE ever popping UAC
    let validated =
        super::registry::validate_windows_font_path(path_str).map_err(ElevatedError::Failed)?;
    let file_stem = validated.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let query_name = name.unwrap_or(file_stem);
    let validated_str = validated.to_string_lossy();
    if super::protected::is_protected_system_font(query_name, file_stem, path_str)
        || super::protected::is_protected_system_font(query_name, file_stem, &validated_str)
    {
        return Err(ElevatedError::Failed(format!(
            "Cannot uninstall protected Windows core font: {}",
            query_name
        )));
    }

    #[cfg(windows)]
    {
        if super::registry::is_system_windows_fonts_path(path_str) && !is_running_as_admin() {
            let mut val = run_elevated_worker(&["--elevated-uninstall", path_str, query_name])?;
            if let Some(obj) = val.as_object_mut() {
                obj.insert("elevated".to_string(), serde_json::json!(true));
            }
            return Ok(val);
        }
    }

    match super::registry::uninstall_windows_font(name, path_str) {
        Ok(msg) => Ok(serde_json::json!({
            "success": true,
            "elevated": false,
            "message": msg
        })),
        Err(e) => Err(ElevatedError::Failed(e)),
    }
}

/// Runs undo_restore_backup, validating backup_id first and triggering on-demand UAC elevation
/// when not running as Administrator.
pub fn undo_restore_backup_elevated(backup_id: &str) -> Result<serde_json::Value, ElevatedError> {
    let safe_id = super::registry::validate_backup_id(backup_id).map_err(ElevatedError::Failed)?;

    #[cfg(windows)]
    {
        if !is_running_as_admin() {
            let mut val = run_elevated_worker(&["--elevated-undo", safe_id])?;
            if let Some(obj) = val.as_object_mut() {
                obj.insert("elevated".to_string(), serde_json::json!(true));
            }
            return Ok(val);
        }
    }

    match super::backup::undo_restore_backup(safe_id) {
        Ok(count) => Ok(serde_json::json!({
            "success": true,
            "elevated": false,
            "restoredCount": count
        })),
        Err(e) => Err(ElevatedError::Failed(e)),
    }
}

pub fn relaunch_as_admin() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let current_exe = env::current_exe().map_err(|e| e.to_string())?;
        let verb_w: Vec<u16> = "runas\0".encode_utf16().collect();
        let file_w: Vec<u16> = format!("{}\0", current_exe.to_string_lossy())
            .encode_utf16()
            .collect();
        let mut sei = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            lpVerb: PCWSTR(verb_w.as_ptr()),
            lpFile: PCWSTR(file_w.as_ptr()),
            nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };
        unsafe { ShellExecuteExW(&mut sei) }.map_err(|e| e.to_string())?;
        std::process::exit(0);
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

pub fn get_system_fonts_admin_status() -> (usize, bool) {
    #[cfg(windows)]
    {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();
        let is_admin = unsafe {
            let mut test_key = HKEY::default();
            if RegOpenKeyExW(
                HKEY_LOCAL_MACHINE,
                PCWSTR(subkey.as_ptr()),
                None,
                KEY_SET_VALUE,
                &mut test_key,
            )
            .is_ok()
            {
                let _ = RegCloseKey(test_key);
                true
            } else {
                false
            }
        };
        let all_fonts = super::registry::enumerate_windows_fonts();
        let system_user_count = all_fonts
            .iter()
            .filter(|f| {
                !f.is_system_core
                    && (f.hive == "HKLM" || f.path.to_lowercase().contains("c:\\windows\\fonts"))
            })
            .count();
        (system_user_count, is_admin)
    }
    #[cfg(not(windows))]
    {
        (0, false)
    }
}

pub fn get_autostart_status() -> (bool, String) {
    #[cfg(windows)]
    {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0"
            .encode_utf16()
            .collect();
        let val_name: Vec<u16> = "Fontivo\0".encode_utf16().collect();
        let mut hkey = HKEY::default();

        unsafe {
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                None,
                KEY_READ,
                &mut hkey,
            )
            .is_ok()
            {
                let mut data_buf = vec![0u8; 1024];
                let mut data_len = data_buf.len() as u32;

                let res = RegQueryValueExW(
                    hkey,
                    PCWSTR(val_name.as_ptr()),
                    None,
                    None,
                    Some(data_buf.as_mut_ptr()),
                    Some(&mut data_len),
                );

                let _ = RegCloseKey(hkey);

                if res.is_ok() {
                    let data_u16_slice = std::slice::from_raw_parts(
                        data_buf.as_ptr() as *const u16,
                        (data_len / 2) as usize,
                    );
                    let path = String::from_utf16_lossy(data_u16_slice)
                        .trim_end_matches('\0')
                        .to_string();
                    return (true, path);
                }
            }
        }
    }

    let curr_exe = env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Fontivo.exe".to_string());
    (false, curr_exe)
}

pub fn toggle_autostart(enable: Option<bool>) -> Result<(bool, String), String> {
    let (currently_enabled, current_path) = get_autostart_status();
    let should_enable = enable.unwrap_or(!currently_enabled);

    #[cfg(windows)]
    {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0"
            .encode_utf16()
            .collect();
        let val_name: Vec<u16> = "Fontivo\0".encode_utf16().collect();
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
                if should_enable {
                    let exe_path = env::current_exe()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| current_path);
                    let run_val = format!("\"{}\" --daemon\0", exe_path);
                    let run_val_w: Vec<u16> = run_val.encode_utf16().collect();

                    let res = RegSetValueExW(
                        hkey,
                        PCWSTR(val_name.as_ptr()),
                        None,
                        REG_SZ,
                        Some(std::slice::from_raw_parts(
                            run_val_w.as_ptr() as *const u8,
                            run_val_w.len() * 2,
                        )),
                    );
                    let _ = RegCloseKey(hkey);

                    if res.is_ok() {
                        return Ok((true, exe_path));
                    } else {
                        return Err("Failed to write to Run registry key".to_string());
                    }
                } else {
                    let _ = RegDeleteValueW(hkey, PCWSTR(val_name.as_ptr()));
                    let _ = RegCloseKey(hkey);
                    return Ok((false, String::new()));
                }
            }
        }
        Err("Failed to open HKCU Run registry key".to_string())
    }

    #[cfg(not(windows))]
    {
        Ok((should_enable, current_path))
    }
}
