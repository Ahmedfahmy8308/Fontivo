use serde::Serialize;
use std::fs;
use std::sync::{Arc, RwLock};
use tiny_http::{Header, Request};

use super::adobe::inspect_design_helper;
use super::common::{respond_json, respond_json_str, walk_fonts_in_dir};
use crate::server::state::{AppState, FontRecord};

pub fn handle_pick_folder(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let folder_opt = rfd::FileDialog::new()
        .set_title("Select Font Folder to Import")
        .pick_folder();

    if let Some(folder_path) = folder_opt {
        let path_str = folder_path.to_string_lossy().to_string();
        let folder_name = folder_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Imported Folder")
            .to_string();

        let mut imported_count = 0;
        let mut duplicates: Vec<crate::server::state::DuplicateFontMatch> = Vec::new();
        let mut batch_hashes: std::collections::HashSet<String> = std::collections::HashSet::new();

        if let Ok(entries) = walk_fonts_in_dir(&folder_path) {
            let mut st = state.write().unwrap();
            let current_max_id = st.fonts.iter().map(|f| f.id).max().unwrap_or(0);
            let mut next_id = current_max_id + 1;
            let mut new_ids = Vec::new();

            for p in entries {
                if let Ok(meta) = crate::parser::FontParser::parse_file(&p) {
                    let fname = p
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("font")
                        .to_string();
                    let size = fs::metadata(&p).map(|m| m.len() as usize).unwrap_or(0);

                    if let Some(dup) = st.find_duplicate_font(
                        Some(&p),
                        None,
                        &fname,
                        Some(&meta.family),
                        Some(&meta.subfamily),
                        Some(&meta.postscript_name),
                        size,
                    ) {
                        duplicates.push(dup);
                        continue;
                    }

                    if let Some(h) = crate::server::state::compute_file_sha256(&p) {
                        if !batch_hashes.insert(h) {
                            duplicates.push(crate::server::state::DuplicateFontMatch {
                                file_name: fname,
                                family: meta.family,
                                style: meta.subfamily,
                                existing_id: 0,
                                existing_path: path_str.clone(),
                                existing_source: "batch".to_string(),
                                match_reason: "sha256".to_string(),
                            });
                            continue;
                        }
                    }

                    let is_arabic = meta.coverage.supports_arabic
                        || meta.family.to_lowercase().contains("arabic");
                    let is_latin = meta.coverage.supports_latin;
                    let is_bilingual = is_arabic && is_latin;
                    let weight = if meta.weight_class > 0 {
                        meta.weight_class
                    } else {
                        crate::server::state::style_to_weight(Some(&meta.subfamily))
                    };

                    let record = FontRecord {
                        id: next_id,
                        name: fname,
                        path: p.to_string_lossy().to_string(),
                        category: if is_arabic {
                            "01 - Arabic Fonts".into()
                        } else {
                            "02 - English Fonts".into()
                        },
                        sub_category: Some(folder_name.clone()),
                        family: Some(meta.family),
                        format: meta.format,
                        size,
                        is_arabic,
                        is_latin,
                        is_bilingual,
                        is_variable: meta.is_variable,
                        weight,
                        source: "local".to_string(),
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
                    };

                    new_ids.push(next_id);
                    next_id += 1;
                    st.fonts.push(record);
                    imported_count += 1;
                }
            }

            if !new_ids.is_empty() {
                st.collections
                    .entry(folder_name.clone())
                    .or_default()
                    .extend(new_ids);
                st.save_collections();
                st.save_user_library_index();
            }
        }

        let skipped_duplicates_count = duplicates.len();

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct PickRes {
            success: bool,
            path: String,
            folder_name: String,
            imported_count: usize,
            skipped_duplicates_count: usize,
            duplicates: Vec<crate::server::state::DuplicateFontMatch>,
        }

        let res_obj = PickRes {
            success: true,
            path: path_str,
            folder_name,
            imported_count,
            skipped_duplicates_count,
            duplicates,
        };

        respond_json_str(
            req,
            200,
            serde_json::to_string(&res_obj).unwrap_or_default(),
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
