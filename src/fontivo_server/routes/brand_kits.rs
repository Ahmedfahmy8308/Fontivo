use std::sync::{Arc, RwLock};
use tiny_http::{Header, Request};

use super::common::{read_body, respond_json, respond_json_str};
use crate::server::state::{AppState, BrandKit};

pub fn get_brand_kits(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    let kits = st.get_brand_kits();
    respond_json_str(
        req,
        200,
        serde_json::to_string(&kits).unwrap_or_else(|_| "[]".to_string()),
        cors_origin,
        json_header,
    );
}

pub fn save_brand_kit(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    if let Ok(kit) = serde_json::from_str::<BrandKit>(&body) {
        let mut st = state.write().unwrap();
        let saved = st.save_brand_kit(kit);
        respond_json_str(
            req,
            200,
            serde_json::to_string(&saved).unwrap_or_default(),
            cors_origin,
            json_header,
        );
        return;
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Invalid brand kit data" }),
        cors_origin,
        json_header,
    );
}

pub fn delete_brand_kit(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    kit_id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let mut st = state.write().unwrap();
    let ok = st.delete_brand_kit(kit_id);
    respond_json(
        req,
        200,
        serde_json::json!({ "success": ok }),
        cors_origin,
        json_header,
    );
}

pub fn activate_brand_kit(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    kit_id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let mut st = state.write().unwrap();
    match st.activate_brand_kit(kit_id) {
        Ok(ids) => {
            respond_json(
                req,
                200,
                serde_json::json!({ "success": true, "activated": ids.len() }),
                cors_origin,
                json_header,
            );
        }
        Err(e) => {
            respond_json(
                req,
                404,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
        }
    }
}

pub fn export_brand_bundle(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    kit_id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    match st.export_brand_bundle(kit_id) {
        Ok(path) => {
            let path_str = path.to_string_lossy().to_string().replace('\\', "/");
            respond_json(
                req,
                200,
                serde_json::json!({ "success": true, "folderPath": path_str }),
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
}
