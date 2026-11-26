use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use Fontivo::engine::health::SystemHealthChecker;

// =========================================================================
// 1. Core System Fonts Strict Identification & Protection
// =========================================================================

#[test]
fn test_core_system_fonts_protection_identification() {
    // Critical Windows core system fonts that must NEVER be uninstalled or modified
    let protected_fonts = [
        ("Segoe UI", "Segoe UI"),
        ("Segoe UI Bold", "Segoe UI"),
        ("Segoe UI Semibold", "Segoe UI"),
        ("Segoe UI Variable", "Segoe UI Variable"),
        ("Arial", "Arial"),
        ("Arial Bold", "Arial"),
        ("Arial Black", "Arial"),
        ("Calibri", "Calibri"),
        ("Calibri Light", "Calibri"),
        ("Tahoma", "Tahoma"),
        ("Tahoma Bold", "Tahoma"),
        ("Times New Roman", "Times New Roman"),
        ("Consolas", "Consolas"),
        ("Verdana", "Verdana"),
        ("Georgia", "Georgia"),
        ("Comic Sans MS", "Comic Sans MS"),
        ("Trebuchet MS", "Trebuchet MS"),
        ("Impact", "Impact"),
        ("Marlett", "Marlett"),
        ("Symbol", "Symbol"),
        ("Wingdings", "Wingdings"),
        ("Webdings", "Webdings"),
        ("MS Sans Serif", "MS Sans Serif"),
        ("Microsoft Sans Serif", "Microsoft Sans Serif"),
        ("Malgun Gothic", "Malgun Gothic"),
        ("Meiryo", "Meiryo"),
        ("Yu Gothic", "Yu Gothic"),
        ("SimSun", "SimSun"),
    ];

    for (name, family) in &protected_fonts {
        assert!(
            SystemHealthChecker::is_core_font(name, family),
            "System font '{}' (family '{}') MUST be recognized as protected core font",
            name,
            family
        );
    }

    // Custom, third-party, and open-source brand fonts must NOT be flagged as system core
    let user_fonts = [
        ("Cairo Regular", "Cairo"),
        ("Amiri Quran", "Amiri"),
        ("Changa Bold", "Changa"),
        ("Tajawal", "Tajawal"),
        ("Inter Regular", "Inter"),
        ("Roboto", "Roboto"),
        ("Open Sans", "Open Sans"),
        ("Fira Code", "Fira Code"),
        ("BrandNeoFont", "BrandNeoFont"),
    ];

    for (name, family) in &user_fonts {
        assert!(
            !SystemHealthChecker::is_core_font(name, family),
            "User font '{}' must not be flagged as protected system core font",
            name
        );
    }
}

// =========================================================================
// 2. Strict Rejection of Core System Font Uninstallation / Deletion
// =========================================================================

#[test]
fn test_core_system_fonts_uninstall_rejection() {
    let core_targets = [
        ("Segoe UI", "C:\\Windows\\Fonts\\segoeui.ttf"),
        ("Arial", "C:\\Windows\\Fonts\\arial.ttf"),
        ("Calibri", "C:\\Windows\\Fonts\\calibri.ttf"),
        ("Tahoma", "C:\\Windows\\Fonts\\tahoma.ttf"),
        ("Consolas", "C:\\Windows\\Fonts\\consola.ttf"),
    ];

    for (name, path) in &core_targets {
        // 1. Query with explicit name
        let res_named = SystemHealthChecker::uninstall_windows_font(Some(name), path);
        assert!(
            res_named.is_err(),
            "Attempting to uninstall core font '{}' must fail with safety error",
            name
        );
        let err_msg = res_named.unwrap_err();
        assert!(
            err_msg.contains("Cannot uninstall protected Windows core font"),
            "Error message must specify core font protection: '{}'",
            err_msg
        );

        // 2. Query with None name (must inspect path file stem e.g. 'segoeui')
        let res_stem = SystemHealthChecker::uninstall_windows_font(None, path);
        assert!(
            res_stem.is_err(),
            "Attempting to uninstall core font via path '{}' must fail",
            path
        );
        let err_stem = res_stem.unwrap_err();
        assert!(
            err_stem.contains("Cannot uninstall protected Windows core font"),
            "Error message must specify core font protection: '{}'",
            err_stem
        );
    }
}

