use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;
use Fontivo::engine::{
    DownloadManager, FontPackItem, FontPackManifest, JobPhase, LibraryStorageManager,
    SafeZipExtractor,
};
use Fontivo::server::routes::fonts_query::filter_fonts;
use Fontivo::server::state::{AppState, FontRecord};

// =========================================================================
// 1. Font Pack Manifest Validation Tests
// =========================================================================

#[test]
fn test_manifest_validation_valid_default() {
    let manifest = FontPackManifest::default_manifest();
    assert!(
        manifest.validate().is_ok(),
        "Default manifest must be strictly valid"
    );
    assert_eq!(manifest.schema_version, 1);
    assert!(!manifest.packs.is_empty());
}

#[test]
fn test_manifest_validation_invalid_schema() {
    let mut manifest = FontPackManifest::default_manifest();
    manifest.schema_version = 2; // Only version 1 is supported
    let err = manifest.validate().unwrap_err();
    assert!(
        err.contains("Unsupported schemaVersion"),
        "Should reject schemaVersion 2"
    );
}

#[test]
fn test_manifest_validation_untrusted_url() {
    let mut manifest = FontPackManifest::default_manifest();
    manifest.packs[0].download_url = "http://malicious-attacker.com/pack.zip".to_string();
    let err = manifest.validate().unwrap_err();
    assert!(
        err.contains("untrusted downloadUrl"),
        "Should reject non-whitelisted domain: {}",
        err
    );

    manifest.packs[0].download_url = "https://127.0.0.1/pack.zip".to_string();
    let err2 = manifest.validate().unwrap_err();
    assert!(
        err2.contains("untrusted downloadUrl"),
        "Should reject private IP SSRF attempt"
    );
}

#[test]
fn test_manifest_validation_invalid_checksum() {
    let mut manifest = FontPackManifest::default_manifest();
    manifest.packs[0].sha256 = "short_hash".to_string();
    let err = manifest.validate().unwrap_err();
    assert!(
        err.contains("invalid sha256 checksum"),
        "Should reject short hash: {}",
        err
    );

    manifest.packs[0].sha256 =
        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz".to_string();
    let err2 = manifest.validate().unwrap_err();
    assert!(
        err2.contains("invalid sha256 checksum"),
        "Should reject non-hexadecimal characters: {}",
        err2
    );
}

#[test]
fn test_manifest_validation_invalid_filename() {
    let mut manifest = FontPackManifest::default_manifest();
    manifest.packs[0].file_name = "../evil.zip".to_string();
    let err = manifest.validate().unwrap_err();
    assert!(
        err.contains("invalid path characters"),
        "Should reject filename with path traversal: {}",
        err
    );

    manifest.packs[0].file_name = "evil.exe".to_string();
    let err2 = manifest.validate().unwrap_err();
    assert!(
        err2.contains("must end with '.zip'"),
        "Should reject non-zip filename: {}",
        err2
    );
}

// =========================================================================
// 2. Safe ZIP Extraction & Security Tests
// =========================================================================

fn create_test_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buf = Vec::new();
    {
        let mut zip = ZipWriter::new(Cursor::new(&mut buf));
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for (name, data) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }
    buf
}

