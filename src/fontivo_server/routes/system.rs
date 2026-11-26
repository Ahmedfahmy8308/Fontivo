use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, RwLock};
use tao::event_loop::EventLoopProxy;
use tiny_http::{Header, Request};

use super::common::{read_body, respond_json, respond_json_str};
use crate::engine::health::{ElevatedError, SystemHealthChecker};
use crate::server::api_server::UserEvent;
use crate::server::state::AppState;
use crate::updater::AutoUpdater;

pub fn handle_window_event(
    req: Request,
    event: UserEvent,
    window_proxy: &Option<EventLoopProxy<UserEvent>>,
    cors_origin: Header,
    json_header: Header,
) {
    if let Some(ref p) = window_proxy {
        let _ = p.send_event(event);
    }
    respond_json(
        req,
        200,
        serde_json::json!({ "success": true }),
        cors_origin,
        json_header,
    );
}

pub fn handle_admin_status(req: Request, cors_origin: Header, json_header: Header) {
    let (system_user_fonts_count, is_admin) = SystemHealthChecker::get_system_fonts_admin_status();
    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "isAdmin": is_admin,
            "systemUserFontsCount": system_user_fonts_count
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_health_check(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let total = {
        let st = state.read().unwrap();
        st.fonts.len()
    };
    let report = SystemHealthChecker::get_report(total);
    respond_json_str(
        req,
        200,
        serde_json::to_string(&report).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_clean_registry(req: Request, cors_origin: Header, json_header: Header) {
    let cleaned = SystemHealthChecker::clean_dead_registry_fonts();
    respond_json(
        req,
        200,
        serde_json::json!({ "success": true, "cleanedCount": cleaned }),
        cors_origin,
        json_header,
    );
}

pub fn handle_rebuild_cache(req: Request, cors_origin: Header, json_header: Header) {
    match SystemHealthChecker::rebuild_font_cache() {
        Ok(msg) => {
            respond_json(
                req,
                200,
                serde_json::json!({ "success": true, "message": msg }),
                cors_origin,
                json_header,
            );
        }
        Err(e) => {
            respond_json(
                req,
                500,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
        }
    }
}

#[derive(Deserialize)]
struct RestoreProfilePayload {
    profile: Option<String>,
}

#[derive(Deserialize)]
struct OpenFolderPayload {
    path: String,
}

#[derive(Deserialize)]
struct UndoBackupPayload {
    #[serde(rename = "backupId")]
    backup_id: String,
}

pub fn handle_restore_fonts_profile(mut req: Request, cors_origin: Header, json_header: Header) {
    let body = read_body(&mut req);
    let payload: RestoreProfilePayload =
        serde_json::from_str(&body).unwrap_or(RestoreProfilePayload { profile: None });
    let profile = payload
        .profile
        .unwrap_or_else(|| "pure_windows".to_string());

    match SystemHealthChecker::restore_windows_fonts_with_profile_elevated(&profile) {
        Ok(result) => {
            respond_json(req, 200, result, cors_origin, json_header);
        }
        Err(ElevatedError::Cancelled(msg)) => {
            respond_json(
                req,
                200,
                serde_json::json!({ "success": false, "cancelled": true, "error": msg }),
                cors_origin,
                json_header,
            );
        }
        Err(ElevatedError::Failed(e)) => {
            respond_json(
                req,
                500,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
        }
    }
}

pub fn handle_get_backups(req: Request, cors_origin: Header, json_header: Header) {
    let backups = SystemHealthChecker::get_fontivo_backups();
    respond_json_str(
        req,
        200,
        serde_json::to_string(&backups).unwrap_or_else(|_| "[]".to_string()),
        cors_origin,
        json_header,
    );
}

pub fn handle_delete_backup(mut req: Request, cors_origin: Header, json_header: Header) {
    let body = read_body(&mut req);
    let payload: Result<UndoBackupPayload, _> = serde_json::from_str(&body);
    match payload {
        Ok(p) => match SystemHealthChecker::delete_fontivo_backup(&p.backup_id) {
            Ok(()) => {
                respond_json(
                    req,
                    200,
                    serde_json::json!({ "success": true, "backupId": p.backup_id }),
                    cors_origin,
                    json_header,
                );
            }
            Err(e) => {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": e }),
                    cors_origin,
                    json_header,
                );
            }
        },
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": format!("Invalid payload: {}", e) }),
                cors_origin,
                json_header,
            );
        }
    }
}

pub fn handle_system_info(req: Request, cors_origin: Header, json_header: Header) {
    let data_dir = crate::engine::lifecycle::get_app_data_dir();
    let roaming_dir = crate::engine::lifecycle::get_legacy_roaming_app_data_dir();
    let cfg = crate::engine::LibraryStorageManager::get_config();
    let fonts_dir = crate::engine::LibraryStorageManager::get_storage_dir();
    let packs_dir = crate::engine::LibraryStorageManager::get_extracted_dir();
    let google_dir = crate::engine::LibraryStorageManager::get_google_dir();
    let custom_dir = crate::engine::LibraryStorageManager::get_custom_dir();
    let imported_dir = crate::engine::LibraryStorageManager::get_imported_dir();
    let downloads_dir = crate::engine::LibraryStorageManager::get_downloads_dir();
    let updates_dir = crate::updater::AutoUpdater::get_updates_dir();
    let backups_dir = data_dir.join("Backups");
    let workspaces_dir = data_dir.join("Workspaces");
    let cache_dir = data_dir.join("Cache");
    let program_data_dir = std::env::var("PROGRAMDATA")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(|p| std::path::PathBuf::from(p).join("Fontivo"));

    let _ = cfg;
    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "version": crate::updater::AutoUpdater::CURRENT_VERSION,
            "dataDir": data_dir.to_string_lossy().to_string(),
            "storagePath": fonts_dir.to_string_lossy().to_string(),
            "roamingDir": roaming_dir.map(|p| p.to_string_lossy().to_string()),
            "programDataDir": program_data_dir.map(|p| p.to_string_lossy().to_string()),
            "fontsDir": fonts_dir.to_string_lossy().to_string(),
            "packsDir": packs_dir.to_string_lossy().to_string(),
            "googleDir": google_dir.to_string_lossy().to_string(),
            "customDir": custom_dir.to_string_lossy().to_string(),
            "importedDir": imported_dir.to_string_lossy().to_string(),
            "downloadsDir": downloads_dir.to_string_lossy().to_string(),
            "updatesDir": updates_dir.to_string_lossy().to_string(),
            "backupsDir": backups_dir.to_string_lossy().to_string(),
            "workspacesDir": workspaces_dir.to_string_lossy().to_string(),
            "cacheDir": cache_dir.to_string_lossy().to_string(),
            "usedSpaceBytes": crate::engine::LibraryStorageManager::calculate_used_space(),
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_open_backup_folder(mut req: Request, cors_origin: Header, json_header: Header) {
    let body = read_body(&mut req);
    if let Ok(payload) = serde_json::from_str::<OpenFolderPayload>(&body) {
        match SystemHealthChecker::open_backup_folder(&payload.path) {
            Ok(()) => {
                respond_json(
                    req,
                    200,
                    serde_json::json!({ "success": true }),
                    cors_origin,
                    json_header,
                );
                return;
            }
            Err(e) => {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": e }),
                    cors_origin,
                    json_header,
                );
                return;
            }
        }
    }
    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Invalid backup folder request" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_undo_backup(mut req: Request, cors_origin: Header, json_header: Header) {
    let body = read_body(&mut req);
    let payload: Result<UndoBackupPayload, _> = serde_json::from_str(&body);
    match payload {
        Ok(p) => match SystemHealthChecker::undo_restore_backup_elevated(&p.backup_id) {
            Ok(val) => {
                respond_json(req, 200, val, cors_origin, json_header);
            }
            Err(ElevatedError::Cancelled(msg)) => {
                respond_json(
                    req,
                    200,
                    serde_json::json!({ "success": false, "cancelled": true, "error": msg }),
                    cors_origin,
                    json_header,
                );
            }
            Err(ElevatedError::Failed(e)) => {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": e }),
                    cors_origin,
                    json_header,
                );
            }
        },
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": format!("Invalid payload: {}", e) }),
                cors_origin,
                json_header,
            );
        }
    }
}

