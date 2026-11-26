use std::fs::File;
use std::io::Write;
use Fontivo::updater::{AutoUpdater, UpdateStatus};

#[test]
fn test_updater_check() {
    let update_res = AutoUpdater::check_for_updates();
    assert!(
        update_res.is_ok(),
        "Update check should succeed: {:?}",
        update_res.err()
    );

    let info = update_res.unwrap();
    assert_eq!(info.current_version, AutoUpdater::CURRENT_VERSION);
    assert!(!info.release_notes.is_empty());
    assert!(!info.download_url.is_empty());
    assert!(info.asset_size_bytes > 0);
}

#[test]
fn test_version_comparison() {
    assert_eq!(AutoUpdater::compare_versions("2026.1.1", "2026.1.0"), 1);
    assert_eq!(AutoUpdater::compare_versions("2026.1.0", "2026.1.1"), -1);
    assert_eq!(AutoUpdater::compare_versions("2026.1.0", "2026.1.0"), 0);
    assert_eq!(AutoUpdater::compare_versions("v2.0.0", "1.9.9"), 1);
    assert_eq!(AutoUpdater::compare_versions("2.0.1", "2.0.0"), 1);
    assert_eq!(AutoUpdater::compare_versions("2.0.0", "2.0.1"), -1);
}

#[test]
fn test_checksum_verification() {
    let temp_file = std::env::temp_dir().join("test_update_file.bin");
    let mut f = File::create(&temp_file).unwrap();
    f.write_all(b"Fontivo update binary payload").unwrap();
    f.flush().unwrap();

    let valid = AutoUpdater::verify_checksum(
        &temp_file,
        "8be84a0e50f68478c1fcee088492b9efffeed0b752038f6908747a1977f6460a",
    );
    assert!(
        valid,
        "Checksum should verify non-empty file with matching SHA256"
    );

    let invalid = AutoUpdater::verify_checksum(
        &temp_file,
        "0000000000000000000000000000000000000000000000000000000000000000",
    );
    assert!(!invalid, "Checksum should reject mismatched SHA256");

    let _ = std::fs::remove_file(temp_file);
}

#[test]
fn test_auto_download_and_ready_state_transition() {
    AutoUpdater::reset_state();
    AutoUpdater::set_test_mode(true);

    // Prepare a mock local payload file
    let temp_payload = std::env::temp_dir().join("Fontivo-v1.1.0-Setup.exe");
    {
        let mut f = File::create(&temp_payload).unwrap();
        f.write_all(b"Mock Fontivo Inno Setup Executable v1.1.0")
            .unwrap();
        f.flush().unwrap();
    }

    // SHA256 of b"Mock Fontivo Inno Setup Executable v1.1.0"
    let expected_sha256 = "132fc6332295fb717a814746c383314bca67be6076f15b3fcc5b60774cf18925";

    let mock_status = UpdateStatus {
        status: "idle".to_string(),
        current_version: "1.0.0".to_string(),
        latest_version: "1.1.0".to_string(),
        has_update: true,
        release_notes:
            " Fontivo v1.1.0 includes automated background updates and enhanced Adobe bridge."
                .to_string(),
        published_at: "2026-11-24T00:00:00Z".to_string(),
        download_url: format!("file://{}", temp_payload.to_string_lossy()),
        asset_size_bytes: 40,
        sha256_checksum: Some(expected_sha256.to_string()),
        download_progress: 0,
        bytes_downloaded: 0,
        installer_path: None,
        error: None,
        last_checked: None,
    };

    // Verify synchronous download and checksum verification
    let res = AutoUpdater::download_and_verify(&mock_status);
    assert!(
        res.is_ok(),
        "Download and verify should succeed: {:?}",
        res.err()
    );
    let installer_path = res.unwrap();
    assert!(
        std::path::Path::new(&installer_path).exists(),
        "Downloaded installer must exist on disk"
    );

    // Test apply update in test mode
    let mut ready_status = mock_status.clone();
    ready_status.status = "ready_to_install".to_string();
    ready_status.installer_path = Some(installer_path.clone());
    AutoUpdater::set_mock_update(Some(ready_status));

    let apply_res = AutoUpdater::apply_update(true);
    assert!(
        apply_res.is_ok(),
        "Apply update should validate in test mode: {:?}",
        apply_res.err()
    );

    // Clean up
    let _ = std::fs::remove_file(&temp_payload);
    let _ = std::fs::remove_file(installer_path);
    AutoUpdater::reset_state();
}

