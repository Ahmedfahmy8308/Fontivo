use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use Fontivo::server::api_server::ApiServer;
use Fontivo::server::state::AppState;

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
fn test_open_url_rejects_invalid_schemes_and_shell_injection() {
    let temp_data = make_temp_dir("fontivo_v117_open_url_reject");
    let (base, _state) = start_isolated_server(&temp_data);

    let invalid_urls = [
        "javascript:alert(1)",
        "file:///C:/Windows/System32/calc.exe",
        "cmd:/c calc.exe",
        "https://example.com & calc.exe",
        "https://example.com|calc.exe",
        "https://example.com<script>",
        "https://example.com>out.txt",
        "https://example.com^calc",
        "https://example.com\"foo",
        "https://example.com'foo",
        "https://example.com foo",
        "https://example.com\nfoo",
        "https://",
        "",
    ];

    for bad_url in invalid_urls {
        let res = ureq::post(&format!("{}/api/system/open-url", base))
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "url": bad_url }).to_string());
        match res {
            Err(ureq::Error::Status(400, resp)) => {
                let body = resp_json(resp);
                assert_eq!(body["success"], false, "expected failure for {}", bad_url);
            }
            other => panic!("expected 400 for '{}', got {:?}", bad_url, other),
        }
    }

    let _ = fs::remove_dir_all(&temp_data);
}

#[test]
fn test_open_url_allows_valid_https_url() {
    let temp_data = make_temp_dir("fontivo_v117_open_url_allow");
    let (base, _state) = start_isolated_server(&temp_data);

    let target = "https://ahmed-fahmy.engineer/";
    let resp = ureq::post(&format!("{}/api/system/open-url", base))
        .set("Content-Type", "application/json")
        .send_string(&serde_json::json!({ "url": target }).to_string())
        .expect("POST /api/system/open-url should succeed for valid https URL");

    assert_eq!(resp.status(), 200);
    let body = resp_json(resp);
    assert_eq!(body["success"], true);
    assert_eq!(body["url"], target);

    let _ = fs::remove_dir_all(&temp_data);
}
