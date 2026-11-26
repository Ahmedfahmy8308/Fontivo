use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Request};

use super::common::{decode_base64_bytes, read_body, respond_json, respond_json_str};
use crate::google::GoogleFontsManager;
use crate::scanner::adobe_scanner::{AdobeScanner, DesignFontItem, DesignInspectionResult};
use crate::server::security::{
    validate_design_bytes, validate_design_file, MAX_DESIGN_FILE_SIZE_BYTES,
};
use crate::server::state::{AppState, PendingAdobeDocument};

/// Per-document cache of raw extracted font names (keyed by `doc_id`) so live 4-tier
/// resolution always evaluates every detected font against the latest library + Google catalog.
static DOC_EXTRACTED_FONTS: OnceLock<RwLock<HashMap<String, Vec<String>>>> = OnceLock::new();

pub fn register_document_extracted_fonts(doc_id: &str, font_names: Vec<String>) {
    let map = DOC_EXTRACTED_FONTS.get_or_init(|| RwLock::new(HashMap::new()));
    if let Ok(mut guard) = map.write() {
        guard.insert(doc_id.to_string(), font_names);
    }
}

fn get_document_extracted_fonts(doc: &PendingAdobeDocument) -> Vec<String> {
    let map = DOC_EXTRACTED_FONTS.get_or_init(|| RwLock::new(HashMap::new()));
    if let Ok(guard) = map.read() {
        if let Some(names) = guard.get(&doc.id) {
            if !names.is_empty() {
                return names.clone();
            }
        }
    }
    // Fallback: reconstruct from file_path or PendingAdobeDocument matched + missing lists
    if let Some(ref fp) = doc.file_path {
        let p = Path::new(fp);
        if p.exists() {
            if let Ok(names) = AdobeScanner::extract_font_names(p) {
                if !names.is_empty() {
                    register_document_extracted_fonts(&doc.id, names.clone());
                    return names;
                }
            }
        }
    }
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for item in doc.matched_fonts.iter().chain(doc.missing_fonts.iter()) {
        if AdobeScanner::is_internal_adobe_non_font(&item.name) {
            continue;
        }
        if seen.insert(item.name.to_ascii_lowercase()) {
            out.push(item.name.clone());
        }
    }
    out
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAdobeFont {
    pub name: String,
    pub status: String, // "system" | "local" | "google" | "missing"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_id: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_family: Option<String>,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdobeFontCounts {
    pub total: usize,
    pub system: usize,
    pub local: usize,
    pub google: usize,
    pub missing: usize,
    pub active: usize,
}

/// Normalizes a font or family name into an alphanumeric lowercase comparison key.
pub fn normalize_font_key(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}

/// Strips common PostScript / Adobe weight & style suffixes (e.g. `-Bold`, `-SemiBoldItalic`, `MT`, `PS`)
/// and returns a normalized family comparison key.
pub fn normalize_family_key(raw: &str) -> String {
    let trimmed = raw.trim();
    // Strip PostScript subset prefix if any remained (e.g. ABCDEF+Cairo-Bold)
    let without_subset = if let Some(idx) = trimmed.find('+') {
        if idx == 6 {
            &trimmed[7..]
        } else {
            trimmed
        }
    } else {
        trimmed
    };

    // Split on '-' or '_' first if the right-hand side looks like a style token
    let base = if let Some((left, _right)) = without_subset.split_once('-') {
        left
    } else if let Some((left, _right)) = without_subset.split_once('_') {
        left
    } else {
        without_subset
    };

    let mut key = normalize_font_key(base);

    // Iteratively strip trailing style/foundry suffixes
    const SUFFIXES: &[&str] = &[
        "extrabolditalic",
        "extralightitalic",
        "semibolditalic",
        "demibolditalic",
        "ultrabolditalic",
        "ultralightitalic",
        "bolditalic",
        "boldoblique",
        "mediumitalic",
        "lightitalic",
        "thinitalic",
        "blackitalic",
        "heavyitalic",
        "extrabold",
        "extralight",
        "ultrabold",
        "ultralight",
        "semibold",
        "demibold",
        "regular",
        "normal",
        "medium",
        "italic",
        "oblique",
        "condensed",
        "expanded",
        "narrow",
        "bold",
        "light",
        "thin",
        "black",
        "heavy",
        "roman",
        "book",
        "variable",
        "psmt",
        "mt",
        "ps",
    ];

    loop {
        let mut stripped = false;
        for suf in SUFFIXES {
            if key.len() > suf.len() + 2 && key.ends_with(suf) {
                key.truncate(key.len() - suf.len());
                stripped = true;
                break;
            }
        }
        if !stripped {
            break;
        }
    }

    key
}

/// Evaluates whether a font record satisfies an extracted Adobe document font request.
/// Checks exact PostScript name, exact display name, or exact family + weight + italic.
/// Strictly enforces weight and italic parity so a `Raleway-Thin` or `Poppins-Regular`
/// can NEVER falsely satisfy a `Raleway-ExtraBold` or `Poppins-BlackItalic` request.
pub fn matches_design_font(raw_name: &str, f: &crate::server::state::FontRecord) -> bool {
    let exact_key = normalize_font_key(raw_name);
    let fam_key = normalize_family_key(raw_name);
    let (req_weight, req_italic) = GoogleFontsManager::parse_style_weight_italic(raw_name);

    let file_stem = f
        .name
        .trim_end_matches(".ttf")
        .trim_end_matches(".otf")
        .trim_end_matches(".TTF")
        .trim_end_matches(".OTF");

    // 1. Exact PostScript / Display match (always wins)
    if let Some(ref ps) = f.post_script_name {
        let k = normalize_font_key(ps);
        if !k.is_empty() && k == exact_key {
            return true;
        }
    }
    if let Some(ref disp) = f.display_name {
        let k = normalize_font_key(disp);
        if !k.is_empty() && k == exact_key {
            return true;
        }
    }
    // Only fall back to filename exact match when internal PostScript metadata is absent,
    // so a misnamed Regular file (e.g. Poppins-BlackItalic.ttf containing Poppins-Regular)
    // can never falsely satisfy an exact weight/italic request.
    if f.post_script_name
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
    {
        let stem_exact = normalize_font_key(file_stem);
        if !stem_exact.is_empty() && stem_exact == exact_key {
            return true;
        }
    }

    // 2. Family match — MUST ALSO match exact weight & italic (unless variable font on matching italic axis)
    let family_matches = f
        .family
        .as_deref()
        .map(|fam| normalize_font_key(fam) == fam_key || normalize_family_key(fam) == fam_key)
        .unwrap_or(false)
        || f.post_script_name
            .as_deref()
            .map(|ps| normalize_family_key(ps) == fam_key)
            .unwrap_or(false)
        || f.display_name
            .as_deref()
            .map(|disp| normalize_family_key(disp) == fam_key)
            .unwrap_or(false)
        || normalize_family_key(file_stem) == fam_key;

    if !family_matches {
        return false;
    }

    let style_hint = f
        .style
        .as_deref()
        .or(f.post_script_name.as_deref())
        .or(f.display_name.as_deref())
        .unwrap_or(file_stem);
    let (parsed_w, style_italic) = GoogleFontsManager::parse_style_weight_italic(style_hint);
    let ps_italic = f
        .post_script_name
        .as_deref()
        .map(|ps| GoogleFontsManager::parse_style_weight_italic(ps).1)
        .unwrap_or(false);
    let cand_italic = style_italic || ps_italic;
    let cand_weight = if f.weight > 0 { f.weight } else { parsed_w };

    if cand_italic != req_italic {
        return false;
    }
    if f.is_variable {
        return true;
    }
    cand_weight == req_weight
}

/// Resolves a list of detected Adobe font names across 4 tiers:
/// 1. `"system"`  — already installed in Windows (`source == "system"`)
/// 2. `"local"`   — available on disk in Fontivo local/cloud/downloaded library (`fontId` included)
/// 3. `"google"`  — matched by normalized family name against the full 1,961+ Google Fonts catalog (`googleFamily` included)
/// 4. `"missing"` — not found locally or on Google Fonts
pub fn resolve_fonts_four_tier(
    names: &[String],
    st: &AppState,
    google_catalog_map: &HashMap<String, String>,
) -> (Vec<ResolvedAdobeFont>, AdobeFontCounts) {
    let mut resolved = Vec::with_capacity(names.len());
    let mut counts = AdobeFontCounts::default();

    for raw_name in names {
        if AdobeScanner::is_internal_adobe_non_font(raw_name) {
            continue;
        }

        let exact_key = normalize_font_key(raw_name);
        let fam_key = normalize_family_key(raw_name);

        // Tier 1: System font already installed in Windows
        if let Some(sys_font) = st
            .fonts
            .iter()
            .filter(|f| f.source == "system")
            .find(|f| matches_design_font(raw_name, f))
        {
            counts.system += 1;
            counts.active += 1;
            resolved.push(ResolvedAdobeFont {
                name: raw_name.clone(),
                status: "system".to_string(),
                font_id: Some(sys_font.id),
                google_family: None,
                active: true,
            });
            continue;
        }

        // Tier 2: Local / Cloud / Already-downloaded Google Font on disk in Fontivo library
        if let Some(local_font) = st
            .fonts
            .iter()
            .filter(|f| f.source != "system" && (f.is_local || Path::new(&f.path).exists()))
            .find(|f| matches_design_font(raw_name, f))
        {
            let is_active = local_font.is_active || st.active_font_ids.contains(&local_font.id);
            counts.local += 1;
            if is_active {
                counts.active += 1;
            }
            resolved.push(ResolvedAdobeFont {
                name: raw_name.clone(),
                status: "local".to_string(),
                font_id: Some(local_font.id),
                google_family: if local_font.source == "google" {
                    local_font.family.clone()
                } else {
                    None
                },
                active: is_active,
            });
            continue;
        }

        // Tier 3: Match against full live 1,961+ Google Fonts catalog
        if let Some(gf_family) = google_catalog_map
            .get(&exact_key)
            .or_else(|| google_catalog_map.get(&fam_key))
        {
            counts.google += 1;
            resolved.push(ResolvedAdobeFont {
                name: raw_name.clone(),
                status: "google".to_string(),
                font_id: None,
                google_family: Some(gf_family.clone()),
                active: false,
            });
            continue;
        }

        // Tier 4: Missing
        counts.missing += 1;
        resolved.push(ResolvedAdobeFont {
            name: raw_name.clone(),
            status: "missing".to_string(),
            font_id: None,
            google_family: None,
            active: false,
        });
    }

    counts.total = resolved.len();
    (resolved, counts)
}

/// Builds a normalized lookup map `{ normalized_family_key -> canonical Google Family Name }`
/// from the full live Google Fonts catalog (1,961+ families).
pub fn build_google_catalog_lookup() -> HashMap<String, String> {
    let (catalog, _src) = GoogleFontsManager::get_full_catalog(false);
    let mut map = HashMap::with_capacity(catalog.len());
    for entry in catalog {
        let key = normalize_font_key(&entry.family);
        if !key.is_empty() {
            map.entry(key).or_insert(entry.family);
        }
    }
    map
}

fn build_design_inspection_result(
    names: Vec<String>,
    file_path: String,
    file_name: String,
    st: &AppState,
) -> DesignInspectionResult {
    let mut items = Vec::new();
    let mut available_ids = Vec::new();
    let mut available_fonts = Vec::new();
    let mut missing_fonts = Vec::new();
    let mut already_active = 0;

    for name in names {
        if AdobeScanner::is_internal_adobe_non_font(&name) {
            continue;
        }
        let match_font = st.fonts.iter().find(|f| {
            if !f.is_local && f.source != "system" && !Path::new(&f.path).exists() {
                return false;
            }
            matches_design_font(&name, f)
        });

        if let Some(f) = match_font {
            if f.is_active || f.source == "system" {
                already_active += 1;
                items.push(DesignFontItem {
                    name: name.clone(),
                    status: if f.source == "system" {
                        "system".to_string()
                    } else {
                        "active".to_string()
                    },
                    font_id: Some(f.id),
                    id: Some(f.id),
                    matched_id: Some(f.id),
                    available: true,
                    is_matched: true,
                    is_active: true,
                    family: f.family.clone(),
                    path: Some(f.path.clone()),
                    post_script_name: f.post_script_name.clone(),
                    style: f.style.clone(),
                });
            } else {
                let item = DesignFontItem {
                    name: name.clone(),
                    status: "available".to_string(),
                    font_id: Some(f.id),
                    id: Some(f.id),
                    matched_id: Some(f.id),
                    available: true,
                    is_matched: true,
                    is_active: false,
                    family: f.family.clone(),
                    path: Some(f.path.clone()),
                    post_script_name: f.post_script_name.clone(),
                    style: f.style.clone(),
                };
                if !available_ids.contains(&f.id) {
                    available_ids.push(f.id);
                }
                available_fonts.push(item.clone());
                items.push(item);
            }
        } else {
            let item = DesignFontItem {
                name: name.clone(),
                status: "missing".to_string(),
                font_id: None,
                id: None,
                matched_id: None,
                available: false,
                is_matched: false,
                is_active: false,
                family: None,
                path: None,
                post_script_name: None,
                style: None,
            };
            missing_fonts.push(item.clone());
            items.push(item);
        }
    }

    let matched_count = items.iter().filter(|i| i.is_matched).count();

    DesignInspectionResult {
        success: true,
        file_path,
        file_name,
        total_fonts: items.len(),
        total_detected: items.len(),
        matched_count,
        already_active_count: already_active,
        available_ids,
        available_fonts,
        missing_fonts,
        fonts: items,
    }
}

pub fn inspect_design_helper(path: &Path, st: &AppState) -> Result<DesignInspectionResult, String> {
    let names = AdobeScanner::extract_font_names(path)?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    Ok(build_design_inspection_result(
        names,
        path.to_string_lossy().to_string(),
        file_name,
        st,
    ))
}

pub fn inspect_design_bytes_helper(
    file_name: &str,
    bytes: &[u8],
    st: &AppState,
) -> Result<DesignInspectionResult, String> {
    validate_design_bytes(file_name, bytes).map_err(|e| e.to_string())?;
    let names = AdobeScanner::extract_font_names_from_bytes(bytes);
    Ok(build_design_inspection_result(
        names,
        file_name.to_string(),
        file_name.to_string(),
        st,
    ))
}

fn infer_adobe_app_from_filename(file_name: &str) -> &'static str {
    let low = file_name.to_ascii_lowercase();
    if low.ends_with(".ai") || low.ends_with(".eps") {
        "Illustrator"
    } else if low.ends_with(".indd") {
        "InDesign"
    } else {
        "Photoshop"
    }
}

