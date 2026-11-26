use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use Fontivo::server::api_server::ApiServer;
use Fontivo::server::routes::fonts_query::filter_fonts;
use Fontivo::server::routes::workspaces::{
    generate_standalone_styleguide_html, resolve_workspace_file_path,
    sync_workspace_physical_files, Workspace,
};
use Fontivo::server::state::{AppState, FontRecord};

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

fn write_test_ttf(dest: &Path) {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let candidates = [
        Path::new("C:\\Windows\\Fonts\\tahoma.ttf"),
        Path::new("C:\\Windows\\Fonts\\arial.ttf"),
        Path::new("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ];
    for c in candidates {
        if c.is_file() && fs::copy(c, dest).is_ok() {
            return;
        }
    }
    fs::write(dest, [0x00, 0x01, 0x00, 0x00, 0x00, 0x0C]).unwrap();
}

fn make_font_record(
    id: usize,
    name: &str,
    path: &str,
    family: &str,
    source: &str,
    sub_category: Option<&str>,
    is_local: bool,
) -> FontRecord {
    FontRecord {
        id,
        name: name.to_string(),
        path: path.to_string(),
        category: "02 - English Fonts".to_string(),
        sub_category: sub_category.map(|s| s.to_string()),
        family: Some(family.to_string()),
        format: "TTF".to_string(),
        size: 1024,
        is_arabic: false,
        is_latin: true,
        is_bilingual: false,
        is_variable: false,
        weight: 400,
        source: source.to_string(),
        is_active: false,
        is_favorite: false,
        display_name: Some(format!("{} Regular", family)),
        style: Some("Regular".to_string()),
        post_script_name: Some(format!("{}-Regular", family)),
        glyph_count: Some(256),
        has_tashkeel: false,
        has_extended_arabic: false,
        has_arabic_numerals: false,
        has_western_numerals: true,
        is_local,
    }
}

fn start_isolated_server(state: AppState) -> (u16, String, Arc<RwLock<AppState>>) {
    let port = allocate_free_port();
    let state_arc = Arc::new(RwLock::new(state));
    ApiServer::start(
        Arc::clone(&state_arc),
        port,
        PathBuf::from("nonexistent_dist"),
        None,
    );
    std::thread::sleep(Duration::from_millis(120));
    (port, format!("http://127.0.0.1:{}", port), state_arc)
}

#[test]
fn test_workspace_extended_fields_backward_compat_and_custom_font_activation() {
    // 1. Legacy JSON without deadline, customFonts, pinnedAssets, or task metadata,
    // plus string-formatted updatedAt/createdAt timestamps, must deserialize cleanly
    let legacy_json = r#"{
        "id": "legacy-ws",
        "name": "Legacy Brand",
        "updatedAt": "2026-11-20",
        "tasks": [
            { "id": "t-old", "text": "Old task", "createdAt": "2026-11-18" }
        ]
    }"#;
    let legacy_ws: Workspace =
        serde_json::from_str(legacy_json).expect("Legacy workspace JSON must deserialize");
    assert_eq!(legacy_ws.deadline, None);
    assert!(legacy_ws.custom_fonts.is_empty());
    assert!(legacy_ws.pinned_assets.is_empty());
    assert_eq!(legacy_ws.tasks[0].status, "todo");
    assert!(legacy_ws.tasks[0].created_at > 0);
    assert_eq!(legacy_ws.tasks[0].due_date, None);
    assert_eq!(legacy_ws.tasks[0].priority, None);
    assert_eq!(legacy_ws.tasks[0].category, None);

    // 2. Roundtrip + sync + activate customFonts via HTTP API
    let temp_data = make_temp_dir("fontivo_ws_ext_test");
    let custom_font_path = temp_data
        .join("Fonts")
        .join("Custom")
        .join("SocialFont")
        .join("SocialFont-Bold.ttf");
    write_test_ttf(&custom_font_path);

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.fonts.clear();
    state.active_font_ids.clear();
    state.fonts.push(make_font_record(
        50001,
        "SocialFont-Bold.ttf",
        &custom_font_path.to_string_lossy(),
        "SocialFont",
        "local",
        Some("Custom Fonts"),
        true,
    ));

    let (_port, base, state_arc) = start_isolated_server(state);
    let ws_id = "ext-brand-ws";
    let ws_root = temp_data.join("Workspaces").join(ws_id);

    let payload = serde_json::json!({
        "id": ws_id,
        "name": "Extended Brand",
        "client": "Acme",
        "deadline": "2026-12-31",
        "folderPath": ws_root.to_string_lossy(),
        "typography": {
            "headingFont": {
                "name": "SocialFont-Bold.ttf",
                "fontId": 50001,
                "family": "SocialFont"
            }
        },
        "customFonts": [
            {
                "label": "Social Heading",
                "name": "SocialFont-Bold.ttf",
                "fontId": 50001,
                "family": "SocialFont",
                "style": "Bold"
            }
        ],
        "pinnedAssets": ["Designs/Facebook & Meta/hero.png"],
        "tasks": [
            {
                "id": "t1",
                "text": "Deliver social kit",
                "status": "in_progress",
                "dueDate": "2026-12-20",
                "priority": "high",
                "category": "Social"
            }
        ],
        "palette": [{ "name": "Brand Violet", "hex": "#5200EA", "role": "primary" }]
    });

    let save_resp = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(&payload.to_string())
        .expect("POST /api/workspaces should succeed");
    let saved = resp_json(save_resp);
    assert_eq!(saved["deadline"], "2026-12-31");
    assert_eq!(saved["customFonts"][0]["label"], "Social Heading");
    assert_eq!(saved["pinnedAssets"][0], "Designs/Facebook & Meta/hero.png");
    assert_eq!(saved["tasks"][0]["dueDate"], "2026-12-20");
    assert_eq!(saved["tasks"][0]["priority"], "high");
    assert_eq!(saved["tasks"][0]["category"], "Social");

    let fetched = resp_json(
        ureq::get(&format!("{}/api/workspaces/{}", base, ws_id))
            .call()
            .expect("GET /api/workspaces/:id should succeed"),
    );
    assert_eq!(fetched["deadline"], "2026-12-31");
    assert_eq!(fetched["customFonts"][0]["label"], "Social Heading");
    assert_eq!(fetched["tasks"][0]["priority"], "high");

    // Verify POST /api/workspaces/:id update route preserves & updates extended fields
    let updated_payload = serde_json::json!({
        "id": ws_id,
        "name": "Extended Brand v2",
        "deadline": "2027-01-15",
        "folderPath": ws_root.to_string_lossy(),
        "customFonts": [
            {
                "label": "Social Heading",
                "name": "SocialFont-Bold.ttf",
                "fontId": 50001,
                "family": "SocialFont",
                "style": "Bold"
            }
        ],
        "pinnedAssets": ["Designs/Facebook & Meta/hero.png"],
        "tasks": [
            {
                "id": "t1",
                "text": "Deliver social kit",
                "status": "done",
                "dueDate": "2027-01-10",
                "priority": "medium",
                "category": "Print"
            }
        ],
        "palette": [{ "name": "Brand Violet", "hex": "#5200EA", "role": "primary" }]
    });
    let upd_resp = resp_json(
        ureq::post(&format!("{}/api/workspaces/{}", base, ws_id))
            .set("Content-Type", "application/json")
            .send_string(&updated_payload.to_string())
            .expect("POST /api/workspaces/:id should succeed"),
    );
    assert_eq!(upd_resp["name"], "Extended Brand v2");
    assert_eq!(upd_resp["deadline"], "2027-01-15");
    assert_eq!(upd_resp["tasks"][0]["priority"], "medium");
    assert_eq!(upd_resp["tasks"][0]["category"], "Print");
    assert_eq!(upd_resp["tasks"][0]["dueDate"], "2027-01-10");

    // Verify physical sync copied the custom font and updated palette.css & styleguide.html
    assert!(
        ws_root.join("Fonts").join("SocialFont-Bold.ttf").is_file(),
        "sync_workspace_physical_files must copy customFonts into Workspace/Fonts/"
    );
    let css_content = fs::read_to_string(ws_root.join("Palettes").join("palette.css")).unwrap();
    assert!(css_content.contains("--font-custom-social-heading:"));

    let loaded_ws: Workspace = serde_json::from_value(upd_resp).unwrap();
    let html = generate_standalone_styleguide_html(&loaded_ws);
    assert!(html.contains("2027-01-15"));
    assert!(html.contains("Social Heading"));
    assert!(html.contains("Deliver social kit"));

    // Verify sync helper directly and RAM activation of customFonts
    let snapshot = state_arc.read().unwrap().fonts.clone();
    let _ = sync_workspace_physical_files(&loaded_ws, &snapshot, loaded_ws.folder_path.as_deref())
        .unwrap();

    let act_resp = ureq::post(&format!("{}/api/workspaces/{}/activate-ram", base, ws_id))
        .send_string("{}")
        .expect("POST /api/workspaces/:id/activate-ram should succeed");
    let act_json = resp_json(act_resp);
    assert_eq!(act_json["success"], true);
    let ids = act_json["activatedIds"].as_array().unwrap();
    assert!(
        ids.iter().any(|v| v.as_u64() == Some(50001)),
        "activate-ram must activate customFonts fontId 50001"
    );
    assert_eq!(
        ids.iter().filter(|v| v.as_u64() == Some(50001)).count(),
        1,
        "activate-ram must deduplicate fontId across headingFont and customFonts"
    );
    assert_eq!(act_json["activatedCount"], 1);

    // Cleanup activated RAM handle before temp dir deletion
    {
        let st = state_arc.read().unwrap();
        let _ = st
            .activator
            .deactivate_ram(&custom_font_path.to_string_lossy());
    }
    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_workspace_open_file_security_and_delete_folder_protections() {
    let temp_data = make_temp_dir("fontivo_ws_folders_test");
    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    let (_port, base, _state_arc) = start_isolated_server(state);

    let ws_id = "folder-sec-ws";
    let ws_root = temp_data.join("Workspaces").join(ws_id);
    let _ = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": ws_id,
                "name": "Folder Security WS",
                "folderPath": ws_root.to_string_lossy()
            })
            .to_string(),
        )
        .expect("Workspace creation should succeed");

    // Create subfolder containing '&' (brand template) + nested empty subfolder
    let mk_res = resp_json(
        ureq::post(&format!("{}/api/workspaces/{}/folders", base, ws_id))
            .set("Content-Type", "application/json")
            .send_string(
                &serde_json::json!({
                    "relativePath": "Designs/Facebook & Meta"
                })
                .to_string(),
            )
            .expect("Creating Designs/Facebook & Meta should succeed"),
    );
    assert_eq!(mk_res["success"], true);

    let _ = ureq::post(&format!("{}/api/workspaces/{}/folders", base, ws_id))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "relativePath": "Designs/EmptySibling"
            })
            .to_string(),
        )
        .expect("Creating Designs/EmptySibling should succeed");

    let design_file = ws_root
        .join("Designs")
        .join("Facebook & Meta")
        .join("post.png");
    fs::write(&design_file, b"\x89PNG\r\n\x1a\n").unwrap();

    let retina_file = ws_root
        .join("Designs")
        .join("Facebook & Meta")
        .join("hero@2x [final].png");
    fs::write(&retina_file, b"\x89PNG\r\n\x1a\n").unwrap();

    // Valid open-file path resolution check (without popping GUI explorer window during tests)
    let resolved = resolve_workspace_file_path(
        &temp_data,
        ws_id,
        "Designs/Facebook & Meta/post.png",
    )
    .expect("Valid workspace file path must resolve");
    assert_eq!(resolved.1, "Designs/Facebook & Meta/post.png");
    assert!(resolved.2.is_file());

    let resolved_retina = resolve_workspace_file_path(
        &temp_data,
        ws_id,
        "Designs/Facebook & Meta/hero@2x [final].png",
    )
    .expect("Valid filename with @ and brackets must resolve");
    assert!(resolved_retina.2.is_file());

    // open-file traversal, reserved device names, and bad path rejections
    for bad_path in [
        "../secret.txt",
        "Designs/../../Windows/win.ini",
        "C:\\Windows\\win.ini",
        "//server/share/file.png",
        "Designs/CON.png",
        "Designs/NUL",
        "",
        "Designs/Facebook & Meta",
    ] {
        let err = ureq::post(&format!("{}/api/workspaces/{}/open-file", base, ws_id))
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "path": bad_path }).to_string());
        match err {
            Err(ureq::Error::Status(code, _)) => {
                assert_eq!(code, 400, "Bad path '{}' must return HTTP 400", bad_path)
            }
            other => panic!("Expected HTTP 400 for '{}', got {:?}", bad_path, other),
        }
    }

    // Missing file inside workspace returns 404
    let miss_err = ureq::post(&format!("{}/api/workspaces/{}/open-file", base, ws_id))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "path": "Designs/missing.png" }).to_string());
    match miss_err {
        Err(ureq::Error::Status(code, _)) => assert_eq!(code, 404),
        other => panic!("Expected HTTP 404 for missing file, got {:?}", other),
    }

    // DELETE /api/workspaces/:id/folders must protect all 4 base folders & block traversal
    for protected in [
        "Fonts",
        "Designs",
        "Palettes",
        "Guidelines",
        "../outside",
        "Designs/../Fonts",
        "CustomTopLevel",
    ] {
        let del_err = ureq::delete(&format!(
            "{}/api/workspaces/{}/folders?path={}",
            base, ws_id, protected
        ))
        .call();
        match del_err {
            Err(ureq::Error::Status(code, _)) => assert_eq!(
                code, 400,
                "Deleting '{}' must be forbidden with HTTP 400",
                protected
            ),
            other => panic!(
                "Expected HTTP 400 protecting '{}', got {:?}",
                protected, other
            ),
        }
    }
    assert!(ws_root.join("Fonts").is_dir());
    assert!(ws_root.join("Designs").is_dir());
    assert!(ws_root.join("Palettes").is_dir());
    assert!(ws_root.join("Guidelines").is_dir());

    // Also seed pinnedAssets pointing inside Designs/Facebook & Meta to verify folder delete prunes them
    let _ = ureq::post(&format!("{}/api/workspaces/{}", base, ws_id))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": ws_id,
                "name": "Folder Security WS",
                "folderPath": ws_root.to_string_lossy(),
                "folders": ["Designs/Facebook & Meta", "Designs/EmptySibling"],
                "pinnedAssets": [
                    "Designs/Facebook & Meta/post.png",
                    "Designs/KeepOther.png"
                ]
            })
            .to_string(),
        )
        .expect("Updating workspace with pinnedAssets should succeed");

    // Nonexistent workspace ID must return 404 without creating orphan dirs
    let missing_ws_open = ureq::post(&format!("{}/api/workspaces/nonexistent-ws-404/open-file", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "path": "Designs/post.png" }).to_string());
    match missing_ws_open {
        Err(ureq::Error::Status(code, _)) => assert_eq!(code, 404),
        other => panic!("Expected HTTP 404 for nonexistent workspace open-file, got {:?}", other),
    }
    let missing_ws_del = ureq::delete(&format!(
        "{}/api/workspaces/nonexistent-ws-404/folders?path=Designs%2FSub",
        base
    ))
    .call();
    match missing_ws_del {
        Err(ureq::Error::Status(code, _)) => assert_eq!(code, 404),
        other => panic!("Expected HTTP 404 for nonexistent workspace folder delete, got {:?}", other),
    }

    // Valid nested subfolder deletion removes folder + files and updates ws.folders & pinnedAssets
    let del_ok = resp_json(
        ureq::delete(&format!(
            "{}/api/workspaces/{}/folders?path=Designs%2FFacebook%20%26%20Meta",
            base, ws_id
        ))
        .call()
        .expect("DELETE nested subfolder should succeed"),
    );
    assert_eq!(del_ok["success"], true);
    assert!(!ws_root.join("Designs").join("Facebook & Meta").exists());
    assert!(ws_root.join("Designs").join("EmptySibling").is_dir());

    let ws_after = resp_json(
        ureq::get(&format!("{}/api/workspaces/{}", base, ws_id))
            .call()
            .unwrap(),
    );
    let folders_after: Vec<String> = ws_after["folders"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    assert!(!folders_after.iter().any(|f| f.contains("Facebook")));
    assert!(folders_after.iter().any(|f| f == "Designs/EmptySibling"));
    let pinned_after: Vec<String> = ws_after["pinnedAssets"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    assert!(!pinned_after.iter().any(|p| p.contains("Facebook")));
    assert!(pinned_after.iter().any(|p| p == "Designs/KeepOther.png"));

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_local_all_bucket_folder_path_filters_and_custom_buckets_endpoint() {
    let temp_data = make_temp_dir("fontivo_local_filter_test");
    let custom_file = temp_data
        .join("Fonts")
        .join("Custom")
        .join("CustomSans.ttf");
    let imp_a_file = temp_data
        .join("Fonts")
        .join("Imported")
        .join("Brand")
        .join("BrandSans.ttf");
    let imp_b_file = temp_data
        .join("Fonts")
        .join("Imported")
        .join("Brand2")
        .join("BrandTwo.ttf");
    let pack_file = temp_data
        .join("Fonts")
        .join("Packs")
        .join("pack-essential-001")
        .join("EssentialDisplay.ttf");
    let google_file = temp_data
        .join("Fonts")
        .join("Google")
        .join("Tajawal-Regular.ttf");

    for p in [
        &custom_file,
        &imp_a_file,
        &imp_b_file,
        &pack_file,
        &google_file,
    ] {
        write_test_ttf(p);
    }

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.active_font_ids.clear();
    state.favorite_font_ids.clear();
    state.fonts = vec![
        make_font_record(
            1,
            "arial.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
            "Arial",
            "system",
            Some("Windows System Fonts"),
            true,
        ),
        make_font_record(
            2,
            "Roboto-Remote.ttf",
            "cloud://Roboto",
            "Roboto",
            "google",
            Some("Google Fonts Cloud"),
            false,
        ),
        make_font_record(
            3,
            "CustomSans.ttf",
            &custom_file.to_string_lossy(),
            "CustomSans",
            "local",
            Some("Custom Fonts"),
            true,
        ),
        make_font_record(
            4,
            "BrandSans.ttf",
            &imp_a_file.to_string_lossy(),
            "BrandSans",
            "local",
            Some("Imported · Brand"),
            true,
        ),
        make_font_record(
            5,
            "BrandTwo.ttf",
            &imp_b_file.to_string_lossy(),
            "BrandTwo",
            "local",
            Some("Imported · Brand2"),
            true,
        ),
        make_font_record(
            6,
            "EssentialDisplay.ttf",
            &pack_file.to_string_lossy(),
            "EssentialDisplay",
            "cloud",
            Some("Fontivo Cloud Pack"),
            true,
        ),
        make_font_record(
            7,
            "Tajawal-Regular.ttf",
            &google_file.to_string_lossy(),
            "Tajawal",
            "google",
            Some("Google Fonts"),
            true,
        ),
    ];

    // Direct unit checks on filter_fonts
    let mut q_all = HashMap::new();
    q_all.insert("source".into(), "local_all".into());
    let local_all = filter_fonts(&state, &q_all);
    let ids: Vec<usize> = local_all.iter().map(|f| f.id).collect();
    assert_eq!(ids, vec![3, 4, 5, 6, 7]);

    for (bucket, expected_ids) in [
        ("custom", vec![3usize]),
        ("imported", vec![4, 5]),
        ("cloud", vec![6]),
        ("google", vec![7]),
    ] {
        let mut q = HashMap::new();
        q.insert("source".into(), "local_all".into());
        q.insert("bucket".into(), bucket.into());
        let res_ids: Vec<usize> = filter_fonts(&state, &q).iter().map(|f| f.id).collect();
        assert_eq!(res_ids, expected_ids, "bucket={} mismatch", bucket);
    }

    // folderPath must normalize '/' vs '\' case-insensitively and NOT match sibling Brand2!
    let brand_fwd = temp_data
        .join("Fonts")
        .join("Imported")
        .join("Brand")
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();
    let mut q_folder = HashMap::new();
    q_folder.insert("source".into(), "local_all".into());
    q_folder.insert("folderPath".into(), format!("{}/", brand_fwd));
    let folder_res = filter_fonts(&state, &q_folder);
    assert_eq!(folder_res.len(), 1);
    assert_eq!(folder_res[0].id, 4);

    // HTTP checks on /api/fonts, /api/families, /api/fonts/custom-buckets, /api/activate-batch, and /api/stats
    let (_port, base, state_arc) = start_isolated_server(state);

    let fonts_local_all = resp_json(
        ureq::get(&format!("{}/api/fonts?source=local_all", base))
            .call()
            .unwrap(),
    );
    assert_eq!(fonts_local_all["total"], 5);

    let fonts_imported_brand = resp_json(
        ureq::get(&format!(
            "{}/api/fonts?source=local_all&bucket=imported&folderPath=Imported%2FBrand",
            base
        ))
        .call()
        .unwrap(),
    );
    assert_eq!(fonts_imported_brand["total"], 1);
    assert_eq!(fonts_imported_brand["fonts"][0]["id"], 4);

    let fams_cloud = resp_json(
        ureq::get(&format!(
            "{}/api/families?source=local_all&bucket=cloud",
            base
        ))
        .call()
        .unwrap(),
    );
    assert_eq!(fams_cloud["total"], 1);
    assert_eq!(fams_cloud["families"][0]["family"], "EssentialDisplay");

    // Batch activate/deactivate by folder chip path (with forward slashes + trailing slash)
    let act_folder = resp_json(
        ureq::post(&format!("{}/api/activate-batch", base))
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "folder": format!("{}/", brand_fwd) }).to_string())
            .unwrap(),
    );
    assert_eq!(act_folder["success"], true);
    assert_eq!(act_folder["totalRequested"], 1);
    assert_eq!(act_folder["activatedIds"][0], 4);

    let deact_folder = resp_json(
        ureq::post(&format!("{}/api/deactivate-batch", base))
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "folder": brand_fwd }).to_string())
            .unwrap(),
    );
    assert_eq!(
        deact_folder["totalRequested"]
            .as_u64()
            .or_else(|| deact_folder["total_requested"].as_u64()),
        Some(1)
    );
    {
        let st = state_arc.read().unwrap();
        let _ = st.activator.deactivate_ram(&imp_a_file.to_string_lossy());
    }

    let buckets_json = resp_json(
        ureq::get(&format!("{}/api/fonts/custom-buckets", base))
            .call()
            .unwrap(),
    );
    assert_eq!(buckets_json["success"], true);
    assert_eq!(buckets_json["total"], 5);
    assert_eq!(buckets_json["counts"]["custom"], 1);
    assert_eq!(buckets_json["counts"]["imported"], 2);
    assert_eq!(buckets_json["counts"]["cloud"], 1);
    assert_eq!(buckets_json["counts"]["google"], 1);
    assert_eq!(buckets_json["folders"].as_array().unwrap().len(), 5);

    let stats_json = resp_json(ureq::get(&format!("{}/api/stats", base)).call().unwrap());
    assert_eq!(stats_json["localAllCount"], 5);
    assert_eq!(stats_json["customBuckets"]["imported"], 2);
    assert_eq!(stats_json["systemCount"], 1);

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_delete_font_folder_endpoint_protections_and_targeted_cleanup() {
    let temp_data = make_temp_dir("fontivo_del_font_folder_test");
    let fonts_root = temp_data.join("Fonts");
    let folder_a = fonts_root.join("Imported").join("FolderA");
    let folder_b = fonts_root.join("Imported").join("FolderB");
    let custom_dir = fonts_root.join("Custom");
    let pack_dir = fonts_root.join("Packs").join("pack-essential-001");
    let google_dir = fonts_root.join("Google");
    let outside_dir = temp_data.join("OutsideDir");
    fs::create_dir_all(&outside_dir).unwrap();

    let file_a = folder_a.join("FontA.ttf");
    let file_b = folder_b.join("FontB.ttf");
    let file_c = custom_dir.join("KeepCustom.ttf");
    let file_p = pack_dir.join("KeepPack.ttf");
    let file_g = google_dir.join("KeepGoogle.ttf");
    for p in [&file_a, &file_b, &file_c, &file_p, &file_g] {
        write_test_ttf(p);
    }

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.active_font_ids.clear();
    state.favorite_font_ids.clear();
    state.collections.clear();

    let mut rec_a = make_font_record(
        101,
        "FontA.ttf",
        &file_a.to_string_lossy(),
        "FontA",
        "local",
        Some("Imported · FolderA"),
        true,
    );
    let _ = state.activator.activate_ram(&rec_a.path);
    rec_a.is_active = true;
    state.active_font_ids.insert(101);
    state.favorite_font_ids.insert(101);
    state.collections.insert("FolderA".to_string(), vec![101, 102]);

    state.fonts = vec![
        make_font_record(
            100,
            "arial.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
            "Arial",
            "system",
            Some("Windows System Fonts"),
            true,
        ),
        rec_a,
        make_font_record(
            102,
            "FontB.ttf",
            &file_b.to_string_lossy(),
            "FontB",
            "local",
            Some("Imported · FolderB"),
            true,
        ),
        make_font_record(
            103,
            "KeepCustom.ttf",
            &file_c.to_string_lossy(),
            "KeepCustom",
            "local",
            Some("Custom Fonts"),
            true,
        ),
        make_font_record(
            104,
            "KeepPack.ttf",
            &file_p.to_string_lossy(),
            "KeepPack",
            "cloud",
            Some("Fontivo Cloud Pack"),
            true,
        ),
        make_font_record(
            105,
            "KeepGoogle.ttf",
            &file_g.to_string_lossy(),
            "KeepGoogle",
            "google",
            Some("Google Fonts"),
            true,
        ),
    ];
    state.save_user_library_index();

    let (_port, base, state_arc) = start_isolated_server(state);

    // 1. Security rejections: root Fonts dir, Imported/Packs/Extracted containers, Windows Fonts, traversal, outside dir
    for forbidden in [
        fonts_root.to_string_lossy().to_string(),
        fonts_root.join("Imported").to_string_lossy().to_string(),
        fonts_root.join("Packs").to_string_lossy().to_string(),
        "Fonts".to_string(),
        "Imported".to_string(),
        "Packs".to_string(),
        "Extracted".to_string(),
        "C:\\Windows\\Fonts".to_string(),
        "../../etc".to_string(),
        outside_dir.to_string_lossy().to_string(),
    ] {
        let err = ureq::post(&format!("{}/api/fonts/delete-folder", base))
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "folderPath": forbidden }).to_string());
        match err {
            Err(ureq::Error::Status(code, _)) => assert_eq!(
                code, 400,
                "delete-folder must reject '{}' with HTTP 400",
                forbidden
            ),
            other => panic!("Expected HTTP 400 for '{}', got {:?}", forbidden, other),
        }
    }

    // 2. Targeted deletion of Imported/FolderA
    let del_resp = resp_json(
        ureq::post(&format!("{}/api/fonts/delete-folder", base))
            .set("Content-Type", "application/json")
            .send_string(
                &serde_json::json!({ "folderPath": folder_a.to_string_lossy() }).to_string(),
            )
            .expect("POST /api/fonts/delete-folder on FolderA should succeed"),
    );
    assert_eq!(del_resp["success"], true);
    assert_eq!(del_resp["removedCount"], 1);
    assert!(!folder_a.exists(), "FolderA must be deleted from disk");

    // Sibling folders and files MUST remain untouched!
    assert!(file_b.is_file());
    assert!(file_c.is_file());
    assert!(file_p.is_file());
    assert!(file_g.is_file());

    {
        let st = state_arc.read().unwrap();
        let remaining_ids: HashSet<usize> = st.fonts.iter().map(|f| f.id).collect();
        assert!(!remaining_ids.contains(&101));
        assert!(remaining_ids.contains(&100)); // system font untouched
        assert!(remaining_ids.contains(&102)); // sibling Imported/FolderB untouched
        assert!(remaining_ids.contains(&103)); // Custom untouched
        assert!(remaining_ids.contains(&104)); // Packs untouched
        assert!(remaining_ids.contains(&105)); // Google untouched
        assert!(!st.active_font_ids.contains(&101));
        assert!(!st.favorite_font_ids.contains(&101));
        assert_eq!(st.collections.get("FolderA"), Some(&vec![102]));

        // Persisted index must no longer contain FontA
        let index_str = fs::read_to_string(st.get_user_library_index_path()).unwrap();
        assert!(!index_str.contains("FontA.ttf"));
        assert!(index_str.contains("FontB.ttf"));

        // Verify customOnly=true excludes system font (100) while keeping remaining 4 offline fonts
        let mut q_custom = HashMap::new();
        q_custom.insert("customOnly".into(), "true".into());
        assert_eq!(filter_fonts(&st, &q_custom).len(), 4);
    }

    // 3. Targeted deletion via relative path ("Packs/pack-essential-001")
    let del_pack_resp = resp_json(
        ureq::post(&format!("{}/api/fonts/delete-folder", base))
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "folderPath": "Packs/pack-essential-001" }).to_string())
            .expect("POST /api/fonts/delete-folder on relative Packs subfolder should succeed"),
    );
    assert_eq!(del_pack_resp["success"], true);
    assert_eq!(del_pack_resp["removedCount"], 1);
    assert!(!pack_dir.exists());
    assert!(file_b.is_file());
    assert!(file_c.is_file());
    assert!(file_g.is_file());

    let _ = fs::remove_dir_all(&temp_data);
}
