use std::collections::HashMap;
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use Fontivo::engine::health::SystemHealthChecker;
use Fontivo::engine::{DownloadManager, FontPackItem};
use Fontivo::server::routes::fonts_lifecycle::resolve_trusted_pack_request;
use Fontivo::server::routes::fonts_query::{filter_fonts, font_mime_type_for_path, sort_families};
use Fontivo::server::routes::workspaces::{
    escape_html, escape_js_string, generate_standalone_styleguide_html, sanitize_hex_color,
    validate_workspace_id, TypographyFont, Workspace, WorkspaceColor, WorkspaceTask,
    WorkspaceTypography,
};
use Fontivo::server::security::{parse_deep_link_url, validate_design_bytes};
use Fontivo::server::state::{AppState, BrandColor, BrandKit, FamilyGroup, FontRecord};
use Fontivo::server::ApiServer;

// =========================================================================
// 1. Downloader SSRF, SHA-256 Bypass & Path Traversal Protection Tests
// =========================================================================

#[test]
fn test_downloader_rejects_pack_id_and_filename_traversal() {
    for bad_id in [
        "",
        "../evil",
        "..\\evil",
        "pack/sub",
        "pack\\sub",
        "pack\0id",
        "pack id with spaces",
        &"a".repeat(129),
    ] {
        assert!(
            DownloadManager::sanitize_pack_id(bad_id).is_err(),
            "Expected bad pack_id '{}' to be rejected",
            bad_id
        );
    }

    assert!(DownloadManager::sanitize_pack_id("pack-essential-001").is_ok());

    for bad_file in [
        "",
        "../escape.zip",
        "..\\escape.zip",
        "sub/pack.zip",
        "sub\\pack.zip",
        "pack.exe",
        "pack.zip\0.exe",
        "C:evil.zip",
    ] {
        assert!(
            DownloadManager::sanitize_pack_filename(bad_file).is_err(),
            "Expected bad file_name '{}' to be rejected",
            bad_file
        );
    }

    assert!(DownloadManager::sanitize_pack_filename("fontivo-essential-001.zip").is_ok());
}

#[test]
fn test_downloader_blocks_ssrf_and_empty_sha256_in_start_pack_download() {
    let mgr = DownloadManager::new();
    let state = Arc::new(RwLock::new(AppState::new()));

    // 1. SSRF URL to localhost / metadata IP
    let ssrf_pack = FontPackItem {
        id: "pack-ssrf".into(),
        name: "SSRF Pack".into(),
        version: "1.0.0".into(),
        download_url: "http://169.254.169.254/latest/meta-data/".into(),
        file_name: "ssrf.zip".into(),
        compressed_size: 1024,
        uncompressed_size: 2048,
        sha256: "d8b2de93736f80bc65a2bf97823af914adf884b67c2713c2ea71ac43dadff291".into(),
        font_count: 1,
        category: None,
        description: None,
    };
    assert!(
        mgr.start_pack_download(ssrf_pack, Arc::clone(&state))
            .is_err(),
        "SSRF pack download must be rejected"
    );

    // 2. Empty SHA-256 bypass attempt
    let empty_sha_pack = FontPackItem {
        id: "pack-empty-sha".into(),
        name: "No Hash Pack".into(),
        version: "1.0.0".into(),
        download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.0/fontivo-essential-001.zip".into(),
        file_name: "fontivo-essential-001.zip".into(),
        compressed_size: 1024,
        uncompressed_size: 2048,
        sha256: "".into(),
        font_count: 1,
        category: None,
        description: None,
    };
    assert!(
        mgr.start_pack_download(empty_sha_pack, Arc::clone(&state))
            .is_err(),
        "Pack with empty SHA-256 must be rejected"
    );

    // 3. Path traversal in file_name
    let trav_pack = FontPackItem {
        id: "pack-trav".into(),
        name: "Traversal Pack".into(),
        version: "1.0.0".into(),
        download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.0/fontivo-essential-001.zip".into(),
        file_name: "../../evil.zip".into(),
        compressed_size: 1024,
        uncompressed_size: 2048,
        sha256: "d8b2de93736f80bc65a2bf97823af914adf884b67c2713c2ea71ac43dadff291".into(),
        font_count: 1,
        category: None,
        description: None,
    };
    assert!(
        mgr.start_pack_download(trav_pack, state).is_err(),
        "Pack with traversal file_name must be rejected"
    );
}

#[test]
fn test_resolve_trusted_pack_request_blocks_overrides_and_unknown_ids() {
    // Valid manifest pack succeeds
    let ok = resolve_trusted_pack_request(Some("pack-essential-001"), None, None);
    assert!(ok.is_ok(), "Known manifest pack must resolve cleanly");

    // Unknown pack_id rejected
    assert!(resolve_trusted_pack_request(Some("evil-unknown-pack"), None, None).is_err());

    // Traversal pack_id rejected
    assert!(resolve_trusted_pack_request(Some("../../Windows/System32"), None, None).is_err());

    // Overriding download_url rejected
    assert!(resolve_trusted_pack_request(
        Some("pack-essential-001"),
        Some("https://evil.example.com/payload.zip"),
        None,
    )
    .is_err());

    // Overriding sha256 to empty string rejected
    assert!(resolve_trusted_pack_request(Some("pack-essential-001"), None, Some("")).is_err());

    // Overriding sha256 to another hash rejected
    assert!(resolve_trusted_pack_request(
        Some("pack-essential-001"),
        None,
        Some("0000000000000000000000000000000000000000000000000000000000000000"),
    )
    .is_err());
}

