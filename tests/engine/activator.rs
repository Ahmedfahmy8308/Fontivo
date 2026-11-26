use std::fs;
use Fontivo::engine::lifecycle::FontLifecycleError;
use Fontivo::engine::FontActivator;

#[test]
fn test_activator_non_existent_file() {
    let activator = FontActivator::new();
    let res = activator.activate_ram("non_existent_fake_font_path.ttf");
    assert!(res.is_err(), "Should return error for missing font file");
    match res.unwrap_err() {
        FontLifecycleError::FileNotFound(_) => {}
        other => panic!("Expected FileNotFound error, got: {:?}", other),
    }
}

#[test]
fn test_activator_woff_rejection() {
    let temp_dir = std::env::temp_dir().join("fontivo_lifecycle_test_woff");
    let _ = fs::create_dir_all(&temp_dir);

    let woff_file = temp_dir.join("web_font.woff");
    fs::write(&woff_file, b"wOFF\x00\x01\x00\x00").unwrap();

    let activator = FontActivator::new();
    let res = activator.activate_ram(woff_file.to_str().unwrap());
    assert!(
        res.is_err(),
        "WOFF file should be rejected for native OS activation"
    );
    match res.unwrap_err() {
        FontLifecycleError::UnsupportedFormat { format, .. } => {
            assert_eq!(format, "WOFF");
        }
        other => panic!("Expected UnsupportedFormat error, got: {:?}", other),
    }

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_activator_corrupted_file_rejection() {
    let temp_dir = std::env::temp_dir().join("fontivo_lifecycle_test_corrupt");
    let _ = fs::create_dir_all(&temp_dir);

    let corrupt_file = temp_dir.join("broken.ttf");
    fs::write(&corrupt_file, b"THIS IS NOT A FONT HEADER").unwrap();

    let activator = FontActivator::new();
    let res = activator.activate_ram(corrupt_file.to_str().unwrap());
    assert!(
        res.is_err(),
        "Corrupted font should be rejected before native API call"
    );
    match res.unwrap_err() {
        FontLifecycleError::CorruptedFontFile(_) => {}
        other => panic!("Expected CorruptedFontFile error, got: {:?}", other),
    }

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_activator_deactivate_non_active_idempotent() {
    let activator = FontActivator::new();
    let res = activator.deactivate_ram("some_random_font.ttf");
    assert!(
        res.is_ok(),
        "Deactivating non-active font should be idempotent"
    );
    assert!(res.unwrap().contains("NOT_ACTIVE"));
}

#[test]
fn test_activator_batch_partial_failures() {
    let activator = FontActivator::new();

    let items = vec![
        (1, "missing_font_1.ttf".to_string()),
        (2, "missing_font_2.ttf".to_string()),
    ];

    let mut state_tracker = Vec::new();
    let summary = activator.activate_batch(&items, |id, is_active| {
        state_tracker.push((id, is_active));
    });

    assert_eq!(summary.total_requested, 2);
    assert_eq!(summary.succeeded.len(), 0);
    assert_eq!(summary.failed.len(), 2);
    assert_eq!(state_tracker.len(), 2);
    assert_eq!(state_tracker[0], (1, false));
    assert_eq!(state_tracker[1], (2, false));
}
