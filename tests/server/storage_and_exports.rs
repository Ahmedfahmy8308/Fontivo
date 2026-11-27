use std::fs;
use std::io::{Cursor, Read};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use Fontivo::server::api_server::ApiServer;
use Fontivo::server::state::{AppState, FontRecord};
use Fontivo::updater::AutoUpdater;

fn allocate_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

fn resp_json(resp: ureq::Response) -> serde_json::Value {
    let text = resp.into_string().expect("failed to read response body");
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("invalid JSON '{}': {}", text, e))
}

fn make_temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("{}_{}_{}", prefix, std::process::id(), nanos));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn copy_real_ttf(dest: &Path, candidate_idx: usize) {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let candidates = [
        Path::new("C:\\Windows\\Fonts\\tahoma.ttf"),
        Path::new("C:\\Windows\\Fonts\\arial.ttf"),
        Path::new("C:\\Windows\\Fonts\\segoeui.ttf"),
        Path::new("C:\\Windows\\Fonts\\calibri.ttf"),
        Path::new("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ];
    let mut existing: Vec<&Path> = candidates.iter().copied().filter(|p| p.is_file()).collect();
    if existing.is_empty() {
        fs::write(dest, [0x00, 0x01, 0x00, 0x00, 0x00, 0x0C]).unwrap();
        return;
    }
    let chosen = existing.remove(candidate_idx % existing.len());
    fs::copy(chosen, dest).unwrap();
}

fn start_isolated_server(state: AppState) -> (String, Arc<RwLock<AppState>>) {
    let port = allocate_free_port();
    let state_arc = Arc::new(RwLock::new(state));
    ApiServer::start(
        Arc::clone(&state_arc),
        port,
        PathBuf::from("nonexistent_dist"),
        None,
    );
    std::thread::sleep(Duration::from_millis(120));
    (format!("http://127.0.0.1:{}", port), state_arc)
}

#[test]
fn test_preview_folder_custom_import_rename_and_export_zip() {
    let temp_data = make_temp_dir("fontivo_slice_flow_test");
    let src_dir = make_temp_dir("fontivo_slice_src_test");

    // Prepare source folder:
    // - font_a.ttf (valid new font #1)
    // - font_a_dup.ttf (exact byte duplicate of font_a.ttf -> batch SHA-256 duplicate)
    // - font_b.ttf (valid font already indexed in state -> existing duplicate)
    // - corrupt.ttf (invalid OpenType header -> invalidCount)
    let font_a = src_dir.join("font_a.ttf");
    let font_a_dup = src_dir.join("font_a_dup.ttf");
    let font_b = src_dir.join("font_b.ttf");
    let corrupt = src_dir.join("corrupt.ttf");

    copy_real_ttf(&font_a, 0);
    fs::copy(&font_a, &font_a_dup).unwrap();
    copy_real_ttf(&font_b, 1);
    fs::write(&corrupt, b"NOT_A_VALID_FONT_FILE_HEADER").unwrap();

    // Seed AppState with an existing copy of font_b in Fonts/Custom
    let existing_b = temp_data.join("Fonts").join("Custom").join("existing_b.ttf");
    fs::create_dir_all(existing_b.parent().unwrap()).unwrap();
    fs::copy(&font_b, &existing_b).unwrap();
    let existing_b_size = fs::metadata(&existing_b).unwrap().len() as usize;

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.fonts.clear();
    state.collections.clear();
    state.active_font_ids.clear();
    state.fonts.push(FontRecord {
        id: 1,
        name: "existing_b.ttf".to_string(),
        path: existing_b.to_string_lossy().to_string(),
        category: "02 - English Fonts".to_string(),
        sub_category: Some("Custom Fonts".to_string()),
        family: Some("ExistingB".to_string()),
        format: "TTF".to_string(),
        size: existing_b_size,
        is_arabic: false,
        is_latin: true,
        is_bilingual: false,
        is_variable: false,
        weight: 400,
        source: "local".to_string(),
        is_active: false,
        is_favorite: false,
        display_name: Some("ExistingB Regular".to_string()),
        style: Some("Regular".to_string()),
        post_script_name: Some("ExistingB-Regular".to_string()),
        glyph_count: Some(100),
        has_tashkeel: false,
        has_extended_arabic: false,
        has_arabic_numerals: false,
        has_western_numerals: true,
        is_local: true,
    });

    let (base, state_arc) = start_isolated_server(state);

    // 1. Preview folder: must count accurately without copying or mutating state
    let preview_resp = ureq::post(&format!("{}/api/fonts/preview-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({ "folderPath": src_dir.to_string_lossy() }).to_string(),
        )
        .expect("POST /api/fonts/preview-folder should succeed");
    assert_eq!(preview_resp.status(), 200);
    let preview = resp_json(preview_resp);
    assert_eq!(preview["success"], true);
    assert_eq!(preview["totalFiles"], 4);
    assert_eq!(preview["newCount"], 1);
    assert_eq!(preview["duplicateCount"], 2);
    assert_eq!(preview["invalidCount"], 1);
    let expected_bytes = fs::metadata(&font_a).unwrap().len()
        + fs::metadata(&font_a_dup).unwrap().len()
        + fs::metadata(&font_b).unwrap().len()
        + fs::metadata(&corrupt).unwrap().len();
    assert_eq!(preview["totalBytes"].as_u64().unwrap(), expected_bytes);
    assert_eq!(state_arc.read().unwrap().fonts.len(), 1);
    assert!(!temp_data.join("Fonts").join("Imported").join("Client Brand Pack").exists());

    // Reject traversal & non-existent folder in preview
    let bad_preview = ureq::post(&format!("{}/api/fonts/preview-folder", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "folderPath": "../secret" }).to_string());
    assert!(matches!(bad_preview, Err(ureq::Error::Status(400, _))));

    // 2. Import folder with customFolderName
    let import_resp = ureq::post(&format!("{}/api/import-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "folderPath": src_dir.to_string_lossy(),
                "customFolderName": "Client Brand Pack"
            })
            .to_string(),
        )
        .expect("POST /api/import-folder with customFolderName should succeed");
    assert_eq!(import_resp.status(), 200);
    let imported = resp_json(import_resp);
    assert_eq!(imported["success"], true);
    assert_eq!(imported["folderName"], "Client Brand Pack");
    assert_eq!(imported["importedCount"], 1);
    assert_eq!(imported["skippedDuplicatesCount"], 2);
    assert_eq!(imported["skippedInvalidCount"], 1);

    let slice_dir = temp_data
        .join("Fonts")
        .join("Imported")
        .join("Client Brand Pack");
    assert!(slice_dir.is_dir(), "Custom slice folder must exist on disk");

    // 3. Rename imported slice folder
    // Security rejections first:
    for (old_p, new_n) in [
        ("../Custom", "ValidName"),
        (&temp_data.join("Fonts").join("Custom").to_string_lossy().to_string(), "ValidName"),
        (&temp_data.join("Fonts").join("Imported").to_string_lossy().to_string(), "ValidName"),
        (&slice_dir.to_string_lossy().to_string(), "../Escape"),
        (&slice_dir.to_string_lossy().to_string(), "CON"),
        (&slice_dir.to_string_lossy().to_string(), "Bad/Name"),
    ] {
        let rej = ureq::post(&format!("{}/api/fonts/rename-folder", base))
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "oldPath": old_p, "newName": new_n }).to_string());
        assert!(
            matches!(rej, Err(ureq::Error::Status(400, _))),
            "Expected 400 for rename ({}, {}), got {:?}",
            old_p,
            new_n,
            rej
        );
    }

    let rename_resp = ureq::post(&format!("{}/api/fonts/rename-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "oldPath": slice_dir.to_string_lossy(),
                "newName": "Renamed Brand Pack"
            })
            .to_string(),
        )
        .expect("POST /api/fonts/rename-folder should succeed");
    assert_eq!(rename_resp.status(), 200);
    let renamed = resp_json(rename_resp);
    assert_eq!(renamed["success"], true);
    assert_eq!(renamed["oldName"], "Client Brand Pack");
    assert_eq!(renamed["newName"], "Renamed Brand Pack");
    assert_eq!(renamed["updatedCount"], 1);

    let renamed_dir = temp_data
        .join("Fonts")
        .join("Imported")
        .join("Renamed Brand Pack");
    assert!(!slice_dir.exists());
    assert!(renamed_dir.is_dir());

    // Verify state, collection, and persisted user-library-index.json
    {
        let st = state_arc.read().unwrap();
        let imported_font = st
            .fonts
            .iter()
            .find(|f| f.id != 1)
            .expect("imported font must exist in state");
        assert!(
            imported_font.path.contains("Renamed Brand Pack"),
            "Font path must be updated: {}",
            imported_font.path
        );
        assert_eq!(
            imported_font.sub_category.as_deref(),
            Some("Imported · Renamed Brand Pack")
        );
        assert!(st.collections.contains_key("Renamed Brand Pack"));
        assert!(!st.collections.contains_key("Client Brand Pack"));
    }
    let persisted_index = fs::read_to_string(temp_data.join("user-library-index.json"))
        .expect("user-library-index.json must be persisted");
    assert!(persisted_index.contains("Renamed Brand Pack"));
    assert!(!persisted_index.contains("Client Brand Pack"));

    // 4. Export folder slice as ZIP
    let export_resp = ureq::get(&format!(
        "{}/api/fonts/export-folder?path=Imported/Renamed%20Brand%20Pack",
        base
    ))
    .call()
    .expect("GET /api/fonts/export-folder should succeed");
    assert_eq!(export_resp.status(), 200);
    assert_eq!(export_resp.header("Content-Type"), Some("application/zip"));
    let disp = export_resp
        .header("Content-Disposition")
        .unwrap_or("")
        .to_string();
    assert!(disp.contains("attachment") && disp.contains(".zip"));

    let mut zip_bytes = Vec::new();
    export_resp.into_reader().read_to_end(&mut zip_bytes).unwrap();
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes))
        .expect("exported bytes must be a valid ZIP archive");
    assert_eq!(archive.len(), 1);
    let entry_name = archive.by_index(0).unwrap().name().to_string();
    assert!(
        entry_name.ends_with("font_a.ttf"),
        "Unexpected ZIP entry: {}",
        entry_name
    );

    // Export folder security rejections
    for bad_path in ["../Workspaces", "C:\\Windows\\Fonts", &src_dir.to_string_lossy()] {
        let rej = ureq::get(&format!(
            "{}/api/fonts/export-folder?path={}",
            base,
            bad_path.replace(' ', "%20")
        ))
        .call();
        assert!(
            matches!(rej, Err(ureq::Error::Status(400 | 403, _))),
            "Expected 400/403 for export path '{}', got {:?}",
            bad_path,
            rej
        );
    }

    let _ = fs::remove_dir_all(&temp_data);
    let _ = fs::remove_dir_all(&src_dir);
}

