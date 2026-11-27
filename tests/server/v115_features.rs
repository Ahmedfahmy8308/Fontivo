use std::fs;
use std::io::{Cursor, Read};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use Fontivo::server::api_server::ApiServer;
use Fontivo::server::state::AppState;
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
        Path::new("C:\\Windows\\Fonts\\consola.ttf"),
        Path::new("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ];
    let existing: Vec<&Path> = candidates.iter().copied().filter(|p| p.is_file()).collect();
    if !existing.is_empty() {
        let src = existing[candidate_idx % existing.len()];
        fs::copy(src, dest).unwrap();
        return;
    }
    fs::write(dest, [0x00, 0x01, 0x00, 0x00, 0x00, 0x0C]).unwrap();
}

fn start_isolated_server(temp_data: &Path) -> (String, Arc<RwLock<AppState>>) {
    let mut state = AppState::new();
    state.data_dir = temp_data.to_path_buf();
    state.fonts.clear();
    state.active_font_ids.clear();
    state.collections.clear();
    state.ensure_directory_layout();

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
fn test_canonical_website_url_sync() {
    assert_eq!(
        AutoUpdater::DEFAULT_FALLBACK_MANIFEST_URL,
        "https://fontivo-app.github.io/api/manifest.json"
    );
    assert!(AutoUpdater::DEFAULT_MANIFEST_URL.contains("Ahmedfahmy8308/Fontivo"));
}

#[test]
fn test_folder_preview_custom_import_rename_and_zip_export() {
    let temp_data = make_temp_dir("fontivo_v115_folder_ops");
    let source_dir = make_temp_dir("fontivo_v115_src_pack");
    copy_real_ttf(&source_dir.join("BrandFont.ttf"), 0);
    // Exact byte duplicate inside the same source folder
    copy_real_ttf(&source_dir.join("BrandFont_dup.ttf"), 0);
    // Corrupted/invalid font file
    fs::write(source_dir.join("Corrupt.ttf"), b"not-a-valid-opentype-file").unwrap();

    let (base, state_arc) = start_isolated_server(&temp_data);

    // 1. POST /api/fonts/preview-folder (dry-run, no copy)
    let preview_resp = ureq::post(&format!("{}/api/fonts/preview-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({ "folderPath": source_dir.to_string_lossy() }).to_string(),
        )
        .expect("preview-folder should return 200");
    let preview = resp_json(preview_resp);
    assert_eq!(preview["success"], true);
    assert_eq!(preview["totalScanned"], 3);
    assert_eq!(preview["newCount"], 1);
    assert_eq!(preview["duplicateCount"], 1);
    assert_eq!(preview["invalidCount"], 1);
    assert!(preview["totalBytes"].as_u64().unwrap_or(0) > 0);
    assert!(!preview["suggestedName"].as_str().unwrap_or("").is_empty());
    assert!(
        preview["sampleFamilies"]
            .as_array()
            .map(|a| !a.is_empty())
            .unwrap_or(false),
        "sampleFamilies should contain at least one discovered family"
    );
    // Verify preview did NOT mutate AppState
    assert_eq!(state_arc.read().unwrap().fonts.len(), 0);

    // 2. POST /api/import-folder with customFolderName
    let import_resp = ureq::post(&format!("{}/api/import-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "folderPath": source_dir.to_string_lossy(),
                "customFolderName": "Client Brand Pack"
            })
            .to_string(),
        )
        .expect("import-folder with customFolderName should return 200");
    let imported = resp_json(import_resp);
    assert_eq!(imported["success"], true);
    assert_eq!(imported["folderName"], "Client Brand Pack");
    assert_eq!(imported["importedCount"], 1);
    assert_eq!(imported["skippedDuplicatesCount"], 1);
    assert_eq!(imported["skippedInvalidCount"], 1);

    let managed_path = imported["managedPath"].as_str().unwrap().to_string();
    assert!(Path::new(&managed_path).is_dir());
    assert!(managed_path.contains("Client Brand Pack"));
    assert!(state_arc
        .read()
        .unwrap()
        .collections
        .contains_key("Client Brand Pack"));

    // Previewing the same folder again now reports 0 new and 2 duplicates
    let preview2 = resp_json(
        ureq::post(&format!("{}/api/fonts/preview-folder", base))
            .set("Content-Type", "application/json")
            .send_string(
                &serde_json::json!({ "folderPath": source_dir.to_string_lossy() }).to_string(),
            )
            .expect("second preview-folder should return 200"),
    );
    assert_eq!(preview2["newCount"], 0);
    assert_eq!(preview2["duplicateCount"], 2);
    assert_eq!(preview2["invalidCount"], 1);

    // 3. POST /api/fonts/rename-folder — security checks (traversal & protected dirs)
    let bad_traversal = ureq::post(&format!("{}/api/fonts/rename-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({ "folderPath": "../Custom", "newName": "Hacked" }).to_string(),
        );
    assert!(matches!(bad_traversal, Err(ureq::Error::Status(400, _))));

    let bad_custom = ureq::post(&format!("{}/api/fonts/rename-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "folderPath": temp_data.join("Fonts").join("Custom").to_string_lossy(),
                "newName": "RenamedCustom"
            })
            .to_string(),
        );
    assert!(matches!(bad_custom, Err(ureq::Error::Status(400, _))));

    // Valid rename of direct subfolder under Fonts/Imported/
    let rename_resp = ureq::post(&format!("{}/api/fonts/rename-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "folderPath": managed_path,
                "newName": "Renamed Brand Pack"
            })
            .to_string(),
        )
        .expect("rename-folder should succeed");
    let renamed = resp_json(rename_resp);
    assert_eq!(renamed["success"], true);
    assert_eq!(renamed["oldName"], "Client Brand Pack");
    assert_eq!(renamed["newName"], "Renamed Brand Pack");
    assert_eq!(renamed["updatedCount"], 1);
    let new_managed_path = renamed["newPath"].as_str().unwrap().to_string();
    assert!(Path::new(&new_managed_path).is_dir());
    assert!(!Path::new(&managed_path).exists());
    {
        let st = state_arc.read().unwrap();
        assert!(st.fonts[0].path.contains("Renamed Brand Pack"));
        assert!(!st.collections.contains_key("Client Brand Pack"));
        assert!(st.collections.contains_key("Renamed Brand Pack"));
    }

    // 4. GET /api/fonts/export-folder?folderPath=... (ZIP download + security)
    let export_url = format!(
        "{}/api/fonts/export-folder?folderPath={}",
        base, "Fonts/Imported/Renamed%20Brand%20Pack"
    );
    let export_resp = ureq::get(&export_url)
        .call()
        .expect("export-folder should return 200 ZIP");
    assert_eq!(
        export_resp.header("Content-Type").unwrap_or(""),
        "application/zip"
    );
    assert!(export_resp
        .header("Content-Disposition")
        .unwrap_or("")
        .contains("attachment; filename="));

    let mut zip_bytes = Vec::new();
    export_resp.into_reader().read_to_end(&mut zip_bytes).unwrap();
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).expect("valid ZIP archive");
    assert_eq!(archive.len(), 1);
    let entry_name = archive.by_index(0).unwrap().name().to_string();
    assert!(entry_name.ends_with(".ttf"));

    // Protected dir export (Fonts/Packs or Fonts/Imported root) must be rejected
    let bad_export = ureq::get(&format!(
        "{}/api/fonts/export-folder?folderPath=Fonts/Packs",
        base
    ))
    .call();
    assert!(matches!(bad_export, Err(ureq::Error::Status(403, _))));

    let bad_imported_root = ureq::get(&format!(
        "{}/api/fonts/export-folder?folderPath=Fonts/Imported",
        base
    ))
    .call();
    assert!(matches!(bad_imported_root, Err(ureq::Error::Status(403, _))));

    let _ = fs::remove_dir_all(&temp_data);
    let _ = fs::remove_dir_all(&source_dir);
}

