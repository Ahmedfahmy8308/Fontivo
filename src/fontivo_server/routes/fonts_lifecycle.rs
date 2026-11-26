use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, RwLock};
use tiny_http::{Header, Request};

use super::common::{read_body, respond_json, respond_json_str};
use crate::engine::{
    DownloadManager, FontPackItem, FontPackManifest, LibraryConfig, LibraryStorageManager,
};
use crate::google::google_fonts::{GoogleFontEntry, GoogleFontsManager};
use crate::parser::FontParser;
use crate::server::state::{AppState, FontRecord};

pub fn handle_activate(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct ActReq {
        id: usize,
    }
    if let Ok(data) = serde_json::from_str::<ActReq>(&body) {
        let mut st = state.write().unwrap();
        if let Some(font) = st.fonts.iter().find(|f| f.id == data.id).cloned() {
            if font.source.eq_ignore_ascii_case("system") {
                respond_json(
                    req,
                    200,
                    serde_json::json!({
                        "success": false,
                        "id": font.id,
                        "isSystem": true,
                        "error": "System font is already installed in Windows and cannot be toggled in RAM"
                    }),
                    cors_origin,
                    json_header,
                );
                return;
            }
            let usable_path = AppState::resolve_usable_font_path(&font.path);
            let target_str = usable_path.to_string_lossy().to_string();
            match st.activator.activate_ram(&target_str) {
                Ok(msg) => {
                    st.active_font_ids.insert(font.id);
                    if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                        f_mut.is_active = true;
                    }
                    st.save_active_fonts();
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": true, "id": font.id, "message": msg }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
                Err(err) => {
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": false, "id": font.id, "error": err }),
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
        404,
        serde_json::json!({ "success": false, "error": "Font not found" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_deactivate(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct DeactReq {
        id: usize,
    }
    if let Ok(data) = serde_json::from_str::<DeactReq>(&body) {
        let mut st = state.write().unwrap();
        if let Some(font) = st.fonts.iter().find(|f| f.id == data.id).cloned() {
            if font.source.eq_ignore_ascii_case("system") {
                respond_json(
                    req,
                    200,
                    serde_json::json!({
                        "success": false,
                        "id": font.id,
                        "isSystem": true,
                        "error": "System font is managed by Windows and cannot be deactivated in RAM"
                    }),
                    cors_origin,
                    json_header,
                );
                return;
            }
            let usable_path = AppState::resolve_usable_font_path(&font.path);
            let target_str = usable_path.to_string_lossy().to_string();
            let _ = st.activator.deactivate_ram(&font.path);
            match st.activator.deactivate_ram(&target_str) {
                Ok(msg) => {
                    st.active_font_ids.remove(&font.id);
                    if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                        f_mut.is_active = false;
                    }
                    st.save_active_fonts();
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": true, "id": font.id, "message": msg }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
                Err(err) => {
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": false, "id": font.id, "error": err }),
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
        404,
        serde_json::json!({ "success": false, "error": "Font not found" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_activate_batch(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum IdValue {
        Num(usize),
        Str(String),
    }

    #[derive(Deserialize)]
    struct BatchReq {
        ids: Option<Vec<IdValue>>,
        family: Option<String>,
        folder: Option<String>,
    }

    if let Ok(data) = serde_json::from_str::<BatchReq>(&body) {
        let mut st = state.write().unwrap();
        let mut target_ids: Vec<usize> = Vec::new();
        if let Some(folder) = data.folder {
            let norm_folder = folder
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_lowercase();
            let prefix = format!("{}\\", norm_folder);
            for f in st.fonts.iter().filter(|f| {
                if f.source.eq_ignore_ascii_case("system") {
                    return false;
                }
                let fp = f.path.replace('/', "\\").to_lowercase();
                fp == norm_folder || fp.starts_with(&prefix)
            }) {
                if !target_ids.contains(&f.id) {
                    target_ids.push(f.id);
                }
            }
        } else if let Some(fam) = data.family {
            for f in st.fonts.iter().filter(|f| {
                !f.source.eq_ignore_ascii_case("system")
                    && (f.family.as_deref() == Some(&fam)
                        || f.display_name.as_deref() == Some(&fam))
            }) {
                if !target_ids.contains(&f.id) {
                    target_ids.push(f.id);
                }
            }
        } else if let Some(ids) = data.ids {
            for v in ids {
                let parsed = match v {
                    IdValue::Num(n) => Some(n),
                    IdValue::Str(s) => s.trim().parse::<usize>().ok(),
                };
                if let Some(id) = parsed {
                    if !target_ids.contains(&id) {
                        target_ids.push(id);
                    }
                }
            }
        }

        let items: Vec<(usize, String)> = target_ids
            .into_iter()
            .filter_map(|id| {
                st.fonts.iter().find(|f| f.id == id).map(|f| {
                    let usable = AppState::resolve_usable_font_path(&f.path);
                    (f.id, usable.to_string_lossy().to_string())
                })
            })
            .collect();

        let activator = Arc::clone(&st.activator);
        let summary = activator.activate_batch(&items, |id, is_active| {
            if is_active {
                st.active_font_ids.insert(id);
                if let Some(f) = st.fonts.iter_mut().find(|f| f.id == id) {
                    f.is_active = true;
                }
            }
        });
        st.save_active_fonts();

        let resp = serde_json::json!({
            "success": true,
            "activatedCount": summary.succeeded.len(),
            "activatedIds": summary.succeeded,
            "totalRequested": summary.total_requested,
            "succeeded": summary.succeeded,
            "failed": summary.failed,
            "alreadyInState": summary.already_in_state,
        });
        respond_json(req, 200, resp, cors_origin, json_header);
        return;
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Malformed batch request" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_deactivate_batch(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct BatchReq {
        ids: Option<Vec<usize>>,
        family: Option<String>,
        folder: Option<String>,
    }

    if let Ok(data) = serde_json::from_str::<BatchReq>(&body) {
        let mut st = state.write().unwrap();
        let target_ids: Vec<usize> = if let Some(folder) = data.folder {
            let norm_folder = folder
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_lowercase();
            let prefix = format!("{}\\", norm_folder);
            st.fonts
                .iter()
                .filter(|f| {
                    if f.source.eq_ignore_ascii_case("system") {
                        return false;
                    }
                    let fp = f.path.replace('/', "\\").to_lowercase();
                    fp == norm_folder || fp.starts_with(&prefix)
                })
                .map(|f| f.id)
                .collect()
        } else if let Some(fam) = data.family {
            st.fonts
                .iter()
                .filter(|f| {
                    !f.source.eq_ignore_ascii_case("system")
                        && (f.family.as_deref() == Some(&fam)
                            || f.display_name.as_deref() == Some(&fam))
                })
                .map(|f| f.id)
                .collect()
        } else {
            data.ids.unwrap_or_default()
        };

        let items: Vec<(usize, String)> = target_ids
            .into_iter()
            .filter_map(|id| {
                st.fonts.iter().find(|f| f.id == id).map(|f| {
                    let usable = AppState::resolve_usable_font_path(&f.path);
                    (f.id, usable.to_string_lossy().to_string())
                })
            })
            .collect();

        let activator = Arc::clone(&st.activator);
        let summary = activator.deactivate_batch(&items, |id, deactivated| {
            if deactivated {
                st.active_font_ids.remove(&id);
                if let Some(f) = st.fonts.iter_mut().find(|f| f.id == id) {
                    f.is_active = false;
                }
            }
        });
        st.save_active_fonts();

        respond_json_str(
            req,
            200,
            serde_json::to_string(&summary).unwrap_or_default(),
            cors_origin,
            json_header,
        );
        return;
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Malformed batch request" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_deactivate_all(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let mut st = state.write().unwrap();
    let count = st.activator.deactivate_all();
    st.active_font_ids.clear();
    for f in &mut st.fonts {
        f.is_active = false;
    }
    st.save_active_fonts();
    respond_json(
        req,
        200,
        serde_json::json!({ "success": true, "count": count }),
        cors_origin,
        json_header,
    );
}

pub fn handle_activate_all_library(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let mut st = state.write().unwrap();
    let to_activate: Vec<(usize, String)> = st
        .fonts
        .iter()
        .filter(|f| f.source != "system" && Path::new(&f.path).exists())
        .map(|f| (f.id, f.path.clone()))
        .collect();
    let mut count = 0;
    let mut newly_active = std::collections::HashSet::new();
    for (id, path) in to_activate {
        if st.activator.activate_ram(&path).is_ok() {
            st.active_font_ids.insert(id);
            newly_active.insert(id);
            count += 1;
        }
    }
    for f in &mut st.fonts {
        if newly_active.contains(&f.id) {
            f.is_active = true;
        }
    }
    st.save_active_fonts();
    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "count": count,
            "message": format!("Activated {} fonts successfully in RAM", count)
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_install_all_library(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let mut st = state.write().unwrap();
    let to_install: Vec<(usize, String, String)> = st
        .fonts
        .iter()
        .filter(|f| f.source != "system" && Path::new(&f.path).exists())
        .map(|f| {
            let name = f.display_name.as_deref().unwrap_or(&f.name).to_string();
            (f.id, f.path.clone(), name)
        })
        .collect();
    let mut count = 0;
    let mut newly_active = std::collections::HashSet::new();
    for (id, path, name) in to_install {
        if st.activator.install_permanent(&path, &name).is_ok() {
            st.active_font_ids.insert(id);
            newly_active.insert(id);
            count += 1;
        }
    }
    for f in &mut st.fonts {
        if newly_active.contains(&f.id) {
            f.is_active = true;
        }
    }
    st.save_active_fonts();
    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "count": count,
            "message": format!("Installed {} fonts permanently in Windows", count)
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_activate_category(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct CatReq {
        category: String,
    }
    let mut count = 0;
    if let Ok(data) = serde_json::from_str::<CatReq>(&body) {
        let mut st = state.write().unwrap();
        let target_cat = data.category.to_lowercase();
        let to_activate: Vec<(usize, String)> = st
            .fonts
            .iter()
            .filter(|f| {
                let matches = if target_cat == "arabic" {
                    f.is_arabic || f.category.contains("Arabic")
                } else if target_cat == "english" {
                    !f.is_arabic && !f.category.contains("Symbols")
                } else if target_cat == "symbols" {
                    f.category.contains("Symbols")
                } else {
                    f.category.to_lowercase().contains(&target_cat)
                };
                matches && f.source != "system" && Path::new(&f.path).exists()
            })
            .map(|f| (f.id, f.path.clone()))
            .collect();

        let mut newly_active = std::collections::HashSet::new();
        for (id, path) in to_activate {
            if st.activator.activate_ram(&path).is_ok() {
                st.active_font_ids.insert(id);
                newly_active.insert(id);
                count += 1;
            }
        }
        for f in &mut st.fonts {
            if newly_active.contains(&f.id) {
                f.is_active = true;
            }
        }
        st.save_active_fonts();
    }
    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "count": count,
            "message": format!("Activated {} fonts in category", count)
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_import_folder(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct ImportReq {
        #[serde(rename = "folderPath")]
        folder_path: String,
    }

    if let Ok(data) = serde_json::from_str::<ImportReq>(&body) {
        let folder = Path::new(&data.folder_path);
        if folder.exists() && folder.is_dir() {
            let mut new_fonts = Vec::new();
            let mut next_id = {
                let st = state.read().unwrap();
                st.fonts.iter().map(|f| f.id).max().unwrap_or(0) + 1
            };

            fn scan_recursive(
                dir: &Path,
                next_id: &mut usize,
                list: &mut Vec<FontRecord>,
                depth: usize,
            ) {
                if depth > 12 || list.len() >= 50_000 {
                    return;
                }
                if let Ok(entries) = fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() {
                            scan_recursive(&p, next_id, list, depth + 1);
                        } else if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                            let e = ext.to_lowercase();
                            if e == "ttf" || e == "otf" || e == "woff" || e == "woff2" || e == "ttc"
                            {
                                let file_name = p
                                    .file_name()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("font")
                                    .to_string();
                                let meta = FontParser::parse_file(&p).ok();
                                let is_arabic = meta
                                    .as_ref()
                                    .map(|m| m.coverage.supports_arabic)
                                    .unwrap_or(false);
                                let is_latin = meta
                                    .as_ref()
                                    .map(|m| m.coverage.supports_latin)
                                    .unwrap_or(!is_arabic);
                                let is_bilingual = is_arabic && is_latin;
                                let is_variable =
                                    meta.as_ref().map(|m| m.is_variable).unwrap_or(false);
                                let has_tashkeel = meta
                                    .as_ref()
                                    .map(|m| m.coverage.has_tashkeel)
                                    .unwrap_or(false);
                                let has_extended_arabic = meta
                                    .as_ref()
                                    .map(|m| m.coverage.has_extended_arabic)
                                    .unwrap_or(false);
                                let has_arabic_numerals = meta
                                    .as_ref()
                                    .map(|m| m.coverage.has_arabic_numerals)
                                    .unwrap_or(false);
                                let has_western_numerals = meta
                                    .as_ref()
                                    .map(|m| m.coverage.has_western_numerals)
                                    .unwrap_or(true);
                                let display_name = meta.as_ref().map(|m| m.full_name.clone());
                                let family = meta.as_ref().map(|m| m.family.clone());
                                let style = meta.as_ref().map(|m| m.subfamily.clone());
                                let weight = meta
                                    .as_ref()
                                    .map(|m| m.weight_class)
                                    .filter(|&w| w > 0)
                                    .unwrap_or_else(|| {
                                        crate::server::state::style_to_weight(style.as_deref())
                                    });
                                let glyph_count = meta.as_ref().map(|m| m.glyph_count as usize);
                                let post_script_name =
                                    meta.as_ref().map(|m| m.postscript_name.clone());
                                let size = entry.metadata().map(|m| m.len() as usize).unwrap_or(0);

                                list.push(FontRecord {
                                    id: *next_id,
                                    name: file_name,
                                    path: p.to_string_lossy().to_string(),
                                    category: if is_arabic {
                                        "01 - Arabic Fonts".to_string()
                                    } else {
                                        "02 - English Fonts".to_string()
                                    },
                                    sub_category: Some("Imported".to_string()),
                                    family,
                                    format: e.to_uppercase(),
                                    size,
                                    is_arabic,
                                    is_latin,
                                    is_bilingual,
                                    is_variable,
                                    weight,
                                    source: "local".to_string(),
                                    is_active: false,
                                    is_favorite: false,
                                    display_name,
                                    style,
                                    post_script_name,
                                    glyph_count,
                                    has_tashkeel,
                                    has_extended_arabic,
                                    has_arabic_numerals,
                                    has_western_numerals,
                                    is_local: true,
                                });
                                *next_id += 1;
                            }
                        }
                    }
                }
            }

            scan_recursive(folder, &mut next_id, &mut new_fonts, 0);
            let imported_count = new_fonts.len();
            let folder_name = folder
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            let mut dictionary: std::collections::HashMap<String, FontRecord> =
                std::collections::HashMap::new();
            for f in &new_fonts {
                dictionary.insert(f.name.clone(), f.clone());
            }

            {
                let mut st = state.write().unwrap();
                st.fonts.extend(new_fonts.clone());
                st.save_user_library_index();
            }

            #[derive(Serialize)]
            #[serde(rename_all = "camelCase")]
            struct ImportFolderResponse {
                success: bool,
                imported_count: usize,
                folder_name: String,
                folder_path: String,
                fonts: Vec<FontRecord>,
                dictionary: std::collections::HashMap<String, FontRecord>,
            }

            let resp = ImportFolderResponse {
                success: true,
                imported_count,
                folder_name,
                folder_path: data.folder_path.clone(),
                fonts: new_fonts,
                dictionary,
            };

            respond_json_str(
                req,
                200,
                serde_json::to_string(&resp).unwrap_or_default(),
                cors_origin,
                json_header,
            );
            return;
        }
    }

    respond_json(
        req,
        404,
        serde_json::json!({ "success": false, "error": "Folder not found" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_install_permanent(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct InstReq {
        id: usize,
    }
    if let Ok(data) = serde_json::from_str::<InstReq>(&body) {
        let mut st = state.write().unwrap();
        if let Some(font) = st.fonts.iter().find(|f| f.id == data.id).cloned() {
            let font_name = font.display_name.as_deref().unwrap_or(&font.name);
            match st.activator.install_permanent(&font.path, font_name) {
                Ok(msg) => {
                    st.active_font_ids.insert(font.id);
                    if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                        f_mut.is_active = true;
                    }
                    st.save_active_fonts();
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": true, "id": font.id, "message": msg }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
                Err(e) => {
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": false, "id": font.id, "error": e }),
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
        404,
        serde_json::json!({ "success": false, "error": "Font not found" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_uninstall_permanent(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct UninstReq {
        id: usize,
    }
    if let Ok(data) = serde_json::from_str::<UninstReq>(&body) {
        let mut st = state.write().unwrap();
        if let Some(font) = st.fonts.iter().find(|f| f.id == data.id).cloned() {
            let font_name = font.display_name.as_deref().unwrap_or(&font.name);
            match st.activator.uninstall_permanent(font_name) {
                Ok(msg) => {
                    st.active_font_ids.remove(&font.id);
                    if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                        f_mut.is_active = false;
                    }
                    st.save_active_fonts();
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": true, "id": font.id, "message": msg }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
                Err(e) => {
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": false, "id": font.id, "error": e }),
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
        404,
        serde_json::json!({ "success": false, "error": "Font not found" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_install_permanent_batch(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct InstBatchReq {
        ids: Vec<usize>,
    }
    let mut succeeded = Vec::new();
    let mut failed = Vec::new();

    if let Ok(data) = serde_json::from_str::<InstBatchReq>(&body) {
        let mut st = state.write().unwrap();
        for id in data.ids {
            if let Some(font) = st.fonts.iter().find(|f| f.id == id).cloned() {
                let font_name = font.display_name.as_deref().unwrap_or(&font.name);
                match st.activator.install_permanent(&font.path, font_name) {
                    Ok(_) => {
                        st.active_font_ids.insert(font.id);
                        if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == font.id) {
                            f_mut.is_active = true;
                        }
                        succeeded.push(font.id);
                    }
                    Err(e) => {
                        failed.push((font.id, e.to_string()));
                    }
                }
            } else {
                failed.push((id, "Font ID not found in library".to_string()));
            }
        }
        st.save_active_fonts();
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct BatchInstallRes {
        success: bool,
        installed_count: usize,
        failed_count: usize,
        succeeded: Vec<usize>,
        failed: Vec<(usize, String)>,
    }

    let res_obj = BatchInstallRes {
        success: true,
        installed_count: succeeded.len(),
        failed_count: failed.len(),
        succeeded,
        failed,
    };

    respond_json_str(
        req,
        200,
        serde_json::to_string(&res_obj).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_toggle_favorite(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct FavReq {
        id: usize,
    }
    if let Ok(data) = serde_json::from_str::<FavReq>(&body) {
        let mut st = state.write().unwrap();
        let is_fav = if st.favorite_font_ids.contains(&data.id) {
            st.favorite_font_ids.remove(&data.id);
            false
        } else {
            st.favorite_font_ids.insert(data.id);
            true
        };
        if let Some(f) = st.fonts.iter_mut().find(|f| f.id == data.id) {
            f.is_favorite = is_fav;
        }
        st.save_favorites();
        respond_json(
            req,
            200,
            serde_json::json!({ "success": true, "isFavorite": is_fav }),
            cors_origin,
            json_header,
        );
        return;
    }
    respond_json(
        req,
        400,
        serde_json::json!({ "success": false }),
        cors_origin,
        json_header,
    );
}

pub fn handle_google_fonts(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let force_refresh = query_params
        .get("refresh")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let (mut catalog, source) = GoogleFontsManager::get_full_catalog(force_refresh);

    // Compute real global totals across the full catalog before filtering
    let total_families = catalog.len();
    let total_styles: usize = catalog.iter().map(|f| f.variants.len().max(1)).sum();
    let arabic_count = catalog.iter().filter(|f| f.is_arabic).count();
    let variable_count = catalog.iter().filter(|f| f.is_variable).count();

    if let Some(cat) = query_params.get("category") {
        let c_low = cat.trim().to_ascii_lowercase();
        if !c_low.is_empty() && c_low != "all" {
            if c_low == "arabic" {
                catalog.retain(|f| f.is_arabic);
            } else if c_low == "variable" {
                catalog.retain(|f| f.is_variable);
            } else {
                catalog.retain(|f| f.category.to_ascii_lowercase() == c_low);
            }
        }
    }

    if let Some(script) = query_params
        .get("script")
        .or_else(|| query_params.get("scriptFilter"))
    {
        let s_low = script.trim().to_ascii_lowercase();
        if !s_low.is_empty() && s_low != "all" {
            match s_low.as_str() {
                "arabic" => catalog.retain(|f| f.is_arabic),
                "latin" => catalog.retain(|f| f.is_latin),
                "bilingual" => catalog.retain(|f| f.is_arabic && f.is_latin),
                "variable" => catalog.retain(|f| f.is_variable),
                _ => {}
            }
        }
    }

    if let Some(search) = query_params.get("search") {
        let q = search.trim().to_lowercase();
        if !q.is_empty() {
            catalog.retain(|f| {
                f.family.to_lowercase().contains(&q)
                    || f.category.to_lowercase().contains(&q)
                    || f.designers.iter().any(|d| d.to_lowercase().contains(&q))
            });
        }
    }

    if let Some(sort) = query_params
        .get("sort")
        .or_else(|| query_params.get("sortBy"))
    {
        match sort.trim().to_ascii_lowercase().as_str() {
            "name" | "name-asc" => catalog.sort_by(|a, b| a.family.cmp(&b.family)),
            "name-desc" => catalog.sort_by(|a, b| b.family.cmp(&a.family)),
            "variants" | "styles-desc" => {
                catalog.sort_by(|a, b| b.variants.len().cmp(&a.variants.len()))
            }
            _ => {}
        }
    }

    let filtered_total = catalog.len();

    // Optional pagination if `limit` is explicitly provided
    if let Some(limit) = query_params
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
    {
        let page = query_params
            .get("page")
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(1);
        let offset = query_params
            .get("offset")
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or_else(|| if page > 0 { (page - 1) * limit } else { 0 });
        catalog = catalog.into_iter().skip(offset).take(limit).collect();
    }

    let st = state.read().unwrap();
    let active_families: HashSet<String> = st
        .fonts
        .iter()
        .filter(|lf| lf.is_active)
        .filter_map(|lf| lf.family.as_ref().map(|s| s.to_ascii_lowercase()))
        .collect();
    let storage_dir = GoogleFontsManager::get_storage_dir();
    let lib_google_dir = LibraryStorageManager::get_google_dir();

    for f in &mut catalog {
        let fname = format!("{}.ttf", f.family.replace(' ', "_"));
        f.is_downloaded = storage_dir.join(&fname).exists() || lib_google_dir.join(&fname).exists();
        f.is_active = active_families.contains(&f.family.to_ascii_lowercase());
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct GfRes {
        success: bool,
        source: String,
        total: usize,
        total_families: usize,
        total_styles: usize,
        arabic_count: usize,
        variable_count: usize,
        fonts: Vec<GoogleFontEntry>,
    }
    respond_json_str(
        req,
        200,
        serde_json::to_string(&GfRes {
            success: true,
            source,
            total: filtered_total,
            total_families,
            total_styles,
            arabic_count,
            variable_count,
            fonts: catalog,
        })
        .unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_download_google_font(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct DlReq {
        family: String,
        mode: Option<String>,
    }

    if let Ok(data) = serde_json::from_str::<DlReq>(&body) {
        let download_url = GoogleFontsManager::resolve_download_url(&data.family);

        match crate::engine::DownloadManager::download_and_index_google_font(
            &data.family,
            &download_url,
            state,
        ) {
            Ok(mut record) => {
                let mode = data.mode.as_deref().unwrap_or("ram");
                let activated = if mode == "disk" || mode == "download" {
                    let dl_dir = LibraryStorageManager::get_downloads_dir();
                    let _ = fs::create_dir_all(&dl_dir);
                    let src_path = Path::new(&record.path);
                    if let Some(fname) = src_path.file_name() {
                        let dst = dl_dir.join(fname);
                        let _ = fs::copy(src_path, &dst);
                    }
                    false
                } else {
                    let mut st = state.write().unwrap();
                    let res = if mode == "permanent" {
                        st.activator.install_permanent(&record.path, &record.name)
                    } else {
                        st.activator.activate_ram(&record.path)
                    };
                    if res.is_ok() {
                        st.active_font_ids.insert(record.id);
                        if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == record.id) {
                            f_mut.is_active = true;
                        }
                        st.save_active_fonts();
                        true
                    } else {
                        false
                    }
                };
                record.is_active = activated;

                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct DlSuccess<'a> {
                    success: bool,
                    id: usize,
                    family: &'a str,
                    path: &'a str,
                    font: &'a FontRecord,
                }

                respond_json_str(
                    req,
                    200,
                    serde_json::to_string(&DlSuccess {
                        success: true,
                        id: record.id,
                        family: record.family.as_deref().unwrap_or(&data.family),
                        path: &record.path,
                        font: &record,
                    })
                    .unwrap_or_default(),
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
        serde_json::json!({ "success": false, "error": "Invalid request payload" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_network_download_google_font(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct DlReq {
        family: String,
        url: Option<String>,
    }
    if let Ok(dl) = serde_json::from_str::<DlReq>(&body) {
        let resolved_url = dl
            .url
            .clone()
            .unwrap_or_else(|| GoogleFontsManager::resolve_download_url(&dl.family));

        match crate::engine::DownloadManager::download_and_index_google_font(
            &dl.family,
            &resolved_url,
            state,
        ) {
            Ok(mut record) => {
                let activated = {
                    let mut st = state.write().unwrap();
                    if st.activator.activate_ram(&record.path).is_ok() {
                        st.active_font_ids.insert(record.id);
                        if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == record.id) {
                            f_mut.is_active = true;
                        }
                        st.save_active_fonts();
                        true
                    } else {
                        false
                    }
                };
                record.is_active = activated;

                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct DlSuccess<'a> {
                    success: bool,
                    id: usize,
                    family: &'a str,
                    path: &'a str,
                    font: &'a FontRecord,
                }

                respond_json_str(
                    req,
                    200,
                    serde_json::to_string(&DlSuccess {
                        success: true,
                        id: record.id,
                        family: record.family.as_deref().unwrap_or(&dl.family),
                        path: &record.path,
                        font: &record,
                    })
                    .unwrap_or_default(),
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
        serde_json::json!({ "success": false, "error": "Download failed or invalid request" }),
        cors_origin,
        json_header,
    );
}

/// Resolves and validates a requested pack ID strictly against the trusted embedded manifest.
/// Rejects path traversal, unknown pack IDs, and any attempt to override download_url or sha256.
pub fn resolve_trusted_pack_request(
    pack_id: Option<&str>,
    download_url_override: Option<&str>,
    sha256_override: Option<&str>,
) -> Result<FontPackItem, String> {
    let target_pack_id = pack_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("pack-essential-001");

    let safe_id = DownloadManager::sanitize_pack_id(target_pack_id)?;

    let (manifest, _, _) = FontPackManifest::fetch_remote_or_default_cached();
    let pack_item = manifest
        .packs
        .into_iter()
        .find(|p| p.id == safe_id)
        .ok_or_else(|| {
            format!(
                "Unknown font pack ID '{}': only verified manifest packs are allowed",
                safe_id
            )
        })?;

    if let Some(override_url) = download_url_override {
        if !override_url.trim().is_empty() && override_url.trim() != pack_item.download_url {
            return Err("Overriding pack downloadUrl from request body is forbidden".to_string());
        }
    }

    if let Some(override_sha) = sha256_override {
        if !override_sha.trim().eq_ignore_ascii_case(&pack_item.sha256) {
            return Err(
                "Overriding pack sha256 checksum from request body is forbidden".to_string(),
            );
        }
    }

    Ok(pack_item)
}

pub fn handle_github_download_pack(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PackReq {
        #[serde(alias = "pack_id")]
        pack_id: Option<String>,
        #[serde(alias = "download_url")]
        download_url: Option<String>,
        sha256: Option<String>,
    }

    let req_data = serde_json::from_str::<PackReq>(&body).unwrap_or(PackReq {
        pack_id: None,
        download_url: None,
        sha256: None,
    });

    let pack_item = match resolve_trusted_pack_request(
        req_data.pack_id.as_deref(),
        req_data.download_url.as_deref(),
        req_data.sha256.as_deref(),
    ) {
        Ok(item) => item,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let download_mgr = {
        let st = state.read().unwrap();
        Arc::clone(&st.download_manager)
    };

    match download_mgr.start_pack_download(pack_item.clone(), Arc::clone(state)) {
        Ok(job_id) => {
            #[derive(Serialize)]
            #[serde(rename_all = "camelCase")]
            struct Res<'a> {
                success: bool,
                job_id: &'a str,
                status: &'a str,
                message: &'a str,
                pack: &'a FontPackItem,
            }

            respond_json_str(
                req,
                200,
                serde_json::to_string(&Res {
                    success: true,
                    job_id: &job_id,
                    status: "downloading",
                    message: "Font pack download and indexing pipeline started successfully",
                    pack: &pack_item,
                })
                .unwrap_or_default(),
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

pub fn handle_download_pack_status(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let download_mgr = {
        let st = state.read().unwrap();
        Arc::clone(&st.download_manager)
    };

    if let Some(job_id) = query_params.get("jobId") {
        if let Some(progress) = download_mgr.get_status(job_id) {
            respond_json_str(
                req,
                200,
                serde_json::to_string(&progress).unwrap_or_default(),
                cors_origin,
                json_header,
            );
            return;
        }
    }

    let all_jobs = download_mgr.list_jobs();
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct JobsRes {
        success: bool,
        jobs: Vec<crate::engine::DownloadProgress>,
    }
    respond_json_str(
        req,
        200,
        serde_json::to_string(&JobsRes {
            success: true,
            jobs: all_jobs,
        })
        .unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_download_pack_cancel(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CancelReq {
        job_id: String,
    }

    if let Ok(data) = serde_json::from_str::<CancelReq>(&body) {
        let download_mgr = {
            let st = state.read().unwrap();
            Arc::clone(&st.download_manager)
        };
        let cancelled = download_mgr.cancel(&data.job_id);
        respond_json(
            req,
            200,
            serde_json::json!({ "success": cancelled, "jobId": data.job_id }),
            cors_origin,
            json_header,
        );
        return;
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Invalid cancel request" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_download_pack_retry(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RetryReq {
        job_id: String,
    }

    if let Ok(data) = serde_json::from_str::<RetryReq>(&body) {
        let download_mgr = {
            let st = state.read().unwrap();
            Arc::clone(&st.download_manager)
        };
        match download_mgr.retry(&data.job_id, Arc::clone(state)) {
            Ok(_) => {
                respond_json(
                    req,
                    200,
                    serde_json::json!({ "success": true, "jobId": data.job_id }),
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
        serde_json::json!({ "success": false, "error": "Invalid retry request" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_font_pack_manifest(req: Request, cors_origin: Header, json_header: Header) {
    let (manifest, _, _) = FontPackManifest::fetch_remote_or_default_cached();
    respond_json_str(
        req,
        200,
        serde_json::to_string(&manifest).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPackageItem {
    pub id: String,
    pub name: String,
    pub category: String,
    pub font_count: usize,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub download_url: String,
    pub file_name: String,
    pub is_downloaded: bool,
    pub sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

pub fn is_pack_downloaded(pack: &FontPackItem) -> bool {
    let safe_id = match DownloadManager::sanitize_pack_id(&pack.id) {
        Ok(id) => id,
        Err(_) => return false,
    };
    let safe_file = match DownloadManager::sanitize_pack_filename(&pack.file_name) {
        Ok(f) => f,
        Err(_) => return false,
    };

    let packs_dir = LibraryStorageManager::get_packs_dir();
    let extracted_dir = LibraryStorageManager::get_extracted_dir();

    // 1. Check if zip file exists in Packs dir
    let zip_file = packs_dir.join(&safe_file);
    if zip_file.exists() {
        return true;
    }

    // 2. Check if extracted directory exists and has files
    let pack_ext_dir = extracted_dir.join(&safe_id);
    if pack_ext_dir.exists() {
        if let Ok(entries) = fs::read_dir(&pack_ext_dir) {
            if entries.flatten().next().is_some() {
                return true;
            }
        }
    }

    false
}

pub fn handle_catalog_packages(req: Request, cors_origin: Header, json_header: Header) {
    let (manifest, is_remote, source) = FontPackManifest::fetch_remote_or_default_cached();
    let library_version = manifest.library_version.clone();
    let schema_version = manifest.schema_version;
    let packages: Vec<CatalogPackageItem> = manifest
        .packs
        .into_iter()
        .map(|p| {
            let downloaded = is_pack_downloaded(&p);
            CatalogPackageItem {
                id: p.id,
                name: p.name,
                category: p.category.unwrap_or_else(|| "General".to_string()),
                font_count: p.font_count,
                compressed_size: p.compressed_size,
                uncompressed_size: p.uncompressed_size,
                download_url: p.download_url,
                file_name: p.file_name,
                is_downloaded: downloaded,
                sha256: p.sha256,
                description: p.description,
            }
        })
        .collect();

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "isRemote": is_remote,
            "source": source,
            "schemaVersion": schema_version,
            "libraryVersion": library_version,
            "releaseTag": format!("v{}", library_version),
            "version": library_version,
            "packCount": packages.len(),
            "packages": packages
        }),
        cors_origin,
        json_header,
    );
}

pub fn handle_catalog_download_all(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let (manifest, _, _) = FontPackManifest::fetch_remote_or_default_cached();
    let library_version = manifest.library_version.clone();
    let download_mgr = {
        let st = state.read().unwrap();
        Arc::clone(&st.download_manager)
    };

    let mut queued_jobs = Vec::new();
    let mut already_downloaded = Vec::new();

    for pack in manifest.packs {
        if is_pack_downloaded(&pack) {
            already_downloaded.push(pack.id);
            continue;
        }

        match download_mgr.start_pack_download(pack.clone(), Arc::clone(state)) {
            Ok(job_id) => {
                queued_jobs.push(serde_json::json!({
                    "packId": pack.id,
                    "packName": pack.name,
                    "version": library_version,
                    "totalBytes": pack.compressed_size,
                    "jobId": job_id,
                    "status": "downloading"
                }));
            }
            Err(err) => {
                queued_jobs.push(serde_json::json!({
                    "packId": pack.id,
                    "packName": pack.name,
                    "version": library_version,
                    "totalBytes": pack.compressed_size,
                    "error": err,
                    "status": "failed"
                }));
            }
        }
    }

    let res_obj = serde_json::json!({
        "success": true,
        "libraryVersion": library_version,
        "message": format!("Started download for {} packages ({} already downloaded)", queued_jobs.len(), already_downloaded.len()),
        "queued": queued_jobs,
        "alreadyDownloaded": already_downloaded
    });

    respond_json(req, 200, res_obj, cors_origin, json_header);
}

pub fn handle_library_config_get(req: Request, cors_origin: Header, json_header: Header) {
    let config = LibraryStorageManager::get_config();
    let used_space = LibraryStorageManager::calculate_used_space();
    let free_space = LibraryStorageManager::check_available_space(0).unwrap_or(0);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ConfigRes {
        success: bool,
        config: LibraryConfig,
        used_space_bytes: u64,
        available_space_bytes: u64,
    }

    respond_json_str(
        req,
        200,
        serde_json::to_string(&ConfigRes {
            success: true,
            config,
            used_space_bytes: used_space,
            available_space_bytes: free_space,
        })
        .unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_library_config_post(mut req: Request, cors_origin: Header, json_header: Header) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SetConfigReq {
        library_dir: Option<String>,
        downloads_dir: Option<String>,
        auto_sync: Option<bool>,
    }

    if let Ok(data) = serde_json::from_str::<SetConfigReq>(&body) {
        if let Some(ref lib_dir) = data.library_dir {
            if !lib_dir.trim().is_empty() {
                if let Err(e) = LibraryStorageManager::set_library_dir(Path::new(lib_dir)) {
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

        if let Some(ref dl_dir) = data.downloads_dir {
            if !dl_dir.trim().is_empty() {
                if let Err(e) = LibraryStorageManager::set_downloads_dir(Path::new(dl_dir)) {
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

        let mut config = LibraryStorageManager::get_config();
        if let Some(sync) = data.auto_sync {
            config.auto_sync = sync;
            let _ = LibraryStorageManager::save_config(&config);
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct SuccessRes {
            success: bool,
            config: LibraryConfig,
        }

        respond_json_str(
            req,
            200,
            serde_json::to_string(&SuccessRes {
                success: true,
                config,
            })
            .unwrap_or_default(),
            cors_origin,
            json_header,
        );
        return;
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Invalid configuration payload" }),
        cors_origin,
        json_header,
    );
}

/// Opens the user's active downloads folder directly in the native file explorer (Windows Explorer)
pub fn handle_open_downloads_folder(req: Request, cors_origin: Header, json_header: Header) {
    let dl_dir = LibraryStorageManager::get_downloads_dir();
    let _ = fs::create_dir_all(&dl_dir);

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(&dl_dir)
            .spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dl_dir).spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dl_dir).spawn();
    }

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "path": dl_dir.to_string_lossy().to_string()
        }),
        cors_origin,
        json_header,
    );
}

/// Downloads/copies font file(s) directly to the user's configured downloads directory without system installation or RAM forcing
pub fn handle_download_font_to_disk(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DownloadReq {
        font_id: Option<usize>,
        family: Option<String>,
        style: Option<String>,
        #[allow(dead_code)]
        is_google: Option<bool>,
    }

    let dl_dir = LibraryStorageManager::get_downloads_dir();
    let _ = fs::create_dir_all(&dl_dir);

    if let Ok(data) = serde_json::from_str::<DownloadReq>(&body) {
        let mut saved_files = Vec::new();

        // 1. If single font_id is provided
        if let Some(fid) = data.font_id {
            let st = state.read().unwrap();
            if let Some(font) = st.fonts.iter().find(|f| f.id == fid) {
                let src_path = Path::new(&font.path);
                if src_path.exists() && src_path.is_file() {
                    let fname = src_path.file_name().unwrap_or_default();
                    let dest = dl_dir.join(fname);
                    if fs::copy(src_path, &dest).is_ok() {
                        saved_files.push(dest.to_string_lossy().to_string());
                    }
                }
            }
        }

        // 2. If family name is provided
        if let Some(ref fam) = data.family {
            if saved_files.is_empty() {
                let st = state.read().unwrap();
                let matching_fonts: Vec<FontRecord> = st
                    .fonts
                    .iter()
                    .filter(|f| f.family.as_deref().unwrap_or("").eq_ignore_ascii_case(fam))
                    .cloned()
                    .collect();
                drop(st);

                if !matching_fonts.is_empty() {
                    for f in matching_fonts {
                        let src = Path::new(&f.path);
                        if src.exists() && src.is_file() {
                            let fname = src.file_name().unwrap_or_default();
                            let dest = dl_dir.join(fname);
                            if fs::copy(src, &dest).is_ok() {
                                saved_files.push(dest.to_string_lossy().to_string());
                            }
                        }
                    }
                } else {
                    // Google Fonts download directly into downloads directory
                    let style_req = data.style.as_deref().unwrap_or(fam);
                    let download_url =
                        crate::google::GoogleFontsManager::resolve_download_url_for_style(
                            fam, style_req,
                        );
                    if let Ok(record) = DownloadManager::download_and_index_google_font_style(
                        fam,
                        style_req,
                        &download_url,
                        state,
                    ) {
                        let src = Path::new(&record.path);
                        if src.exists() && src.is_file() {
                            let fname = src.file_name().unwrap_or_default();
                            let dest = dl_dir.join(fname);
                            if fs::copy(src, &dest).is_ok() {
                                saved_files.push(dest.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }

        if !saved_files.is_empty() {
            respond_json(
                req,
                200,
                serde_json::json!({
                    "success": true,
                    "downloadsDir": dl_dir.to_string_lossy().to_string(),
                    "savedFiles": saved_files,
                    "count": saved_files.len(),
                    "message": format!("Successfully saved {} font file(s) to downloads folder", saved_files.len())
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
        serde_json::json!({ "success": false, "error": "Could not locate or download font files to save" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_library_repair(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct RepairOptions {
        prune_missing: Option<bool>,
        index_orphaned: Option<bool>,
    }
    let opts = serde_json::from_str::<RepairOptions>(&body).unwrap_or_default();
    let prune_missing = opts.prune_missing.unwrap_or_else(|| {
        query_params
            .get("pruneMissing")
            .map(|v| v == "true")
            .unwrap_or(false)
    });
    let index_orphaned = opts.index_orphaned.unwrap_or_else(|| {
        query_params
            .get("indexOrphaned")
            .map(|v| v == "true")
            .unwrap_or(false)
    });

    let (checked_count, missing_ids, missing_paths, indexed_paths_set) = {
        let st = state.read().unwrap();
        let mut missing_ids = Vec::new();
        let mut missing_paths = Vec::new();
        let mut indexed_paths_set = HashSet::new();

        for font in &st.fonts {
            indexed_paths_set.insert(font.path.clone());
            if let Ok(c) = Path::new(&font.path).canonicalize() {
                indexed_paths_set.insert(c.to_string_lossy().to_string());
            }

            if !Path::new(&font.path).exists() {
                missing_ids.push(font.id);
                missing_paths.push(font.path.clone());
            }
        }

        (
            st.fonts.len(),
            missing_ids,
            missing_paths,
            indexed_paths_set,
        )
    };

    let orphaned_paths = LibraryStorageManager::scan_orphaned_font_files(&indexed_paths_set);
    let orphaned_count = orphaned_paths.len();
    let orphaned_strings: Vec<String> = orphaned_paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    let mut pruned_count = 0;
    if prune_missing && !missing_ids.is_empty() {
        let missing_set: HashSet<usize> = missing_ids.iter().cloned().collect();
        let mut st = state.write().unwrap();
        st.fonts.retain(|f| !missing_set.contains(&f.id));
        st.active_font_ids.retain(|id| !missing_set.contains(id));
        st.favorite_font_ids.retain(|id| !missing_set.contains(id));
        pruned_count = missing_ids.len();
    }

    let mut restored_count = 0;
    if index_orphaned && !orphaned_paths.is_empty() {
        let mut new_records = Vec::new();
        {
            let st = state.read().unwrap();
            let current_max_id = st.fonts.iter().map(|f| f.id).max().unwrap_or(0);
            let mut next_id = current_max_id + 1;

            for path in &orphaned_paths {
                if let Ok(meta) = FontParser::parse_file(path) {
                    let fname = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("font")
                        .to_string();
                    let size = fs::metadata(path).map(|m| m.len() as usize).unwrap_or(0);
                    let is_arabic = meta.coverage.supports_arabic
                        || meta.family.to_lowercase().contains("arabic");
                    let is_latin = meta.coverage.supports_latin;
                    let is_bilingual = is_arabic && is_latin;
                    let weight = if meta.weight_class > 0 {
                        meta.weight_class
                    } else {
                        crate::server::state::style_to_weight(Some(&meta.subfamily))
                    };
                    let path_str = path.to_string_lossy().to_string();
                    let source = crate::server::state::classify_font_source(
                        &path_str,
                        Some("Recovered Orphaned Library"),
                    );

                    new_records.push(FontRecord {
                        id: next_id,
                        name: fname,
                        path: path_str,
                        category: if is_arabic {
                            "01 - Arabic Fonts".into()
                        } else {
                            "02 - English Fonts".into()
                        },
                        sub_category: Some("Recovered Orphaned Library".to_string()),
                        family: Some(meta.family),
                        format: meta.format,
                        size,
                        is_arabic,
                        is_latin,
                        is_bilingual,
                        is_variable: meta.is_variable,
                        weight,
                        source,
                        is_active: false,
                        is_favorite: false,
                        display_name: Some(meta.full_name),
                        style: Some(meta.subfamily),
                        post_script_name: Some(meta.postscript_name),
                        glyph_count: Some(meta.glyph_count as usize),
                        has_tashkeel: meta.coverage.has_tashkeel,
                        has_extended_arabic: meta.coverage.has_extended_arabic,
                        has_arabic_numerals: meta.coverage.has_arabic_numerals,
                        has_western_numerals: meta.coverage.has_western_numerals,
                        is_local: true,
                    });
                    next_id += 1;
                }
            }
        }

        if !new_records.is_empty() {
            restored_count = new_records.len();
            let mut st = state.write().unwrap();
            st.fonts.extend(new_records);
        }
    }

    if pruned_count > 0 || restored_count > 0 {
        let st = state.read().unwrap();
        st.save_user_library_index();
        if pruned_count > 0 {
            st.save_active_fonts();
            st.save_favorites();
        }
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct RepairReport {
        success: bool,
        checked_count: usize,
        valid_count: usize,
        missing_count: usize,
        missing_font_paths: Vec<String>,
        orphaned_count: usize,
        orphaned_font_paths: Vec<String>,
        pruned_missing_count: usize,
        restored_orphaned_count: usize,
    }

    let report = RepairReport {
        success: true,
        checked_count,
        valid_count: checked_count.saturating_sub(missing_paths.len()),
        missing_count: missing_paths.len(),
        missing_font_paths: missing_paths,
        orphaned_count,
        orphaned_font_paths: orphaned_strings,
        pruned_missing_count: pruned_count,
        restored_orphaned_count: restored_count,
    };

    respond_json_str(
        req,
        200,
        serde_json::to_string(&report).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_open_folder(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct OpenReq {
        id: usize,
    }
    if let Ok(data) = serde_json::from_str::<OpenReq>(&body) {
        let st = state.read().unwrap();
        if let Some(font) = st.fonts.iter().find(|f| f.id == data.id) {
            let p = Path::new(&font.path);
            if p.is_file() {
                if let Ok(canonical_path) = p.canonicalize() {
                    #[allow(unused_variables)]
                    let path_str = canonical_path.to_string_lossy();
                    #[cfg(windows)]
                    {
                        let _ = Command::new("explorer.exe")
                            .arg(format!("/select,{}", path_str))
                            .spawn();
                    }
                    #[cfg(target_os = "macos")]
                    {
                        let _ = Command::new("open").args(&["-R", &path_str]).spawn();
                    }
                    #[cfg(target_os = "linux")]
                    {
                        if let Some(parent) = canonical_path.parent() {
                            let _ = Command::new("xdg-open").arg(parent).spawn();
                        }
                    }
                    respond_json(
                        req,
                        200,
                        serde_json::json!({ "success": true }),
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
        404,
        serde_json::json!({ "success": false }),
        cors_origin,
        json_header,
    );
}

pub fn handle_delete_font(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DeleteFontReq {
        id: Option<usize>,
        path: Option<String>,
    }

    if let Ok(data) = serde_json::from_str::<DeleteFontReq>(&body) {
        if data.id.is_none() && data.path.as_deref().unwrap_or("").trim().is_empty() {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Either 'id' or 'path' must be provided" }),
                cors_origin,
                json_header,
            );
            return;
        }

        let mut st = state.write().unwrap();
        match st.delete_library_font(data.id, data.path.as_deref()) {
            Ok(removed) => {
                respond_json(
                    req,
                    200,
                    serde_json::json!({
                        "success": true,
                        "id": removed.id,
                        "name": removed.name,
                        "path": removed.path,
                        "message": format!("Removed font '{}' from library", removed.name)
                    }),
                    cors_origin,
                    json_header,
                );
                return;
            }
            Err(err) => {
                respond_json(
                    req,
                    404,
                    serde_json::json!({ "success": false, "error": err }),
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
        serde_json::json!({ "success": false, "error": "Invalid delete font payload" }),
        cors_origin,
        json_header,
    );
}

pub fn handle_refresh_manifest(req: Request, cors_origin: Header, json_header: Header) {
    let (manifest, is_remote, source) = FontPackManifest::fetch_remote_or_default();
    let packages: Vec<CatalogPackageItem> = manifest
        .packs
        .iter()
        .map(|p| {
            let downloaded = is_pack_downloaded(p);
            CatalogPackageItem {
                id: p.id.clone(),
                name: p.name.clone(),
                category: p.category.clone().unwrap_or_else(|| "General".to_string()),
                font_count: p.font_count,
                compressed_size: p.compressed_size,
                uncompressed_size: p.uncompressed_size,
                download_url: p.download_url.clone(),
                file_name: p.file_name.clone(),
                is_downloaded: downloaded,
                sha256: p.sha256.clone(),
                description: p.description.clone(),
            }
        })
        .collect();

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "isRemote": is_remote,
            "source": source,
            "schemaVersion": manifest.schema_version,
            "libraryVersion": manifest.library_version,
            "packCount": manifest.packs.len(),
            "manifest": manifest,
            "packages": packages
        }),
        cors_origin,
        json_header,
    );
}
