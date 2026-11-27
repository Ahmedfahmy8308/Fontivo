#![allow(unused_mut)]
use include_dir::{include_dir, Dir};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

static EMBEDDED_DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/src/ui/dist");

use super::routes;
use super::state::AppState;
use tao::event_loop::EventLoopProxy;

#[derive(Debug, Clone)]
pub enum UserEvent {
    Minimize,
    Maximize,
    Close,
    Drag,
}

pub struct ApiServer;

impl ApiServer {
    pub fn start(
        state: Arc<RwLock<AppState>>,
        port: u16,
        static_dir: PathBuf,
        window_proxy: Option<EventLoopProxy<UserEvent>>,
    ) {
        thread::spawn(move || {
            let addr = format!("127.0.0.1:{}", port);
            let server = match Server::http(&addr) {
                Ok(s) => {
                    println!(" Fontivo REST & Web Engine running on http://{}", addr);
                    s
                }
                Err(e) => {
                    eprintln!("Failed to bind API server on port {}: {}", port, e);
                    return;
                }
            };

            for mut req in server.incoming_requests() {
                let url_raw = req.url().to_string();
                let method = req.method().to_string();

                let (path, query_str) = match url_raw.find('?') {
                    Some(pos) => (&url_raw[..pos], &url_raw[pos + 1..]),
                    None => (url_raw.as_str(), ""),
                };

                let query_params: HashMap<String, String> = query_str
                    .split('&')
                    .filter(|kv| !kv.is_empty())
                    .filter_map(|kv| {
                        let (k, v) = match kv.split_once('=') {
                            Some((k, v)) => (k, v),
                            None => (kv, ""),
                        };
                        if k.is_empty() {
                            None
                        } else {
                            Some((
                                routes::common::urlencoding_decode(k),
                                routes::common::urlencoding_decode(v),
                            ))
                        }
                    })
                    .collect();

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
                        let mut res = Response::from_string(format!("403 Forbidden: {}", e))
                            .with_status_code(StatusCode(403));
                        routes::common::add_security_headers(&mut res);
                        let _ = req.respond(res);
                        continue;
                    }
                };

                // Never set wildcard '*' for sensitive local REST APIs
                let cors_origin_str =
                    validated_origin.unwrap_or_else(|| format!("http://127.0.0.1:{}", port));
                let cors_origin = Header::from_bytes(
                    &b"Access-Control-Allow-Origin"[..],
                    cors_origin_str.as_bytes(),
                )
                .unwrap();
                let cors_methods = Header::from_bytes(
                    &b"Access-Control-Allow-Methods"[..],
                    &b"GET, POST, DELETE, OPTIONS"[..],
                )
                .unwrap();
                let cors_headers = Header::from_bytes(
                    &b"Access-Control-Allow-Headers"[..],
                    &b"Content-Type, X-File-Name"[..],
                )
                .unwrap();
                let json_header = Header::from_bytes(
                    &b"Content-Type"[..],
                    &b"application/json; charset=utf-8"[..],
                )
                .unwrap();

                if method == "OPTIONS" {
                    let mut res = Response::from_string("");
                    res.add_header(cors_origin);
                    res.add_header(cors_methods);
                    res.add_header(cors_headers);
                    routes::common::add_security_headers(&mut res);
                    let _ = req.respond(res);
                    continue;
                }

                // Modular API Router Dispatch
                if path.starts_with("/api/") {
                    match (method.as_str(), path) {
                        // Library Stats & Font Queries
                        ("GET", "/api/stats") => {
                            routes::fonts::handle_stats(req, &state, cors_origin, json_header)
                        }
                        ("GET", "/api/fonts/custom-buckets") => {
                            routes::fonts::handle_custom_buckets(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/fonts") => routes::fonts::handle_fonts(
                            req,
                            &state,
                            &query_params,
                            cors_origin,
                            json_header,
                        ),
                        ("GET", "/api/families") => routes::fonts::handle_families(
                            req,
                            &state,
                            &query_params,
                            cors_origin,
                            json_header,
                        ),
                        ("GET", p) if p.starts_with("/api/font-file/") => {
                            let id_str = &p["/api/font-file/".len()..];
                            let font_id: usize = id_str.parse().unwrap_or(0);
                            routes::fonts::handle_font_file(req, &state, font_id, cors_origin);
                        }
                        ("GET", p)
                            if p.starts_with("/api/fonts/") && p.ends_with("/file") =>
                        {
                            let id_str =
                                &p["/api/fonts/".len()..p.len() - "/file".len()];
                            let font_id: usize = id_str.parse().unwrap_or(0);
                            routes::fonts::handle_font_file(req, &state, font_id, cors_origin);
                        }
                        ("GET", p) if p.starts_with("/api/font-glyphs/") => {
                            let id_str = &p["/api/font-glyphs/".len()..];
                            let font_id: usize = id_str.parse().unwrap_or(0);
                            routes::fonts::handle_font_glyphs(
                                req,
                                &state,
                                font_id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("GET", "/api/font-metadata") => routes::fonts::handle_font_metadata(
                            req,
                            &state,
                            &query_params,
                            cors_origin,
                            json_header,
                        ),

                        // Window Manager Controls
                        ("POST", "/api/window/minimize") => routes::system::handle_window_event(
                            req,
                            UserEvent::Minimize,
                            &window_proxy,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/window/maximize") => routes::system::handle_window_event(
                            req,
                            UserEvent::Maximize,
                            &window_proxy,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/window/close") => routes::system::handle_window_event(
                            req,
                            UserEvent::Close,
                            &window_proxy,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/window/drag") => routes::system::handle_window_event(
                            req,
                            UserEvent::Drag,
                            &window_proxy,
                            cors_origin,
                            json_header,
                        ),

                        // Native OS Dialogs
                        ("POST", "/api/dialog/pick-folder") => routes::dialogs::handle_pick_folder(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/dialog/pick-folder-preview") => {
                            routes::dialogs::handle_pick_folder_preview(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/dialog/pick-directory") => {
                            routes::dialogs::handle_pick_directory(req, cors_origin, json_header)
                        }
                        ("POST", "/api/dialog/pick-design-file") => {
                            routes::dialogs::handle_pick_design_file(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }

                        // Network & Cloud Provider Integrations
                        ("GET", "/api/network/status") => {
                            routes::system::handle_network_status(req, cors_origin, json_header)
                        }
                        ("POST", "/api/network/download-google-font") => {
                            routes::fonts::handle_network_download_google_font(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/google-fonts") => routes::fonts::handle_google_fonts(
                            req,
                            &state,
                            &query_params,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/download-google-font") => {
                            routes::fonts::handle_download_google_font(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/catalog/packages")
                        | ("GET", "/api/cloud/packages")
                        | ("GET", "/api/packs") => {
                            routes::fonts::handle_catalog_packages(req, cors_origin, json_header)
                        }
                        ("GET", "/api/catalog/refresh-manifest")
                        | ("GET", "/api/packs/check-updates") => {
                            routes::fonts::handle_refresh_manifest(req, cors_origin, json_header)
                        }
                        ("POST", "/api/catalog/download-all") => {
                            routes::fonts::handle_catalog_download_all(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/catalog/download-pack") => {
                            routes::fonts::handle_github_download_pack(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/github/download-pack") => {
                            routes::fonts::handle_github_download_pack(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/github/download-pack/status")
                        | ("GET", "/api/download/status")
                        | ("GET", "/api/catalog/download-status") => {
                            routes::fonts::handle_download_pack_status(
                                req,
                                &state,
                                &query_params,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/github/download-pack/cancel")
                        | ("POST", "/api/download/cancel") => {
                            routes::fonts::handle_download_pack_cancel(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/github/download-pack/retry")
                        | ("POST", "/api/download/retry") => {
                            routes::fonts::handle_download_pack_retry(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/font-packs/manifest") | ("GET", "/api/library/manifest") => {
                            routes::fonts::handle_font_pack_manifest(req, cors_origin, json_header)
                        }
                        ("GET", "/api/providers/status") => {
                            routes::system::handle_providers_status(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }

                        // Library Storage & Integrity
                        ("GET", "/api/library/config") => {
                            routes::fonts::handle_library_config_get(req, cors_origin, json_header)
                        }
                        ("POST", "/api/library/config") => {
                            routes::fonts::handle_library_config_post(req, cors_origin, json_header)
                        }
                        ("POST", "/api/library/open-downloads") => {
                            routes::fonts::handle_open_downloads_folder(
                                req,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/fonts/download-to-disk") => {
                            routes::fonts::handle_download_font_to_disk(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/library/repair") | ("GET", "/api/library/repair") => {
                            routes::fonts::handle_library_repair(
                                req,
                                &state,
                                &query_params,
                                cors_origin,
                                json_header,
                            )
                        }

                        // Font Activation & Installation Engine
                        ("POST", "/api/activate") | ("POST", "/api/activate-font") => {
                            routes::fonts::handle_activate(req, &state, cors_origin, json_header)
                        }
                        ("POST", "/api/deactivate") => {
                            routes::fonts::handle_deactivate(req, &state, cors_origin, json_header)
                        }
                        ("POST", "/api/activate-batch") => routes::fonts::handle_activate_batch(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/deactivate-batch") => {
                            routes::fonts::handle_deactivate_batch(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/deactivate-all") => routes::fonts::handle_deactivate_all(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/activate-all-library") => {
                            routes::fonts::handle_activate_all_library(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/install-all-library") => {
                            routes::fonts::handle_install_all_library(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/activate-category") => {
                            routes::fonts::handle_activate_category(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/import-folder") => routes::fonts::handle_import_folder(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/fonts/preview-folder") => {
                            routes::fonts::handle_preview_folder(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/fonts/rename-folder") => {
                            routes::fonts::handle_rename_font_folder(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/fonts/export-folder") => {
                            routes::fonts::handle_export_font_folder(
                                req,
                                &state,
                                &query_params,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/fonts/import-file") => {
                            routes::fonts::handle_import_font_file(
                                req,
                                &state,
                                &query_params,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/install-permanent") => {
                            routes::fonts::handle_install_permanent(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/install-permanent-batch") => {
                            routes::fonts::handle_install_permanent_batch(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/uninstall-permanent") => {
                            routes::fonts::handle_uninstall_permanent(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/toggle-favorite") => routes::fonts::handle_toggle_favorite(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/open-folder") => {
                            routes::fonts::handle_open_folder(req, &state, cors_origin, json_header)
                        }
                        ("POST", "/api/fonts/delete")
                        | ("DELETE", "/api/fonts/custom")
                        | ("POST", "/api/fonts/custom") => {
                            routes::fonts::handle_delete_font(req, &state, cors_origin, json_header)
                        }
                        ("POST", "/api/fonts/delete-family") => {
                            routes::fonts::handle_delete_family(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/fonts/delete-folder") => {
                            routes::fonts::handle_delete_font_folder(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }

                        // Smart & Custom Collections
                        ("GET", "/api/collections") => routes::collections::get_collections(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/collections") => routes::collections::create_collection(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("DELETE", "/api/collections") => routes::collections::delete_collection(
                            req,
                            &state,
                            &query_params,
                            None,
                            cors_origin,
                            json_header,
                        ),
                        ("DELETE", p) if p.starts_with("/api/collections/") => {
                            let col_name = &p["/api/collections/".len()..];
                            routes::collections::delete_collection(
                                req,
                                &state,
                                &query_params,
                                Some(col_name),
                                cors_origin,
                                json_header,
                            );
                        }

                        // Designer Brand Kits & Bundles
                        ("GET", "/api/brand-kits") => routes::brand_kits::get_brand_kits(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/brand-kits") => routes::brand_kits::save_brand_kit(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("DELETE", p) if p.starts_with("/api/brand-kits/") => {
                            let id = &p["/api/brand-kits/".len()..];
                            routes::brand_kits::delete_brand_kit(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/brand-kits/") && p.ends_with("/activate") =>
                        {
                            let id = &p["/api/brand-kits/".len()..p.len() - "/activate".len()];
                            routes::brand_kits::activate_brand_kit(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/brand-kits/")
                                && p.ends_with("/export-bundle") =>
                        {
                            let id = &p["/api/brand-kits/".len()..p.len() - "/export-bundle".len()];
                            routes::brand_kits::export_brand_bundle(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }

                        // Project Workspaces (Brand Systems) & ASE Swatches
                        ("GET", "/api/workspaces") => routes::workspaces::get_workspaces(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/workspaces") => routes::workspaces::save_workspace(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/workspaces/open-folder") => {
                            routes::workspaces::open_workspace_folder(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/workspaces/scan-folder") => {
                            routes::workspaces::scan_workspace_folder(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/workspaces/save-palette") => {
                            routes::workspaces::save_workspace_palette(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/ase/inspect") => {
                            routes::workspaces::inspect_ase(req, &state, cors_origin, json_header)
                        }
                        ("GET", p)
                            if p.starts_with("/api/workspaces/") && p.ends_with("/asset") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/asset".len()];
                            routes::workspaces::serve_workspace_asset(
                                req,
                                &state,
                                id,
                                &query_params,
                                cors_origin,
                            );
                        }
                        ("GET", p)
                            if p.starts_with("/api/workspaces/")
                                && (p.ends_with("/export-bundle")
                                    || p.ends_with("/export-zip")) =>
                        {
                            let suffix_len = if p.ends_with("/export-bundle") {
                                "/export-bundle".len()
                            } else {
                                "/export-zip".len()
                            };
                            let id = &p["/api/workspaces/".len()..p.len() - suffix_len];
                            routes::workspaces::export_workspace_handover_zip(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("GET", p) if p.starts_with("/api/workspaces/") => {
                            let id = &p["/api/workspaces/".len()..];
                            routes::workspaces::get_workspace_by_id(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("DELETE", p)
                            if p.starts_with("/api/workspaces/")
                                && p.ends_with("/design-file") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/design-file".len()];
                            routes::workspaces::delete_workspace_design_file(
                                req,
                                &state,
                                id,
                                &query_params,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("DELETE", p)
                            if p.starts_with("/api/workspaces/") && p.ends_with("/folders") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/folders".len()];
                            routes::workspaces::delete_workspace_folder(
                                req,
                                &state,
                                id,
                                &query_params,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("DELETE", p) if p.starts_with("/api/workspaces/") => {
                            let id = &p["/api/workspaces/".len()..];
                            routes::workspaces::delete_workspace(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/workspaces/") && p.ends_with("/folders") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/folders".len()];
                            routes::workspaces::create_workspace_folder(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/workspaces/") && p.ends_with("/open-file") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/open-file".len()];
                            routes::workspaces::open_workspace_file(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/workspaces/")
                                && p.ends_with("/upload-design") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/upload-design".len()];
                            routes::workspaces::upload_workspace_design(
                                req,
                                &state,
                                id,
                                &query_params,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/workspaces/")
                                && p.ends_with("/import-design-dialog") =>
                        {
                            let id = &p
                                ["/api/workspaces/".len()..p.len() - "/import-design-dialog".len()];
                            routes::workspaces::import_workspace_design_dialog(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/workspaces/")
                                && p.ends_with("/activate-ram") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/activate-ram".len()];
                            routes::workspaces::activate_workspace_ram(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p)
                            if p.starts_with("/api/workspaces/")
                                && p.ends_with("/export-bundle") =>
                        {
                            let id = &p["/api/workspaces/".len()..p.len() - "/export-bundle".len()];
                            routes::workspaces::export_workspace_bundle(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", p) if p.starts_with("/api/workspaces/") => {
                            let id = &p["/api/workspaces/".len()..];
                            routes::workspaces::save_workspace_with_id(
                                req,
                                &state,
                                id,
                                cors_origin,
                                json_header,
                            );
                        }

                        // Adobe Design Inspection (PSD / AI / INDD / PDF) & Live Document Monitor
                        ("POST", "/api/inspect-design") | ("POST", "/api/inspect-design-file") => {
                            routes::adobe::handle_inspect_design(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", "/api/inspect-design-upload") => {
                            routes::adobe::handle_inspect_design_upload(
                                req,
                                &state,
                                &query_params,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("GET", "/api/adobe/pending-activations") => {
                            routes::adobe::handle_pending_activations(
                                req,
                                &state,
                                &query_params,
                                cors_origin,
                                json_header,
                            );
                        }
                        ("POST", "/api/adobe/activate-document") => {
                            routes::adobe::handle_activate_document(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            );
                        }

                        // System Health, Memory & Registry Diagnostics
                        ("GET", "/api/system/info") => {
                            routes::system::handle_system_info(req, cors_origin, json_header)
                        }
                        ("GET", "/api/system/storage-breakdown")
                        | ("GET", "/api/system/storage") => {
                            routes::system::handle_system_storage(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/system/cleanup-cache")
                        | ("POST", "/api/system/storage/cleanup") => {
                            routes::system::handle_system_storage_cleanup(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/system/admin-status") => {
                            routes::system::handle_admin_status(req, cors_origin, json_header)
                        }
                        ("GET", "/api/health-check")
                        | ("GET", "/api/system-health")
                        | ("GET", "/api/system/health") => routes::system::handle_health_check(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/clean-registry")
                        | ("POST", "/api/clean-registry-fonts")
                        | ("POST", "/api/system/clean-registry") => {
                            routes::system::handle_clean_registry(req, cors_origin, json_header)
                        }
                        ("POST", "/api/rebuild-cache") | ("POST", "/api/system/rebuild-cache") => {
                            routes::system::handle_rebuild_cache(req, cors_origin, json_header)
                        }
                        ("POST", "/api/restore-default-fonts")
                        | ("POST", "/api/system/restore-default-fonts")
                        | ("POST", "/api/system/windows-fonts/restore-defaults") => {
                            routes::system::handle_restore_default_fonts(
                                req,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/system/windows-fonts/restore-profile") => {
                            routes::system::handle_restore_fonts_profile(
                                req,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/system/windows-fonts/backups") => {
                            routes::system::handle_get_backups(req, cors_origin, json_header)
                        }
                        ("DELETE", "/api/system/windows-fonts/backups")
                        | ("POST", "/api/system/windows-fonts/backups/delete") => {
                            routes::system::handle_delete_backup(req, cors_origin, json_header)
                        }
                        ("POST", "/api/system/windows-fonts/open-folder") => {
                            routes::system::handle_open_backup_folder(req, cors_origin, json_header)
                        }
                        ("POST", "/api/system/windows-fonts/undo-backup") => {
                            routes::system::handle_undo_backup(req, cors_origin, json_header)
                        }
                        ("POST", "/api/system/relaunch-admin") => {
                            routes::system::handle_relaunch_admin(req, cors_origin, json_header)
                        }
                        ("GET", "/api/system/resources") => {
                            routes::system::handle_system_resources(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/optimize-ram") | ("POST", "/api/system/optimize-ram") => {
                            routes::system::handle_optimize_ram(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/system/trim-process") => {
                            routes::system::handle_trim_process(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/system/operations") => {
                            routes::system::handle_system_operations(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("POST", "/api/system/operations/clear") => {
                            routes::system::handle_clear_system_operations(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/ram-status") | ("GET", "/api/system/ram-status") => {
                            routes::system::handle_ram_status(req, cors_origin, json_header)
                        }
                        ("GET", "/api/system/windows-fonts") => {
                            routes::system::handle_get_windows_fonts(req, cors_origin, json_header)
                        }
                        ("POST", "/api/system/windows-fonts/uninstall") => {
                            routes::system::handle_uninstall_windows_font(
                                req,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/system/ram-fonts") => routes::system::handle_get_ram_fonts(
                            req,
                            &state,
                            cors_origin,
                            json_header,
                        ),
                        ("POST", "/api/system/ram-fonts/clear-all") => {
                            routes::system::handle_clear_ram_fonts(
                                req,
                                &state,
                                cors_origin,
                                json_header,
                            )
                        }
                        ("GET", "/api/system/autostart") => {
                            routes::system::handle_get_autostart(req, cors_origin, json_header)
                        }
                        ("POST", "/api/system/autostart/toggle") => {
                            routes::system::handle_toggle_autostart(req, cors_origin, json_header)
                        }
                        ("POST", "/api/system/pin-taskbar-picker") => {
                            routes::system::handle_pin_taskbar_picker(req, cors_origin, json_header)
                        }
                        ("GET", "/api/updater")
                        | ("GET", "/api/updater/status")
                        | ("GET", "/api/check-update") => {
                            routes::system::handle_updater_status(req, cors_origin, json_header)
                        }
                        ("POST", "/api/updater/check") => {
                            routes::system::handle_updater_check(req, cors_origin, json_header)
                        }
                        ("POST", "/api/updater/apply") | ("POST", "/api/updater/install") => {
                            routes::system::handle_updater_apply(req, cors_origin, json_header)
                        }

                        // Desktop Screen Color Picker & Standalone Tool
                        ("GET", "/api/color/cursor-pixel") | ("GET", "/api/color/cursor-live") => {
                            routes::system::handle_cursor_pixel(req, cors_origin, json_header);
                        }
                        ("POST", "/api/color/pick-screen") | ("GET", "/api/color/pick-screen") => {
                            // Run interactive click-to-pick on a dedicated worker thread so
                            // `/api/color/cursor-pixel` and other API routes stay responsive concurrently.
                            let qp = query_params.clone();
                            thread::spawn(move || {
                                routes::system::handle_pick_screen_color(
                                    req,
                                    &qp,
                                    cors_origin,
                                    json_header,
                                );
                            });
                        }
                        ("POST", "/api/color/launch-standalone") => {
                            routes::system::handle_launch_color_picker(
                                req,
                                cors_origin,
                                json_header,
                            )
                        }

                        _ => {
                            routes::common::respond_json(
                                req,
                                404,
                                serde_json::json!({ "error": "API endpoint not found" }),
                                cors_origin,
                                json_header,
                            );
                        }
                    }
                    continue;
                }

                // Serve static files from static_dir or embedded assets with Path Traversal protection
                let rel_path = if path == "/" || path.is_empty() {
                    "index.html"
                } else {
                    path.trim_start_matches('/')
                };

                // Reject any traversal attempts
                if rel_path.contains("..") || rel_path.contains('\\') || rel_path.contains('\0') {
                    let mut res =
                        Response::from_string("403 Forbidden").with_status_code(StatusCode(403));
                    res.add_header(cors_origin);
                    routes::common::add_security_headers(&mut res);
                    let _ = req.respond(res);
                    continue;
                }

                let file_path = static_dir.join(rel_path);
                let is_safe = match (file_path.canonicalize(), static_dir.canonicalize()) {
                    (Ok(f), Ok(s)) => f.starts_with(s),
                    _ => false,
                };

                if is_safe && file_path.is_file() {
                    serve_file(file_path, req, cors_origin);
                } else if let Some(embedded_file) = EMBEDDED_DIST.get_file(rel_path) {
                    serve_embedded_file(embedded_file, req, cors_origin);
                } else {
                    // Fallback to index.html for SPA routing
                    let index_path = static_dir.join("index.html");
                    if index_path.exists() {
                        serve_file(index_path, req, cors_origin);
                    } else if let Some(index_file) = EMBEDDED_DIST.get_file("index.html") {
                        serve_embedded_file(index_file, req, cors_origin);
                    } else {
                        let mut res =
                            Response::from_string("Fontivo Native UI - Dist assets not found")
                                .with_status_code(StatusCode(404));
                        res.add_header(cors_origin);
                        routes::common::add_security_headers(&mut res);
                        let _ = req.respond(res);
                    }
                }
            }
        });
    }
}

fn serve_file(file_path: PathBuf, req: tiny_http::Request, cors: Header) {
    if let Ok(bytes) = fs::read(&file_path) {
        let mime = mime_guess_from_path(&file_path);
        let mime_h = Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap();
        let mut res = Response::from_data(bytes);
        res.add_header(cors);
        res.add_header(mime_h);
        routes::common::add_security_headers(&mut res);
        let _ = req.respond(res);
    }
}

fn serve_embedded_file(file: &include_dir::File<'_>, req: tiny_http::Request, cors: Header) {
    let mime = mime_guess_from_path(Path::new(file.path()));
    let mime_h = Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap();
    let mut res = Response::from_data(file.contents());
    res.add_header(cors);
    res.add_header(mime_h);
    routes::common::add_security_headers(&mut res);
    let _ = req.respond(res);
}

fn mime_guess_from_path(p: &Path) -> &'static str {
    match p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "ttc" | "otc" => "font/collection",
        _ => "application/octet-stream",
    }
}