#[test]
fn test_storage_breakdown_and_safe_cache_cleanup() {
    let temp_data = make_temp_dir("fontivo_v115_storage");
    let (base, _state_arc) = start_isolated_server(&temp_data);

    // Populate deterministic files across every tracked bucket
    fs::write(
        temp_data.join("Fonts").join("Imported").join("a.ttf"),
        vec![1u8; 100],
    )
    .unwrap();
    fs::write(
        temp_data.join("Fonts").join("Custom").join("b.ttf"),
        vec![2u8; 200],
    )
    .unwrap();
    fs::write(
        temp_data.join("Fonts").join("Google").join("c.ttf"),
        vec![3u8; 300],
    )
    .unwrap();
    fs::write(
        temp_data.join("Fonts").join("Packs").join("d.ttf"),
        vec![4u8; 400],
    )
    .unwrap();
    fs::write(temp_data.join("Backups").join("bk.reg"), vec![5u8; 50]).unwrap();
    fs::write(
        temp_data.join("Workspaces").join("ws.json"),
        vec![6u8; 60],
    )
    .unwrap();

    let archives_dir = temp_data.join("Cache").join("PackArchives");
    fs::write(archives_dir.join("pack1.zip"), vec![7u8; 500]).unwrap();
    fs::write(archives_dir.join("pack2.part"), vec![8u8; 250]).unwrap();
    fs::write(archives_dir.join("temp_dl.tmp"), vec![9u8; 150]).unwrap();
    // Non-temp marker file should NOT be deleted by cleanup-cache
    fs::write(archives_dir.join("keep.txt"), vec![10u8; 40]).unwrap();

    // 1. GET /api/system/storage-breakdown
    let breakdown = resp_json(
        ureq::get(&format!("{}/api/system/storage-breakdown", base))
            .call()
            .expect("storage-breakdown should return 200"),
    );
    assert_eq!(breakdown["success"], true);
    assert_eq!(breakdown["imported"]["bytes"], 100);
    assert_eq!(breakdown["imported"]["fileCount"], 1);
    assert_eq!(breakdown["custom"]["bytes"], 200);
    assert_eq!(breakdown["google"]["bytes"], 300);
    assert_eq!(breakdown["packs"]["bytes"], 400);
    assert_eq!(breakdown["backups"]["bytes"], 50);
    assert_eq!(breakdown["workspaces"]["bytes"], 60);
    assert_eq!(breakdown["cache"]["bytes"], 940);
    assert_eq!(breakdown["cache"]["fileCount"], 4);
    assert_eq!(breakdown["totalBytes"], 100 + 200 + 300 + 400 + 50 + 60 + 940);

    // 2. POST /api/system/cleanup-cache
    let cleanup = resp_json(
        ureq::post(&format!("{}/api/system/cleanup-cache", base))
            .send_string("{}")
            .expect("cleanup-cache should return 200"),
    );
    assert_eq!(cleanup["success"], true);
    assert_eq!(cleanup["removedFiles"], 3);
    assert_eq!(cleanup["freedBytes"], 500 + 250 + 150);
    assert!(!archives_dir.join("pack1.zip").exists());
    assert!(!archives_dir.join("pack2.part").exists());
    assert!(!archives_dir.join("temp_dl.tmp").exists());
    assert!(archives_dir.join("keep.txt").exists());

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_workspace_handover_zip_bundle_export() {
    let temp_data = make_temp_dir("fontivo_v115_ws_bundle");
    let (base, _state_arc) = start_isolated_server(&temp_data);

    let ws_id = "acme-brand-2026";
    let ws_root = temp_data.join("Workspaces").join(ws_id);
    fs::create_dir_all(ws_root.join("Fonts")).unwrap();
    fs::create_dir_all(ws_root.join("Palettes")).unwrap();
    fs::create_dir_all(ws_root.join("Guidelines")).unwrap();
    fs::create_dir_all(ws_root.join("Designs").join("Social")).unwrap();

    copy_real_ttf(&ws_root.join("Fonts").join("AcmeHeading.ttf"), 0);
    fs::write(ws_root.join("Designs").join("Social").join("hero.png"), b"PNGDATA").unwrap();

    // Save workspace via API so palette.ase and styleguide.html can be generated/persisted
    let payload = serde_json::json!({
        "id": ws_id,
        "name": "Acme Brand",
        "client": "Acme Corp",
        "folderPath": ws_root.to_string_lossy(),
        "palette": [
            { "name": "Primary", "hex": "#F16B50", "role": "primary" },
            { "name": "Ink", "hex": "#130C16", "role": "text" }
        ]
    });
    let save_resp = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(&payload.to_string())
        .expect("POST /api/workspaces should succeed");
    assert_eq!(save_resp.status(), 200);

    // 1. GET /api/workspaces/:id/export-bundle
    let bundle_resp = ureq::get(&format!("{}/api/workspaces/{}/export-bundle", base, ws_id))
        .call()
        .expect("GET /api/workspaces/:id/export-bundle should return 200");
    assert_eq!(
        bundle_resp.header("Content-Type").unwrap_or(""),
        "application/zip"
    );
    assert_eq!(
        bundle_resp.header("Content-Disposition").unwrap_or(""),
        format!("attachment; filename=\"{}-handover.zip\"", ws_id)
    );

    let mut zip_bytes = Vec::new();
    bundle_resp.into_reader().read_to_end(&mut zip_bytes).unwrap();
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).expect("valid handover ZIP");

    let mut names: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        names.push(archive.by_index(i).unwrap().name().to_string());
    }
    assert!(
        names.iter().any(|n| n == "Fonts/AcmeHeading.ttf"),
        "ZIP must contain Fonts/AcmeHeading.ttf; got {:?}",
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
        names.iter().any(|n| n == "Designs/Social/hero.png"),
        "ZIP must contain Designs/Social/hero.png; got {:?}",
        names
    );

    // 2. Traversal ID must be rejected with 400
    let bad_id = ureq::get(&format!("{}/api/workspaces/..%2Fevil/export-bundle", base)).call();
    assert!(matches!(bad_id, Err(ureq::Error::Status(400, _))));

    // 3. Unknown workspace ID must return 404
    let missing = ureq::get(&format!("{}/api/workspaces/does-not-exist/export-bundle", base)).call();
    assert!(matches!(missing, Err(ureq::Error::Status(404, _))));

    let _ = fs::remove_dir_all(&temp_data);
}
