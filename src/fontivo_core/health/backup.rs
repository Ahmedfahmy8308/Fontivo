use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use windows::core::PCWSTR;
#[cfg(windows)]
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegEnumValueW, RegOpenKeyExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, REG_SZ, REG_VALUE_TYPE,
};

use super::types::*;

pub fn restore_default_windows_fonts() -> Result<(usize, String), String> {
    let res = restore_windows_fonts_with_profile("pure_windows")?;
    let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".to_string());
    let ts = res.backup_id.split('_').nth(1).unwrap_or("0");
    let legacy_file = PathBuf::from(&local_app_data)
        .join("Fontivo")
        .join("Backups")
        .join(format!("fonts_backup_{}.json", ts));
    Ok((res.removed_count, legacy_file.to_string_lossy().to_string()))
}

#[cfg(windows)]
fn current_unix_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(windows)]
fn append_transaction_log(
    log: &mut Vec<TransactionLogEntry>,
    action: &str,
    status: &str,
    font: &str,
    hive: &str,
    details: impl Into<String>,
) {
    log.push(TransactionLogEntry {
        timestamp: current_unix_ts(),
        action: action.to_string(),
        status: status.to_string(),
        font: font.to_string(),
        hive: hive.to_string(),
        details: details.into(),
    });
}

#[cfg(windows)]
fn write_transaction_log_jsonl(path: &Path, entries: &[TransactionLogEntry]) -> Result<(), String> {
    let mut out = String::new();
    for entry in entries {
        if let Ok(line) = serde_json::to_string(entry) {
            out.push_str(&line);
            out.push('\n');
        }
    }
    fs::write(path, out).map_err(|e| format!("Failed to write transaction_log.jsonl: {}", e))
}

/// Moves a font file to the backup directory before any registry deletion.
/// Returns `Ok(true)` if the file existed and was moved/removed from `src_path`,
/// `Ok(false)` if `src_path` did not exist, or `Err(...)` if the file is locked or cannot be removed.
pub fn move_font_file_to_backup(src_path: &Path, dest_path: &Path) -> Result<bool, String> {
    if !src_path.exists() {
        return Ok(false);
    }
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create backup font directory: {}", e))?;
    }
    if fs::rename(src_path, dest_path).is_ok() {
        return Ok(true);
    }
    fs::copy(src_path, dest_path).map_err(|e| {
        format!(
            "Failed to copy font '{}' to backup: {}",
            src_path.display(),
            e
        )
    })?;
    if let Err(e) = fs::remove_file(src_path) {
        let _ = fs::remove_file(dest_path);
        return Err(format!(
            "Font file '{}' is locked or cannot be removed (skipping registry deletion): {}",
            src_path.display(),
            e
        ));
    }
    Ok(true)
}

#[cfg(windows)]
fn schedule_locked_font_deletion_and_backup(
    src_path: &Path,
    dest_path: &Path,
) -> Result<(), String> {
    use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_DELAY_UNTIL_REBOOT};

    if !src_path.exists() {
        return Ok(());
    }
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create backup font directory: {}", e))?;
    }
    fs::copy(src_path, dest_path).map_err(|e| {
        format!(
            "Failed to back up locked font '{}': {}",
            src_path.display(),
            e
        )
    })?;
    let wide_src: Vec<u16> = src_path
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let res = unsafe {
        MoveFileExW(
            PCWSTR(wide_src.as_ptr()),
            PCWSTR::null(),
            MOVEFILE_DELAY_UNTIL_REBOOT,
        )
    };
    if let Err(e) = res {
        let _ = fs::remove_file(dest_path);
        return Err(format!(
            "Failed to schedule reboot removal for '{}': {}",
            src_path.display(),
            e
        ));
    }
    Ok(())
}

/// Captures a full snapshot of HKCU and HKLM Fonts registry entries (exact name, type, and data).
pub fn snapshot_fonts_registry() -> Vec<RegistrySnapshotEntry> {
    #[allow(unused_mut)]
    let mut entries = Vec::new();
    #[cfg(windows)]
    {
        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();
        for (root_key, hive_name) in [(HKEY_CURRENT_USER, "HKCU"), (HKEY_LOCAL_MACHINE, "HKLM")] {
            let mut hkey = HKEY::default();
            unsafe {
                if RegOpenKeyExW(root_key, PCWSTR(subkey.as_ptr()), None, KEY_READ, &mut hkey)
                    .is_ok()
                {
                    let mut index = 0;
                    let mut name_buf = vec![0u16; 512];
                    let mut data_buf = vec![0u8; 2048];
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
                        let value_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                        let data_u16_slice = std::slice::from_raw_parts(
                            data_buf.as_ptr() as *const u16,
                            (data_len / 2) as usize,
                        );
                        let value_data = String::from_utf16_lossy(data_u16_slice)
                            .trim_end_matches('\0')
                            .to_string();
                        entries.push(RegistrySnapshotEntry {
                            hive: hive_name.to_string(),
                            value_name,
                            value_type: val_type,
                            value_data,
                        });
                        index += 1;
                    }
                    let _ = RegCloseKey(hkey);
                }
            }
        }
    }
    entries
}