// =========================================================================
// 3. Enumerate Windows Fonts Enforces Safety Flags
// =========================================================================

#[test]
fn test_enumerate_windows_fonts_safety_flags() {
    let fonts = SystemHealthChecker::enumerate_windows_fonts();
    assert!(
        !fonts.is_empty(),
        "enumerate_windows_fonts must return installed fonts"
    );

    let mut found_segoe = false;
    let mut found_arial = false;
    let mut found_tahoma = false;

    for font in &fonts {
        let low_name = font.name.to_lowercase();
        let low_fam = font.family.to_lowercase();

        if low_fam == "segoe ui" || low_name == "segoe ui" {
            found_segoe = true;
            assert!(
                font.is_system_core,
                "Segoe UI font '{}' must have is_system_core == true",
                font.name
            );
            assert!(
                !font.is_uninstallable,
                "Segoe UI font '{}' must have is_uninstallable == false",
                font.name
            );
        }

        if low_fam == "arial" || low_name == "arial" {
            found_arial = true;
            assert!(
                font.is_system_core,
                "Arial font '{}' must have is_system_core == true",
                font.name
            );
            assert!(
                !font.is_uninstallable,
                "Arial font '{}' must have is_uninstallable == false",
                font.name
            );
        }

        if low_fam == "tahoma" || low_name == "tahoma" {
            found_tahoma = true;
            assert!(
                font.is_system_core,
                "Tahoma font '{}' must have is_system_core == true",
                font.name
            );
            assert!(
                !font.is_uninstallable,
                "Tahoma font '{}' must have is_uninstallable == false",
                font.name
            );
        }

        if low_name == "103 tahoma" || low_name == "marlett_2" {
            assert!(
                !font.is_system_core,
                "Duplicate/non-system font '{}' must NOT have is_system_core == true",
                font.name
            );
        }

        // Universal invariant: No system core font can ever be marked uninstallable
        if font.is_system_core {
            assert!(
                !font.is_uninstallable,
                "Font '{}' is flagged as system core but is marked is_uninstallable: true!",
                font.name
            );
        }
    }

    assert!(found_segoe, "Segoe UI font must be present in enumeration");
    assert!(found_arial, "Arial font must be present in enumeration");
    assert!(found_tahoma, "Tahoma font must be present in enumeration");
}

// =========================================================================
// 4. FNTCACHE.DAT Cache Health & Recovery Logic Validation
// =========================================================================

#[test]
fn test_fntcache_recovery_and_health_validation() {
    let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let fntcache_path = PathBuf::from(&win_dir)
        .join("System32")
        .join("FNTCACHE.DAT");

    // 1. Verify health report correctly inspects FNTCACHE.DAT
    let report = SystemHealthChecker::get_report(100);
    assert!(
        !report.cache_status.is_empty(),
        "Cache status must be populated"
    );
    assert!(
        !report.cache_size_mb.is_empty(),
        "Cache size in MB must be calculated"
    );

    if fntcache_path.exists() {
        println!(
            "FNTCACHE.DAT found at {:?}, report size: {} MB",
            fntcache_path, report.cache_size_mb
        );
        let actual_size = fs::metadata(&fntcache_path).map(|m| m.len()).unwrap_or(0);
        assert!(
            actual_size > 0,
            "FNTCACHE.DAT exists and should be non-empty"
        );
    } else {
        println!("FNTCACHE.DAT not in default System32 path (sandbox/non-admin)");
    }

    // 2. Validate font cache rebuild recovery function
    let rebuild_res = SystemHealthChecker::rebuild_font_cache();
    if SystemHealthChecker::is_running_as_admin() {
        assert!(
            rebuild_res.is_ok(),
            "Font cache rebuild must succeed when running as admin: {:?}",
            rebuild_res.err()
        );
        let msg = rebuild_res.unwrap();
        assert!(
            msg.contains("Font Cache") || msg.contains("cache"),
            "Rebuild message must confirm cache operation: '{}'",
            msg
        );
    } else {
        assert!(
            rebuild_res.is_err(),
            "Font cache rebuild must return explicit Err when not running as admin"
        );
    }
}

// =========================================================================
// 5. Registry Backup Creation Before Restore Defaults
// =========================================================================

