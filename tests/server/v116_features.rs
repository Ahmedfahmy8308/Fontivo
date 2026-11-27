use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use Fontivo::engine::{DownloadProgress, JobPhase};
use Fontivo::server::api_server::ApiServer;
use Fontivo::server::routes::workspaces::{
    import_local_design_files_into_workspace, normalize_workspace_root_folder,
    MAX_DESIGN_UPLOAD_BYTES,
};
use Fontivo::server::state::{AppState, SystemOperation};

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
    let addr = format!("127.0.0.1:{}", port);
    for _ in 0..40 {
        if std::net::TcpStream::connect(&addr).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    (format!("http://127.0.0.1:{}", port), state_arc)
}

#[test]
fn test_open_workspace_folder_prevents_nested_designs_duplication() {
    assert_eq!(
        normalize_workspace_root_folder(Some("C:\\Projects\\Brand\\Designs"), Some("Designs")),
        Some("C:\\Projects\\Brand".to_string())
    );
    assert_eq!(
        normalize_workspace_root_folder(
            Some("C:\\Projects\\Brand\\Designs\\Mockups\\"),
            Some("Designs/Mockups")
        ),
        Some("C:\\Projects\\Brand".to_string())
    );
    assert_eq!(
        normalize_workspace_root_folder(Some("C:\\Projects\\Brand\\Fonts"), None),
        Some("C:\\Projects\\Brand".to_string())
    );

    let temp_data = make_temp_dir("fontivo_v116_open_folder_data");
    let ws_root = make_temp_dir("fontivo_v116_open_folder_ws");
    let (base, _state) = start_isolated_server(&temp_data);

    // Save workspace with explicit root folderPath
    let save_resp = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": "v116-nested-test",
                "name": "Nested Guard Brand",
                "folderPath": ws_root.to_string_lossy()
            })
            .to_string(),
        )
        .expect("POST /api/workspaces should succeed");
    assert_eq!(resp_json(save_resp)["success"], true);

    // Simulate frontend sending <root>\Designs as folderPath while requesting subfolder "Designs"
    let nested_designs_arg = ws_root.join("Designs");
    let open_resp = ureq::post(&format!("{}/api/workspaces/open-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": "v116-nested-test",
                "subfolder": "Designs",
                "folderPath": nested_designs_arg.to_string_lossy()
            })
            .to_string(),
        )
        .expect("POST /api/workspaces/open-folder should succeed");
    let open_json = resp_json(open_resp);
    assert_eq!(open_json["success"], true);
    assert_eq!(
        PathBuf::from(open_json["folderPath"].as_str().unwrap()),
        ws_root.join("Designs")
    );

    // Verify NO nested Fonts/Designs/Palettes/Guidelines were created inside Designs/
    assert!(!nested_designs_arg.join("Fonts").exists());
    assert!(!nested_designs_arg.join("Designs").exists());
    assert!(!nested_designs_arg.join("Palettes").exists());
    assert!(!nested_designs_arg.join("Guidelines").exists());

    let _ = fs::remove_dir_all(&temp_data);
    let _ = fs::remove_dir_all(&ws_root);
}

#[test]
fn test_large_psd_upload_cap_streaming_and_direct_local_import() {
    assert_eq!(MAX_DESIGN_UPLOAD_BYTES, 512 * 1024 * 1024);

    let temp_data = make_temp_dir("fontivo_v116_psd_data");
    let ws_root = make_temp_dir("fontivo_v116_psd_ws");
    let src_dir = make_temp_dir("fontivo_v116_psd_src");
    let (base, state_arc) = start_isolated_server(&temp_data);

    let save_resp = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": "v116-psd-test",
                "name": "PSD Brand",
                "folderPath": ws_root.to_string_lossy()
            })
            .to_string(),
        )
        .expect("POST /api/workspaces should succeed");
    assert_eq!(resp_json(save_resp)["success"], true);

    // 1. Stream a 2 MB PSD payload via HTTP upload-design
    let mut psd_payload = b"8BPS\x00\x01\x00\x00\x00\x00\x00\x00".to_vec();
    psd_payload.resize(2 * 1024 * 1024, 0x20);
    let upload_resp = ureq::post(&format!(
        "{}/api/workspaces/v116-psd-test/upload-design?fileName=HeroCampaign.psd&subfolder=Designs",
        base
    ))
    .set("Content-Type", "application/octet-stream")
    .send_bytes(&psd_payload)
    .expect("upload-design should succeed for PSD");
    let upload_json = resp_json(upload_resp);
    assert_eq!(upload_json["success"], true);
    assert_eq!(upload_json["design"]["name"], "HeroCampaign.psd");
    assert_eq!(upload_json["design"]["format"], "PSD");
    assert_eq!(upload_json["design"]["size"], psd_payload.len() as u64);
    assert!(ws_root.join("Designs").join("HeroCampaign.psd").is_file());

    // 2. Direct local disk import helper (used by POST /api/workspaces/:id/import-design-dialog)
    let local_psd = src_dir.join("PosterMockup.psd");
    let local_png = src_dir.join("LogoPreview.png");
    fs::write(&local_psd, b"8BPS\x00\x01_local_psd_bytes").unwrap();
    fs::write(&local_png, b"\x89PNG\r\n\x1a\nfake_png").unwrap();

    let imported = import_local_design_files_into_workspace(
        &state_arc,
        "v116-psd-test",
        "Designs",
        &[local_psd, local_png],
    )
    .expect("direct local import should succeed");
    assert_eq!(imported.len(), 2);
    assert_eq!(imported[0]["name"], "PosterMockup.psd");
    assert_eq!(imported[0]["format"], "PSD");
    assert_eq!(imported[1]["name"], "LogoPreview.png");
    assert!(imported[1]["previewUrl"].as_str().is_some());
    assert!(ws_root.join("Designs").join("PosterMockup.psd").is_file());
    assert!(ws_root.join("Designs").join("LogoPreview.png").is_file());

    let _ = fs::remove_dir_all(&temp_data);
    let _ = fs::remove_dir_all(&ws_root);
    let _ = fs::remove_dir_all(&src_dir);
}