#[test]
fn test_download_checksum_mismatch_handling() {
    let temp_payload = std::env::temp_dir().join("Fontivo-Corrupt-Setup.exe");
    {
        let mut f = File::create(&temp_payload).unwrap();
        f.write_all(b"Corrupted payload bytes").unwrap();
        f.flush().unwrap();
    }

    let corrupt_status = UpdateStatus {
        status: "idle".to_string(),
        current_version: "1.0.0".to_string(),
        latest_version: "1.2.0".to_string(),
        has_update: true,
        release_notes: "Corrupted release".to_string(),
        published_at: "2026-11-24T00:00:00Z".to_string(),
        download_url: format!("file://{}", temp_payload.to_string_lossy()),
        asset_size_bytes: 23,
        sha256_checksum: Some(
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".to_string(),
        ),
        download_progress: 0,
        bytes_downloaded: 0,
        installer_path: None,
        error: None,
        last_checked: None,
    };

    let res = AutoUpdater::download_and_verify(&corrupt_status);
    assert!(
        res.is_err(),
        "Corrupted payload must fail checksum verification"
    );
    assert!(res.unwrap_err().contains("SHA-256 checksum mismatch"));

    let _ = std::fs::remove_file(temp_payload);
}

#[test]
fn test_parse_github_releases_api_payload_detects_newer_version_and_sha256() {
    let gh_json = r#"{
        "tag_name": "v9.9.9",
        "published_at": "2026-12-01T10:00:00Z",
        "body": "Major Fontivo release with new updater.",
        "html_url": "https://github.com/Ahmedfahmy8308/Fontivo/releases/tag/v9.9.9",
        "assets": [
            {
                "name": "Fontivo-Setup.exe",
                "size": 4520404,
                "digest": "sha256:2ef8204cf4bca5fe3c137b22ac50117a2b0831900c7a0744d8835ce8715614d4",
                "browser_download_url": "https://github.com/Ahmedfahmy8308/Fontivo/releases/download/v9.9.9/Fontivo-Setup.exe"
            },
            {
                "name": "Fontivo-macos-arm64.tar.gz",
                "size": 2852782,
                "digest": "sha256:c2394b3aa08a3d2ef9ca2bc45160b113048b5e4b7337f29e8552f87212dc7e9e",
                "browser_download_url": "https://github.com/Ahmedfahmy8308/Fontivo/releases/download/v9.9.9/Fontivo-macos-arm64.tar.gz"
            },
            {
                "name": "Fontivo-macos-x86_64.tar.gz",
                "size": 2998357,
                "digest": "sha256:b9e080db220b05517951a329b6058a033779cab36575face5e5db3d1a0cf33eb",
                "browser_download_url": "https://github.com/Ahmedfahmy8308/Fontivo/releases/download/v9.9.9/Fontivo-macos-x86_64.tar.gz"
            },
            {
                "name": "Fontivo-linux-x86_64.tar.gz",
                "size": 3971862,
                "digest": "sha256:488af635266119924f5649384a9a61085d1c39198c7f035ed0a65de863bc7932",
                "browser_download_url": "https://github.com/Ahmedfahmy8308/Fontivo/releases/download/v9.9.9/Fontivo-linux-x86_64.tar.gz"
            }
        ]
    }"#;

    let parsed = AutoUpdater::parse_release_payload(gh_json).expect("Must parse GitHub release");
    assert_eq!(parsed.latest_version, "9.9.9");
    assert!(parsed.has_update);
    assert_eq!(parsed.status, "downloading");
    assert!(parsed.sha256_checksum.is_some());
    assert!(parsed.download_url.contains("v9.9.9"));
}
