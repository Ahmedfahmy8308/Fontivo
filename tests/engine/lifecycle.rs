use std::fs;
use std::path::PathBuf;
use Fontivo::engine::lifecycle::{get_app_data_dir, get_user_fonts_dir};
use Fontivo::engine::FontActivator;

fn find_sample_font() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("../../01 - Fonts"),
        PathBuf::from("../01 - Fonts"),
        PathBuf::from("01 - Fonts"),
    ];

    for base in &candidates {
        if base.exists() {
            if let Ok(entries) = fs::read_dir(base) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        if let Ok(sub_entries) = fs::read_dir(&p) {
                            for sub in sub_entries.flatten() {
                                let sp = sub.path();
                                if sp.is_file() {
                                    if let Some(ext) = sp.extension().and_then(|s| s.to_str()) {
                                        let e = ext.to_lowercase();
                                        if e == "ttf" || e == "otf" {
                                            return Some(sp);
                                        }
                                    }
                                }
                            }
                        }
                    } else if p.is_file() {
                        if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                            let e = ext.to_lowercase();
                            if e == "ttf" || e == "otf" {
                                return Some(p);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[test]
fn test_activator_lifecycle() {
    let activator = FontActivator::new();
    assert_eq!(activator.get_active_fonts().len(), 0);
    assert_eq!(activator.get_active_count(), 0);

    if let Some(font_path) = find_sample_font() {
        let path_str = font_path.to_string_lossy().to_string();

        // 1. Activation
        let act_res = activator.activate_ram(&path_str);
        assert!(
            act_res.is_ok(),
            "Activation should succeed: {:?}",
            act_res.err()
        );
        assert!(
            activator.is_active(&path_str),
            "Font should be reported as active"
        );
        assert_eq!(activator.get_active_count(), 1); // Strictly 1 active font per activated file

        // 2. Duplicate activation must be idempotent and return ALREADY_ACTIVE
        let dup_res = activator.activate_ram(&path_str);
        assert!(dup_res.is_ok());
        assert!(dup_res.unwrap().contains("ALREADY_ACTIVE"));

        // 3. Deactivation
        let deact_res = activator.deactivate_ram(&path_str);
        assert!(
            deact_res.is_ok(),
            "Deactivation should succeed: {:?}",
            deact_res.err()
        );
        assert!(
            !activator.is_active(&path_str),
            "Font should no longer be active"
        );
        assert_eq!(activator.get_active_count(), 0);
    }
}

#[test]
fn test_activator_session_cleanup() {
    let activator = FontActivator::new();
    assert_eq!(activator.get_session_managed_count(), 0);

    if let Some(font_path) = find_sample_font() {
        let path_str = font_path.to_string_lossy().to_string();
        let _ = activator.activate_ram(&path_str);
        assert!(activator.get_session_managed_count() > 0);

        // Run session cleanup
        let cleaned = activator.cleanup_session_fonts();
        assert!(cleaned > 0);
        assert_eq!(activator.get_session_managed_count(), 0);
        assert!(!activator.is_active(&path_str));
    }
}

#[test]
fn test_cross_platform_directories() {
    let app_data = get_app_data_dir();
    assert!(!app_data.to_string_lossy().is_empty());
    assert!(app_data.to_string_lossy().contains("Fontivo"));

    let user_fonts = get_user_fonts_dir();
    assert!(user_fonts.is_ok());
    let ufonts = user_fonts.unwrap();
    assert!(!ufonts.to_string_lossy().is_empty());
    assert!(ufonts.to_string_lossy().to_lowercase().contains("fonts"));
}