#[test]
fn test_restore_default_windows_fonts_creates_backup() {
    let res = SystemHealthChecker::restore_default_windows_fonts();
    assert!(
        res.is_ok(),
        "Restore defaults must succeed: {:?}",
        res.err()
    );

    let (_cleaned_count, backup_path_str) = res.unwrap();
    assert!(!backup_path_str.is_empty(), "Backup path must not be empty");

    let backup_file = Path::new(&backup_path_str);
    assert!(
        backup_file.exists(),
        "Backup JSON file must exist on disk at {:?}",
        backup_file
    );

    // Read and verify backup JSON contents
    let content = fs::read_to_string(backup_file).expect("Failed to read backup file");
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&content);
    assert!(
        parsed.is_ok(),
        "Backup file must be valid JSON: {}",
        content
    );
    assert!(
        parsed.unwrap().is_array(),
        "Backup data must be an array of registry font entries"
    );
}

// =========================================================================
// 6. Essential Creative Fonts & Profile-based Restoration
// =========================================================================

#[test]
fn test_essential_creative_fonts_identification() {
    let creative_fonts = [
        ("Roboto Regular", "Roboto"),
        ("Open Sans", "Open Sans"),
        ("Montserrat Bold", "Montserrat"),
        ("Lato", "Lato"),
        ("Poppins SemiBold", "Poppins"),
        ("Inter", "Inter"),
        ("Cairo Regular", "Cairo"),
        ("Tajawal Medium", "Tajawal"),
        ("Almarai", "Almarai"),
        ("El Messiri", "El Messiri"),
        ("Amiri Quran", "Amiri"),
        ("Changa Bold", "Changa"),
        ("Helvetica Neue", "Helvetica"),
        ("DIN Pro", "DIN"),
        ("Bebas Neue", "Bebas Neue"),
    ];

    for (name, family) in &creative_fonts {
        assert!(
            SystemHealthChecker::is_essential_creative_font(name, family),
            "Font '{}' (family '{}') MUST be recognized as essential creative font",
            name,
            family
        );
    }

    let unknown_fonts = [
        ("XyZRandomFont123", "XyZRandomFont123"),
        ("CorruptedDumpFont", "CorruptedDumpFont"),
    ];

    for (name, family) in &unknown_fonts {
        assert!(
            !SystemHealthChecker::is_essential_creative_font(name, family),
            "Random font '{}' must not be flagged as essential creative font",
            name
        );
    }
}

#[test]
fn test_restore_windows_fonts_with_profiles() {
    // 1. Test pure_windows profile
    let pure_res = SystemHealthChecker::restore_windows_fonts_with_profile("pure_windows");
    assert!(
        pure_res.is_ok(),
        "Restore pure_windows profile must succeed: {:?}",
        pure_res.err()
    );
    let pure_summary = pure_res.unwrap();
    assert_eq!(pure_summary.profile, "pure_windows");
    assert!(!pure_summary.backup_path.is_empty());
    assert!(!pure_summary.backup_id.is_empty());

    // 2. Test essential_creative profile
    let creative_res =
        SystemHealthChecker::restore_windows_fonts_with_profile("essential_creative");
    assert!(
        creative_res.is_ok(),
        "Restore essential_creative profile must succeed: {:?}",
        creative_res.err()
    );
    let creative_summary = creative_res.unwrap();
    assert_eq!(creative_summary.profile, "essential_creative");
    assert!(!creative_summary.backup_path.is_empty());

    // 3. Verify backup list
    let backups = SystemHealthChecker::get_fontivo_backups();
    assert!(
        !backups.is_empty(),
        "get_fontivo_backups must return at least the newly created backup"
    );
}

#[test]
fn test_registry_value_matches_arabic_utf8_font_names_without_panic() {
    // Regression test: Arabic multi-byte UTF-8 font names where (len - suffix.len())
    // lands mid-character must never panic.
    let arabic_names = [
        "خط المهند العريض",
        "خط النسخ العربي ه",
        "الخط الديواني (TrueType)",
        "تجوّال هـ",
    ];

    for name in &arabic_names {
        let matched = SystemHealthChecker::registry_value_matches_font(
            "Arial (TrueType)",
            "arial.ttf",
            Some(name),
            "C:\\Windows\\Fonts\\custom_arabic.ttf",
        );
        assert!(!matched);
    }

    assert!(SystemHealthChecker::registry_value_matches_font(
        "خط المهند العريض (TrueType)",
        "mohand.ttf",
        Some("خط المهند العريض"),
        "C:\\Windows\\Fonts\\mohand.ttf",
    ));
}