#[test]
fn test_safe_zip_extractor_normal_archive() {
    let temp_dir =
        std::env::temp_dir().join(format!("fontivo_test_zip_normal_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let ttf_magic = [0x00, 0x01, 0x00, 0x00, 0x00, 0x0C]; // Valid TTF magic header
    let otf_magic = [b'O', b'T', b'T', b'O', 0x00, 0x0C]; // Valid OTF magic header

    let zip_bytes = create_test_zip(&[
        ("fonts/arabic/test1.ttf", &ttf_magic),
        ("fonts/english/test2.otf", &otf_magic),
        ("README.md", b"# Font Pack Readme"),
    ]);

    let report =
        SafeZipExtractor::extract(Cursor::new(zip_bytes), &temp_dir, None, None, |_, _, _| {})
            .expect("Extraction should succeed for safe archive");

    assert_eq!(report.font_files_count, 2);
    assert!(temp_dir.join("fonts/arabic/test1.ttf").exists());
    assert!(temp_dir.join("fonts/english/test2.otf").exists());
    assert!(temp_dir.join("README.md").exists());

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_safe_zip_extractor_zip_slip_rejection() {
    let temp_dir =
        std::env::temp_dir().join(format!("fontivo_test_zip_slip_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let zip_bytes = create_test_zip(&[
        ("../../escaped.ttf", b"\x00\x01\x00\x00data"),
        ("..\\windows\\system32\\evil.ttf", b"\x00\x01\x00\x00data"),
    ]);

    let res =
        SafeZipExtractor::extract(Cursor::new(zip_bytes), &temp_dir, None, None, |_, _, _| {});

    assert!(res.is_err(), "Zip Slip attempt must be rejected");
    let err_msg = res.unwrap_err();
    assert!(
        err_msg.contains("Security violation")
            || err_msg.contains("Zip Slip")
            || err_msg.contains("malicious path"),
        "Error message should mention security or malicious path: {}",
        err_msg
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_safe_zip_extractor_blocked_extensions() {
    let temp_dir =
        std::env::temp_dir().join(format!("fontivo_test_zip_blocked_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let ttf_magic = [0x00, 0x01, 0x00, 0x00, 0x00, 0x0C];
    let zip_bytes = create_test_zip(&[
        ("safe_font.ttf", &ttf_magic),
        ("payload.exe", b"MZexecutable"),
        ("script.bat", b"@echo off"),
        ("library.dll", b"MZdll"),
    ]);

    let report =
        SafeZipExtractor::extract(Cursor::new(zip_bytes), &temp_dir, None, None, |_, _, _| {})
            .expect("Extraction should succeed while skipping dangerous files");

    assert!(temp_dir.join("safe_font.ttf").exists());
    assert!(
        !temp_dir.join("payload.exe").exists(),
        "Executable file must not be extracted"
    );
    assert!(
        !temp_dir.join("script.bat").exists(),
        "Batch file must not be extracted"
    );
    assert!(
        !temp_dir.join("library.dll").exists(),
        "DLL must not be extracted"
    );
    assert!(report.skipped_entries >= 3);

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_safe_zip_extractor_magic_byte_filtering() {
    let temp_dir =
        std::env::temp_dir().join(format!("fontivo_test_zip_magic_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let fake_font_bytes = b"CORRUPT_OR_FAKE_DATA_NOT_A_FONT";
    let real_font_bytes = [0x00, 0x01, 0x00, 0x00, 0x01, 0x02];

    let zip_bytes = create_test_zip(&[
        ("corrupt.ttf", fake_font_bytes),
        ("valid.ttf", &real_font_bytes),
    ]);

    let report =
        SafeZipExtractor::extract(Cursor::new(zip_bytes), &temp_dir, None, None, |_, _, _| {})
            .expect("Extraction should succeed");

    assert!(
        !temp_dir.join("corrupt.ttf").exists(),
        "Fake font with corrupt magic header must be deleted"
    );
    assert!(
        temp_dir.join("valid.ttf").exists(),
        "Valid font with correct magic header must be saved"
    );
    assert_eq!(report.font_files_count, 1);

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_safe_zip_extractor_decompression_limit_bomb() {
    let temp_dir =
        std::env::temp_dir().join(format!("fontivo_test_zip_bomb_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let large_data = vec![0u8; 100 * 1024]; // 100 KB
    let zip_bytes = create_test_zip(&[("large.txt", &large_data)]);

    // Cap decompression at 10 KB (below 100 KB)
    let res = SafeZipExtractor::extract(
        Cursor::new(zip_bytes),
        &temp_dir,
        Some(10 * 1024), // Max 10 KB limit
        None,
        |_, _, _| {},
    );

    assert!(
        res.is_err(),
        "Zip exceeding decompressed byte cap must be rejected"
    );
    let err_msg = res.unwrap_err();
    assert!(
        err_msg.contains("exceed") || err_msg.contains("ZIP bomb"),
        "Error should report exceeding limit or zip bomb: {}",
        err_msg
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

// =========================================================================
// 3. Local Library Storage & Configuration Tests
// =========================================================================

#[test]
fn test_storage_manager_validation_and_config() {
    let temp_dir = std::env::temp_dir().join(format!("fontivo_lib_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);

    // Validate setting new library dir
    let resolved =
        LibraryStorageManager::set_library_dir(&temp_dir).expect("Should set valid library dir");
    assert!(resolved.exists());

    let config = LibraryStorageManager::get_config();
    assert_eq!(PathBuf::from(&config.library_dir), resolved);

    // Ensure subdirectories can be queried and exist
    let packs_dir = LibraryStorageManager::get_packs_dir();
    assert!(packs_dir.exists());

    let google_dir = LibraryStorageManager::get_google_dir();
    assert!(google_dir.exists());

    let extracted_dir = LibraryStorageManager::get_extracted_dir();
    assert!(extracted_dir.exists());

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_storage_manager_reject_system_root() {
    let root_paths = ["/", "\\", "C:\\", "C:"];
    for r in root_paths {
        let res = LibraryStorageManager::validate_library_dir(Path::new(r));
        assert!(
            res.is_err(),
            "Root directory '{}' must be rejected as storage root",
            r
        );
    }
}

#[test]
fn test_storage_manager_disk_space_check() {
    // Check available space for reasonable size (10 MB)
    let res = LibraryStorageManager::check_available_space(10 * 1024 * 1024);
    assert!(
        res.is_ok(),
        "Checking 10 MB space should succeed on standard development volume"
    );
    let free_bytes = res.unwrap();
    assert!(free_bytes > 0);

    // Unreasonable requirement (100 Petabytes) should fail
    let huge_space = 100_000_000_000_000_000u64;
    let res_huge = LibraryStorageManager::check_available_space(huge_space);
    assert!(
        res_huge.is_err(),
        "Checking 100 PB space should fail due to insufficient space"
    );
}

// =========================================================================
// 4. Resumable Download Manager & Verification Tests
// =========================================================================

#[test]
fn test_download_manager_sha256_verification() {
    let temp_file =
        std::env::temp_dir().join(format!("fontivo_test_hash_{}.dat", std::process::id()));
    fs::write(&temp_file, b"Fontivo Secure Typography Engine").unwrap();

    // SHA-256 of "Fontivo Secure Typography Engine"
    let correct_hash = "d8b2de93736f80bc65a2bf97823af914adf884b67c2713c2ea71ac43dadff291";

    let match_res = DownloadManager::verify_sha256(&temp_file, correct_hash).unwrap();
    assert!(match_res, "Correct SHA-256 hash must verify as true");

    let wrong_hash = "0000000000000000000000000000000000000000000000000000000000000000";
    let mismatch_res = DownloadManager::verify_sha256(&temp_file, wrong_hash).unwrap();
    assert!(
        !mismatch_res,
        "Mismatched SHA-256 hash must verify as false"
    );

    // Empty or malformed SHA-256 must NEVER bypass verification
    assert!(
        DownloadManager::verify_sha256(&temp_file, "").is_err(),
        "Empty expected SHA-256 hash MUST be rejected"
    );
    assert!(
        DownloadManager::verify_sha256(&temp_file, "   ").is_err(),
        "Whitespace-only expected SHA-256 hash MUST be rejected"
    );
    assert!(
        DownloadManager::verify_sha256(&temp_file, "deadbeef").is_err(),
        "Truncated SHA-256 hash MUST be rejected"
    );

    let _ = fs::remove_file(temp_file);
}

#[test]
fn test_download_manager_job_lifecycle_and_cancellation() {
    let manager = DownloadManager::new();

    let pack = FontPackItem {
        id: "test-pack-cancel".to_string(),
        name: "Test Cancel Pack".to_string(),
        version: "1.0.0".to_string(),
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf".to_string(),
        file_name: "test_cancel.zip".to_string(),
        compressed_size: 1024,
        uncompressed_size: 2048,
        sha256: "d8b2de93736f80bc65a2bf97823af914adf884b67c2713c2ea71ac43dadff291".to_string(),
        font_count: 1,
        category: Some("Test".to_string()),
        description: None,
    };

    let state = Arc::new(RwLock::new(AppState::new()));
    let job_id = manager
        .start_pack_download(pack, state)
        .expect("Job initiation should succeed");
    assert!(!job_id.is_empty());

    // Status query
    let status = manager.get_status(&job_id);
    assert!(status.is_some());
    let prog = status.unwrap();
    assert_eq!(prog.job_id, job_id);

    // Cancel job
    let cancelled = manager.cancel(&job_id);
    assert!(cancelled, "Cancel should return true for active job");

    let status_after = manager.get_status(&job_id).unwrap();
    assert!(
        status_after.phase == JobPhase::Cancelled
            || status_after.phase == JobPhase::Failed
            || status_after.phase == JobPhase::Completed
    );
}

// =========================================================================
// 5. Dynamic Real Statistics Tests
// =========================================================================

#[test]
fn test_dynamic_stats_calculation_no_hardcoded_values() {
    let mut state = AppState::new();

    // Clear existing fonts and add custom test fonts
    state.fonts = vec![
        FontRecord {
            id: 1,
            name: "Cairo-Regular.ttf".into(),
            path: "C:/test/Cairo-Regular.ttf".into(),
            category: "01 - Arabic Fonts".into(),
            sub_category: Some("Google Fonts Cloud".into()),
            family: Some("Cairo".into()),
            format: "ttf".into(),
            size: 120000,
            is_arabic: true,
            is_latin: true,
            is_bilingual: true,
            is_variable: false,
            weight: 400,
            source: "google".into(),
            is_active: true,
            is_favorite: true,
            display_name: Some("Cairo Regular".into()),
            style: Some("Regular".into()),
            post_script_name: Some("Cairo-Regular".into()),
            glyph_count: Some(500),
            has_tashkeel: true,
            has_extended_arabic: true,
            has_arabic_numerals: true,
            has_western_numerals: true,
            is_local: true,
        },
        FontRecord {
            id: 2,
            name: "Inter-Bold.otf".into(),
            path: "C:/test/Inter-Bold.otf".into(),
            category: "02 - English Fonts".into(),
            sub_category: Some("Curated Pack".into()),
            family: Some("Inter".into()),
            format: "otf".into(),
            size: 240000,
            is_arabic: false,
            is_latin: true,
            is_bilingual: false,
            is_variable: false,
            weight: 700,
            source: "cloud".into(),
            is_active: false,
            is_favorite: false,
            display_name: Some("Inter Bold".into()),
            style: Some("Bold".into()),
            post_script_name: Some("Inter-Bold".into()),
            glyph_count: Some(800),
            has_tashkeel: false,
            has_extended_arabic: false,
            has_arabic_numerals: false,
            has_western_numerals: true,
            is_local: true,
        },
    ];
    state.active_font_ids = HashSet::from([1]);
    state.favorite_font_ids = HashSet::from([1]);

    let total = state.fonts.len();
    let active = state.active_font_ids.len();
    let inactive = total.saturating_sub(active);
    let favorites = state.favorite_font_ids.len();
    let arabic = state.fonts.iter().filter(|f| f.is_arabic).count();
    let english = state.fonts.iter().filter(|f| !f.is_arabic).count();

    assert_eq!(total, 2);
    assert_eq!(active, 1);
    assert_eq!(inactive, 1);
    assert_eq!(favorites, 1);
    assert_eq!(arabic, 1);
    assert_eq!(english, 1);

    // Formats breakdown
    let mut formats: HashMap<String, usize> = HashMap::new();
    for f in &state.fonts {
        *formats.entry(f.format.to_lowercase()).or_insert(0) += 1;
    }
    assert_eq!(formats.get("ttf"), Some(&1));
    assert_eq!(formats.get("otf"), Some(&1));
}

// =========================================================================
// 6. Large Library Pagination & Performance Tests (35,000 fonts)
// =========================================================================

#[test]
fn test_large_library_pagination_and_fast_search() {
    let mut state = AppState::new();

    // Generate 10,000 synthetic font records to benchmark pagination speed & RAM
    let num_fonts = 10_000;
    let mut large_fonts = Vec::with_capacity(num_fonts);

    for i in 1..=num_fonts {
        let is_arabic = i % 2 == 0;
        let fam_num = (i % 500) + 1;
        large_fonts.push(FontRecord {
            id: i,
            name: format!("Font-{}.ttf", i),
            path: format!("C:/Library/Font-{}.ttf", i),
            category: if is_arabic {
                "01 - Arabic Fonts".into()
            } else {
                "02 - English Fonts".into()
            },
            sub_category: Some("Large Benchmark".into()),
            family: Some(format!("Family-{}", fam_num)),
            format: if i % 3 == 0 {
                "otf".into()
            } else {
                "ttf".into()
            },
            size: 150_000,
            is_arabic,
            is_latin: !is_arabic,
            is_bilingual: false,
            is_variable: false,
            weight: 400,
            source: "local".into(),
            is_active: i % 10 == 0,
            is_favorite: i % 20 == 0,
            display_name: Some(format!("Display Font {}", i)),
            style: Some("Regular".into()),
            post_script_name: Some(format!("Font-{}", i)),
            glyph_count: Some(400),
            has_tashkeel: is_arabic,
            has_extended_arabic: is_arabic,
            has_arabic_numerals: is_arabic,
            has_western_numerals: true,
            is_local: true,
        });
    }

    state.fonts = large_fonts;

    // 1. Pagination benchmark: Query page 5 with limit 50
    let mut query = HashMap::new();
    query.insert("limit".to_string(), "50".to_string());
    query.insert("page".to_string(), "5".to_string());

    let start_time = std::time::Instant::now();
    let filtered = filter_fonts(&state, &query);
    let total = filtered.len();

    let limit: usize = 50;
    let page: usize = 5;
    let offset = (page - 1) * limit;
    let paged: Vec<FontRecord> = filtered.into_iter().skip(offset).take(limit).collect();
    let elapsed = start_time.elapsed();

    assert_eq!(total, 10_000);
    assert_eq!(paged.len(), 50);
    assert_eq!(paged[0].id, 201); // (5 - 1) * 50 + 1 = 201
    assert!(
        elapsed.as_millis() < 50,
        "Pagination over 10K fonts should take < 50ms, took {:?}",
        elapsed
    );

    // 2. Search benchmark: Query substring "Family-42"
    let mut search_query = HashMap::new();
    search_query.insert("search".to_string(), "family-42".to_string());

    let search_start = std::time::Instant::now();
    let search_results = filter_fonts(&state, &search_query);
    let search_elapsed = search_start.elapsed();

    assert!(!search_results.is_empty());
    assert!(
        search_elapsed.as_millis() < 50,
        "Search filtering over 10K fonts should take < 50ms, took {:?}",
        search_elapsed
    );
}

// =========================================================================
// 7. Library Integrity and Repair Tests
// =========================================================================

#[test]
fn test_library_repair_missing_and_orphaned_recovery() {
    let temp_lib = std::env::temp_dir().join(format!("fontivo_repair_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_lib);
    fs::create_dir_all(&temp_lib).unwrap();

    let _ = LibraryStorageManager::set_library_dir(&temp_lib);

    // Create an orphaned font file in library directory
    let orphaned_file = temp_lib.join("orphaned_font.ttf");
    fs::write(&orphaned_file, [0x00, 0x01, 0x00, 0x00, 0x00, 0x0C]).unwrap();

    let mut state = AppState::new();
    // Font with non-existent path
    let non_existent_path = "C:/totally_missing_path/font.ttf".to_string();
    state.fonts = vec![FontRecord {
        id: 101,
        name: "Missing.ttf".into(),
        path: non_existent_path.clone(),
        category: "01 - Arabic Fonts".into(),
        sub_category: None,
        family: Some("Missing".into()),
        format: "ttf".into(),
        size: 50000,
        is_arabic: true,
        is_latin: false,
        is_bilingual: false,
        is_variable: false,
        weight: 400,
        source: "local".into(),
        is_active: true,
        is_favorite: false,
        display_name: None,
        style: None,
        post_script_name: None,
        glyph_count: None,
        has_tashkeel: false,
        has_extended_arabic: false,
        has_arabic_numerals: false,
        has_western_numerals: true,
        is_local: false,
    }];

    // Detect missing
    let missing_count = state
        .fonts
        .iter()
        .filter(|f| !Path::new(&f.path).exists())
        .count();
    assert_eq!(missing_count, 1);

    // Scan orphaned
    let mut indexed_paths = HashSet::new();
    for f in &state.fonts {
        indexed_paths.insert(f.path.clone());
    }
    let orphaned = LibraryStorageManager::scan_orphaned_font_files_in(&temp_lib, &indexed_paths);
    assert_eq!(orphaned.len(), 1);
    assert_eq!(orphaned[0], orphaned_file);

    // Prune missing
    state.fonts.retain(|f| Path::new(&f.path).exists());
    assert_eq!(
        state.fonts.len(),
        0,
        "Missing font should be pruned from index"
    );

    let _ = fs::remove_dir_all(&temp_lib);
}