#[test]
fn test_serve_workspace_asset_auto_generates_missing_styleguide_html() {
    let temp_data = make_temp_dir("fontivo_v116_styleguide_data");
    let ws_root = make_temp_dir("fontivo_v116_styleguide_ws");
    let (base, _state) = start_isolated_server(&temp_data);

    let save_resp = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": "v116-styleguide-test",
                "name": "Styleguide Auto Brand",
                "folderPath": ws_root.to_string_lossy()
            })
            .to_string(),
        )
        .expect("POST /api/workspaces should succeed");
    assert_eq!(resp_json(save_resp)["success"], true);

    let styleguide_path = ws_root.join("Guidelines").join("styleguide.html");
    if styleguide_path.exists() {
        fs::remove_file(&styleguide_path).unwrap();
    }
    assert!(!styleguide_path.exists());

    let asset_resp = ureq::get(&format!(
        "{}/api/workspaces/v116-styleguide-test/asset?path=Guidelines/styleguide.html",
        base
    ))
    .call()
    .expect("GET Guidelines/styleguide.html should auto-generate and return 200");
    assert_eq!(asset_resp.status(), 200);
    assert!(asset_resp
        .header("Content-Type")
        .unwrap_or("")
        .contains("text/html"));
    let html = asset_resp.into_string().unwrap();
    assert!(html.contains("Styleguide Auto Brand"));
    assert!(styleguide_path.is_file());

    let _ = fs::remove_dir_all(&temp_data);
    let _ = fs::remove_dir_all(&ws_root);
}

#[test]
fn test_operations_clear_persists_across_polls() {
    let temp_data = make_temp_dir("fontivo_v116_ops_clear_data");
    let (base, state_arc) = start_isolated_server(&temp_data);

    {
        let mut st = state_arc.write().unwrap();
        st.record_operation(SystemOperation {
            id: "sys-done".to_string(),
            title: "Completed Scan".to_string(),
            kind: "scan".to_string(),
            status: "completed".to_string(),
            progress_percent: 100.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            processed_items: 10,
            total_items: 10,
            speed_bps: 0,
            message: "Done".to_string(),
            updated_at: 100,
        });
        st.record_operation(SystemOperation {
            id: "sys-running".to_string(),
            title: "Active Index".to_string(),
            kind: "index".to_string(),
            status: "running".to_string(),
            progress_percent: 50.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            processed_items: 5,
            total_items: 10,
            speed_bps: 0,
            message: "Running".to_string(),
            updated_at: 101,
        });

        let make_job = |id: &str, phase: JobPhase| DownloadProgress {
            job_id: id.to_string(),
            pack_id: format!("pack-{}", id),
            pack_name: format!("Pack {}", id),
            phase,
            bytes_downloaded: 100,
            total_bytes: 100,
            speed_bps: 0,
            eta_seconds: 0,
            progress_percent: 100.0,
            extracted_count: 1,
            indexed_count: 1,
            error: None,
        };
        st.download_manager
            .upsert_job(make_job("dl-completed", JobPhase::Completed));
        st.download_manager
            .upsert_job(make_job("dl-failed", JobPhase::Failed));
        st.download_manager
            .upsert_job(make_job("dl-cancelled", JobPhase::Cancelled));
        st.download_manager
            .upsert_job(make_job("dl-active", JobPhase::Downloading));
    }

    let before_ops = resp_json(
        ureq::get(&format!("{}/api/system/operations", base))
            .call()
            .unwrap(),
    );
    assert_eq!(before_ops["totalCount"], 6);

    let clear_resp = resp_json(
        ureq::post(&format!("{}/api/system/operations/clear", base))
            .send_string("{}")
            .unwrap(),
    );
    assert_eq!(clear_resp["success"], true);
    assert_eq!(clear_resp["clearedCount"], 4);
    assert_eq!(clear_resp["totalCount"], 2);
    assert_eq!(clear_resp["activeCount"], 2);

    // Re-poll both endpoints to confirm cleared items do NOT reappear
    let after_ops = resp_json(
        ureq::get(&format!("{}/api/system/operations", base))
            .call()
            .unwrap(),
    );
    assert_eq!(after_ops["totalCount"], 2);

    let after_dl = resp_json(
        ureq::get(&format!("{}/api/catalog/download-status", base))
            .call()
            .unwrap(),
    );
    let jobs = after_dl["jobs"].as_array().unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0]["jobId"], "dl-active");

    let _ = fs::remove_dir_all(&temp_data);
}