// =========================================================================
// 7. Regression Tests for Protected System Font Inventory & Transactional Restore
// =========================================================================

#[test]
fn test_is_protected_system_font_exact_protection_and_no_false_positives() {
    let must_protect = [
        ("courbd", "courbd", "C:\\Windows\\Fonts\\courbd.ttf"),
        ("trebucbd", "trebucbd", "C:\\Windows\\Fonts\\trebucbd.ttf"),
        ("segmdl2", "segmdl2", "C:\\Windows\\Fonts\\segmdl2.ttf"),
        (
            "SegoeIcons",
            "SegoeIcons",
            "C:\\Windows\\Fonts\\SegoeIcons.ttf",
        ),
        (
            "Courier New Bold",
            "Courier New",
            "C:\\Windows\\Fonts\\courbd.ttf",
        ),
        (
            "Trebuchet MS Bold",
            "Trebuchet MS",
            "C:\\Windows\\Fonts\\trebucbd.ttf",
        ),
        (
            "Segoe MDL2 Assets",
            "Segoe MDL2 Assets",
            "C:\\Windows\\Fonts\\segmdl2.ttf",
        ),
        (
            "Segoe Fluent Icons",
            "Segoe Fluent Icons",
            "C:\\Windows\\Fonts\\SegoeIcons.ttf",
        ),
        (
            "Microsoft Sans Serif",
            "Microsoft Sans Serif",
            "C:\\Windows\\Fonts\\micross.ttf",
        ),
        (
            "Lucida Console",
            "Lucida Console",
            "C:\\Windows\\Fonts\\lucon.ttf",
        ),
        (
            "Nirmala UI",
            "Nirmala UI",
            "C:\\Windows\\Fonts\\nirmala.ttf",
        ),
        (
            "Bahnschrift",
            "Bahnschrift",
            "C:\\Windows\\Fonts\\bahnschrift.ttf",
        ),
        (
            "MS Gothic & MS UI Gothic & MS PGothic",
            "MS Gothic & MS UI Gothic & MS PGothic",
            "C:\\WINDOWS\\Fonts\\msgothic.ttc",
        ),
        (
            "SimSun-ExtG",
            "SimSun-ExtG",
            "C:\\WINDOWS\\Fonts\\SimsunExtG.ttf",
        ),
        ("LeelaUIb", "LeelaUIb", "C:\\WINDOWS\\Fonts\\LeelaUIb.ttf"),
        (
            "SansSerifCollection",
            "SansSerifCollection",
            "C:\\WINDOWS\\Fonts\\SansSerifCollection.ttf",
        ),
        (
            "Courier 10,12,15",
            "Courier 10,12,15",
            "C:\\WINDOWS\\Fonts\\COUE1256.FON",
        ),
        (
            "Courier 10,12,15 (120)",
            "Courier 10,12,15 (120)",
            "C:\\WINDOWS\\Fonts\\COUF1256.FON",
        ),
        (
            "MS Serif 8,10,12,14,18,24",
            "MS Serif 8,10,12,14,18,24",
            "C:\\WINDOWS\\Fonts\\SERE1256.FON",
        ),
        (
            "MS Serif 8,10,12,14,18,24 (120)",
            "MS Serif 8,10,12,14,18,24 (120)",
            "C:\\WINDOWS\\Fonts\\SERF1256.FON",
        ),
        (
            "Cascadia Code",
            "Cascadia Code",
            "C:\\WINDOWS\\Fonts\\CascadiaCode.ttf",
        ),
    ];

    for (name, family, path) in &must_protect {
        assert!(
            SystemHealthChecker::is_protected_system_font(name, family, path),
            "Protected system font ({}, {}, {}) MUST be protected",
            name,
            family,
            path
        );
    }

    // Duplicates and non-system fonts containing core-like substrings MUST NOT be protected
    let must_not_protect = [
        (
            "MARLETT_2",
            "MARLETT_2",
            "C:\\Windows\\Fonts\\MARLETT_2.TTF",
        ),
        (
            "Marlett_3",
            "Marlett_3",
            "C:\\Windows\\Fonts\\Marlett_3.ttf",
        ),
        (
            "103 Tahoma",
            "103 Tahoma",
            "C:\\Windows\\Fonts\\103 Tahoma.ttf",
        ),
        ("Arial_0", "Arial_0", "C:\\Windows\\Fonts\\Arial_0.ttf"),
        ("ARIALN_2", "ARIALN_2", "C:\\WINDOWS\\Fonts\\ARIALN_2.TTF"),
        (
            "ARIALNBI_3",
            "ARIALNBI_3",
            "C:\\WINDOWS\\Fonts\\ARIALNBI_3.TTF",
        ),
        (
            "Lucida Bright",
            "Lucida Bright",
            "C:\\WINDOWS\\Fonts\\LBRITE.TTF",
        ),
        (
            "Lucida Fax Regular",
            "Lucida Fax Regular",
            "C:\\WINDOWS\\Fonts\\LFAX.TTF",
        ),
        (
            "Segoe UI Copy",
            "Segoe UI Copy",
            "C:\\Windows\\Fonts\\SegoeUICopy.ttf",
        ),
        (
            "My Custom Times",
            "My Custom Times",
            "C:\\Users\\user\\AppData\\Local\\Microsoft\\Windows\\Fonts\\MyCustomTimes.ttf",
        ),
        (
            "Cairo Regular",
            "Cairo",
            "C:\\Users\\user\\AppData\\Local\\Microsoft\\Windows\\Fonts\\Cairo-Regular.ttf",
        ),
    ];

    for (name, family, path) in &must_not_protect {
        assert!(
            !SystemHealthChecker::is_protected_system_font(name, family, path),
            "Non-system/duplicate font ({}, {}, {}) MUST NOT be falsely treated as protected",
            name,
            family,
            path
        );
    }
}