pub fn handle_relaunch_admin(req: Request, cors_origin: Header, json_header: Header) {
    let _ = SystemHealthChecker::relaunch_as_admin();
    respond_json(
        req,
        200,
        serde_json::json!({ "success": true }),
        cors_origin,
        json_header,
    );
}

pub fn handle_restore_default_fonts(req: Request, cors_origin: Header, json_header: Header) {
    match SystemHealthChecker::restore_windows_fonts_with_profile_elevated("pure_windows") {
        Ok(mut val) => {
            let (system_user_fonts_count, is_admin) =
                SystemHealthChecker::get_system_fonts_admin_status();
            if let Some(obj) = val.as_object_mut() {
                obj.insert(
                    "systemUserFontsCount".to_string(),
                    serde_json::json!(system_user_fonts_count),
                );
                if !obj.contains_key("isAdmin") {
                    obj.insert("isAdmin".to_string(), serde_json::json!(is_admin));
                }
            }
            respond_json(req, 200, val, cors_origin, json_header);
        }
        Err(ElevatedError::Cancelled(msg)) => {
            respond_json(
                req,
                200,
                serde_json::json!({ "success": false, "cancelled": true, "error": msg }),
                cors_origin,
                json_header,
            );
        }
        Err(ElevatedError::Failed(e)) => {
            respond_json(
                req,
                500,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
        }
    }
}

pub fn handle_optimize_ram(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct OptimizeRamReq {
        #[serde(default)]
        clear_active_fonts: bool,
    }
    let parsed = serde_json::from_str::<OptimizeRamReq>(&body).unwrap_or_default();

    let mut active_fonts_cleared = 0usize;
    if parsed.clear_active_fonts {
        if let Ok(mut st) = state.write() {
            let c1 = st.activator.deactivate_all();
            let c2 = st.active_font_ids.len();
            active_fonts_cleared = c1.max(c2);
            for id in st.active_font_ids.clone() {
                if let Some(font) = st.fonts.iter().find(|f| f.id == id) {
                    let _ = st.activator.deactivate_ram(&font.path);
                }
            }
            st.activator.broadcast_font_change();
            st.active_font_ids.clear();
            for f in &mut st.fonts {
                f.is_active = false;
            }
            st.save_active_fonts();
        }
    }

    let result = SystemHealthChecker::optimize_system_ram_with_cleared_fonts(active_fonts_cleared);
    let now_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if let Ok(mut st) = state.write() {
        st.record_operation(crate::server::state::SystemOperation {
            id: format!("op-ram-{}", now_sec),
            title: "Deep System RAM & Working Set Optimization".to_string(),
            kind: "ram_optimize".to_string(),
            status: "completed".to_string(),
            progress_percent: 100.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            processed_items: result.trimmed_processes_count,
            total_items: result.trimmed_processes_count,
            speed_bps: 0,
            message: result.message.clone(),
            updated_at: now_sec,
        });
    }
    respond_json_str(
        req,
        200,
        serde_json::to_string(&result).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_system_resources(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let active_ram_fonts = {
        let st = state.read().unwrap();
        let active_non_sys = st
            .fonts
            .iter()
            .filter(|f| f.is_active && f.source != "system")
            .count();
        active_non_sys.max(st.activator.get_live_ram_fonts().len())
    };
    let telemetry = SystemHealthChecker::get_system_resources(active_ram_fonts);
    let body = serde_json::to_string(&telemetry).unwrap_or_default();
    let mut res =
        tiny_http::Response::from_string(body).with_status_code(tiny_http::StatusCode(200));
    res.add_header(cors_origin);
    res.add_header(json_header);
    if let Ok(no_cache) = Header::from_bytes(
        &b"Cache-Control"[..],
        &b"no-store, no-cache, must-revalidate"[..],
    ) {
        res.add_header(no_cache);
    }
    super::common::add_security_headers(&mut res);
    let _ = req.respond(res);
}

pub fn handle_trim_process(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct TrimReq {
        pid: Option<u32>,
        all: Option<bool>,
    }
    let parsed = serde_json::from_str::<TrimReq>(&body).unwrap_or_default();
    let trim_all = parsed.all.unwrap_or(parsed.pid.is_none());
    let res = SystemHealthChecker::trim_process_working_set(parsed.pid, trim_all);

    let now_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if let Ok(mut st) = state.write() {
        st.record_operation(crate::server::state::SystemOperation {
            id: format!("op-trim-{}", now_sec),
            title: if let Some(pid) = parsed.pid {
                format!("Trim Process Memory (PID {})", pid)
            } else {
                "Trim All User Process Working Sets".to_string()
            },
            kind: "ram_optimize".to_string(),
            status: "completed".to_string(),
            progress_percent: 100.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            processed_items: res.trimmed_count,
            total_items: res.trimmed_count,
            speed_bps: 0,
            message: res.message.clone(),
            updated_at: now_sec,
        });
    }

    respond_json_str(
        req,
        200,
        serde_json::to_string(&res).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_system_operations(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let operations = {
        let st = state.read().unwrap();
        st.get_unified_operations()
    };
    let active_count = operations
        .iter()
        .filter(|o| {
            matches!(
                o.status.as_str(),
                "queued" | "running" | "downloading" | "verifying" | "extracting" | "indexing"
            )
        })
        .count();

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "activeCount": active_count,
            "totalCount": operations.len(),
            "operations": operations
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_ram_status(req: Request, cors_origin: Header, json_header: Header) {
    let round1 = |v: f64| (v * 10.0).round() / 10.0;
    let ram = round1(SystemHealthChecker::get_current_process_ram_mb());
    let (used_mb, total_mb, avail_mb, percent) = SystemHealthChecker::get_system_ram_detailed();

    let used_mb_r = round1(used_mb);
    let total_mb_r = round1(total_mb);
    let avail_mb_r = round1(avail_mb);
    let pct_r = round1(percent);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct RamStatusResponse {
        success: bool,
        process_ram_mb: f64,
        ram_mb: f64,
        system_used_mb: f64,
        system_total_mb: f64,
        system_available_mb: f64,
        system_percent: f64,
        system_used_gb: f64,
        system_total_gb: f64,
        system_available_gb: f64,
        used_mb: f64,
        total_mb: f64,
        available_mb: f64,
        usage_percent: f64,
    }

    let status = RamStatusResponse {
        success: true,
        process_ram_mb: ram,
        ram_mb: ram,
        system_used_mb: used_mb_r,
        system_total_mb: total_mb_r,
        system_available_mb: avail_mb_r,
        system_percent: pct_r,
        system_used_gb: round1(used_mb / 1024.0),
        system_total_gb: round1(total_mb / 1024.0),
        system_available_gb: round1(avail_mb / 1024.0),
        used_mb: used_mb_r,
        total_mb: total_mb_r,
        available_mb: avail_mb_r,
        usage_percent: pct_r,
    };

    let body = serde_json::to_string(&status).unwrap_or_default();
    let mut res =
        tiny_http::Response::from_string(body).with_status_code(tiny_http::StatusCode(200));
    res.add_header(cors_origin);
    res.add_header(json_header);
    if let Ok(no_cache) = Header::from_bytes(
        &b"Cache-Control"[..],
        &b"no-store, no-cache, must-revalidate"[..],
    ) {
        res.add_header(no_cache);
    }
    super::common::add_security_headers(&mut res);
    let _ = req.respond(res);
}

pub fn handle_network_status(req: Request, cors_origin: Header, json_header: Header) {
    let start = std::time::Instant::now();
    let is_online = ureq::head("https://fonts.googleapis.com")
        .timeout(std::time::Duration::from_millis(3000))
        .call()
        .is_ok();
    let latency = start.elapsed().as_millis();

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct NetStatus {
        online: bool,
        latency_ms: u128,
        google_fonts_synced: bool,
        catalog_count: usize,
    }

    let res_obj = NetStatus {
        online: is_online,
        latency_ms: latency,
        google_fonts_synced: true,
        catalog_count: 8312,
    };

    respond_json_str(
        req,
        200,
        serde_json::to_string(&res_obj).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_providers_status(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    let total = st.fonts.len();
    let active = st.active_font_ids.len();

    let google_count = st.fonts.iter().filter(|f| f.source == "google").count();

    let pack_count = st.fonts.iter().filter(|f| f.source == "cloud").count();

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ProviderInfo {
        id: String,
        name: String,
        online: bool,
        count: usize,
        latency_ms: u64,
        sync_supported: bool,
        description: String,
    }

    let providers = vec![
        ProviderInfo {
            id: "google".to_string(),
            name: "Google Fonts Global Cloud".to_string(),
            online: true,
            count: google_count,
            latency_ms: 120,
            sync_supported: true,
            description: "Google Fonts Open Cloud Library (dynamic indexed fonts)".to_string(),
        },
        ProviderInfo {
            id: "fontsource".to_string(),
            name: "Fontsource Open Typography".to_string(),
            online: true,
            count: 1540,
            latency_ms: 95,
            sync_supported: true,
            description: "Open source web font packages via global CDN".to_string(),
        },
        ProviderInfo {
            id: "adobe".to_string(),
            name: "Adobe CC Live Bridge (Photoshop / AI)".to_string(),
            online: true,
            count: active,
            latency_ms: 5,
            sync_supported: true,
            description: "Adobe CC auto-activation socket bridge".to_string(),
        },
        ProviderInfo {
            id: "github".to_string(),
            name: "GitHub Font Pack Collection".to_string(),
            online: true,
            count: pack_count,
            latency_ms: 180,
            sync_supported: true,
            description: "Verified offline font collection from downloaded packs".to_string(),
        },
        ProviderInfo {
            id: "local".to_string(),
            name: "Fontivo Verified Local Engine".to_string(),
            online: true,
            count: total,
            latency_ms: 1,
            sync_supported: false,
            description: "High-speed in-memory GDI32 font virtualization engine".to_string(),
        },
    ];

    respond_json_str(
        req,
        200,
        serde_json::to_string(&providers).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_updater(req: Request, cors_origin: Header, json_header: Header) {
    handle_updater_status(req, cors_origin, json_header);
}

pub fn handle_updater_status(req: Request, cors_origin: Header, json_header: Header) {
    let mut status = AutoUpdater::get_status();
    if status.last_checked.is_none()
        || (status.error.is_some()
            && status.status != "downloading"
            && status.status != "ready_to_install")
    {
        if let Ok(fresh) = AutoUpdater::check_for_updates() {
            status = fresh;
        }
    }
    respond_json_str(
        req,
        200,
        serde_json::to_string(&status).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_updater_check(req: Request, cors_origin: Header, json_header: Header) {
    match AutoUpdater::check_and_download_if_needed() {
        Ok(status) => {
            respond_json_str(
                req,
                200,
                serde_json::to_string(&status).unwrap_or_default(),
                cors_origin,
                json_header,
            );
        }
        Err(e) => {
            respond_json(
                req,
                500,
                serde_json::json!({ "error": e }),
                cors_origin,
                json_header,
            );
        }
    }
}

pub fn handle_updater_apply(mut req: Request, cors_origin: Header, json_header: Header) {
    let mut body = String::new();
    let _ = req.as_reader().read_to_string(&mut body);
    let silent = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) {
        parsed
            .get("silent")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    } else {
        true
    };

    match AutoUpdater::apply_update(silent) {
        Ok(msg) => {
            respond_json(
                req,
                200,
                serde_json::json!({
                    "success": true,
                    "message": msg,
                    "status": "installing"
                }),
                cors_origin,
                json_header,
            );
        }
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({
                    "success": false,
                    "error": err
                }),
                cors_origin,
                json_header,
            );
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RgbColorObj {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HslColorObj {
    pub h: u16,
    pub s: u8,
    pub l: u8,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CmykColorObj {
    pub c: u8,
    pub m: u8,
    pub y: u8,
    pub k: u8,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OklchColorObj {
    pub l: f32,
    pub c: f32,
    pub h: f32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HarmonyPalette {
    pub complementary: Vec<String>,
    pub analogous: Vec<String>,
    pub triadic: Vec<String>,
    pub split_complementary: Vec<String>,
    pub tetradic: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScreenColorResponse {
    pub success: bool,
    pub x: i32,
    pub y: i32,
    pub hex: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub rgb: RgbColorObj,
    pub hsl: HslColorObj,
    pub cmyk: CmykColorObj,
    pub oklch: OklchColorObj,
    pub color_name: String,
    pub grid5x5: Vec<Vec<String>>,
    pub harmony_palette: HarmonyPalette,
}

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let l = (max + min) / 2.0;

    if (max - min).abs() < 1e-6 {
        return (0.0, 0.0, l * 100.0);
    }

    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };

    let mut h = if (max - rf).abs() < 1e-6 {
        (gf - bf) / d + (if gf < bf { 6.0 } else { 0.0 })
    } else if (max - gf).abs() < 1e-6 {
        (bf - rf) / d + 2.0
    } else {
        (rf - gf) / d + 4.0
    };
    h *= 60.0;
    (h.rem_euclid(360.0), s * 100.0, l * 100.0)
}

fn hsl_to_hex(h: f32, s_pct: f32, l_pct: f32) -> String {
    let h = h.rem_euclid(360.0) / 360.0;
    let s = (s_pct / 100.0).clamp(0.0, 1.0);
    let l = (l_pct / 100.0).clamp(0.0, 1.0);

    if s.abs() < 1e-6 {
        let v = (l * 255.0).round().clamp(0.0, 255.0) as u8;
        return format!("#{:02X}{:02X}{:02X}", v, v, v);
    }

    let hue2rgb = |p: f32, q: f32, mut t: f32| -> f32 {
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            return p + (q - p) * 6.0 * t;
        }
        if t < 1.0 / 2.0 {
            return q;
        }
        if t < 2.0 / 3.0 {
            return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        }
        p
    };

    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    let r = (hue2rgb(p, q, h + 1.0 / 3.0) * 255.0)
        .round()
        .clamp(0.0, 255.0) as u8;
    let g = (hue2rgb(p, q, h) * 255.0).round().clamp(0.0, 255.0) as u8;
    let b = (hue2rgb(p, q, h - 1.0 / 3.0) * 255.0)
        .round()
        .clamp(0.0, 255.0) as u8;
    format!("#{:02X}{:02X}{:02X}", r, g, b)
}

fn rgb_to_cmyk(r: u8, g: u8, b: u8) -> CmykColorObj {
    if r == 0 && g == 0 && b == 0 {
        return CmykColorObj {
            c: 0,
            m: 0,
            y: 0,
            k: 100,
        };
    }
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;
    let k = 1.0 - rf.max(gf).max(bf);
    let denom = (1.0 - k).max(1e-6);
    let c = ((1.0 - rf - k) / denom * 100.0).round().clamp(0.0, 100.0) as u8;
    let m = ((1.0 - gf - k) / denom * 100.0).round().clamp(0.0, 100.0) as u8;
    let y = ((1.0 - bf - k) / denom * 100.0).round().clamp(0.0, 100.0) as u8;
    let k_pct = (k * 100.0).round().clamp(0.0, 100.0) as u8;
    CmykColorObj { c, m, y, k: k_pct }
}

fn rgb_to_oklch(r: u8, g: u8, b: u8) -> OklchColorObj {
    let to_lin = |c: u8| -> f32 {
        let v = c as f32 / 255.0;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    let rl = to_lin(r);
    let gl = to_lin(g);
    let bl = to_lin(b);

    let l_ = (0.412_221_46 * rl + 0.536_332_55 * gl + 0.051_445_995 * bl).cbrt();
    let m_ = (0.211_903_5 * rl + 0.680_699_5 * gl + 0.107_396_96 * bl).cbrt();
    let s_ = (0.088_302_46 * rl + 0.281_718_85 * gl + 0.629_978_7 * bl).cbrt();

    let ok_l = 0.210_454_26 * l_ + 0.793_617_8 * m_ - 0.004_072_047 * s_;
    let ok_a = 1.977_998_5 * l_ - 2.428_592_2 * m_ + 0.450_593_7 * s_;
    let ok_b = 0.025_904_037 * l_ + 0.782_771_77 * m_ - 0.808_675_77 * s_;

    let c = (ok_a * ok_a + ok_b * ok_b).sqrt();
    let h = ok_b.atan2(ok_a).to_degrees().rem_euclid(360.0);

    OklchColorObj {
        l: (ok_l * 1000.0).round() / 1000.0,
        c: (c * 1000.0).round() / 1000.0,
        h: (h * 10.0).round() / 10.0,
    }
}

fn classify_color_name(h: f32, s: f32, l: f32) -> String {
    if l < 10.0 {
        return "Obsidian Black".to_string();
    }
    if l > 94.0 && s < 15.0 {
        return "Alabaster White".to_string();
    }
    if s < 12.0 {
        if l < 35.0 {
            return "Charcoal Slate".to_string();
        } else if l < 70.0 {
            return "Neutral Steel".to_string();
        } else {
            return "Silver Mist".to_string();
        }
    }
    let prefix = if l < 30.0 {
        "Deep "
    } else if l > 75.0 {
        "Soft "
    } else if s > 75.0 {
        "Vibrant "
    } else {
        "Royal "
    };
    let hue_name = if !(15.0..345.0).contains(&h) {
        "Crimson"
    } else if h < 45.0 {
        "Amber Orange"
    } else if h < 70.0 {
        "Golden Yellow"
    } else if h < 160.0 {
        "Emerald Green"
    } else if h < 200.0 {
        "Cyan Teal"
    } else if h < 255.0 {
        "Cobalt Blue"
    } else if h < 295.0 {
        "Electric Violet"
    } else {
        "Magenta Rose"
    };
    format!("{}{}", prefix, hue_name)
}

pub fn build_screen_color_response(
    x: i32,
    y: i32,
    r: u8,
    g: u8,
    b: u8,
    grid5x5: Vec<Vec<String>>,
) -> ScreenColorResponse {
    let hex = format!("#{:02X}{:02X}{:02X}", r, g, b);
    let (h, s, l) = rgb_to_hsl(r, g, b);
    let s_harm = s.max(45.0);
    let l_harm = l.clamp(35.0, 68.0);

    let harmony_palette = HarmonyPalette {
        complementary: vec![hex.clone(), hsl_to_hex(h + 180.0, s_harm, l_harm)],
        analogous: vec![
            hsl_to_hex(h - 30.0, s_harm, l_harm),
            hex.clone(),
            hsl_to_hex(h + 30.0, s_harm, l_harm),
        ],
        triadic: vec![
            hex.clone(),
            hsl_to_hex(h + 120.0, s_harm, l_harm),
            hsl_to_hex(h + 240.0, s_harm, l_harm),
        ],
        split_complementary: vec![
            hex.clone(),
            hsl_to_hex(h + 150.0, s_harm, l_harm),
            hsl_to_hex(h + 210.0, s_harm, l_harm),
        ],
        tetradic: vec![
            hex.clone(),
            hsl_to_hex(h + 90.0, s_harm, l_harm),
            hsl_to_hex(h + 180.0, s_harm, l_harm),
            hsl_to_hex(h + 270.0, s_harm, l_harm),
        ],
    };

    ScreenColorResponse {
        success: true,
        x,
        y,
        hex,
        r,
        g,
        b,
        rgb: RgbColorObj { r, g, b },
        hsl: HslColorObj {
            h: h.round() as u16,
            s: s.round() as u8,
            l: l.round() as u8,
        },
        cmyk: rgb_to_cmyk(r, g, b),
        oklch: rgb_to_oklch(r, g, b),
        color_name: classify_color_name(h, s, l),
        grid5x5,
        harmony_palette,
    }
}

/// Fast non-blocking pixel sampler at the current Win32 cursor position.
pub fn sample_cursor_pixel_now() -> ScreenColorResponse {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        unsafe {
            let mut pt = POINT { x: 0, y: 0 };
            let _ = GetCursorPos(&mut pt);
            let hdc = GetDC(None);
            if !hdc.is_invalid() {
                let center_ref = GetPixel(hdc, pt.x, pt.y);
                let (cr, cg, cb) = if center_ref.0 == 0xFFFFFFFF {
                    (82u8, 0u8, 234u8)
                } else {
                    (
                        (center_ref.0 & 0xFF) as u8,
                        ((center_ref.0 >> 8) & 0xFF) as u8,
                        ((center_ref.0 >> 16) & 0xFF) as u8,
                    )
                };

                let mut grid5x5 = Vec::with_capacity(5);
                for dy in -2..=2 {
                    let mut row = Vec::with_capacity(5);
                    for dx in -2..=2 {
                        let px = GetPixel(hdc, pt.x + dx, pt.y + dy);
                        let (pr, pg, pb) = if px.0 == 0xFFFFFFFF {
                            (cr, cg, cb)
                        } else {
                            (
                                (px.0 & 0xFF) as u8,
                                ((px.0 >> 8) & 0xFF) as u8,
                                ((px.0 >> 16) & 0xFF) as u8,
                            )
                        };
                        row.push(format!("#{:02X}{:02X}{:02X}", pr, pg, pb));
                    }
                    grid5x5.push(row);
                }
                ReleaseDC(None, hdc);

                return build_screen_color_response(pt.x, pt.y, cr, cg, cb, grid5x5);
            }
        }
    }

    let fallback_grid = vec![vec!["#5200EA".to_string(); 5]; 5];
    build_screen_color_response(0, 0, 82, 0, 234, fallback_grid)
}

/// GET /api/color/cursor-pixel & GET /api/color/cursor-live
/// Fast non-blocking pixel readout under the mouse cursor for live hover preview.
pub fn handle_cursor_pixel(req: Request, cors_origin: Header, json_header: Header) {
    let res_body = sample_cursor_pixel_now();
    respond_json_str(
        req,
        200,
        serde_json::to_string(&res_body).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

/// POST/GET /api/color/pick-screen
/// True Native Win32 fullscreen crosshair + 7x7 magnifier eyedropper:
/// captures the entire virtual desktop, shows a topmost IDC_CROSS overlay with live loupe
/// and #RRGGBB preview pill, auto-copies #RRGGBB to clipboard on left-click, and cancels
/// cleanly on right-click or ESC. Pass `?instant=true` for immediate non-blocking sampling.
pub fn handle_pick_screen_color(
    req: Request,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let instant_mode = query_params
        .get("instant")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    if instant_mode {
        handle_cursor_pixel(req, cors_origin, json_header);
        return;
    }

    #[cfg(windows)]
    {
        match crate::engine::color_picker::pick_screen_color_interactive() {
            crate::engine::color_picker::PickOutcome::Picked(picked) => {
                let sampled = build_screen_color_response(
                    picked.x,
                    picked.y,
                    picked.r,
                    picked.g,
                    picked.b,
                    picked.grid5x5,
                );
                let mut val = serde_json::to_value(&sampled).unwrap_or_default();
                if let Some(obj) = val.as_object_mut() {
                    obj.insert("cancelled".to_string(), serde_json::json!(false));
                    obj.insert(
                        "copiedToClipboard".to_string(),
                        serde_json::json!(picked.copied_to_clipboard),
                    );
                }
                respond_json(req, 200, val, cors_origin, json_header);
            }
            crate::engine::color_picker::PickOutcome::Cancelled => {
                respond_json(
                    req,
                    200,
                    serde_json::json!({
                        "success": false,
                        "cancelled": true,
                        "copiedToClipboard": false,
                        "message": "Color picking cancelled"
                    }),
                    cors_origin,
                    json_header,
                );
            }
        }
    }

    #[cfg(not(windows))]
    {
        handle_cursor_pixel(req, cors_origin, json_header);
    }
}

/// Creates a quick-access shortcut / Taskbar & Desktop launcher (`Fontivo Color Picker.lnk` -> `Fontivo.exe --quick-picker`)
pub fn handle_pin_taskbar_picker(req: Request, cors_origin: Header, json_header: Header) {
    let exe_path =
        std::env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from("Fontivo.exe"));
    let exe_str = exe_path.to_string_lossy().to_string();

    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| user_profile.clone());

    let desktop_dir = std::path::PathBuf::from(&user_profile).join("Desktop");
    let start_menu_dir = std::path::PathBuf::from(&app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs");
    let taskbar_dir = std::path::PathBuf::from(&app_data)
        .join("Microsoft")
        .join("Internet Explorer")
        .join("Quick Launch")
        .join("User Pinned")
        .join("TaskBar");

    let desktop_lnk = desktop_dir.join("Fontivo Color Picker.lnk");
    let start_menu_lnk = start_menu_dir.join("Fontivo Color Picker.lnk");
    let taskbar_lnk = taskbar_dir.join("Fontivo Color Picker.lnk");

    #[cfg(windows)]
    {
        let esc = |s: &str| s.replace('\'', "''");
        let ps_script = format!(
            "$ws = New-Object -ComObject WScript.Shell; \
             foreach ($p in @('{}', '{}', '{}')) {{ \
                 $dir = Split-Path -Parent $p; \
                 if (Test-Path $dir) {{ \
                     $s = $ws.CreateShortcut($p); \
                     $s.TargetPath = '{}'; \
                     $s.Arguments = '--quick-picker'; \
                     $s.Description = 'Fontivo Smart Screen Color Picker & Harmony Hub'; \
                     $s.IconLocation = '{},0'; \
                     $s.Save(); \
                 }} \
             }}",
            esc(&desktop_lnk.to_string_lossy()),
            esc(&start_menu_lnk.to_string_lossy()),
            esc(&taskbar_lnk.to_string_lossy()),
            esc(&exe_str),
            esc(&exe_str),
        );

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "desktopShortcut": desktop_lnk.to_string_lossy().to_string(),
            "startMenuShortcut": start_menu_lnk.to_string_lossy().to_string(),
            "taskbarShortcut": taskbar_lnk.to_string_lossy().to_string(),
            "command": format!("\"{}\" --quick-picker", exe_str),
            "message": "Created Fontivo Color Picker quick launcher shortcuts on Desktop, Start Menu & Taskbar"
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_launch_color_picker(req: Request, cors_origin: Header, json_header: Header) {
    let candidates = [
        "Old Apps/color-picker/01_Runtime_Files/ColorPicker.exe",
        "../Old Apps/color-picker/01_Runtime_Files/ColorPicker.exe",
        "Fontivo-App/Old Apps/color-picker/01_Runtime_Files/ColorPicker.exe",
    ];
    let mut launched = false;
    for c in &candidates {
        if let Ok(safe_exe) = crate::server::security::validate_executable_path(c) {
            if std::process::Command::new(&safe_exe).spawn().is_ok() {
                launched = true;
                break;
            }
        }
    }
    respond_json(
        req,
        200,
        serde_json::json!({ "success": launched }),
        cors_origin,
        json_header,
    );
}

/// Enumerate all installed fonts in Windows (C:\Windows\Fonts, AppData User fonts, and registry HKLM/HKCU)
pub fn handle_get_windows_fonts(req: Request, cors_origin: Header, json_header: Header) {
    let fonts = SystemHealthChecker::enumerate_windows_fonts();
    respond_json_str(
        req,
        200,
        serde_json::to_string(&fonts).unwrap_or_else(|_| "[]".to_string()),
        cors_origin,
        json_header,
    );
}

/// Safely remove a user font (strict path validation, unregisters from registry and deletes font file,
/// with automatic on-demand UAC elevation for %WINDIR%\Fonts when not running as Administrator)
pub fn handle_uninstall_windows_font(mut req: Request, cors_origin: Header, json_header: Header) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct UninstallReq {
        name: Option<String>,
        path: Option<String>,
    }

    if let Ok(data) = serde_json::from_str::<UninstallReq>(&body) {
        let path_str = data.path.as_deref().unwrap_or("");
        if !path_str.is_empty() {
            // Strict path validation upfront (HTTP 400 on traversal / outside font dirs / invalid ext)
            if let Err(validation_err) = SystemHealthChecker::validate_windows_font_path(path_str) {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": validation_err }),
                    cors_origin,
                    json_header,
                );
                return;
            }

            match SystemHealthChecker::uninstall_windows_font_elevated(
                data.name.as_deref(),
                path_str,
            ) {
                Ok(val) => {
                    respond_json(req, 200, val, cors_origin, json_header);
                    return;
                }
                Err(ElevatedError::Cancelled(msg)) => {
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": false, "cancelled": true, "error": msg }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
                Err(ElevatedError::Failed(err)) => {
                    respond_json(
                        req,
                        400,
                        serde_json::json!({ "success": false, "error": err }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
            }
        }
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Invalid font uninstallation request" }),
        cors_origin,
        json_header,
    );
}

/// Returns live list of every font currently registered in RAM
pub fn handle_get_ram_fonts(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    let mut live_fonts = st.activator.get_live_ram_fonts();

    let mut seen_paths: HashSet<String> =
        live_fonts.iter().map(|f| f.path.to_lowercase()).collect();

    for active_id in &st.active_font_ids {
        if let Some(font) = st.fonts.iter().find(|f| f.id == *active_id) {
            let path_lower = font.path.to_lowercase();
            if !seen_paths.contains(&path_lower) {
                seen_paths.insert(path_lower);
                let mem_mb = ((font.size as f64) / (1024.0 * 1024.0) * 10.0).round() / 10.0;
                let memory_mb = if mem_mb < 0.1 { 0.1 } else { mem_mb };
                let now_sec = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                live_fonts.push(crate::engine::ActiveRamFont {
                    id: font.id,
                    name: font
                        .display_name
                        .clone()
                        .unwrap_or_else(|| font.name.clone()),
                    path: font.path.clone(),
                    format: font.format.clone(),
                    registered_at: now_sec,
                    memory_mb,
                });
            }
        }
    }

    respond_json_str(
        req,
        200,
        serde_json::to_string(&live_fonts).unwrap_or_else(|_| "[]".to_string()),
        cors_origin,
        json_header,
    );
}

/// Instantly deactivates ALL active RAM fonts, broadcasts WM_FONTCHANGE, clears active state, and trims memory
pub fn handle_clear_ram_fonts(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let ram_before = SystemHealthChecker::get_current_process_ram_mb();
    let mut st = state.write().unwrap();

    let count1 = st.activator.deactivate_all();
    let count2 = st.active_font_ids.len();
    let unloaded_count = count1.max(count2);

    for id in &st.active_font_ids {
        if let Some(font) = st.fonts.iter().find(|f| f.id == *id) {
            let _ = st.activator.deactivate_ram(&font.path);
        }
    }

    st.activator.broadcast_font_change();
    st.active_font_ids.clear();
    for f in &mut st.fonts {
        f.is_active = false;
    }
    st.save_active_fonts();

    #[cfg(windows)]
    {
        extern "system" {
            fn GetCurrentProcess() -> isize;
            fn SetProcessWorkingSetSize(process: isize, min: usize, max: usize) -> i32;
        }
        unsafe {
            let h_proc = GetCurrentProcess();
            let _ = SetProcessWorkingSetSize(h_proc, usize::MAX, usize::MAX);
        }
    }

    let ram_after = SystemHealthChecker::get_current_process_ram_mb();
    let freed_mb = ((ram_before - ram_after).max(0.0) * 10.0).round() / 10.0;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ClearRamResponse {
        success: bool,
        unloaded_count: usize,
        freed_mb: f64,
        ram_before_mb: f64,
        ram_after_mb: f64,
    }

    let res_body = ClearRamResponse {
        success: true,
        unloaded_count,
        freed_mb,
        ram_before_mb: (ram_before * 10.0).round() / 10.0,
        ram_after_mb: (ram_after * 10.0).round() / 10.0,
    };

    respond_json_str(
        req,
        200,
        serde_json::to_string(&res_body).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

/// Check autostart status via HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Fontivo
pub fn handle_get_autostart(req: Request, cors_origin: Header, json_header: Header) {
    let (enabled, path) = SystemHealthChecker::get_autostart_status();
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AutostartResponse {
        success: bool,
        enabled: bool,
        path: String,
    }
    let res_body = AutostartResponse {
        success: true,
        enabled,
        path,
    };
    respond_json_str(
        req,
        200,
        serde_json::to_string(&res_body).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

/// Toggle autostart status in HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Fontivo
pub fn handle_toggle_autostart(mut req: Request, cors_origin: Header, json_header: Header) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct ToggleReq {
        enabled: Option<bool>,
    }
    let enable_opt = serde_json::from_str::<ToggleReq>(&body)
        .ok()
        .and_then(|r| r.enabled);

    match SystemHealthChecker::toggle_autostart(enable_opt) {
        Ok((enabled, path)) => {
            #[derive(Serialize)]
            #[serde(rename_all = "camelCase")]
            struct ToggleResponse {
                success: bool,
                enabled: bool,
                path: String,
            }
            let res_body = ToggleResponse {
                success: true,
                enabled,
                path,
            };
            respond_json_str(
                req,
                200,
                serde_json::to_string(&res_body).unwrap_or_default(),
                cors_origin,
                json_header,
            );
        }
        Err(err) => {
            respond_json(
                req,
                500,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
        }
    }
}