/// Validates that every protected Windows system font present in `pre_snapshot`
/// remains registered in `post_snapshot`. Returns `Err(missing_entries)` if any were lost.
pub fn validate_protected_fonts_post_op(
    pre_snapshot: &[RegistrySnapshotEntry],
    post_snapshot: &[RegistrySnapshotEntry],
) -> Result<(), Vec<String>> {
    let mut missing = Vec::new();
    for pre in pre_snapshot {
        if super::protected::is_protected_system_font(
            &pre.value_name,
            &pre.value_name,
            &pre.value_data,
        ) {
            let still_present = post_snapshot.iter().any(|post| {
                post.hive.eq_ignore_ascii_case(&pre.hive)
                    && post.value_name.eq_ignore_ascii_case(&pre.value_name)
            });
            if !still_present {
                missing.push(format!("{}:{}", pre.hive, pre.value_name));
            }
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing)
    }
}

#[cfg(windows)]
unsafe fn write_registry_snapshot_entry(
    hkey_cu: HKEY,
    hkey_lm: HKEY,
    entry: &RegistrySnapshotEntry,
) -> Result<(), String> {
    let target_key = if entry.hive.eq_ignore_ascii_case("HKCU") {
        hkey_cu
    } else {
        hkey_lm
    };
    if target_key.is_invalid() {
        return Err(format!(
            "Registry hive {} is not open for write",
            entry.hive
        ));
    }
    let val_name_w: Vec<u16> = entry
        .value_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let val_data_w: Vec<u16> = entry
        .value_data
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let reg_type = if entry.value_type == 0 {
        REG_SZ
    } else {
        REG_VALUE_TYPE(entry.value_type)
    };
    let res = RegSetValueExW(
        target_key,
        PCWSTR(val_name_w.as_ptr()),
        None,
        reg_type,
        Some(std::slice::from_raw_parts(
            val_data_w.as_ptr() as *const u8,
            val_data_w.len() * 2,
        )),
    );
    if res.is_ok() {
        Ok(())
    } else {
        Err(format!(
            "RegSetValueExW failed for '{}': {:?}",
            entry.value_name, res
        ))
    }
}