#[test]
fn test_uninstall_windows_font_enforces_protected_system_font() {
    let protected_paths = [
        "C:\\Windows\\Fonts\\courbd.ttf",
        "C:\\Windows\\Fonts\\trebucbd.ttf",
        "C:\\Windows\\Fonts\\segmdl2.ttf",
        "C:\\Windows\\Fonts\\SegoeIcons.ttf",
    ];

    for path in &protected_paths {
        let res = SystemHealthChecker::uninstall_windows_font(None, path);
        assert!(
            res.is_err(),
            "uninstall_windows_font(None, '{}') must reject protected system font directly",
            path
        );
        let err = res.unwrap_err();
        assert!(
            err.contains("Cannot uninstall protected Windows core font"),
            "Unexpected error for '{}': {}",
            path,
            err
        );
    }
}

#[test]
fn test_rebuild_font_cache_explicit_error_when_not_admin() {
    if !SystemHealthChecker::is_running_as_admin() {
        let res = SystemHealthChecker::rebuild_font_cache();
        assert!(
            res.is_err(),
            "rebuild_font_cache must return Err when not admin"
        );
        let err = res.unwrap_err();
        assert!(
            err.to_lowercase().contains("administrator") || err.to_lowercase().contains("failed"),
            "Error message must explain failure: {}",
            err
        );
    }
}

#[test]
fn test_restore_creates_snapshot_manifest_and_transaction_log() {
    let res = SystemHealthChecker::restore_windows_fonts_with_profile("pure_windows")
        .expect("restore_windows_fonts_with_profile should succeed");
    let backup_dir = Path::new(&res.backup_path);

    let snapshot_file = backup_dir.join("fonts_registry_snapshot.json");
    assert!(
        snapshot_file.exists(),
        "fonts_registry_snapshot.json must exist"
    );
    let snapshot_text = fs::read_to_string(&snapshot_file).expect("read snapshot");
    let snapshot_val: serde_json::Value =
        serde_json::from_str(&snapshot_text).expect("snapshot must be valid JSON");
    assert!(snapshot_val.is_array(), "snapshot must be a JSON array");

    let manifest_file = backup_dir.join("manifest.json");
    assert!(manifest_file.exists(), "manifest.json must exist");

    let tx_log_file = backup_dir.join("transaction_log.jsonl");
    assert!(tx_log_file.exists(), "transaction_log.jsonl must exist");
    let tx_text = fs::read_to_string(&tx_log_file).expect("read transaction_log.jsonl");
    assert!(
        !tx_text.trim().is_empty(),
        "transaction_log.jsonl must not be empty"
    );
    for line in tx_text.lines() {
        let parsed: serde_json::Value =
            serde_json::from_str(line).expect("each transaction_log.jsonl line must be valid JSON");
        assert!(parsed.get("action").is_some());
        assert!(parsed.get("status").is_some());
    }
}