pub fn handle_inspect_design(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    struct InspectReq {
        #[serde(rename = "filePath")]
        file_path: String,
    }

    if let Ok(data) = serde_json::from_str::<InspectReq>(&body) {
        let path = Path::new(&data.file_path);

        // Security check: validate size limit and authentic file magic signatures
        if let Err(sec_err) = validate_design_file(path) {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": sec_err.to_string() }),
                cors_origin,
                json_header,
            );
            return;
        }

        let google_map = build_google_catalog_lookup();
        let res = {
            let st = state.read().unwrap();
            inspect_design_helper(path, &st).map(|inspection| {
                let raw_names: Vec<String> =
                    inspection.fonts.iter().map(|f| f.name.clone()).collect();
                let (resolved_fonts, counts) =
                    resolve_fonts_four_tier(&raw_names, &st, &google_map);
                (inspection, raw_names, resolved_fonts, counts)
            })
        };

        match res {
            Ok((inspection, raw_names, resolved_fonts, counts)) => {
                // Register manually scanned file so 1-click activation works seamlessly
                let doc_id = format!("manual::{}", inspection.file_name.to_ascii_lowercase());
                register_document_extracted_fonts(&doc_id, raw_names);

                if let Ok(mut st) = state.write() {
                    let now_sec = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let app_name = infer_adobe_app_from_filename(&inspection.file_name).to_string();
                    let pending = PendingAdobeDocument {
                        id: doc_id.clone(),
                        app_name,
                        window_title: inspection.file_name.clone(),
                        document_name: inspection.file_name.clone(),
                        file_path: Some(inspection.file_path.clone()),
                        detected_at: now_sec,
                        matched_fonts: inspection.available_fonts.clone(),
                        missing_fonts: inspection.missing_fonts.clone(),
                        matched_font_ids: inspection.available_ids.clone(),
                        already_active_count: inspection.already_active_count,
                        total_fonts: inspection.total_fonts,
                        dismissed: false,
                        activated: false,
                    };
                    st.dismissed_adobe_doc_ids.remove(&doc_id);
                    if let Some(existing) =
                        st.pending_adobe_docs.iter_mut().find(|d| d.id == doc_id)
                    {
                        *existing = pending;
                    } else {
                        st.pending_adobe_docs.push(pending);
                    }
                }

                let mut val = serde_json::to_value(&inspection).unwrap_or_default();
                if let Some(obj) = val.as_object_mut() {
                    obj.insert("documentId".to_string(), serde_json::json!(doc_id));
                    obj.insert(
                        "resolvedFonts".to_string(),
                        serde_json::json!(resolved_fonts),
                    );
                    obj.insert("counts".to_string(), serde_json::json!(counts));
                }
                respond_json(req, 200, val, cors_origin, json_header);
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
        return;
    }

    respond_json(
        req,
        400,
        serde_json::json!({ "success": false, "error": "Malformed JSON request" }),
        cors_origin,
        json_header,
    );
}

/// POST /api/inspect-design-upload: inspects dropped/uploaded design file bytes natively from WebView2.
/// Supports raw binary body (`?fileName=foo.psd&autoActivate=true` or `X-File-Name` header)
/// AND JSON (`{ "fileName": "foo.psd", "data": "<base64>", "autoActivate": true }`).
pub fn handle_inspect_design_upload(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let is_json = req
        .headers()
        .iter()
        .find(|h| {
            h.field
                .as_str()
                .as_str()
                .eq_ignore_ascii_case("Content-Type")
        })
        .map(|h| {
            h.value
                .as_str()
                .to_ascii_lowercase()
                .contains("application/json")
        })
        .unwrap_or(false);

    let header_file_name = req
        .headers()
        .iter()
        .find(|h| {
            h.field
                .as_str()
                .as_str()
                .eq_ignore_ascii_case("X-File-Name")
        })
        .map(|h| super::common::urlencoding_decode(h.value.as_str()));

    let mut raw_body = Vec::new();
    let max_read = MAX_DESIGN_FILE_SIZE_BYTES + 1;
    let _ = req.as_reader().take(max_read).read_to_end(&mut raw_body);

    if raw_body.len() as u64 > MAX_DESIGN_FILE_SIZE_BYTES {
        respond_json(
            req,
            413,
            serde_json::json!({ "success": false, "error": "Uploaded design file exceeds 100 MB limit" }),
            cors_origin,
            json_header,
        );
        return;
    }

    let query_auto_activate = query_params
        .get("autoActivate")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    let (file_name, file_bytes, auto_activate) = if is_json {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct UploadJsonReq {
            #[serde(alias = "file_name", alias = "name")]
            file_name: String,
            #[serde(alias = "base64", alias = "content")]
            data: String,
            #[serde(default)]
            auto_activate: Option<bool>,
        }

        match serde_json::from_slice::<UploadJsonReq>(&raw_body) {
            Ok(payload) => match decode_base64_bytes(&payload.data) {
                Some(bytes) => (
                    payload.file_name,
                    bytes,
                    payload.auto_activate.unwrap_or(query_auto_activate),
                ),
                None => {
                    respond_json(
                        req,
                        400,
                        serde_json::json!({ "success": false, "error": "Invalid base64 encoding in design file upload" }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
            },
            Err(_) => {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": "Invalid JSON design upload payload" }),
                    cors_origin,
                    json_header,
                );
                return;
            }
        }
    } else {
        let fname = query_params
            .get("fileName")
            .cloned()
            .or(header_file_name)
            .unwrap_or_default();
        if fname.trim().is_empty() {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Missing fileName query parameter or X-File-Name header" }),
                cors_origin,
                json_header,
            );
            return;
        }
        (fname, raw_body, query_auto_activate)
    };

    // Keep only the basename (strip any client-supplied path segments)
    let clean_file_name = Path::new(&file_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&file_name)
        .to_string();

    if let Err(sec_err) = validate_design_bytes(&clean_file_name, &file_bytes) {
        respond_json(
            req,
            400,
            serde_json::json!({ "success": false, "error": sec_err.to_string() }),
            cors_origin,
            json_header,
        );
        return;
    }

    let mut result = {
        let st = state.read().unwrap();
        match inspect_design_bytes_helper(&clean_file_name, &file_bytes, &st) {
            Ok(r) => r,
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
    };

    if auto_activate && !result.available_fonts.is_empty() {
        let mut st = state.write().unwrap();
        let mut newly_activated_ids = Vec::new();
        for item in &result.available_fonts {
            if let (Some(fid), Some(ref p)) = (item.font_id, &item.path) {
                if Path::new(p).exists() && st.activator.activate_ram(p).is_ok() {
                    st.active_font_ids.insert(fid);
                    newly_activated_ids.push(fid);
                }
            }
        }
        if !newly_activated_ids.is_empty() {
            for f in &mut st.fonts {
                if newly_activated_ids.contains(&f.id) {
                    f.is_active = true;
                }
            }
            st.save_active_fonts();
            for item in &mut result.fonts {
                if let Some(fid) = item.font_id {
                    if newly_activated_ids.contains(&fid) {
                        item.is_active = true;
                        item.status = "active".to_string();
                    }
                }
            }
            result.already_active_count += newly_activated_ids.len();
            result
                .available_ids
                .retain(|id| !newly_activated_ids.contains(id));
            result.available_fonts.retain(|item| {
                !item
                    .font_id
                    .map(|id| newly_activated_ids.contains(&id))
                    .unwrap_or(false)
            });
        }
    }

    let google_map = build_google_catalog_lookup();
    let raw_names: Vec<String> = result.fonts.iter().map(|f| f.name.clone()).collect();
    let (resolved_fonts, counts) = {
        let st = state.read().unwrap();
        resolve_fonts_four_tier(&raw_names, &st, &google_map)
    };

    let doc_id = format!("manual::{}", clean_file_name.to_ascii_lowercase());
    register_document_extracted_fonts(&doc_id, raw_names);

    let mut val = serde_json::to_value(&result).unwrap_or_default();
    if let Some(obj) = val.as_object_mut() {
        obj.insert("documentId".to_string(), serde_json::json!(doc_id));
        obj.insert(
            "resolvedFonts".to_string(),
            serde_json::json!(resolved_fonts),
        );
        obj.insert("counts".to_string(), serde_json::json!(counts));
    }

    respond_json_str(
        req,
        200,
        serde_json::to_string(&val).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

/// GET /api/adobe/pending-activations
/// Returns ALL detected open Adobe design documents (Photoshop/Illustrator/InDesign)
/// plus manually scanned documents, with full 4-tier per-font resolution
/// (`system` | `local` | `google` | `missing`) and summary counts.
pub fn handle_pending_activations(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let include_dismissed = query_params
        .get("includeDismissed")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    let google_map = build_google_catalog_lookup();

    let (running_apps, enriched_docs, total_pending_fonts) = {
        let st = state.read().unwrap();
        let filtered_docs: Vec<PendingAdobeDocument> = st
            .pending_adobe_docs
            .iter()
            .filter(|d| include_dismissed || !d.dismissed)
            .cloned()
            .collect();

        let mut total_pending = 0usize;
        let mut docs_out = Vec::with_capacity(filtered_docs.len());

        for doc in filtered_docs {
            let raw_names = get_document_extracted_fonts(&doc);
            let (resolved_fonts, counts) = resolve_fonts_four_tier(&raw_names, &st, &google_map);

            let actionable_local_ids: Vec<usize> = resolved_fonts
                .iter()
                .filter(|f| f.status == "local" && !f.active)
                .filter_map(|f| f.font_id)
                .collect();
            let actionable_google_count = resolved_fonts
                .iter()
                .filter(|f| f.status == "google")
                .count();

            let pending_for_doc = actionable_local_ids.len() + actionable_google_count;
            if !doc.activated {
                total_pending += pending_for_doc;
            }

            docs_out.push(serde_json::json!({
                "id": doc.id,
                "app": doc.app_name,
                "appName": doc.app_name,
                "windowTitle": doc.window_title,
                "documentName": doc.document_name,
                "filePath": doc.file_path,
                "detectedAt": doc.detected_at,
                "dismissed": doc.dismissed,
                "activated": doc.activated || (counts.total > 0 && pending_for_doc == 0),
                "fonts": resolved_fonts,
                "counts": counts,
                "totalFonts": counts.total,
                "alreadyActiveCount": counts.active,
                "matchedFontIds": actionable_local_ids,
                "matchedFonts": doc.matched_fonts,
                "missingFonts": doc.missing_fonts
            }));
        }

        (st.running_adobe_apps.clone(), docs_out, total_pending)
    };

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "runningApps": running_apps,
            "documents": enriched_docs,
            "totalPendingFonts": total_pending_fonts
        }),
        cors_origin,
        json_header,
    );
}

/// POST /api/adobe/activate-document
/// 1-click activates all `"local"` fonts in RAM AND automatically downloads + activates all
/// `"google"` matched fonts from Google Fonts into RAM.
/// Also supports activating a single font from a document via `{ documentId, fontName }`,
/// or dismissing a document banner when `dismissOnly: true`.
pub fn handle_activate_document(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct ActivateDocReq {
        #[serde(alias = "id")]
        document_id: Option<String>,
        file_path: Option<String>,
        font_name: Option<String>,
        #[serde(default)]
        dismiss_only: bool,
        #[serde(default)]
        dismiss: bool,
    }

    let payload = serde_json::from_str::<ActivateDocReq>(&body).unwrap_or_default();
    let dismiss_only = payload.dismiss_only || payload.dismiss;
    let target_single_font = payload
        .font_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    // Handle dismiss-only immediately
    if dismiss_only {
        let mut st = state.write().unwrap();
        let doc_idx = st.pending_adobe_docs.iter().position(|d| {
            if let Some(ref target_id) = payload.document_id {
                if d.id == *target_id {
                    return true;
                }
            }
            if let Some(ref target_path) = payload.file_path {
                if d.file_path
                    .as_deref()
                    .map(|p| p.eq_ignore_ascii_case(target_path))
                    .unwrap_or(false)
                {
                    return true;
                }
            }
            payload.document_id.is_none() && payload.file_path.is_none() && !d.dismissed
        });

        if let Some(idx) = doc_idx {
            let doc_id = st.pending_adobe_docs[idx].id.clone();
            st.pending_adobe_docs[idx].dismissed = true;
            st.dismissed_adobe_doc_ids.insert(doc_id.clone());
            respond_json(
                req,
                200,
                serde_json::json!({
                    "success": true,
                    "dismissed": true,
                    "documentId": doc_id,
                    "activatedCount": 0,
                    "activatedIds": []
                }),
                cors_origin,
                json_header,
            );
            return;
        }
        respond_json(
            req,
            404,
            serde_json::json!({ "success": false, "error": "Pending Adobe document not found" }),
            cors_origin,
            json_header,
        );
        return;
    }

    let google_map = build_google_catalog_lookup();

    type AdobeResolvedPlan = (String, Vec<usize>, Vec<(String, String)>);
    // Step 1: Resolve target document and collect local font IDs + exact (raw_name, google_family) pairs to activate
    let resolved_plan: Option<AdobeResolvedPlan> = {
        let st = state.read().unwrap();
        let found_doc = st.pending_adobe_docs.iter().find(|d| {
            if let Some(ref target_id) = payload.document_id {
                if d.id == *target_id {
                    return true;
                }
            }
            if let Some(ref target_path) = payload.file_path {
                if d.file_path
                    .as_deref()
                    .map(|p| p.eq_ignore_ascii_case(target_path))
                    .unwrap_or(false)
                {
                    return true;
                }
            }
            payload.document_id.is_none() && payload.file_path.is_none() && !d.dismissed
        });

        if let Some(doc) = found_doc {
            let raw_names = get_document_extracted_fonts(doc);
            let (resolved_fonts, _) = resolve_fonts_four_tier(&raw_names, &st, &google_map);
            let mut local_ids = Vec::new();
            let mut google_requests: Vec<(String, String)> = Vec::new();

            for rf in resolved_fonts {
                if let Some(ref single) = target_single_font {
                    let matches_single = rf.name.eq_ignore_ascii_case(single)
                        || rf
                            .google_family
                            .as_deref()
                            .map(|g| g.eq_ignore_ascii_case(single))
                            .unwrap_or(false);
                    if !matches_single {
                        continue;
                    }
                }
                if rf.status == "local" && !rf.active {
                    if let Some(fid) = rf.font_id {
                        if !local_ids.contains(&fid) {
                            local_ids.push(fid);
                        }
                    }
                } else if rf.status == "google" {
                    if let Some(gf) = rf.google_family {
                        if !google_requests
                            .iter()
                            .any(|(rn, _)| rn.eq_ignore_ascii_case(&rf.name))
                        {
                            google_requests.push((rf.name.clone(), gf));
                        }
                    }
                }
            }

            Some((doc.id.clone(), local_ids, google_requests))
        } else if let Some(ref fp) = payload.file_path {
            let p = Path::new(fp);
            if p.exists() && validate_design_file(p).is_ok() {
                if let Ok(raw_names) = AdobeScanner::extract_font_names(p) {
                    let (resolved_fonts, _) = resolve_fonts_four_tier(&raw_names, &st, &google_map);
                    let mut local_ids = Vec::new();
                    let mut google_requests: Vec<(String, String)> = Vec::new();
                    for rf in resolved_fonts {
                        if let Some(ref single) = target_single_font {
                            let matches_single = rf.name.eq_ignore_ascii_case(single)
                                || rf
                                    .google_family
                                    .as_deref()
                                    .map(|g| g.eq_ignore_ascii_case(single))
                                    .unwrap_or(false);
                            if !matches_single {
                                continue;
                            }
                        }
                        if rf.status == "local" && !rf.active {
                            if let Some(fid) = rf.font_id {
                                if !local_ids.contains(&fid) {
                                    local_ids.push(fid);
                                }
                            }
                        } else if rf.status == "google" {
                            if let Some(gf) = rf.google_family {
                                if !google_requests
                                    .iter()
                                    .any(|(rn, _)| rn.eq_ignore_ascii_case(&rf.name))
                                {
                                    google_requests.push((rf.name.clone(), gf));
                                }
                            }
                        }
                    }
                    Some((fp.clone(), local_ids, google_requests))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    };

    let (doc_id, local_ids, google_requests) = match resolved_plan {
        Some(plan) => plan,
        None => {
            respond_json(
                req,
                404,
                serde_json::json!({ "success": false, "error": "Pending Adobe document not found" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    // Step 2: Activate all matched local fonts in RAM
    let mut activated_ids = Vec::new();
    let mut local_activated_count = 0usize;
    if !local_ids.is_empty() {
        let mut st = state.write().unwrap();
        for fid in &local_ids {
            if let Some(font) = st.fonts.iter().find(|f| f.id == *fid).cloned() {
                let usable = AppState::resolve_usable_font_path(&font.path);
                if usable.exists() && st.activator.activate_ram(&usable.to_string_lossy()).is_ok() {
                    st.active_font_ids.insert(*fid);
                    activated_ids.push(*fid);
                    local_activated_count += 1;
                }
            }
        }
        if !activated_ids.is_empty() {
            for f in &mut st.fonts {
                if activated_ids.contains(&f.id) {
                    f.is_active = true;
                }
            }
            st.save_active_fonts();
        }
    }

    // Step 3: Download + index + activate all matched Google Fonts (exact weight/italic style) into RAM
    let mut google_families_activated = Vec::new();
    let mut failed_google_families = Vec::new();

    for (raw_name, family) in google_requests {
        let download_url = GoogleFontsManager::resolve_download_url_for_style(&family, &raw_name);
        match crate::engine::DownloadManager::download_and_index_google_font_style(
            &family,
            &raw_name,
            &download_url,
            state,
        ) {
            Ok(record) => {
                let mut st = state.write().unwrap();
                if st.activator.activate_ram(&record.path).is_ok() {
                    st.active_font_ids.insert(record.id);
                    if let Some(f_mut) = st.fonts.iter_mut().find(|f| f.id == record.id) {
                        f_mut.is_active = true;
                    }
                    st.save_active_fonts();
                    if !activated_ids.contains(&record.id) {
                        activated_ids.push(record.id);
                    }
                    google_families_activated.push(raw_name);
                } else {
                    failed_google_families.push(raw_name);
                }
            }
            Err(_) => {
                failed_google_families.push(raw_name);
            }
        }
    }

    if !activated_ids.is_empty() {
        let st = state.read().unwrap();
        st.activator.broadcast_font_change();
    }

    // Step 4: Update pending document status in AppState
    {
        let mut st = state.write().unwrap();
        if let Some(doc) = st.pending_adobe_docs.iter_mut().find(|d| d.id == doc_id) {
            doc.already_active_count += activated_ids.len();
            if target_single_font.is_none() && failed_google_families.is_empty() {
                doc.activated = true;
            }
        }
    }

    let google_downloaded_count = google_families_activated.len();
    let total_activated = activated_ids.len();

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "documentId": doc_id,
            "fontName": target_single_font,
            "activatedCount": total_activated,
            "activatedIds": activated_ids,
            "localActivatedCount": local_activated_count,
            "googleDownloadedCount": google_downloaded_count,
            "googleFamiliesActivated": google_families_activated,
            "failedGoogleFamilies": failed_google_families,
            "message": format!(
                "Activated {} design fonts in RAM ({} local, {} downloaded from Google Fonts)",
                total_activated, local_activated_count, google_downloaded_count
            )
        }),
        cors_origin,
        json_header,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::state::FontRecord;

    fn make_font(
        id: usize,
        family: &str,
        ps: &str,
        source: &str,
        is_local: bool,
        is_active: bool,
    ) -> FontRecord {
        FontRecord {
            id,
            name: format!("{}.ttf", ps),
            path: format!("C:\\Fake\\{}.ttf", ps),
            category: "02 - English Fonts".to_string(),
            sub_category: None,
            family: Some(family.to_string()),
            format: "TTF".to_string(),
            size: 120_000,
            is_arabic: false,
            is_latin: true,
            is_bilingual: false,
            is_variable: false,
            weight: 400,
            source: source.to_string(),
            is_active,
            is_favorite: false,
            display_name: Some(family.to_string()),
            style: Some("Regular".to_string()),
            post_script_name: Some(ps.to_string()),
            glyph_count: Some(500),
            has_tashkeel: false,
            has_extended_arabic: false,
            has_arabic_numerals: false,
            has_western_numerals: true,
            is_local,
        }
    }

    #[test]
    fn test_normalize_family_key_handles_adobe_postscript_names() {
        assert_eq!(normalize_family_key("Cairo-Bold"), "cairo");
        assert_eq!(
            normalize_family_key("IBMPlexSansArabic-SemiBold"),
            "ibmplexsansarabic"
        );
        assert_eq!(
            normalize_family_key("ABCDEF+OpenSans-ExtraBoldItalic"),
            "opensans"
        );
        assert_eq!(normalize_family_key("ArialMT"), "arial");
        assert_eq!(normalize_family_key("Noto Sans Arabic"), "notosansarabic");
    }

    #[test]
    fn test_resolve_fonts_four_tier_classification() {
        let mut st = AppState::new();
        st.fonts.clear();
        st.active_font_ids.clear();

        // 1. System font
        st.fonts
            .push(make_font(1, "Arial", "ArialMT", "system", true, false));
        // 2. Local custom font (not yet active)
        st.fonts.push(make_font(
            2,
            "Brand Custom",
            "BrandCustom-Bold",
            "local",
            true,
            false,
        ));
        // 3. Google catalog entry
        let mut gmap = HashMap::new();
        gmap.insert("cairo".to_string(), "Cairo".to_string());
        gmap.insert(
            "ibmplexsansarabic".to_string(),
            "IBM Plex Sans Arabic".to_string(),
        );

        let names = vec![
            "ArialMT".to_string(),
            "BrandCustom-Bold".to_string(),
            "Cairo-Bold".to_string(),
            "IBMPlexSansArabic-SemiBold".to_string(),
            "NonExistentProprietaryFont-Regular".to_string(),
        ];

        let (resolved, counts) = resolve_fonts_four_tier(&names, &st, &gmap);
        assert_eq!(counts.total, 5);
        assert_eq!(counts.system, 1);
        assert_eq!(counts.local, 1);
        assert_eq!(counts.google, 2);
        assert_eq!(counts.missing, 1);
        assert_eq!(counts.active, 1);

        assert_eq!(resolved[0].status, "system");
        assert_eq!(resolved[0].font_id, Some(1));
        assert!(resolved[0].active);

        assert_eq!(resolved[1].status, "local");
        assert_eq!(resolved[1].font_id, Some(2));
        assert!(!resolved[1].active);

        assert_eq!(resolved[2].status, "google");
        assert_eq!(resolved[2].google_family.as_deref(), Some("Cairo"));
        assert!(!resolved[2].active);

        assert_eq!(resolved[3].status, "google");
        assert_eq!(
            resolved[3].google_family.as_deref(),
            Some("IBM Plex Sans Arabic")
        );

        assert_eq!(resolved[4].status, "missing");
        assert_eq!(resolved[4].font_id, None);
        assert_eq!(resolved[4].google_family, None);
    }

    #[test]
    fn test_exact_weight_and_italic_matching_prevents_false_regular_match() {
        let mut st = AppState::new();
        st.fonts.clear();
        st.active_font_ids.clear();

        // Local library only has Poppins Regular (400, upright) and Raleway Thin (100, upright)
        let mut poppins_reg = make_font(10, "Poppins", "Poppins-Regular", "google", true, true);
        poppins_reg.weight = 400;
        poppins_reg.style = Some("Regular".to_string());

        let mut raleway_thin = make_font(11, "Raleway", "Raleway-Thin", "local", true, true);
        raleway_thin.weight = 100;
        raleway_thin.style = Some("Thin".to_string());

        st.fonts.push(poppins_reg);
        st.fonts.push(raleway_thin);

        let mut gmap = HashMap::new();
        gmap.insert("poppins".to_string(), "Poppins".to_string());
        gmap.insert("raleway".to_string(), "Raleway".to_string());

        let names = vec![
            "Poppins-BlackItalic".to_string(),
            "Raleway-ExtraBold".to_string(),
            "Normal RGB".to_string(),
            "PhotoshopKinsokuHard".to_string(),
            "PhotoshopKinsokuSoft".to_string(),
        ];

        let (resolved, counts) = resolve_fonts_four_tier(&names, &st, &gmap);

        // Internal Photoshop tokens must be completely stripped
        assert_eq!(counts.total, 2);
        assert_eq!(counts.local, 0);
        assert_eq!(counts.google, 2);

        // Must route to Google Fonts for exact style download, NOT falsely match Poppins-Regular / Raleway-Thin
        assert_eq!(resolved[0].name, "Poppins-BlackItalic");
        assert_eq!(resolved[0].status, "google");
        assert_eq!(resolved[0].google_family.as_deref(), Some("Poppins"));
        assert!(!resolved[0].active);

        assert_eq!(resolved[1].name, "Raleway-ExtraBold");
        assert_eq!(resolved[1].status, "google");
        assert_eq!(resolved[1].google_family.as_deref(), Some("Raleway"));
        assert!(!resolved[1].active);
    }

    #[test]
    fn test_parse_style_weight_italic_cases() {
        assert_eq!(
            GoogleFontsManager::parse_style_weight_italic("Poppins-BlackItalic"),
            (900, true)
        );
        assert_eq!(
            GoogleFontsManager::parse_style_weight_italic("Raleway-ExtraBold"),
            (800, false)
        );
        assert_eq!(
            GoogleFontsManager::parse_style_weight_italic("Cairo-SemiBold"),
            (600, false)
        );
        assert_eq!(
            GoogleFontsManager::parse_style_weight_italic("BlackOpsOne-Regular"),
            (400, false)
        );
        assert_eq!(
            GoogleFontsManager::parse_style_weight_italic("Roboto-ThinItalic"),
            (100, true)
        );
    }
}