pub fn restore_windows_fonts_with_profile(profile: &str) -> Result<RestoreProfileResult, String> {
    #[cfg(windows)]
    {
        let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".to_string());
        let backups_root = PathBuf::from(&local_app_data)
            .join("Fontivo")
            .join("Backups");
        fs::create_dir_all(&backups_root)
            .map_err(|e| format!("Failed to create backups root: {}", e))?;
        let timestamp = current_unix_ts();

        let clean_profile = if profile.to_lowercase().contains("essential")
            || profile.to_lowercase().contains("creative")
        {
            "essential_creative"
        } else {
            "pure_windows"
        };

        static BACKUP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = BACKUP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let backup_id = format!(
            "backup_{}_{}_{}_{}",
            timestamp,
            clean_profile,
            std::process::id(),
            seq
        );
        let backup_dir = backups_root.join(&backup_id);
        let backup_fonts_dir = backup_dir.join("fonts");
        fs::create_dir_all(&backup_fonts_dir)
            .map_err(|e| format!("Failed to create backup fonts dir: {}", e))?;

        let mut tx_log: Vec<TransactionLogEntry> = Vec::new();
        let tx_log_path = backup_dir.join("transaction_log.jsonl");

        // 0. Take full Registry snapshot BEFORE modifying anything
        let pre_snapshot = snapshot_fonts_registry();
        let snapshot_path = backup_dir.join("fonts_registry_snapshot.json");
        let snapshot_json = serde_json::to_string_pretty(&pre_snapshot)
            .map_err(|e| format!("Failed to serialize registry snapshot: {}", e))?;
        fs::write(&snapshot_path, snapshot_json)
            .map_err(|e| format!("Failed to write fonts_registry_snapshot.json: {}", e))?;
        append_transaction_log(
            &mut tx_log,
            "snapshot",
            "ok",
            "*",
            "HKCU+HKLM",
            format!("Captured {} registry entries", pre_snapshot.len()),
        );

        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();
        let is_admin = super::elevation::is_running_as_admin();

        let all_fonts = super::registry::enumerate_windows_fonts();
        let mut to_remove = Vec::new();
        let mut retained_count = 0;
        let mut already_scheduled_count = 0;

        for font in all_fonts {
            let is_core =
                super::protected::is_protected_system_font(&font.name, &font.family, &font.path);
            if is_core {
                retained_count += 1;
                continue;
            }

            if clean_profile == "essential_creative"
                && super::protected::is_essential_creative_font(&font.name, &font.family)
            {
                retained_count += 1;
                continue;
            }

            // Skip locked fonts that are already backed up, unregistered from Registry,
            // and queued in PendingFileRenameOperations awaiting OS reboot.
            if font.pending_reboot_delete {
                let has_reg_entry = pre_snapshot.iter().any(|e| {
                    e.hive.eq_ignore_ascii_case(&font.hive)
                        && super::registry::registry_value_matches_font(
                            &e.value_name,
                            &e.value_data,
                            Some(&font.name),
                            &font.path,
                        )
                });
                if !has_reg_entry {
                    already_scheduled_count += 1;
                    append_transaction_log(
                        &mut tx_log,
                        "skip_already_scheduled_reboot",
                        "skipped",
                        &font.name,
                        &font.hive,
                        "Font registry entry already removed and file deletion queued for next Windows reboot",
                    );
                    continue;
                }
            }

            let is_system_path =
                super::registry::is_system_windows_fonts_path(&font.path) || font.hive == "HKLM";
            if is_system_path && !is_admin {
                // Cannot modify system fonts without Administrator elevation
                continue;
            }

            to_remove.push(font);
        }

        let mut removed_count = 0;
        let mut scheduled_reboot_count = 0;
        let mut skipped_count = 0;
        let mut skipped_fonts: Vec<String> = Vec::new();
        let mut backed_up_entries: Vec<serde_json::Value> = Vec::new();
        let mut rollback_records: Vec<(PathBuf, PathBuf, bool, Vec<RegistrySnapshotEntry>)> =
            Vec::new();

        // Stop Windows FontCache service BEFORE attempting file moves so cached system/user handles release
        if is_admin && !to_remove.is_empty() {
            match super::cache::stop_font_cache_service() {
                Ok(_) => append_transaction_log(
                    &mut tx_log,
                    "stop_font_cache",
                    "ok",
                    "*",
                    "SYSTEM",
                    "Stopped FontCache service prior to moving font files",
                ),
                Err(err) => append_transaction_log(
                    &mut tx_log,
                    "stop_font_cache",
                    "skipped",
                    "*",
                    "SYSTEM",
                    err,
                ),
            }
        }

        // Unregister removable fonts from active GDI session and notify shell before moving files
        if !to_remove.is_empty() {
            for font in &to_remove {
                let wide_path: Vec<u16> =
                    font.path.encode_utf16().chain(std::iter::once(0)).collect();
                unsafe {
                    let _ = windows::Win32::Graphics::Gdi::RemoveFontResourceW(PCWSTR(
                        wide_path.as_ptr(),
                    ));
                }
            }
            use windows::Win32::Foundation::{LPARAM, WPARAM};
            use windows::Win32::UI::WindowsAndMessaging::{
                SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_FONTCHANGE,
            };
            let mut result_lparam = 0usize;
            unsafe {
                let _ = SendMessageTimeoutW(
                    HWND_BROADCAST,
                    WM_FONTCHANGE,
                    WPARAM(0),
                    LPARAM(0),
                    SMTO_ABORTIFHUNG,
                    1000,
                    Some(&mut result_lparam),
                );
            }
        }

        unsafe {
            let mut hkey_cu = HKEY::default();
            let cu_open = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                None,
                KEY_READ | KEY_SET_VALUE,
                &mut hkey_cu,
            )
            .is_ok();

            let mut hkey_lm = HKEY::default();
            let lm_open = if is_admin {
                RegOpenKeyExW(
                    HKEY_LOCAL_MACHINE,
                    PCWSTR(subkey.as_ptr()),
                    None,
                    KEY_READ | KEY_SET_VALUE,
                    &mut hkey_lm,
                )
                .is_ok()
            } else {
                false
            };

            for font in &to_remove {
                if super::protected::is_protected_system_font(&font.name, &font.family, &font.path)
                {
                    append_transaction_log(
                        &mut tx_log,
                        "skip_protected",
                        "skipped",
                        &font.name,
                        &font.hive,
                        "Protected system font safeguard triggered",
                    );
                    continue;
                }

                let path = Path::new(&font.path);
                let fname = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("font.ttf");
                let dest = backup_fonts_dir.join(fname);

                // Match exact original registry entries from pre_snapshot
                let matched_reg_entries: Vec<RegistrySnapshotEntry> = pre_snapshot
                    .iter()
                    .filter(|e| {
                        e.hive.eq_ignore_ascii_case(&font.hive)
                            && !super::protected::is_protected_system_font(
                                &e.value_name,
                                &e.value_name,
                                &e.value_data,
                            )
                            && super::registry::registry_value_matches_font(
                                &e.value_name,
                                &e.value_data,
                                Some(&font.name),
                                &font.path,
                            )
                    })
                    .cloned()
                    .collect();

                // 1. Ensure unregistered from GDI RAM before moving/removing file
                let wide_path: Vec<u16> =
                    font.path.encode_utf16().chain(std::iter::once(0)).collect();
                let _ =
                    windows::Win32::Graphics::Gdi::RemoveFontResourceW(PCWSTR(wide_path.as_ptr()));

                // 2. Move font file to backup folder FIRST.
                //    If locked by an active OS process (sharing violation / os error 32) and elevated as Admin,
                //    back up cleanly and schedule Windows boot-time deletion via MoveFileExW(MOVEFILE_DELAY_UNTIL_REBOOT).
                let mut scheduled_reboot = false;
                let file_deleted = match move_font_file_to_backup(path, &dest) {
                    Ok(deleted) => deleted,
                    Err(err_msg) => {
                        let is_sharing_lock = err_msg.contains("os error 32")
                            || err_msg
                                .to_ascii_lowercase()
                                .contains("being used by another process");
                        if is_admin && is_sharing_lock && path.exists() {
                            match schedule_locked_font_deletion_and_backup(path, &dest) {
                                Ok(_) => {
                                    scheduled_reboot = true;
                                    true
                                }
                                Err(sched_err) => {
                                    let _ = windows::Win32::Graphics::Gdi::AddFontResourceW(
                                        PCWSTR(wide_path.as_ptr()),
                                    );
                                    skipped_count += 1;
                                    skipped_fonts.push(font.name.clone());
                                    append_transaction_log(
                                        &mut tx_log,
                                        "move_file",
                                        "skipped",
                                        &font.name,
                                        &font.hive,
                                        sched_err,
                                    );
                                    continue;
                                }
                            }
                        } else {
                            let _ = windows::Win32::Graphics::Gdi::AddFontResourceW(PCWSTR(
                                wide_path.as_ptr(),
                            ));
                            skipped_count += 1;
                            skipped_fonts.push(font.name.clone());
                            append_transaction_log(
                                &mut tx_log,
                                "move_file",
                                "skipped",
                                &font.name,
                                &font.hive,
                                err_msg,
                            );
                            continue;
                        }
                    }
                };

                // 3. File move succeeded (or file was already missing); now delete exact Registry value(s)
                let mut deleted_reg_entries: Vec<RegistrySnapshotEntry> = Vec::new();
                let mut reg_delete_err: Option<String> = None;

                for reg_entry in &matched_reg_entries {
                    let target_key = if reg_entry.hive.eq_ignore_ascii_case("HKCU") && cu_open {
                        hkey_cu
                    } else if reg_entry.hive.eq_ignore_ascii_case("HKLM") && lm_open {
                        hkey_lm
                    } else {
                        HKEY::default()
                    };

                    if target_key.is_invalid() {
                        reg_delete_err = Some(format!(
                            "Registry hive {} not writable for '{}'",
                            reg_entry.hive, reg_entry.value_name
                        ));
                        break;
                    }

                    let wide_name: Vec<u16> = reg_entry
                        .value_name
                        .encode_utf16()
                        .chain(std::iter::once(0))
                        .collect();
                    let res = RegDeleteValueW(target_key, PCWSTR(wide_name.as_ptr()));
                    if res.is_ok() {
                        deleted_reg_entries.push(reg_entry.clone());
                    } else {
                        reg_delete_err = Some(format!(
                            "RegDeleteValueW failed for '{}': {:?}",
                            reg_entry.value_name, res
                        ));
                        break;
                    }
                }

                if let Some(err_detail) = reg_delete_err {
                    // Roll back this font's partial changes
                    for r in &deleted_reg_entries {
                        let _ = write_registry_snapshot_entry(hkey_cu, hkey_lm, r);
                    }
                    if file_deleted && dest.exists() {
                        if fs::rename(&dest, path).is_err() {
                            let _ = fs::copy(&dest, path);
                        }
                        let _ = windows::Win32::Graphics::Gdi::AddFontResourceW(PCWSTR(
                            wide_path.as_ptr(),
                        ));
                    }
                    append_transaction_log(
                        &mut tx_log,
                        "delete_registry",
                        "error",
                        &font.name,
                        &font.hive,
                        err_detail,
                    );
                    continue;
                }

                let primary_reg = deleted_reg_entries.first();
                let reg_val_name = primary_reg
                    .map(|r| r.value_name.clone())
                    .unwrap_or_else(|| font.name.clone());
                let reg_val_type = primary_reg.map(|r| r.value_type).unwrap_or(REG_SZ.0);
                let reg_val_data = primary_reg
                    .map(|r| r.value_data.clone())
                    .unwrap_or_else(|| font.path.clone());

                if scheduled_reboot {
                    scheduled_reboot_count += 1;
                } else {
                    removed_count += 1;
                }
                rollback_records.push((
                    dest.clone(),
                    path.to_path_buf(),
                    file_deleted && !scheduled_reboot,
                    deleted_reg_entries.clone(),
                ));
                backed_up_entries.push(serde_json::json!({
                    "name": font.name,
                    "family": font.family,
                    "fileName": fname,
                    "originalPath": font.path,
                    "hive": font.hive,
                    "size": font.size,
                    "fileDeleted": file_deleted,
                    "scheduledReboot": scheduled_reboot,
                    "registryValueName": reg_val_name,
                    "registryValueType": reg_val_type,
                    "registryValueData": reg_val_data,
                    "registryEntries": deleted_reg_entries
                }));
                append_transaction_log(
                    &mut tx_log,
                    if scheduled_reboot {
                        "schedule_reboot_delete"
                    } else {
                        "remove_font"
                    },
                    "ok",
                    &font.name,
                    &font.hive,
                    format!(
                        "fileDeleted={}, scheduledReboot={}, regEntriesDeleted={}",
                        file_deleted,
                        scheduled_reboot,
                        deleted_reg_entries.len()
                    ),
                );
            }

            // 4. Post-operation validation: verify all protected system fonts remain registered
            let post_snapshot = snapshot_fonts_registry();
            if let Err(missing_protected) =
                validate_protected_fonts_post_op(&pre_snapshot, &post_snapshot)
            {
                // Automatic rollback
                for (backup_file, orig_path, file_deleted, reg_entries) in &rollback_records {
                    if *file_deleted && backup_file.exists() {
                        if let Some(parent) = orig_path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        let _ = fs::copy(backup_file, orig_path);
                        let wide_orig: Vec<u16> = orig_path
                            .to_string_lossy()
                            .encode_utf16()
                            .chain(std::iter::once(0))
                            .collect();
                        let _ = windows::Win32::Graphics::Gdi::AddFontResourceW(PCWSTR(
                            wide_orig.as_ptr(),
                        ));
                    }
                    for r in reg_entries {
                        let _ = write_registry_snapshot_entry(hkey_cu, hkey_lm, r);
                    }
                }

                append_transaction_log(
                    &mut tx_log,
                    "post_op_validation",
                    "rollback",
                    "*",
                    "HKCU+HKLM",
                    format!(
                        "Protected fonts missing after operation; automatic rollback executed: {}",
                        missing_protected.join(", ")
                    ),
                );
                let _ = write_transaction_log_jsonl(&tx_log_path, &tx_log);

                if cu_open {
                    let _ = RegCloseKey(hkey_cu);
                }
                if lm_open {
                    let _ = RegCloseKey(hkey_lm);
                }

                return Err(format!(
                    "Post-operation validation failed; automatic rollback completed. Missing protected fonts: {}",
                    missing_protected.join(", ")
                ));
            }

            append_transaction_log(
                &mut tx_log,
                "post_op_validation",
                "ok",
                "*",
                "HKCU+HKLM",
                "All protected Windows system fonts verified present",
            );

            if cu_open {
                let _ = RegCloseKey(hkey_cu);
            }
            if lm_open {
                let _ = RegCloseKey(hkey_lm);
            }

            // Broadcast font change notification
            use windows::Win32::Foundation::{LPARAM, WPARAM};
            use windows::Win32::UI::WindowsAndMessaging::{
                SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_FONTCHANGE,
            };
            let mut result_lparam = 0usize;
            let _ = SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_FONTCHANGE,
                WPARAM(0),
                LPARAM(0),
                SMTO_ABORTIFHUNG,
                1000,
                Some(&mut result_lparam),
            );
        }

        let total_backed_up = backed_up_entries.len();

        // Write metadata manifest in backup folder
        let manifest_path = backup_dir.join("manifest.json");
        let manifest_data = serde_json::json!({
            "id": backup_id,
            "timestamp": timestamp,
            "dateFormatted": format!("Backup-{}", timestamp),
            "profile": clean_profile,
            "totalFonts": total_backed_up,
            "removedCount": removed_count,
            "scheduledRebootCount": scheduled_reboot_count,
            "alreadyScheduledCount": already_scheduled_count,
            "snapshotFile": "fonts_registry_snapshot.json",
            "transactionLogFile": "transaction_log.jsonl",
            "fonts": backed_up_entries
        });
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest_data).unwrap_or_default(),
        )
        .map_err(|e| format!("Failed to write manifest.json: {}", e))?;

        // Legacy backward-compatibility backup JSON
        let legacy_backup_file = backups_root.join(format!("fonts_backup_{}.json", timestamp));
        let backed_up_names: Vec<String> = to_remove.iter().map(|f| f.name.clone()).collect();
        let _ = fs::write(
            &legacy_backup_file,
            serde_json::to_string_pretty(&backed_up_names).unwrap_or_default(),
        );

        // Rebuild font cache and log outcome only when changes occurred
        if removed_count > 0 || scheduled_reboot_count > 0 {
            match super::cache::rebuild_font_cache() {
                Ok(msg) => append_transaction_log(
                    &mut tx_log,
                    "rebuild_font_cache",
                    "ok",
                    "*",
                    "SYSTEM",
                    msg,
                ),
                Err(err) => append_transaction_log(
                    &mut tx_log,
                    "rebuild_font_cache",
                    "skipped",
                    "*",
                    "SYSTEM",
                    err,
                ),
            }
        }
        let _ = write_transaction_log_jsonl(&tx_log_path, &tx_log);

        let reboot_note = if scheduled_reboot_count > 0 {
            format!(
                " وتم حفظ نسخة احتياطية من {} خطاً وجدولة حذف ملفاتها المحجوزة تلقائياً عند إعادة تشغيل ويندوز.",
                scheduled_reboot_count
            )
        } else {
            String::new()
        };
        let already_note = if already_scheduled_count > 0 {
            format!(
                " ({} خطاً محجوزاً مسبقاً في الذاكرة ومسجل حذفه عند إعادة تشغيل ويندوز القادمة).",
                already_scheduled_count
            )
        } else {
            String::new()
        };
        let skipped_note = if skipped_count > 0 {
            format!(
                " (تعذر نقل {} خطاً لمحجوزيتها أو حمايتها من النظام: {}).",
                skipped_count,
                skipped_fonts
                    .iter()
                    .take(4)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("، ")
            )
        } else {
            String::new()
        };

        let msg = if clean_profile == "essential_creative" {
            format!(
                "تم الاحتفاظ بخطوط ويندوز الأصلية و{} خطاً أساسياً للتصميم؛ تم نقل {} خطاً وحفظ {} في النسخة الاحتياطية.{}{}{}",
                retained_count, removed_count, total_backed_up, reboot_note, already_note, skipped_note
            )
        } else {
            format!(
                "تمت استعادة خطوط ويندوز الأصلية (ضبط المصنع): تم نقل {} خطاً وحفظ {} خطاً في النسخة الاحتياطية.{}{}{}",
                removed_count, total_backed_up, reboot_note, already_note, skipped_note
            )
        };

        Ok(RestoreProfileResult {
            success: true,
            profile: clean_profile.to_string(),
            removed_count,
            retained_count,
            scheduled_reboot_count,
            already_scheduled_count,
            skipped_count,
            skipped_fonts,
            backup_path: backup_dir.to_string_lossy().to_string(),
            backup_id,
            is_admin,
            message: msg,
        })
    }
    #[cfg(not(windows))]
    {
        Ok(RestoreProfileResult {
            success: true,
            profile: profile.to_string(),
            removed_count: 0,
            retained_count: 350,
            scheduled_reboot_count: 0,
            already_scheduled_count: 0,
            skipped_count: 0,
            skipped_fonts: Vec::new(),
            backup_path: "/tmp/backup".to_string(),
            backup_id: "mock_backup".to_string(),
            is_admin: true,
            message: "Restore defaults mock".to_string(),
        })
    }
}