#[test]
fn test_system_storage_breakdown_and_cache_cleanup() {
    let temp_data = make_temp_dir("fontivo_storage_test");

    let write_file = |rel: &str, bytes: &[u8]| {
        let p = temp_data.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, bytes).unwrap();
    };

    write_file("Fonts/Imported/PackA/a.ttf", &[1u8; 100]);
    write_file("Fonts/Custom/b.ttf", &[2u8; 250]);
    write_file("Fonts/Google/c.ttf", &[3u8; 300]);
    write_file("Fonts/Packs/pack-001/d.ttf", &[4u8; 400]);
    write_file("Cache/PackArchives/leftover.zip", &[5u8; 500]);
    write_file("Cache/PackArchives/partial.part", &[6u8; 150]);
    write_file("Cache/PackArchives/keep.txt", &[7u8; 50]);
    write_file("Workspaces/ws1/workspace.yaml", &[8u8; 80]);
    write_file("Backups/backup.reg", &[9u8; 120]);

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.fonts.clear();
    let (base, _state_arc) = start_isolated_server(state);

    // 1. Verify exact breakdown before cleanup
    let resp = ureq::get(&format!("{}/api/system/storage", base))
        .call()
        .expect("GET /api/system/storage should succeed");
    assert_eq!(resp.status(), 200);
    let body = resp_json(resp);
    assert_eq!(body["success"], true);
    assert_eq!(body["imported"]["bytes"], 100);
    assert_eq!(body["imported"]["fileCount"], 1);
    assert_eq!(body["custom"]["bytes"], 250);
    assert_eq!(body["custom"]["fileCount"], 1);
    assert_eq!(body["google"]["bytes"], 300);
    assert_eq!(body["google"]["fileCount"], 1);
    assert_eq!(body["packs"]["bytes"], 400);
    assert_eq!(body["packs"]["fileCount"], 1);
    assert_eq!(body["cache"]["bytes"], 700);
    assert_eq!(body["cache"]["fileCount"], 3);
    assert_eq!(body["workspaces"]["bytes"], 80);
    assert_eq!(body["workspaces"]["fileCount"], 1);
    assert_eq!(body["backups"]["bytes"], 120);
    assert_eq!(body["backups"]["fileCount"], 1);
    assert_eq!(body["totalBytes"], 100 + 250 + 300 + 400 + 700 + 80 + 120);

    // 2. Run cache cleanup
    let clean_resp = ureq::post(&format!("{}/api/system/storage/cleanup", base))
        .send_string("{}")
        .expect("POST /api/system/storage/cleanup should succeed");
    assert_eq!(clean_resp.status(), 200);
    let cleaned = resp_json(clean_resp);
    assert_eq!(cleaned["success"], true);
    assert_eq!(cleaned["freedBytes"], 650);
    assert_eq!(cleaned["removedFiles"], 2);

    assert!(!temp_data.join("Cache/PackArchives/leftover.zip").exists());
    assert!(!temp_data.join("Cache/PackArchives/partial.part").exists());
    assert!(temp_data.join("Cache/PackArchives/keep.txt").is_file());

    // 3. Re-query storage after cleanup
    let after = resp_json(
        ureq::get(&format!("{}/api/system/storage", base))
            .call()
            .unwrap(),
    );
    assert_eq!(after["cache"]["bytes"], 50);
    assert_eq!(after["cache"]["fileCount"], 1);

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_workspace_export_zip_handover_bundle() {
    let temp_data = make_temp_dir("fontivo_ws_zip_test");
    let custom_font = temp_data
        .join("Fonts")
        .join("Custom")
        .join("BrandSans.ttf");
    copy_real_ttf(&custom_font, 0);

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.fonts.clear();
    state.fonts.push(FontRecord {
        id: 77,
        name: "BrandSans.ttf".to_string(),
        path: custom_font.to_string_lossy().to_string(),
        category: "02 - English Fonts".to_string(),
        sub_category: Some("Custom Fonts".to_string()),
        family: Some("BrandSans".to_string()),
        format: "TTF".to_string(),
        size: fs::metadata(&custom_font).unwrap().len() as usize,
        is_arabic: false,
        is_latin: true,
        is_bilingual: false,
        is_variable: false,
        weight: 400,
        source: "local".to_string(),
        is_active: false,
        is_favorite: false,
        display_name: Some("BrandSans Regular".to_string()),
        style: Some("Regular".to_string()),
        post_script_name: Some("BrandSans-Regular".to_string()),
        glyph_count: Some(128),
        has_tashkeel: false,
        has_extended_arabic: false,
        has_arabic_numerals: false,
        has_western_numerals: true,
        is_local: true,
    });

    let (base, _state_arc) = start_isolated_server(state);
    let ws_id = "acme-brand-2026";
    let ws_root = temp_data.join("Workspaces").join(ws_id);

    let payload = serde_json::json!({
        "id": ws_id,
        "name": "Acme Brand 2026",
        "client": "Acme Corp",
        "folderPath": ws_root.to_string_lossy(),
        "typography": {
            "headingFont": {
                "name": "BrandSans.ttf",
                "fontId": 77,
                "family": "BrandSans"
            }
        },
        "palette": [
            { "name": "Primary Coral", "hex": "#F16B50", "role": "primary" }
        ]
    });

    let save_resp = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(&payload.to_string())
        .expect("POST /api/workspaces should succeed");
    assert_eq!(save_resp.status(), 200);

    // Add a design file inside Designs/Social/banner.png
    let design_file = ws_root.join("Designs").join("Social").join("banner.png");
    fs::create_dir_all(design_file.parent().unwrap()).unwrap();
    fs::write(&design_file, b"\x89PNG\r\n\x1a\nFAKE_BANNER").unwrap();

    // Fetch handover ZIP
    let zip_resp = ureq::get(&format!("{}/api/workspaces/{}/export-zip", base, ws_id))
        .call()
        .expect("GET /api/workspaces/:id/export-zip should succeed");
    assert_eq!(zip_resp.status(), 200);
    assert_eq!(zip_resp.header("Content-Type"), Some("application/zip"));
    let disp = zip_resp
        .header("Content-Disposition")
        .unwrap_or("")
        .to_string();
    assert!(
        disp.contains("attachment") && disp.contains("acme-brand-2026-handover.zip"),
        "Unexpected Content-Disposition: {}",
        disp
    );

    let mut zip_bytes = Vec::new();
    zip_resp.into_reader().read_to_end(&mut zip_bytes).unwrap();
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes))
        .expect("handover response must be a valid ZIP archive");

    let mut names = Vec::new();
    for i in 0..archive.len() {
        names.push(archive.by_index(i).unwrap().name().to_string());
    }
    assert!(
        names.iter().any(|n| n.starts_with("Fonts/") && n.ends_with(".ttf")),
        "ZIP must contain Fonts/*.ttf; got {:?}",
        names
    );
    assert!(
        names.iter().any(|n| n == "Palettes/palette.ase"),
        "ZIP must contain Palettes/palette.ase; got {:?}",
        names
    );
    assert!(
        names.iter().any(|n| n == "Guidelines/styleguide.html"),
        "ZIP must contain Guidelines/styleguide.html; got {:?}",
        names
    );
    assert!(
        names.iter().any(|n| n == "Designs/Social/banner.png"),
        "ZIP must contain Designs/Social/banner.png; got {:?}",
        names
    );

    // Reject invalid traversal workspace ID and unknown workspace ID
    let bad_id = ureq::get(&format!("{}/api/workspaces/..%2Fetc/export-zip", base)).call();
    assert!(matches!(bad_id, Err(ureq::Error::Status(400, _))));

    let missing_id = ureq::get(&format!("{}/api/workspaces/does-not-exist/export-zip", base)).call();
    assert!(matches!(missing_id, Err(ureq::Error::Status(404, _))));

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_updater_official_website_fallback_urls() {
    assert_eq!(
        AutoUpdater::DEFAULT_MANIFEST_URL,
        "https://api.github.com/repos/Ahmedfahmy8308/Fontivo/releases/latest"
    );
    assert_eq!(
        AutoUpdater::DEFAULT_FALLBACK_MANIFEST_URL,
        "https://fontivo-app.github.io/api/manifest.json"
    );
    assert_eq!(
        AutoUpdater::SECONDARY_FALLBACK_MANIFEST_URL,
        "https://ahmedfahmy8308.github.io/Fontivo-Site/api/manifest.json"
    );
}