// =========================================================================
// 2. Windows Fonts Arbitrary File Deletion & Narrow Registry Match Tests
// =========================================================================

#[test]
fn test_uninstall_windows_font_blocks_arbitrary_file_deletion() {
    let temp_secret =
        std::env::temp_dir().join(format!("fontivo_do_not_delete_{}.ttf", std::process::id()));
    fs::write(&temp_secret, b"precious user file").unwrap();

    // Even with a .ttf extension, a path outside Windows Fonts directories MUST be rejected
    let res = SystemHealthChecker::uninstall_windows_font(
        Some("Precious"),
        temp_secret.to_str().unwrap(),
    );
    assert!(
        res.is_err(),
        "uninstall_windows_font must reject paths outside Windows Fonts directories"
    );
    assert!(
        temp_secret.exists(),
        "File outside Windows Fonts directory must NEVER be deleted"
    );
    let _ = fs::remove_file(&temp_secret);

    // Reject path traversal & non-font extensions inside Windows\Fonts
    for bad_path in [
        "C:\\Windows\\Fonts\\..\\System32\\cmd.exe",
        "C:\\Windows\\Fonts\\..\\win.ini",
        "C:\\Windows\\Fonts\\malware.exe",
        "C:\\Windows\\Fonts\\script.bat",
        "C:\\Users\\Public\\Documents\\note.txt",
        "C:\\Windows\\Fonts\\bad\0.ttf",
        "",
    ] {
        assert!(
            SystemHealthChecker::validate_windows_font_path(bad_path).is_err(),
            "Expected '{}' to fail validate_windows_font_path",
            bad_path
        );
    }

    // Valid font path inside %WINDIR%\Fonts passes path validation
    let win_dir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let valid_sys = format!("{}\\Fonts\\CustomStudioFont.ttf", win_dir);
    assert!(
        SystemHealthChecker::validate_windows_font_path(&valid_sys).is_ok(),
        "Valid .ttf inside WINDIR\\Fonts should pass path validation"
    );
}

#[test]
fn test_narrow_registry_font_matching_no_substring_collateral() {
    // Substring "a" must NOT match Arial or Tahoma!
    assert!(!SystemHealthChecker::registry_value_matches_font(
        "Arial (TrueType)",
        "arial.ttf",
        Some("a"),
        "C:\\Windows\\Fonts\\a.ttf"
    ));
    assert!(!SystemHealthChecker::registry_value_matches_font(
        "Tahoma (TrueType)",
        "tahoma.ttf",
        Some("a"),
        "C:\\Windows\\Fonts\\a.ttf"
    ));
    // Substring "Roboto" must NOT match "Roboto Condensed (TrueType)" or "Roboto Mono (TrueType)"
    assert!(!SystemHealthChecker::registry_value_matches_font(
        "Roboto Condensed (TrueType)",
        "RobotoCondensed-Regular.ttf",
        Some("Roboto"),
        "C:\\Windows\\Fonts\\Roboto-Regular.ttf"
    ));
    // Suffix match bug: val_data "a.ttf" must NOT match path "C:\Windows\Fonts\tahoma.ttf"
    assert!(!SystemHealthChecker::registry_value_matches_font(
        "Some Font (TrueType)",
        "a.ttf",
        Some("Other"),
        "C:\\Windows\\Fonts\\tahoma.ttf"
    ));

    // Exact matches MUST succeed (case-insensitive + standard Windows suffixes)
    assert!(SystemHealthChecker::registry_value_matches_font(
        "Roboto (TrueType)",
        "Roboto-Regular.ttf",
        Some("Roboto"),
        "C:\\Windows\\Fonts\\Other.ttf"
    ));
    assert!(SystemHealthChecker::registry_value_matches_font(
        "Cairo Bold (OpenType)",
        "Cairo-Bold.otf",
        Some("cairo bold"),
        "C:\\Windows\\Fonts\\unrelated.otf"
    ));
    assert!(SystemHealthChecker::registry_value_matches_font(
        "Custom Display (TrueType & OpenType)",
        "custom.ttf",
        Some("Custom Display"),
        "C:\\Windows\\Fonts\\x.ttf"
    ));
    // Exact bare filename match
    assert!(SystemHealthChecker::registry_value_matches_font(
        "Unrelated Display Name",
        "MyCustomFont.ttf",
        None,
        "C:\\Windows\\Fonts\\mycustomfont.ttf"
    ));
    // Exact full path match
    assert!(SystemHealthChecker::registry_value_matches_font(
        "User Font",
        "C:\\Users\\dev\\AppData\\Local\\Microsoft\\Windows\\Fonts\\Custom.otf",
        None,
        "c:/users/dev/appdata/local/microsoft/windows/fonts/custom.otf"
    ));
}

// =========================================================================
// 3. Workspaces Path Traversal & Stored XSS Protection Tests
// =========================================================================