pub fn get_fontivo_backups() -> Vec<BackupFolderInfo> {
    let backups_root = crate::engine::lifecycle::get_app_data_dir().join("Backups");
    get_fontivo_backups_in(&backups_root)
}

pub fn get_fontivo_backups_in(backups_root: &Path) -> Vec<BackupFolderInfo> {
    let mut list = Vec::new();
    if backups_root.exists() {
        if let Ok(entries) = fs::read_dir(&backups_root) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let manifest_file = p.join("manifest.json");
                    if manifest_file.exists() {
                        if let Ok(content) = fs::read_to_string(&manifest_file) {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                                let id = val["id"].as_str().unwrap_or("").to_string();
                                let timestamp = val["timestamp"].as_u64().unwrap_or(0);
                                let date_formatted =
                                    val["dateFormatted"].as_str().unwrap_or("").to_string();
                                let profile = val["profile"]
                                    .as_str()
                                    .unwrap_or("pure_windows")
                                    .to_string();
                                let array_count = val["fonts"]
                                    .as_array()
                                    .map(|a| a.len())
                                    .unwrap_or(0);
                                let removed_count = val["removedCount"]
                                    .as_u64()
                                    .map(|v| v as usize)
                                    .unwrap_or_else(|| {
                                        val["fonts"]
                                            .as_array()
                                            .map(|a| {
                                                a.iter()
                                                    .filter(|f| !f["scheduledReboot"].as_bool().unwrap_or(false))
                                                    .count()
                                            })
                                            .unwrap_or(0)
                                    });
                                let scheduled_reboot_count = val["scheduledRebootCount"]
                                    .as_u64()
                                    .map(|v| v as usize)
                                    .unwrap_or_else(|| {
                                        val["fonts"]
                                            .as_array()
                                            .map(|a| {
                                                a.iter()
                                                    .filter(|f| f["scheduledReboot"].as_bool().unwrap_or(false))
                                                    .count()
                                            })
                                            .unwrap_or(0)
                                    });
                                let raw_total = val["totalFonts"].as_u64().unwrap_or(0) as usize;
                                let total_fonts = raw_total.max(array_count);
                                list.push(BackupFolderInfo {
                                    id,
                                    timestamp,
                                    date_formatted,
                                    profile,
                                    total_fonts,
                                    removed_count,
                                    scheduled_reboot_count,
                                    path: p.to_string_lossy().to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    list
}

pub fn delete_fontivo_backup(backup_id: &str) -> Result<(), String> {
    let backups_root = crate::engine::lifecycle::get_app_data_dir().join("Backups");
    delete_fontivo_backup_in(&backups_root, backup_id)
}

pub fn delete_fontivo_backup_in(backups_root: &Path, backup_id: &str) -> Result<(), String> {
    let safe_id = super::registry::validate_backup_id(backup_id)?;
    let target = backups_root.join(safe_id);
    if !target.exists() || !target.is_dir() {
        return Err("Backup folder not found".to_string());
    }
    let canon_root = backups_root
        .canonicalize()
        .map_err(|e| format!("Failed to resolve Backups root: {}", e))?;
    let canon_target = target
        .canonicalize()
        .map_err(|e| format!("Failed to resolve backup directory: {}", e))?;
    if !canon_target.starts_with(&canon_root) || canon_target == canon_root {
        return Err("Security violation: invalid backup path".to_string());
    }
    if let Ok(content) = fs::read_to_string(canon_target.join("manifest.json")) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(ts) = val["timestamp"].as_u64() {
                let legacy = backups_root.join(format!("fonts_backup_{}.json", ts));
                let _ = fs::remove_file(legacy);
            }
        }
    }
    fs::remove_dir_all(&canon_target).map_err(|e| format!("Failed to delete backup: {}", e))?;
    Ok(())
}

pub fn open_backup_folder(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".to_string());
    let backups_root = PathBuf::from(&local_app_data)
        .join("Fontivo")
        .join("Backups");
    if p.exists() && p.is_dir() {
        if let (Ok(canon_p), Ok(canon_root)) = (p.canonicalize(), backups_root.canonicalize()) {
            if !canon_p.starts_with(&canon_root) {
                return Err(
                    "Security violation: folder is outside Fontivo Backups directory".to_string(),
                );
            }
            let _ = Command::new("explorer").arg(&canon_p).spawn();
            return Ok(());
        }
    }
    Err("Backup folder does not exist".to_string())
}

/// Extracts exact Registry entries to restore from a `manifest.json` font item.
/// Preserves exact `valueName`, `valueType`, and `valueData`, with backward-compatible
/// fallback for legacy manifests that lack `registryEntries` / `registryValueName`.
pub fn build_undo_registry_entries(font_item: &serde_json::Value) -> Vec<RegistrySnapshotEntry> {
    if let Some(arr) = font_item["registryEntries"].as_array() {
        let mut out = Vec::new();
        for item in arr {
            let hive = item["hive"].as_str().unwrap_or("HKLM").to_string();
            let value_name = item["valueName"].as_str().unwrap_or("").to_string();
            let value_type = item["valueType"].as_u64().unwrap_or(1) as u32;
            let value_data = item["valueData"].as_str().unwrap_or("").to_string();
            if !value_name.is_empty() && !value_data.is_empty() {
                out.push(RegistrySnapshotEntry {
                    hive,
                    value_name,
                    value_type,
                    value_data,
                });
            }
        }
        if !out.is_empty() {
            return out;
        }
    }

    let file_name = font_item["fileName"].as_str().unwrap_or("");
    let original_path = font_item["originalPath"].as_str().unwrap_or("");
    let font_name = font_item["name"].as_str().unwrap_or(file_name);
    let hive = font_item["hive"].as_str().unwrap_or("HKLM").to_string();

    if let Some(exact_name) = font_item["registryValueName"].as_str() {
        let exact_type = font_item["registryValueType"].as_u64().unwrap_or(1) as u32;
        let exact_data = font_item["registryValueData"]
            .as_str()
            .unwrap_or(original_path)
            .to_string();
        if !exact_name.is_empty() && !exact_data.is_empty() {
            return vec![RegistrySnapshotEntry {
                hive,
                value_name: exact_name.to_string(),
                value_type: exact_type,
                value_data: exact_data,
            }];
        }
    }

    let dest_str = Path::new(original_path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(file_name);
    vec![RegistrySnapshotEntry {
        hive,
        value_name: format!("{} (TrueType)", font_name),
        value_type: 1,
        value_data: dest_str.to_string(),
    }]
}

pub fn undo_restore_backup(backup_id: &str) -> Result<usize, String> {
    #[allow(unused_variables)]
    let safe_id = super::registry::validate_backup_id(backup_id)?;
    #[cfg(windows)]
    {
        let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".to_string());
        let backup_dir = PathBuf::from(&local_app_data)
            .join("Fontivo")
            .join("Backups")
            .join(safe_id);
        if !backup_dir.exists() {
            return Err("Backup not found".to_string());
        }

        let manifest_file = backup_dir.join("manifest.json");
        let content = fs::read_to_string(&manifest_file).map_err(|e| e.to_string())?;
        let manifest: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;

        let subkey: Vec<u16> = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\0"
            .encode_utf16()
            .collect();
        let mut restored_count = 0;

        if let Some(fonts_array) = manifest["fonts"].as_array() {
            let is_admin = super::elevation::is_running_as_admin();

            unsafe {
                let mut hkey_cu = HKEY::default();
                let cu_open = RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(subkey.as_ptr()),
                    None,
                    KEY_READ | KEY_SET_VALUE,
                    &mut hkey_cu,
                )
                .is_ok();

                let mut hkey_lm = HKEY::default();
                let lm_open = if is_admin {
                    RegOpenKeyExW(
                        HKEY_LOCAL_MACHINE,
                        PCWSTR(subkey.as_ptr()),
                        None,
                        KEY_READ | KEY_SET_VALUE,
                        &mut hkey_lm,
                    )
                    .is_ok()
                } else {
                    false
                };

                for font_item in fonts_array {
                    let file_name = font_item["fileName"].as_str().unwrap_or("");
                    let original_path = font_item["originalPath"].as_str().unwrap_or("");

                    let src_file = backup_dir.join("fonts").join(file_name);
                    let dest_path = PathBuf::from(original_path);

                    if src_file.exists() {
                        if let Some(parent) = dest_path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        let _ = fs::copy(&src_file, &dest_path);
                    }

                    // Re-register exact original registry entries (name, type, data)
                    let entries_to_restore = build_undo_registry_entries(font_item);
                    for reg_entry in &entries_to_restore {
                        let _ = write_registry_snapshot_entry(hkey_cu, hkey_lm, reg_entry);
                    }

                    // Register with GDI
                    let wide_dest: Vec<u16> = dest_path
                        .to_string_lossy()
                        .encode_utf16()
                        .chain(std::iter::once(0))
                        .collect();
                    let _ =
                        windows::Win32::Graphics::Gdi::AddFontResourceW(PCWSTR(wide_dest.as_ptr()));

                    restored_count += 1;
                }

                if cu_open {
                    let _ = RegCloseKey(hkey_cu);
                }
                if lm_open {
                    let _ = RegCloseKey(hkey_lm);
                }

                // Broadcast font change notification
                use windows::Win32::Foundation::{LPARAM, WPARAM};
                use windows::Win32::UI::WindowsAndMessaging::{
                    SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_FONTCHANGE,
                };
                let mut result_lparam = 0usize;
                let _ = SendMessageTimeoutW(
                    HWND_BROADCAST,
                    WM_FONTCHANGE,
                    WPARAM(0),
                    LPARAM(0),
                    SMTO_ABORTIFHUNG,
                    1000,
                    Some(&mut result_lparam),
                );
            }
        }

        let _ = super::cache::rebuild_font_cache();
        Ok(restored_count)
    }
    #[cfg(not(windows))]
    {
        Ok(0)
    }
}