#[test]
fn test_move_font_file_to_backup_normal_and_locked() {
    let tmp = env::temp_dir().join(format!("fontivo_move_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap();

    let src = tmp.join("test_font.ttf");
    let dest = tmp.join("backup").join("test_font.ttf");
    fs::write(&src, b"dummy font bytes").unwrap();

    // Normal move succeeds and removes source
    let moved = SystemHealthChecker::move_font_file_to_backup(&src, &dest).unwrap();
    assert!(moved);
    assert!(!src.exists());
    assert!(dest.exists());

    // Missing source returns Ok(false)
    let missing = SystemHealthChecker::move_font_file_to_backup(&src, &dest).unwrap();
    assert!(!missing);

    // Locked file on Windows must return Err and leave source untouched
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        let locked_src = tmp.join("locked_font.ttf");
        let locked_dest = tmp.join("backup").join("locked_font.ttf");
        fs::write(&locked_src, b"locked font bytes").unwrap();
        let _handle = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&locked_src)
            .unwrap();

        let locked_res = SystemHealthChecker::move_font_file_to_backup(&locked_src, &locked_dest);
        assert!(
            locked_res.is_err(),
            "Locked font file must fail move_font_file_to_backup so registry is not deleted"
        );
        assert!(
            locked_src.exists(),
            "Locked source file must remain on disk"
        );
        assert!(
            !locked_dest.exists(),
            "Partial backup copy must be cleaned up on failure"
        );
    }

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn test_validate_protected_fonts_post_op_and_undo_exact_entries() {
    use Fontivo::engine::health::RegistrySnapshotEntry;

    let pre = vec![
        RegistrySnapshotEntry {
            hive: "HKLM".to_string(),
            value_name: "Segoe UI (TrueType)".to_string(),
            value_type: 1,
            value_data: "segoeui.ttf".to_string(),
        },
        RegistrySnapshotEntry {
            hive: "HKCU".to_string(),
            value_name: "Custom Display (OpenType)".to_string(),
            value_type: 1,
            value_data: "C:\\Users\\u\\Fonts\\CustomDisplay.otf".to_string(),
        },
    ];

    // Removing non-protected font passes post-op validation
    let post_ok = vec![pre[0].clone()];
    assert!(SystemHealthChecker::validate_protected_fonts_post_op(&pre, &post_ok).is_ok());

    // Missing protected font fails post-op validation and triggers rollback
    let post_bad: Vec<RegistrySnapshotEntry> = vec![];
    let err = SystemHealthChecker::validate_protected_fonts_post_op(&pre, &post_bad).unwrap_err();
    assert_eq!(err, vec!["HKLM:Segoe UI (TrueType)".to_string()]);

    // Undo preserves exact registry value name, type, and data
    let manifest_item = serde_json::json!({
        "name": "Custom Display",
        "fileName": "CustomDisplay.otf",
        "originalPath": "C:\\Users\\u\\Fonts\\CustomDisplay.otf",
        "hive": "HKCU",
        "registryEntries": [{
            "hive": "HKCU",
            "valueName": "Custom Display (TrueType & OpenType)",
            "valueType": 2,
            "valueData": "%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts\\CustomDisplay.otf"
        }]
    });
    let restored = SystemHealthChecker::build_undo_registry_entries(&manifest_item);
    assert_eq!(restored.len(), 1);
    assert_eq!(restored[0].hive, "HKCU");
    assert_eq!(
        restored[0].value_name,
        "Custom Display (TrueType & OpenType)"
    );
    assert_eq!(restored[0].value_type, 2);
    assert_eq!(
        restored[0].value_data,
        "%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts\\CustomDisplay.otf"
    );
}
