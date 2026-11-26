use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tiny_http::{Header, Request};

use super::common::{read_body, respond_json};
use crate::server::state::AppState;

pub fn get_collections(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    let cols = st.collections.clone();
    respond_json(
        req,
        200,
        serde_json::json!({ "success": true, "collections": cols }),
        cors_origin,
        json_header,
    );
}

pub fn create_collection(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct ColReq {
        name: String,
        #[serde(rename = "fontIds")]
        font_ids: Option<Vec<usize>>,
    }

    if let Ok(c) = serde_json::from_str::<ColReq>(&body) {
        let trimmed = c.name.trim().to_string();
        if !trimmed.is_empty() {
            let mut st = state.write().unwrap();
            let entry = st.collections.entry(trimmed.clone()).or_default();
            if let Some(ids) = c.font_ids {
                for id in ids {
                    if !entry.contains(&id) {
                        entry.push(id);
                    }
                }
            }
            let count = st.collections.get(&trimmed).map(|v| v.len()).unwrap_or(0);
            st.save_collections();

            respond_json(
                req,
                200,
                serde_json::json!({
                    "success": true,
                    "collection": trimmed,
                    "total_fonts": count
                }),
                cors_origin,
                json_header,
            );
            return;
        }
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Invalid or duplicate collection name" }),
        cors_origin,
        json_header,
    );
}

pub fn delete_collection(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &HashMap<String, String>,
    path_name: Option<&str>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct DelColReq {
        name: String,
    }

    let target_name = serde_json::from_str::<DelColReq>(&body)
        .ok()
        .map(|r| r.name)
        .or_else(|| query_params.get("name").cloned())
        .or_else(|| path_name.map(super::common::urlencoding_decode))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(name) = target_name {
        let mut st = state.write().unwrap();
        let removed = st.collections.remove(&name).is_some();
        if removed {
            st.save_collections();
            respond_json(
                req,
                200,
                serde_json::json!({ "success": true, "collection": name }),
                cors_origin,
                json_header,
            );
            return;
        }
        respond_json(
            req,
            404,
            serde_json::json!({ "success": false, "error": format!("Collection '{}' not found", name) }),
            cors_origin,
            json_header,
        );
        return;
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Collection name is required" }),
        cors_origin,
        json_header,
    );
}
