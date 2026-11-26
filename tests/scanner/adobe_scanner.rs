use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use Fontivo::scanner::AdobeScanner;

#[test]
fn test_adobe_scanner_signature_matching() {
    let temp_dir = std::env::temp_dir();
    let mock_psd_path = temp_dir.join("test_mock_design.psd");

    let mut file = File::create(&mock_psd_path).unwrap();
    file.write_all(b"8BPS\x00\x01\x00\x00\x00\x00\x00\x00\x00\x03")
        .unwrap();
    file.write_all(&[0u8; 100]).unwrap();
    file.write_all(b"/FontSet [ << /Name (Cairo-Bold) >> << /Name (GE SS Two Light) >> ]")
        .unwrap();
    file.flush().unwrap();

    let extracted = AdobeScanner::extract_font_names(&mock_psd_path);
    assert!(
        extracted.is_ok(),
        "Extraction should succeed: {:?}",
        extracted.err()
    );

    let fonts = extracted.unwrap();
    assert!(fonts.contains(&"Cairo-Bold".to_string()));
    assert!(fonts.contains(&"GE SS Two Light".to_string()));

    let _ = std::fs::remove_file(mock_psd_path);
}

#[test]
fn test_adobe_scanner_missing_file() {
    let fake_path = PathBuf::from("non_existent_design_file_xyz.psd");
    let res = AdobeScanner::extract_font_names(&fake_path);
    assert!(res.is_err(), "Non-existent PSD should return error");
}

#[test]
fn test_adobe_scanner_empty_file() {
    let temp_dir = std::env::temp_dir();
    let empty_file = temp_dir.join("empty_test.psd");
    let _ = File::create(&empty_file).unwrap();

    let res = AdobeScanner::extract_font_names(&empty_file);
    assert!(res.is_ok());
    assert_eq!(res.unwrap().len(), 0);

    let _ = std::fs::remove_file(empty_file);
}

#[test]
fn test_real_psd_scan_if_exists() {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let candidates = [
        PathBuf::from(&home)
            .join("Downloads")
            .join("FRAME INTERVIEWS.psd"),
        PathBuf::from(&home)
            .join("Downloads")
            .join("BEST Member 2026.psd"),
        PathBuf::from(&home).join("Downloads").join("BOARD.psd"),
    ];

    for path in &candidates {
        if path.exists() {
            let res = AdobeScanner::extract_font_names(path);
            assert!(
                res.is_ok(),
                "Scanning real PSD should succeed: {:?}",
                res.err()
            );
            let fonts = res.unwrap();
            println!("Found {} fonts in {:?}", fonts.len(), path);
            assert!(
                !fonts.is_empty(),
                "Should extract text layer fonts from valid PSD"
            );
            break;
        }
    }
}