#[test]
fn test_workspace_id_validation_blocks_path_traversal() {
    for bad in [
        "",
        "   ",
        "..",
        "../secrets",
        "..\\secrets",
        "a/b",
        "a\\b",
        "ws.json",
        "ws\0id",
        "ws with space",
        "ws<script>",
        &"x".repeat(129),
    ] {
        assert!(
            validate_workspace_id(bad).is_err(),
            "Workspace ID '{}' must be rejected",
            bad
        );
    }

    for good in [
        "fontivo-brand-system",
        "ws_2026_01",
        "A1-b2_C3",
        &"a".repeat(128),
    ] {
        assert!(
            validate_workspace_id(good).is_ok(),
            "Workspace ID '{}' should be accepted",
            good
        );
    }
}

#[test]
fn test_styleguide_html_escapes_all_xss_payloads_and_sanitizes_hex() {
    let ws = Workspace {
        id: "xss-test".into(),
        name: r#"Brand <script>alert("name")</script>"#.into(),
        client: Some(r#"Client <img src=x onerror=alert(1)>"#.into()),
        business: Some(r#"<b>Biz</b>"#.into()),
        category: None,
        campaign_name: None,
        brand_tagline: None,
        target_audience: None,
        logo_data_url: None,
        logo_path: None,
        folder_path: None,
        folders: Vec::new(),
        description: Some(r#"<svg onload=alert(2)>"#.into()),
        updated_at: 1700000000,
        typography: WorkspaceTypography {
            heading_font: Some(TypographyFont {
                name: Some("<script>heading()</script>".into()),
                ..Default::default()
            }),
            body_font: Some(TypographyFont {
                name: Some("Inter\" onclick=\"alert(3)".into()),
                ..Default::default()
            }),
            accent_font: Some(TypographyFont {
                name: Some("Playfair'<>".into()),
                ..Default::default()
            }),
            code_font: Some(TypographyFont {
                name: Some("JetBrains<script>".into()),
                ..Default::default()
            }),
        },
        project_fonts: Vec::new(),
        palette: vec![
            WorkspaceColor {
                name: r#"EvilColor <script>alert(4)</script>"#.into(),
                hex: r#"#fff');alert(5);//"#.into(),
                role: r#"primary"><script>alert(6)</script>"#.into(),
            },
            WorkspaceColor {
                name: "Safe Violet".into(),
                hex: "#5200EA".into(),
                role: "primary".into(),
            },
        ],
        tasks: vec![WorkspaceTask {
            id: "t1".into(),
            text: r#"Task <script>alert(7)</script>"#.into(),
            status: "todo".into(),
            created_at: 1700000000,
            due_date: Some(r#"2026-12-31<script>alert(9)</script>"#.into()),
            priority: Some("high".into()),
            category: Some(r#"Phase<script>alert(10)</script>"#.into()),
        }],
        notes: r#"Notes <iframe src="javascript:alert(8)"></iframe>"#.into(),
        success: Some(true),
        ..Default::default()
    };

    let html = generate_standalone_styleguide_html(&ws);
    assert!(
        !html.contains("<script>"),
        "Raw <script> tag must NEVER appear in HTML"
    );
    assert!(
        !html.contains("<img src=x"),
        "Raw <img> tag must NEVER appear in HTML"
    );
    assert!(
        !html.contains("<svg onload"),
        "Raw <svg> tag must NEVER appear in HTML"
    );
    assert!(
        !html.contains("<iframe"),
        "Raw <iframe> tag must NEVER appear in HTML"
    );
    assert!(
        !html.contains("alert(5)"),
        "Invalid hex color injection must be replaced with #000000"
    );
    assert!(
        html.contains("&lt;script&gt;"),
        "HTML-escaped script content should be rendered as text"
    );
    assert!(
        html.contains("#5200EA"),
        "Valid hex color must be preserved"
    );
    assert!(
        html.contains("#000000"),
        "Invalid hex color must fall back to #000000"
    );

    // Helper checks
    assert_eq!(sanitize_hex_color("#fff"), "#fff");
    assert_eq!(sanitize_hex_color("#5200EAFF"), "#5200EAFF");
    assert_eq!(
        sanitize_hex_color("red;background:url(javascript:alert(1))"),
        "#000000"
    );
    assert_eq!(escape_html("<\"'&>"), "&lt;&quot;&#39;&amp;&gt;");
    assert!(escape_js_string("a'b\"<script>").contains("\\'"));

    // BrandKit style guide HTML must also escape XSS
    let kit = BrandKit {
        id: "bk-xss".into(),
        name: "<script>alert('kit')</script>".into(),
        client: Some("<img src=x onerror=alert(1)>".into()),
        heading_font_id: None,
        heading_font_name: Some("<b>Heading</b>".into()),
        body_font_id: None,
        body_font_name: Some("<i>Body</i>".into()),
        accent_font_id: None,
        accent_font_name: None,
        colors: vec![BrandColor {
            name: "<script>c</script>".into(),
            hex: "red;background:url(evil)".into(),
            role: "<svg/onload=alert(1)>".into(),
        }],
        notes: None,
        updated_at: 1700000000,
    };
    let kit_html = AppState::generate_style_guide_html(&kit);
    assert!(!kit_html.contains("<script>"));
    assert!(!kit_html.contains("<img src=x"));
    assert!(!kit_html.contains("<svg/onload"));
    assert!(!kit_html.contains("url(evil)"));
}

// =========================================================================
// 4. MIME Types, Sorting, Design Bytes, Deep Link Tests
// =========================================================================

#[test]
fn test_font_mime_types_by_extension() {
    assert_eq!(font_mime_type_for_path(Path::new("a.ttf")), "font/ttf");
    assert_eq!(font_mime_type_for_path(Path::new("a.OTF")), "font/otf");
    assert_eq!(font_mime_type_for_path(Path::new("a.woff")), "font/woff");
    assert_eq!(font_mime_type_for_path(Path::new("a.woff2")), "font/woff2");
    assert_eq!(
        font_mime_type_for_path(Path::new("a.ttc")),
        "font/collection"
    );
    assert_eq!(
        font_mime_type_for_path(Path::new("a.otc")),
        "font/collection"
    );
}

#[test]
fn test_deep_link_url_parsing() {
    let u1 = parse_deep_link_url("Fontivo://font/42", 3920).expect("valid font deep link");
    assert!(u1.starts_with("http://127.0.0.1:3920/?"));
    assert!(u1.contains("deeplink=font"));
    assert!(u1.contains("fontId=42"));

    let u2 =
        parse_deep_link_url("fontivo://workspace/brand-1", 3920).expect("valid workspace link");
    assert!(u2.contains("tab=workspaces"));
    assert!(u2.contains("workspaceId=brand-1"));

    let u3 = parse_deep_link_url("Fontivo://search?q=Cairo", 3920).expect("valid search link");
    assert!(u3.contains("deeplink=search"));
    assert!(u3.contains("q=Cairo"));

    // Non-fontivo schemes must return None
    assert!(parse_deep_link_url("https://evil.com", 3920).is_none());
    assert!(parse_deep_link_url("javascript:alert(1)", 3920).is_none());
    assert!(parse_deep_link_url("--daemon", 3920).is_none());
}

#[test]
fn test_server_side_sorting_helpers() {
    let mut state = AppState::new();
    state.fonts = vec![
        FontRecord {
            id: 1,
            name: "Zebra.ttf".into(),
            path: "Zebra.ttf".into(),
            category: "English".into(),
            sub_category: None,
            family: Some("Zebra".into()),
            format: "ttf".into(),
            size: 100,
            is_arabic: false,
            is_latin: true,
            is_bilingual: false,
            is_variable: false,
            weight: 400,
            source: "local".into(),
            is_active: false,
            is_favorite: false,
            display_name: Some("Zebra".into()),
            style: Some("Regular".into()),
            post_script_name: None,
            glyph_count: None,
            has_tashkeel: false,
            has_extended_arabic: false,
            has_arabic_numerals: false,
            has_western_numerals: true,
            is_local: true,
        },
        FontRecord {
            id: 2,
            name: "Alpha.ttf".into(),
            path: "Alpha.ttf".into(),
            category: "English".into(),
            sub_category: None,
            family: Some("Alpha".into()),
            format: "ttf".into(),
            size: 500,
            is_arabic: false,
            is_latin: true,
            is_bilingual: false,
            is_variable: false,
            weight: 400,
            source: "local".into(),
            is_active: false,
            is_favorite: false,
            display_name: Some("Alpha".into()),
            style: Some("Regular".into()),
            post_script_name: None,
            glyph_count: None,
            has_tashkeel: false,
            has_extended_arabic: false,
            has_arabic_numerals: false,
            has_western_numerals: true,
            is_local: true,
        },
    ];

    let mut q_asc = HashMap::new();
    q_asc.insert("sortBy".into(), "name-asc".into());
    let asc = filter_fonts(&state, &q_asc);
    assert_eq!(asc[0].name, "Alpha.ttf");
    assert_eq!(asc[1].name, "Zebra.ttf");

    let mut q_desc = HashMap::new();
    q_desc.insert("sortBy".into(), "name-desc".into());
    let desc = filter_fonts(&state, &q_desc);
    assert_eq!(desc[0].name, "Zebra.ttf");
    assert_eq!(desc[1].name, "Alpha.ttf");

    let mut fams = vec![
        FamilyGroup {
            family: "SmallFam".into(),
            is_arabic: false,
            is_latin: true,
            is_bilingual: false,
            is_variable: false,
            source: "local".into(),
            category: "English".into(),
            sub_category: None,
            count: 1,
            is_active: false,
            is_all_active: false,
            is_favorite: false,
            fonts: vec![],
            has_tashkeel: false,
            has_extended_arabic: false,
            has_arabic_numerals: false,
            has_western_numerals: true,
            is_local: true,
        },
        FamilyGroup {
            family: "BigFam".into(),
            is_arabic: false,
            is_latin: true,
            is_bilingual: false,
            is_variable: false,
            source: "local".into(),
            category: "English".into(),
            sub_category: None,
            count: 12,
            is_active: false,
            is_all_active: false,
            is_favorite: false,
            fonts: vec![],
            has_tashkeel: false,
            has_extended_arabic: false,
            has_arabic_numerals: false,
            has_western_numerals: true,
            is_local: true,
        },
    ];
    sort_families(&mut fams, Some("styles-desc"));
    assert_eq!(fams[0].family, "BigFam");
    sort_families(&mut fams, Some("name-desc"));
    assert_eq!(fams[0].family, "SmallFam");
}

#[test]
fn test_validate_design_bytes_magic_checks() {
    assert!(validate_design_bytes("sample.pdf", b"%PDF-1.7\n/BaseFont /Cairo-Regular").is_ok());
    assert!(validate_design_bytes("fake.pdf", b"NOT_A_PDF").is_err());
    assert!(validate_design_bytes("evil.exe", b"MZ\x90\x00").is_err());
}

// =========================================================================
// 5. End-to-End HTTP Integration Tests (Headers, Collections, Traversal, Upload)
// =========================================================================

fn allocate_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

fn resp_json(resp: ureq::Response) -> serde_json::Value {
    let text = resp.into_string().expect("failed to read response body");
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("invalid JSON '{}': {}", text, e))
}

#[test]
fn test_http_api_security_headers_collections_and_endpoints() {
    let port = allocate_free_port();
    let mut state = AppState::new();
    // Use an isolated temp data_dir so tests don't pollute real user AppData
    let temp_data =
        std::env::temp_dir().join(format!("fontivo_http_test_{}_{}", std::process::id(), port));
    let _ = fs::remove_dir_all(&temp_data);
    fs::create_dir_all(&temp_data).unwrap();
    state.data_dir = temp_data.clone();

    let state_arc = Arc::new(RwLock::new(state));
    ApiServer::start(
        Arc::clone(&state_arc),
        port,
        PathBuf::from("nonexistent_dist"),
        None,
    );

    // Wait briefly for server socket to bind
    std::thread::sleep(Duration::from_millis(150));

    let base = format!("http://127.0.0.1:{}", port);

    // 1. Security Headers + CSP check on GET /api/system/admin-status
    let resp = ureq::get(&format!("{}/api/system/admin-status", base))
        .call()
        .expect("admin-status should respond 200");
    assert_eq!(resp.header("X-Content-Type-Options"), Some("nosniff"));
    assert_eq!(resp.header("X-Frame-Options"), Some("DENY"));
    assert_eq!(resp.header("Referrer-Policy"), Some("no-referrer"));
    assert!(
        resp.header("Content-Security-Policy")
            .map(|h| h.contains("default-src 'self'"))
            .unwrap_or(false),
        "CSP header must be present"
    );
    let admin_json = resp_json(resp);
    assert_eq!(admin_json["success"], true);
    assert!(admin_json["isAdmin"].is_boolean());

    // 2. POST -> GET -> DELETE /api/collections
    let col_name = "AuditTestCollection";
    let create_resp = ureq::post(&format!("{}/api/collections", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "name": col_name }).to_string())
        .expect("POST /api/collections should succeed");
    let create_json = resp_json(create_resp);
    assert_eq!(create_json["success"], true);

    let list_json = resp_json(
        ureq::get(&format!("{}/api/collections", base))
            .call()
            .unwrap(),
    );
    assert!(list_json["collections"][col_name].is_array());

    let del_resp = ureq::delete(&format!("{}/api/collections", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "name": col_name }).to_string())
        .expect("DELETE /api/collections should succeed");
    let del_json = resp_json(del_resp);
    assert_eq!(del_json["success"], true);

    let list_after = resp_json(
        ureq::get(&format!("{}/api/collections", base))
            .call()
            .unwrap(),
    );
    assert!(list_after["collections"][col_name].is_null());

    // 3. Workspace Path Traversal blocked with HTTP 400
    let ws_err = ureq::get(&format!("{}/api/workspaces/..%2F..%2Fsecret", base)).call();
    match ws_err {
        Err(ureq::Error::Status(code, _)) => assert_eq!(code, 400),
        other => panic!("Expected HTTP 400 on workspace traversal, got {:?}", other),
    }

    // 4. Downloader SSRF / SHA-256 override blocked with HTTP 400
    let dl_err = ureq::post(&format!("{}/api/github/download-pack", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "packId": "pack-essential-001",
                "downloadUrl": "http://127.0.0.1:9999/evil.zip",
                "sha256": ""
            })
            .to_string(),
        );
    match dl_err {
        Err(ureq::Error::Status(code, _)) => assert_eq!(code, 400),
        other => panic!("Expected HTTP 400 on SSRF/SHA override, got {:?}", other),
    }

    // 5. Uninstall arbitrary path outside Windows Fonts blocked with HTTP 400
    let uninst_err = ureq::post(&format!("{}/api/system/windows-fonts/uninstall", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "name": "Evil",
                "path": "C:\\Users\\Public\\important.txt"
            })
            .to_string(),
        );
    match uninst_err {
        Err(ureq::Error::Status(code, _)) => assert_eq!(code, 400),
        other => panic!(
            "Expected HTTP 400 on arbitrary uninstall path, got {:?}",
            other
        ),
    }

    // 6. POST /api/inspect-design-upload with valid PDF bytes + raw binary upload
    let pdf_bytes = b"%PDF-1.7\n1 0 obj\n<< /Type /Font /BaseFont /Cairo-Regular >>\nendobj\n";
    let upload_resp = ureq::post(&format!(
        "{}/api/inspect-design-upload?fileName=poster.pdf&autoActivate=false",
        base
    ))
    .set("Content-Type", "application/octet-stream")
    .send_bytes(pdf_bytes)
    .expect("POST /api/inspect-design-upload should accept valid PDF bytes");
    let upload_json = resp_json(upload_resp);
    assert_eq!(upload_json["success"], true);
    assert_eq!(upload_json["fileName"], "poster.pdf");
    assert!(upload_json["totalFonts"].as_u64().unwrap_or(0) >= 1);
    assert!(upload_json["availableIds"].is_array());

    // 6b. POST /api/activate-batch accepts numeric or string IDs and returns standard fields
    let batch_resp = ureq::post(&format!("{}/api/activate-batch", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "ids": [999999, "888888"] }).to_string())
        .expect("POST /api/activate-batch should respond 200");
    let batch_json = resp_json(batch_resp);
    assert_eq!(batch_json["success"], true);
    assert!(batch_json["activatedCount"].is_u64());
    assert!(batch_json["activatedIds"].is_array());

    // Invalid magic bytes rejected with HTTP 400
    let bad_upload = ureq::post(&format!(
        "{}/api/inspect-design-upload?fileName=fake.pdf",
        base
    ))
    .set("Content-Type", "application/octet-stream")
    .send_bytes(b"NOT A REAL PDF FILE");
    match bad_upload {
        Err(ureq::Error::Status(code, _)) => assert_eq!(code, 400),
        other => panic!("Expected HTTP 400 on fake PDF upload, got {:?}", other),
    }

    // 7. GET /api/system/resources live telemetry check
    let res_resp = ureq::get(&format!("{}/api/system/resources", base))
        .call()
        .expect("GET /api/system/resources should respond 200");
    let res_json = resp_json(res_resp);
    assert_eq!(res_json["success"], true);
    assert!(res_json["ram"]["totalMb"].as_f64().unwrap_or(0.0) > 0.0);
    assert!(res_json["cpu"]["coresCount"].as_u64().unwrap_or(0) >= 1);
    assert!(res_json["gpu"]["vramTotalMb"].as_f64().unwrap_or(0.0) > 0.0);
    assert!(res_json["topProcesses"].is_array());
    assert!(res_json["cacheBreakdown"]["gdiFontHandles"]
        .as_u64()
        .is_some());

    // 8. POST /api/system/trim-process & GET /api/system/operations
    let trim_resp = ureq::post(&format!("{}/api/system/trim-process", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "pid": std::process::id() }).to_string())
        .expect("POST /api/system/trim-process should respond 200");
    let trim_json = resp_json(trim_resp);
    assert_eq!(trim_json["success"], true);

    let ops_resp = ureq::get(&format!("{}/api/system/operations", base))
        .call()
        .expect("GET /api/system/operations should respond 200");
    let ops_json = resp_json(ops_resp);
    assert_eq!(ops_json["success"], true);
    assert!(ops_json["operations"]
        .as_array()
        .map(|a| !a.is_empty())
        .unwrap_or(false));

    // 9. GET /api/color/cursor-live (5x5 grid, OKLCH, CMYK, HSL, Harmony Palette)
    let color_resp = ureq::get(&format!("{}/api/color/cursor-live", base))
        .call()
        .expect("GET /api/color/cursor-live should respond 200");
    let color_json = resp_json(color_resp);
    assert_eq!(color_json["success"], true);
    assert_eq!(color_json["grid5x5"].as_array().map(|g| g.len()), Some(5));
    assert!(color_json["harmonyPalette"]["complementary"].is_array());
    assert!(color_json["oklch"]["l"].is_number());
    assert!(color_json["cmyk"]["k"].is_number());

    // 10. POST /api/workspaces/scan-folder
    let scan_dir = temp_data.join("scan_project");
    fs::create_dir_all(&scan_dir).unwrap();
    fs::write(
        scan_dir.join("poster.pdf"),
        b"%PDF-1.7\n1 0 obj\n<< /Type /Font /BaseFont /Cairo-Bold >>\nendobj\n",
    )
    .unwrap();
    let scan_resp = ureq::post(&format!("{}/api/workspaces/scan-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": "fontivo-brand-system",
                "folderPath": scan_dir.to_string_lossy()
            })
            .to_string(),
        )
        .expect("POST /api/workspaces/scan-folder should respond 200");
    let scan_json = resp_json(scan_resp);
    assert_eq!(scan_json["success"], true);
    assert_eq!(
        scan_json["designFiles"].as_array().map(|a| a.len()),
        Some(1)
    );

    // 11. Full Workspace CRUD + Palette + Design Upload/Scan/Delete roundtrip
    let ws_id = "e2e-audit-workspace";
    let custom_ws_root = temp_data.join("Workspaces").join(ws_id);
    let create_ws_resp = ureq::post(&format!("{}/api/workspaces", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": ws_id,
                "name": "E2E Audit Brand",
                "client": "Audit Client",
                "folderPath": custom_ws_root.to_string_lossy(),
                "projectFonts": [{ "name": "Cairo Bold", "family": "Cairo" }],
                "palette": [{ "name": "Coral", "hex": "#F16B50", "role": "primary" }],
                "tasks": [{ "id": "t1", "text": "Initial task", "status": "todo" }],
                "notes": "Initial notes"
            })
            .to_string(),
        )
        .expect("POST /api/workspaces should succeed");
    let created_ws = resp_json(create_ws_resp);
    assert_eq!(created_ws["success"], true);
    assert_eq!(created_ws["projectFonts"].as_array().map(|a| a.len()), Some(1));

    // Update palette via /api/workspaces/save-palette
    let pal_resp = ureq::post(&format!("{}/api/workspaces/save-palette", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "workspaceId": ws_id,
                "palette": [
                    { "name": "Coral", "hex": "#F16B50", "role": "primary" },
                    { "name": "Mint", "hex": "#10B981", "role": "accent" }
                ]
            })
            .to_string(),
        )
        .expect("POST /api/workspaces/save-palette should succeed");
    let pal_json = resp_json(pal_resp);
    assert_eq!(pal_json["success"], true);
    assert_eq!(pal_json["paletteCount"], 2);
    assert!(custom_ws_root.join("Palettes").join("palette.ase").is_file());

    // Upload a real PNG design into Designs/Campaigns
    let png_bytes = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ];
    let up_resp = ureq::post(&format!(
        "{}/api/workspaces/{}/upload-design?fileName=hero.png&subfolder=Designs%2FCampaigns",
        base, ws_id
    ))
    .send_bytes(&png_bytes)
    .expect("upload-design should succeed");
    let up_json = resp_json(up_resp);
    assert_eq!(up_json["success"], true);
    assert_eq!(up_json["design"]["relativePath"], "Designs/Campaigns/hero.png");

    // Scan workspace folder & verify uploaded PNG appears with previewUrl
    let scan_ws_resp = ureq::post(&format!("{}/api/workspaces/scan-folder", base))
        .set("Content-Type", "application/json")
        .send_string(
            &serde_json::json!({
                "id": ws_id,
                "folderPath": custom_ws_root.to_string_lossy()
            })
            .to_string(),
        )
        .expect("scan-folder on workspace should succeed");
    let scan_ws_json = resp_json(scan_ws_resp);
    assert_eq!(scan_ws_json["success"], true);
    assert_eq!(
        scan_ws_json["designFiles"].as_array().map(|a| a.len()),
        Some(1)
    );
    assert_eq!(
        scan_ws_json["designFiles"][0]["relativePath"],
        "Designs/Campaigns/hero.png"
    );

    // Delete the uploaded design file
    let del_design_resp = ureq::delete(&format!(
        "{}/api/workspaces/{}/design-file?path=Designs%2FCampaigns%2Fhero.png",
        base, ws_id
    ))
    .call()
    .expect("DELETE /api/workspaces/:id/design-file should succeed");
    let del_design_json = resp_json(del_design_resp);
    assert_eq!(del_design_json["success"], true);
    assert!(!custom_ws_root
        .join("Designs")
        .join("Campaigns")
        .join("hero.png")
        .exists());

    // Delete workspace completely
    let del_ws_resp = ureq::delete(&format!("{}/api/workspaces/{}", base, ws_id))
        .call()
        .expect("DELETE /api/workspaces/:id should succeed");
    let del_ws_json = resp_json(del_ws_resp);
    assert_eq!(del_ws_json["success"], true);
    assert!(ureq::get(&format!("{}/api/workspaces/{}", base, ws_id)).call().is_err());

    // 12. POST /api/fonts/delete
    let total_before = {
        let st = state_arc.read().unwrap();
        st.fonts.len()
    };
    let last_id = {
        let st = state_arc.read().unwrap();
        st.fonts.last().map(|f| f.id).unwrap()
    };
    let del_font_resp = ureq::post(&format!("{}/api/fonts/delete", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "id": last_id }).to_string())
        .expect("POST /api/fonts/delete should respond 200");
    let del_font_json = resp_json(del_font_resp);
    assert_eq!(del_font_json["success"], true);
    let total_after = {
        let st = state_arc.read().unwrap();
        st.fonts.len()
    };
    assert_eq!(total_after, total_before - 1);

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_delete_library_family_removes_all_variants_and_empty_dirs() {
    let temp_data =
        std::env::temp_dir().join(format!("fontivo_del_fam_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_data);
    let custom_fam_dir = temp_data.join("Fonts").join("Custom").join("TestFamily");
    fs::create_dir_all(&custom_fam_dir).unwrap();

    let f1 = custom_fam_dir.join("TestFamily-Regular.ttf");
    let f2 = custom_fam_dir.join("TestFamily-Bold.ttf");
    fs::write(&f1, b"DUMMY_FONT_1").unwrap();
    fs::write(&f2, b"DUMMY_FONT_2").unwrap();

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.fonts.push(Fontivo::server::state::FontRecord {
        id: 90001,
        name: "TestFamily-Regular.ttf".into(),
        path: f1.to_string_lossy().into_owned(),
        category: "02 - English Fonts".into(),
        sub_category: Some("Custom Fonts".into()),
        family: Some("TestFamily".into()),
        format: "TTF".into(),
        size: 12,
        is_arabic: false,
        is_latin: true,
        is_bilingual: false,
        is_variable: false,
        weight: 400,
        source: "local".into(),
        is_active: false,
        is_favorite: false,
        display_name: Some("TestFamily Regular".into()),
        style: Some("Regular".into()),
        post_script_name: Some("TestFamily-Regular".into()),
        glyph_count: Some(10),
        has_tashkeel: false,
        has_extended_arabic: false,
        has_arabic_numerals: false,
        has_western_numerals: true,
        is_local: true,
    });
    state.fonts.push(Fontivo::server::state::FontRecord {
        id: 90002,
        name: "TestFamily-Bold.ttf".into(),
        path: f2.to_string_lossy().into_owned(),
        category: "02 - English Fonts".into(),
        sub_category: Some("Custom Fonts".into()),
        family: Some("TestFamily".into()),
        format: "TTF".into(),
        size: 12,
        is_arabic: false,
        is_latin: true,
        is_bilingual: false,
        is_variable: false,
        weight: 700,
        source: "local".into(),
        is_active: false,
        is_favorite: false,
        display_name: Some("TestFamily Bold".into()),
        style: Some("Bold".into()),
        post_script_name: Some("TestFamily-Bold".into()),
        glyph_count: Some(10),
        has_tashkeel: false,
        has_extended_arabic: false,
        has_arabic_numerals: false,
        has_western_numerals: true,
        is_local: true,
    });

    let deleted = state
        .delete_library_family("TestFamily")
        .expect("Should delete entire TestFamily");
    assert_eq!(deleted.len(), 2);
    assert!(!f1.exists());
    assert!(!f2.exists());
    assert!(
        !custom_fam_dir.exists(),
        "Empty parent family folder should be pruned on family deletion"
    );

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_duplicate_detection_sha256_path_and_metadata() {
    let temp_data = std::env::temp_dir().join(format!("fontivo_dup_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_data);
    let fonts_dir = temp_data.join("Fonts").join("Custom");
    fs::create_dir_all(&fonts_dir).unwrap();

    let payload = b"FONT_CONTENT_UNIQUE_BYTES_12345";
    let existing_file = fonts_dir.join("BrandSans-Regular.ttf");
    fs::write(&existing_file, payload).unwrap();

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.fonts.push(Fontivo::server::state::FontRecord {
        id: 91001,
        name: "BrandSans-Regular.ttf".into(),
        path: existing_file.to_string_lossy().into_owned(),
        category: "02 - English Fonts".into(),
        sub_category: Some("Custom Fonts".into()),
        family: Some("BrandSans".into()),
        format: "TTF".into(),
        size: payload.len(),
        is_arabic: false,
        is_latin: true,
        is_bilingual: false,
        is_variable: false,
        weight: 400,
        source: "local".into(),
        is_active: false,
        is_favorite: false,
        display_name: Some("BrandSans Regular".into()),
        style: Some("Regular".into()),
        post_script_name: Some("BrandSans-Regular".into()),
        glyph_count: Some(50),
        has_tashkeel: false,
        has_extended_arabic: false,
        has_arabic_numerals: false,
        has_western_numerals: true,
        is_local: true,
    });

    // 1. Same bytes under different filename should match by SHA-256
    let dup_hash = state.find_duplicate_font(
        None,
        Some(payload),
        "RenamedCopy.ttf",
        Some("OtherName"),
        Some("Regular"),
        None,
        payload.len(),
    );
    assert!(dup_hash.is_some());
    assert_eq!(dup_hash.unwrap().match_reason, "sha256");

    // 2. Same path should match by path
    let dup_path = state.find_duplicate_font(
        Some(&existing_file),
        None,
        "BrandSans-Regular.ttf",
        None,
        None,
        None,
        payload.len(),
    );
    assert!(dup_path.is_some());
    assert_eq!(dup_path.unwrap().match_reason, "path");

    // 3. Different bytes + different metadata must NOT false-positive
    let other_bytes = b"COMPLETELY_DIFFERENT_FONT_999";
    let no_dup = state.find_duplicate_font(
        None,
        Some(other_bytes),
        "UniqueFont-Bold.ttf",
        Some("UniqueFont"),
        Some("Bold"),
        Some("UniqueFont-Bold"),
        other_bytes.len(),
    );
    assert!(no_dup.is_none());

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_workspace_nested_folders_validation_and_migration() {
    use Fontivo::server::routes::workspaces::validate_relative_subfolder;

    assert_eq!(
        validate_relative_subfolder("Designs\\Campaigns\\Ramadan-2026").unwrap(),
        "Designs/Campaigns/Ramadan-2026"
    );
    assert!(validate_relative_subfolder("../Windows/System32").is_err());
    assert!(validate_relative_subfolder("C:\\secret").is_err());

    let temp_data =
        std::env::temp_dir().join(format!("fontivo_migrate_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_data);
    fs::create_dir_all(temp_data.join("CustomFonts")).unwrap();
    fs::create_dir_all(temp_data.join("Library").join("GoogleFonts")).unwrap();
    fs::create_dir_all(temp_data.join("Library").join("Downloads")).unwrap();
    fs::write(temp_data.join("CustomFonts").join("MyCustom.ttf"), b"ABC").unwrap();
    fs::write(
        temp_data
            .join("Library")
            .join("GoogleFonts")
            .join("Cairo.ttf"),
        b"DEF",
    )
    .unwrap();

    let mut state = AppState::new();
    state.data_dir = temp_data.clone();
    state.migrate_legacy_storage();

    assert!(temp_data
        .join("Fonts")
        .join("Custom")
        .join("MyCustom.ttf")
        .is_file());
    assert!(temp_data
        .join("Fonts")
        .join("Google")
        .join("Cairo.ttf")
        .is_file());
    assert!(!temp_data.join("CustomFonts").exists());
    assert!(!temp_data.join("Library").exists());

    let _ = fs::remove_dir_all(&temp_data);
}
