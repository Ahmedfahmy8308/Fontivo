use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Response, Server, StatusCode};

use super::state::{AppState, PendingAdobeDocument};

pub struct AdobeListener;

impl AdobeListener {
    pub fn start(state: Arc<RwLock<AppState>>, port: u16) {
        // Start lightweight Windows Adobe Active Document Monitor alongside the HTTP/JSON-RPC bridge
        Self::start_window_monitor(Arc::clone(&state));

        thread::spawn(move || {
            let addr = format!("127.0.0.1:{}", port);
            let server = match Server::http(&addr) {
                Ok(s) => {
                    println!(
                        " Adobe CC Auto-Activation Listener running on http://{}",
                        addr
                    );
                    s
                }
                Err(e) => {
                    eprintln!(
                        "[!] Failed to bind Adobe CC listener on port {}: {}",
                        port, e
                    );
                    return;
                }
            };

            for mut req in server.incoming_requests() {
                let url = req.url().to_string();
                let method = req.method().to_string();

                // Origin & CORS Security Validation: Protect against cross-site attacks
                let origin_header = req
                    .headers()
                    .iter()
                    .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("Origin"));
                let validated_origin = match super::security::validate_origin(
                    origin_header.map(|h| h.value.as_str()),
                    port,
                ) {
                    Ok(val) => val,
                    Err(e) => {
                        let res = Response::from_string(format!("403 Forbidden: {}", e))
                            .with_status_code(StatusCode(403));
                        let _ = req.respond(res);
                        continue;
                    }
                };

                // Never set wildcard '*' for sensitive Adobe socket endpoints
                let cors_origin_str =
                    validated_origin.unwrap_or_else(|| format!("http://127.0.0.1:{}", port));
                let cors_header = Header::from_bytes(
                    &b"Access-Control-Allow-Origin"[..],
                    cors_origin_str.as_bytes(),
                )
                .unwrap();
                let cors_methods = Header::from_bytes(
                    &b"Access-Control-Allow-Methods"[..],
                    &b"GET, POST, OPTIONS"[..],
                )
                .unwrap();
                let cors_headers =
                    Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..])
                        .unwrap();
                let json_header =
                    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();

                if method == "OPTIONS" {
                    let mut res = Response::from_string("");
                    res.add_header(cors_header);
                    res.add_header(cors_methods);
                    res.add_header(cors_headers);
                    let _ = req.respond(res);
                    continue;
                }

                if method == "GET" && (url == "/" || url.is_empty()) {
                    let body = r#"{"status":"ok","app":"Fontivo","version":"1.0.2","fontBaseCompatible":true}"#;
                    let mut res = Response::from_string(body);
                    res.add_header(cors_header);
                    res.add_header(json_header);
                    let _ = req.respond(res);
                } else if method == "GET" && url.starts_with("/status") {
                    let count = {
                        let st = state.read().unwrap();
                        st.active_font_ids.len()
                    };
                    let body = format!(r#"{{"running":true,"activeFonts":{}}}"#, count);
                    let mut res = Response::from_string(body);
                    res.add_header(cors_header);
                    res.add_header(json_header);
                    let _ = req.respond(res);
                } else if method == "POST"
                    && (url.starts_with("/activate")
                        || url == "/"
                        || url == "/rpc"
                        || url == "/jsonrpc")
                {
                    use std::io::Read;
                    let mut body = String::new();
                    let _ = req
                        .as_reader()
                        .take(10 * 1024 * 1024)
                        .read_to_string(&mut body);

                    // Check for JSON-RPC 2.0 payload from Adobe Photoshop CEP
                    if body.contains("\"jsonrpc\"") {
                        Self::handle_json_rpc(&body, &state, cors_header, json_header, req);
                        continue;
                    }

                    #[derive(serde::Deserialize)]
                    struct ActivateReq {
                        #[serde(rename = "postscriptName")]
                        post_script_name: Option<String>,
                        family: Option<String>,
                    }

                    let parsed: Result<ActivateReq, _> = serde_json::from_str(&body);
                    let mut activated_name = None;

                    if let Ok(data) = parsed {
                        let target_ps = data.post_script_name.map(|s| s.to_lowercase());
                        let target_fam = data.family.map(|s| s.to_lowercase());

                        let mut st = state.write().unwrap();
                        let found = st
                            .fonts
                            .iter()
                            .find(|f| {
                                if let Some(ref ps) = target_ps {
                                    if let Some(ref f_ps) = f.post_script_name {
                                        if f_ps.to_lowercase() == *ps {
                                            return true;
                                        }
                                    }
                                    if f.name.to_lowercase().contains(ps) {
                                        return true;
                                    }
                                }
                                if let Some(ref fam) = target_fam {
                                    if let Some(ref f_fam) = f.family {
                                        if f_fam.to_lowercase() == *fam {
                                            return true;
                                        }
                                    }
                                }
                                false
                            })
                            .cloned();

                        if let Some(font) = found {
                            let _ = st.activator.activate_ram(&font.path);
                            st.active_font_ids.insert(font.id);
                            if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                                f_mut.is_active = true;
                            }
                            st.save_active_fonts();
                            activated_name = Some(font.display_name.unwrap_or(font.name));
                        }
                    }

                    let res_body = if let Some(name) = activated_name {
                        println!(" Adobe CC auto-activated font: {}", name);
                        format!(r#"{{"success":true,"font":"{}"}}"#, name)
                    } else {
                        r#"{"success":false,"message":"Font not found in library"}"#.to_string()
                    };

                    let mut res = Response::from_string(res_body);
                    res.add_header(cors_header);
                    res.add_header(json_header);
                    let _ = req.respond(res);
                } else if method == "POST" && url.starts_with("/deactivate") {
                    use std::io::Read;
                    let mut body = String::new();
                    let _ = req
                        .as_reader()
                        .take(10 * 1024 * 1024)
                        .read_to_string(&mut body);

                    #[derive(serde::Deserialize)]
                    struct DeactivateReq {
                        #[serde(rename = "postscriptName")]
                        post_script_name: Option<String>,
                        family: Option<String>,
                    }

                    let parsed: Result<DeactivateReq, _> = serde_json::from_str(&body);
                    if let Ok(data) = parsed {
                        let mut st = state.write().unwrap();
                        let target_ps = data.post_script_name.map(|s| s.to_lowercase());
                        let target_fam = data.family.map(|s| s.to_lowercase());

                        let found = st
                            .fonts
                            .iter()
                            .find(|f| {
                                if let Some(ref ps) = target_ps {
                                    if let Some(ref f_ps) = f.post_script_name {
                                        if f_ps.to_lowercase() == *ps {
                                            return true;
                                        }
                                    }
                                }
                                if let Some(ref fam) = target_fam {
                                    if let Some(ref f_fam) = f.family {
                                        if f_fam.to_lowercase() == *fam {
                                            return true;
                                        }
                                    }
                                }
                                false
                            })
                            .cloned();

                        if let Some(font) = found {
                            let _ = st.activator.deactivate_ram(&font.path);
                            st.active_font_ids.remove(&font.id);
                            if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                                f_mut.is_active = false;
                            }
                            st.save_active_fonts();
                        }
                    }

                    let mut res = Response::from_string(r#"{"success":true}"#);
                    res.add_header(cors_header);
                    res.add_header(json_header);
                    let _ = req.respond(res);
                } else {
                    let mut res = Response::from_string("Not Found");
                    res.add_header(cors_header);
                    let _ = req.respond(res);
                }
            }
        });
    }

    /// Handles Adobe Photoshop / Illustrator CEP JSON-RPC 2.0 messages over loopback socket
    pub fn handle_json_rpc(
        body: &str,
        state: &Arc<RwLock<AppState>>,
        cors_header: Header,
        json_header: Header,
        req: tiny_http::Request,
    ) {
        #[derive(serde::Deserialize)]
        struct JsonRpcMessage {
            #[allow(dead_code)]
            jsonrpc: Option<String>,
            id: Option<serde_json::Value>,
            method: Option<String>,
            params: Option<serde_json::Value>,
        }

        let parsed: Result<JsonRpcMessage, _> = serde_json::from_str(body);
        let res_str = match parsed {
            Err(_) => {
                r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}"#
                    .to_string()
            }
            Ok(msg) => {
                let req_id = msg.id.unwrap_or(serde_json::Value::Null);
                let method = msg.method.unwrap_or_default();
                match method.as_str() {
                    "queryMissingFonts" => {
                        let mut results = Vec::new();
                        let mut st = state.write().unwrap();
                        if let Some(params) = msg.params {
                            let font_queries =
                                if let Some(arr) = params.get("fonts").and_then(|v| v.as_array()) {
                                    arr.clone()
                                } else if let Some(arr) = params.as_array() {
                                    arr.clone()
                                } else {
                                    vec![]
                                };

                            for q in font_queries {
                                let (target_ps, target_fam) = if let Some(s) = q.as_str() {
                                    (Some(s.to_lowercase()), Some(s.to_lowercase()))
                                } else {
                                    (
                                        q.get("postscriptName")
                                            .or_else(|| q.get("postScriptName"))
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_lowercase()),
                                        q.get("family")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_lowercase()),
                                    )
                                };

                                let found = st
                                    .fonts
                                    .iter()
                                    .find(|f| {
                                        if let Some(ref ps) = target_ps {
                                            if let Some(ref f_ps) = f.post_script_name {
                                                if f_ps.to_lowercase() == *ps {
                                                    return true;
                                                }
                                            }
                                            if f.name.to_lowercase().contains(ps) {
                                                return true;
                                            }
                                        }
                                        if let Some(ref fam) = target_fam {
                                            if let Some(ref f_fam) = f.family {
                                                if f_fam.to_lowercase() == *fam {
                                                    return true;
                                                }
                                            }
                                        }
                                        false
                                    })
                                    .cloned();

                                if let Some(font) = found {
                                    let _ = st.activator.activate_ram(&font.path);
                                    st.active_font_ids.insert(font.id);
                                    if let Some(f_mut) =
                                        st.fonts.iter_mut().find(|f| f.id == font.id)
                                    {
                                        f_mut.is_active = true;
                                    }
                                    results.push(serde_json::json!({
                                    "font": font.display_name.unwrap_or(font.name),
                                    "postscriptName": font.post_script_name,
                                    "status": "activated",
                                    "available": true
                                    }));
                                } else {
                                    results.push(serde_json::json!({
                                    "font": target_ps.or(target_fam).unwrap_or_default(),
                                    "status": "missing",
                                    "available": false
                                    }));
                                }
                            }
                            st.save_active_fonts();
                        }

                        let resp = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                        "status": "ok",
                        "resolvedFonts": results,
                        "activeCount": st.active_font_ids.len()
                        }
                        });
                        resp.to_string()
                    }
                    "activate" | "activateFont" => {
                        let mut activated_name = None;
                        if let Some(params) = msg.params {
                            let target_ps = params
                                .get("postscriptName")
                                .or_else(|| params.get("postScriptName"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_lowercase());
                            let target_fam = params
                                .get("family")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_lowercase());

                            let mut st = state.write().unwrap();
                            let found = st
                                .fonts
                                .iter()
                                .find(|f| {
                                    if let Some(ref ps) = target_ps {
                                        if let Some(ref f_ps) = f.post_script_name {
                                            if f_ps.to_lowercase() == *ps {
                                                return true;
                                            }
                                        }
                                        if f.name.to_lowercase().contains(ps) {
                                            return true;
                                        }
                                    }
                                    if let Some(ref fam) = target_fam {
                                        if let Some(ref f_fam) = f.family {
                                            if f_fam.to_lowercase() == *fam {
                                                return true;
                                            }
                                        }
                                    }
                                    false
                                })
                                .cloned();

                            if let Some(font) = found {
                                let _ = st.activator.activate_ram(&font.path);
                                st.active_font_ids.insert(font.id);
                                if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                                    f_mut.is_active = true;
                                }
                                st.save_active_fonts();
                                activated_name = Some(font.display_name.unwrap_or(font.name));
                            }
                        }

                        let resp = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                        "success": activated_name.is_some(),
                        "font": activated_name
                        }
                        });
                        resp.to_string()
                    }
                    "deactivate" | "deactivateFont" => {
                        if let Some(params) = msg.params {
                            let target_ps = params
                                .get("postscriptName")
                                .or_else(|| params.get("postScriptName"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_lowercase());
                            let target_fam = params
                                .get("family")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_lowercase());

                            let mut st = state.write().unwrap();
                            let found = st
                                .fonts
                                .iter()
                                .find(|f| {
                                    if let Some(ref ps) = target_ps {
                                        if let Some(ref f_ps) = f.post_script_name {
                                            if f_ps.to_lowercase() == *ps {
                                                return true;
                                            }
                                        }
                                    }
                                    if let Some(ref fam) = target_fam {
                                        if let Some(ref f_fam) = f.family {
                                            if f_fam.to_lowercase() == *fam {
                                                return true;
                                            }
                                        }
                                    }
                                    false
                                })
                                .cloned();

                            if let Some(font) = found {
                                let _ = st.activator.deactivate_ram(&font.path);
                                st.active_font_ids.remove(&font.id);
                                if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                                    f_mut.is_active = false;
                                }
                                st.save_active_fonts();
                            }
                        }

                        let resp = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": { "success": true }
                        });
                        resp.to_string()
                    }
                    "status" | "ping" => {
                        let count = {
                            let st = state.read().unwrap();
                            st.active_font_ids.len()
                        };
                        let resp = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                        "running": true,
                        "app": "Fontivo",
                        "version": "1.0.2",
                        "activeFonts": count
                        }
                        });
                        resp.to_string()
                    }
                    _ => {
                        let resp = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": { "code": -32601, "message": "Method not found" }
                        });
                        resp.to_string()
                    }
                }
            }
        };

        let mut res = Response::from_string(res_str);
        res.add_header(cors_header);
        res.add_header(json_header);
        let _ = req.respond(res);
    }

    /// Parses a Photoshop / Illustrator / InDesign window title into `(AppName, DocumentFileName)`.
    /// Example: `"Poster.psd @ 100% (RGB/8) * - Adobe Photoshop 2025"` -> `Some(("Photoshop", "Poster.psd"))`
    pub fn parse_adobe_window_title(app_exe: &str, title: &str) -> Option<(String, String)> {
        let exe_low = app_exe.to_ascii_lowercase();
        let app_name = if exe_low.contains("photoshop") {
            "Photoshop"
        } else if exe_low.contains("illustrator") {
            "Illustrator"
        } else if exe_low.contains("indesign") {
            "InDesign"
        } else {
            return None;
        };

        let trimmed = title.trim();
        if trimmed.is_empty() {
            return None;
        }

        // Extract the left-hand segment before " @ " or " - Adobe"
        let head = trimmed
            .split(" @ ")
            .next()
            .unwrap_or(trimmed)
            .split(" - Adobe")
            .next()
            .unwrap_or(trimmed)
            .trim()
            .trim_end_matches('*')
            .trim();

        let lower = head.to_ascii_lowercase();
        let valid_exts = [".psd", ".psb", ".ai", ".indd", ".pdf", ".eps"];
        for ext in valid_exts {
            if let Some(idx) = lower.rfind(ext) {
                let end = idx + ext.len();
                let candidate = head[..end].trim();
                let file_name = Path::new(candidate)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(candidate)
                    .trim();
                if !file_name.is_empty() {
                    return Some((app_name.to_string(), file_name.to_string()));
                }
            }
        }

        None
    }

    /// Searches candidate directories for a design file matching `doc_name`, checking root directories directly first.
    pub fn resolve_adobe_document_path(
        doc_name: &str,
        search_roots: &[PathBuf],
    ) -> Option<PathBuf> {
        let target_low = doc_name.to_ascii_lowercase();

        // 1. Instant direct root check (e.g. Downloads/doc_name, Desktop/doc_name)
        for root in search_roots {
            if !root.exists() || !root.is_dir() {
                continue;
            }
            let direct = root.join(doc_name);
            if direct.exists() && direct.is_file() {
                return Some(direct);
            }
            if let Ok(entries) = fs::read_dir(root) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        if let Some(fname) = p.file_name().and_then(|s| s.to_str()) {
                            if fname.to_ascii_lowercase() == target_low {
                                return Some(p);
                            }
                        }
                    }
                }
            }
        }

        // 2. Bounded recursive search for subdirectories (e.g. project subfolders)
        fn walk_limited(
            dir: &Path,
            target_low: &str,
            depth: usize,
            visited: &mut usize,
        ) -> Option<PathBuf> {
            if depth > 3 || *visited > 3000 {
                return None;
            }
            let entries = fs::read_dir(dir).ok()?;
            for entry in entries.flatten() {
                *visited += 1;
                if *visited > 3000 {
                    return None;
                }
                let p = entry.path();
                if p.is_file() {
                    if let Some(fname) = p.file_name().and_then(|s| s.to_str()) {
                        if fname.to_ascii_lowercase() == target_low {
                            return Some(p);
                        }
                    }
                } else if p.is_dir() && depth < 3 {
                    let dir_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if !dir_name.starts_with('.') && !dir_name.eq_ignore_ascii_case("node_modules")
                    {
                        if let Some(found) = walk_limited(&p, target_low, depth + 1, visited) {
                            return Some(found);
                        }
                    }
                }
            }
            None
        }

        for root in search_roots {
            if root.exists() && root.is_dir() {
                let mut visited = 0usize;
                if let Some(found) = walk_limited(root, &target_low, 0, &mut visited) {
                    return Some(found);
                }
            }
        }
        None
    }

    /// Collects standard user design directories (Downloads, Desktop, Documents, Pictures + custom downloads + OneDrive)
    fn default_design_search_roots() -> Vec<PathBuf> {
        let mut roots = Vec::new();
        // Custom Fontivo downloads directory first
        roots.push(crate::engine::downloader::LibraryStorageManager::get_downloads_dir());

        if let Ok(profile) = env::var("USERPROFILE") {
            let base = PathBuf::from(profile);
            roots.push(base.join("Downloads"));
            roots.push(base.join("Desktop"));
            roots.push(base.join("Documents"));
            roots.push(base.join("Pictures"));
            let onedrive = base.join("OneDrive");
            if onedrive.exists() {
                roots.push(onedrive.join("Desktop"));
                roots.push(onedrive.join("Documents"));
                roots.push(onedrive.join("Pictures"));
            }
        }
        roots
    }

    #[cfg(windows)]
    fn enumerate_open_adobe_windows() -> (Vec<String>, Vec<(String, String, String)>) {
        use windows::core::{BOOL, PWSTR};
        use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
        use windows::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumChildWindows, EnumWindows, GetWindowTextLengthW, GetWindowTextW,
            GetWindowThreadProcessId, IsWindowVisible,
        };

        struct Collector {
            running_apps: HashSet<String>,
            seen_doc_ids: HashSet<String>,
            docs: Vec<(String, String, String)>, // (app_name, window_title, doc_name)
        }

        struct ChildCtx<'a> {
            exe_name: &'a str,
            collector: &'a mut Collector,
        }

        unsafe extern "system" fn enum_child_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 || len > 512 {
                return BOOL(1);
            }
            let mut title_buf = vec![0u16; (len + 1) as usize];
            let read_len = GetWindowTextW(hwnd, &mut title_buf);
            if read_len <= 0 {
                return BOOL(1);
            }
            let title = String::from_utf16_lossy(&title_buf[..read_len as usize]);
            let ctx = &mut *(lparam.0 as *mut ChildCtx);
            if let Some((app, doc_name)) =
                AdobeListener::parse_adobe_window_title(ctx.exe_name, &title)
            {
                let key = format!(
                    "{}::{}",
                    app.to_ascii_lowercase(),
                    doc_name.to_ascii_lowercase()
                );
                if ctx.collector.seen_doc_ids.insert(key) {
                    ctx.collector.docs.push((app, title, doc_name));
                }
            }
            BOOL(1)
        }

        unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
            if !IsWindowVisible(hwnd).as_bool() {
                return BOOL(1);
            }
            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 || len > 512 {
                return BOOL(1);
            }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return BOOL(1);
            }

            let proc_handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                Ok(h) => h,
                Err(_) => return BOOL(1),
            };

            let mut exe_buf = [0u16; 512];
            let mut exe_len = exe_buf.len() as u32;
            let ok = QueryFullProcessImageNameW(
                proc_handle,
                PROCESS_NAME_WIN32,
                PWSTR(exe_buf.as_mut_ptr()),
                &mut exe_len,
            )
            .is_ok();
            let _ = CloseHandle(proc_handle);

            if !ok || exe_len == 0 {
                return BOOL(1);
            }

            let exe_path = String::from_utf16_lossy(&exe_buf[..exe_len as usize]);
            let exe_name = Path::new(&exe_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();

            let is_adobe = exe_name == "photoshop.exe"
                || exe_name == "illustrator.exe"
                || exe_name == "indesign.exe";
            if !is_adobe {
                return BOOL(1);
            }

            let mut title_buf = vec![0u16; (len + 1) as usize];
            let read_len = GetWindowTextW(hwnd, &mut title_buf);
            let title = if read_len > 0 {
                String::from_utf16_lossy(&title_buf[..read_len as usize])
            } else {
                String::new()
            };

            let collector = &mut *(lparam.0 as *mut Collector);
            let app_label = if exe_name.contains("photoshop") {
                "Photoshop"
            } else if exe_name.contains("illustrator") {
                "Illustrator"
            } else {
                "InDesign"
            };
            collector.running_apps.insert(app_label.to_string());

            if let Some((app, doc_name)) =
                AdobeListener::parse_adobe_window_title(&exe_name, &title)
            {
                let key = format!(
                    "{}::{}",
                    app.to_ascii_lowercase(),
                    doc_name.to_ascii_lowercase()
                );
                if collector.seen_doc_ids.insert(key) {
                    collector.docs.push((app, title, doc_name));
                }
            }

            // Also scan child MDI / OWL document windows so all open tabs & floating docs are detected
            let mut child_ctx = ChildCtx {
                exe_name: &exe_name,
                collector,
            };
            let _ = EnumChildWindows(
                Some(hwnd),
                Some(enum_child_cb),
                LPARAM(&mut child_ctx as *mut ChildCtx as isize),
            );

            BOOL(1)
        }

        let mut collector = Collector {
            running_apps: HashSet::new(),
            seen_doc_ids: HashSet::new(),
            docs: Vec::new(),
        };
        unsafe {
            let _ = EnumWindows(
                Some(enum_cb),
                LPARAM(&mut collector as *mut Collector as isize),
            );
        }

        let mut apps: Vec<String> = collector.running_apps.into_iter().collect();
        apps.sort();
        (apps, collector.docs)
    }

    #[cfg(not(windows))]
    fn enumerate_open_adobe_windows() -> (Vec<String>, Vec<(String, String, String)>) {
        (Vec::new(), Vec::new())
    }

    /// Starts a lightweight background monitor thread (4-second interval) that detects ALL running
    /// Photoshop / Illustrator / InDesign windows & open tabs simultaneously, scans their `.psd` /
    /// `.ai` / `.indd` documents via `AdobeScanner`, and queues pending font activation alerts.
    pub fn start_window_monitor(state: Arc<RwLock<AppState>>) {
        thread::spawn(move || {
            let mut path_cache: HashMap<String, Option<PathBuf>> = HashMap::new();
            let mut scanned_mtime: HashMap<String, (u64, PendingAdobeDocument)> = HashMap::new();
            let mut session_docs: HashMap<String, (String, String, String)> = HashMap::new();
            let search_roots = Self::default_design_search_roots();

            loop {
                let (running_apps, open_docs) = Self::enumerate_open_adobe_windows();
                let running_set: HashSet<String> = running_apps
                    .iter()
                    .map(|a| a.to_ascii_lowercase())
                    .collect();

                // Prune documents belonging to Adobe apps that are no longer running
                session_docs.retain(|_, (app_name, _, _)| {
                    running_set.contains(&app_name.to_ascii_lowercase())
                });

                // Merge newly observed open documents into the active multi-doc session map
                for (app_name, window_title, doc_name) in open_docs {
                    let doc_id = format!(
                        "{}::{}",
                        app_name.to_ascii_lowercase(),
                        doc_name.to_ascii_lowercase()
                    );
                    session_docs.insert(doc_id, (app_name, window_title, doc_name));
                }

                let now_sec = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let mut active_pending = Vec::new();
                let mut sorted_session: Vec<(String, (String, String, String))> = session_docs
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                sorted_session.sort_by(|a, b| a.0.cmp(&b.0));

                for (doc_id, (app_name, window_title, doc_name)) in sorted_session {
                    let key = doc_name.to_ascii_lowercase();
                    let resolved_path: Option<PathBuf> = if let Some(Some(p)) = path_cache.get(&key)
                    {
                        Some(p.clone())
                    } else if let Some(found) =
                        Self::resolve_adobe_document_path(&doc_name, &search_roots)
                    {
                        path_cache.insert(key, Some(found.clone()));
                        Some(found)
                    } else {
                        None
                    };

                    let mtime_sec = resolved_path
                        .as_ref()
                        .and_then(|p| fs::metadata(p).ok())
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    if let Some((cached_mtime, cached_doc)) = scanned_mtime.get(&doc_id) {
                        if *cached_mtime == mtime_sec {
                            active_pending.push(cached_doc.clone());
                            continue;
                        }
                    }

                    let pending_doc = if let Some(ref file_path) = resolved_path {
                        let st_guard = state.read().unwrap();
                        if let Ok(inspection) =
                            super::routes::adobe::inspect_design_helper(file_path, &st_guard)
                        {
                            let all_names: Vec<String> =
                                inspection.fonts.iter().map(|f| f.name.clone()).collect();
                            super::routes::adobe::register_document_extracted_fonts(
                                &doc_id, all_names,
                            );
                            PendingAdobeDocument {
                                id: doc_id.clone(),
                                app_name,
                                window_title,
                                document_name: doc_name,
                                file_path: Some(file_path.to_string_lossy().to_string()),
                                detected_at: now_sec,
                                matched_fonts: inspection.available_fonts,
                                missing_fonts: inspection.missing_fonts,
                                matched_font_ids: inspection.available_ids,
                                already_active_count: inspection.already_active_count,
                                total_fonts: inspection.total_fonts,
                                dismissed: false,
                                activated: false,
                            }
                        } else {
                            PendingAdobeDocument {
                                id: doc_id.clone(),
                                app_name,
                                window_title,
                                document_name: doc_name,
                                file_path: Some(file_path.to_string_lossy().to_string()),
                                detected_at: now_sec,
                                matched_fonts: Vec::new(),
                                missing_fonts: Vec::new(),
                                matched_font_ids: Vec::new(),
                                already_active_count: 0,
                                total_fonts: 0,
                                dismissed: false,
                                activated: false,
                            }
                        }
                    } else {
                        PendingAdobeDocument {
                            id: doc_id.clone(),
                            app_name,
                            window_title,
                            document_name: doc_name,
                            file_path: None,
                            detected_at: now_sec,
                            matched_fonts: Vec::new(),
                            missing_fonts: Vec::new(),
                            matched_font_ids: Vec::new(),
                            already_active_count: 0,
                            total_fonts: 0,
                            dismissed: false,
                            activated: false,
                        }
                    };

                    scanned_mtime.insert(doc_id, (mtime_sec, pending_doc.clone()));
                    active_pending.push(pending_doc);
                }

                if let Ok(mut st) = state.write() {
                    st.running_adobe_apps = running_apps;
                    // Preserve any manually scanned documents ("manual::...") alongside live Adobe docs
                    let manual_docs: Vec<PendingAdobeDocument> = st
                        .pending_adobe_docs
                        .iter()
                        .filter(|d| d.id.starts_with("manual::"))
                        .cloned()
                        .collect();

                    for doc in &mut active_pending {
                        if st.dismissed_adobe_doc_ids.contains(&doc.id) {
                            doc.dismissed = true;
                        }
                        if let Some(prev) = st.pending_adobe_docs.iter().find(|p| p.id == doc.id) {
                            if prev.activated {
                                doc.activated = true;
                            }
                            if prev.dismissed {
                                doc.dismissed = true;
                            }
                        }
                    }

                    for mdoc in manual_docs {
                        if !active_pending.iter().any(|d| d.id == mdoc.id) {
                            active_pending.push(mdoc);
                        }
                    }
                    st.pending_adobe_docs = active_pending;
                }

                thread::sleep(Duration::from_secs(4));
            }
        });
    }
}
