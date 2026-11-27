use std::sync::{Arc, RwLock};
use tiny_http::{Header, Request};

use super::adobe::inspect_design_helper;
use super::common::{respond_json, respond_json_str};
use crate::server::state::AppState;

pub fn handle_pick_folder(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = super::common::read_body(&mut req);
    #[derive(serde::Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct PickFolderReq {
        #[serde(default)]
        custom_folder_name: Option<String>,
    }
    let parsed = serde_json::from_str::<PickFolderReq>(&body).unwrap_or_default();

    let folder_opt = rfd::FileDialog::new()
        .set_title("Select Font Folder to Import")
        .pick_folder();

    if let Some(folder_path) = folder_opt {
        match super::fonts_lifecycle::ingest_font_folder_into_library_with_name(
            &folder_path,
            state,
            parsed.custom_folder_name.as_deref(),
        ) {
            Ok(summary) => {
                respond_json_str(
                    req,
                    200,
                    serde_json::to_string(&summary).unwrap_or_default(),
                    cors_origin,
                    json_header,
                );
            }
            Err(err) => {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": err }),
                    cors_origin,
                    json_header,
                );
            }
        }
    } else {
        respond_json(
            req,
            200,
            serde_json::json!({ "success": false, "cancelled": true }),
            cors_origin,
            json_header,
        );
    }
}

pub fn handle_pick_folder_preview(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let folder_opt = rfd::FileDialog::new()
        .set_title("Select Font Folder to Import")
        .pick_folder();

    if let Some(folder_path) = folder_opt {
        match super::fonts_lifecycle::preview_font_folder(&folder_path, state) {
            Ok(preview) => {
                respond_json(req, 200, preview, cors_origin, json_header);
            }
            Err((status, err)) => {
                respond_json(
                    req,
                    status,
                    serde_json::json!({ "success": false, "error": err }),
                    cors_origin,
                    json_header,
                );
            }
        }
    } else {
        respond_json(
            req,
            200,
            serde_json::json!({ "success": false, "cancelled": true }),
            cors_origin,
            json_header,
        );
    }
}

pub fn handle_pick_design_file(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let file_opt = rfd::FileDialog::new()
        .set_title("Select Design File to Inspect")
        .add_filter("Design Files", &["psd", "ai", "indd", "pdf"])
        .pick_file();

    if let Some(file_path) = file_opt {
        let st = state.read().unwrap();
        match inspect_design_helper(&file_path, &st) {
            Ok(res_obj) => {
                respond_json_str(
                    req,
                    200,
                    serde_json::to_string(&res_obj).unwrap_or_default(),
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
        }
    } else {
        respond_json(
            req,
            200,
            serde_json::json!({ "success": false, "cancelled": true }),
            cors_origin,
            json_header,
        );
    }
}

pub fn handle_pick_directory(req: Request, cors_origin: Header, json_header: Header) {
    let folder_opt = rfd::FileDialog::new()
        .set_title("Select Downloads Folder")
        .pick_folder();

    if let Some(folder_path) = folder_opt {
        let path_str = folder_path.to_string_lossy().to_string();
        respond_json(
            req,
            200,
            serde_json::json!({
                "success": true,
                "path": path_str,
                "folderName": folder_path.file_name().and_then(|n| n.to_str()).unwrap_or("")
            }),
            cors_origin,
            json_header,
        );
    } else {
        respond_json(
            req,
            200,
            serde_json::json!({ "success": false, "cancelled": true }),
            cors_origin,
            json_header,
        );
    }
}
