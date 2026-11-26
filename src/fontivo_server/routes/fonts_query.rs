use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};
use tiny_http::{Header, Request, Response, StatusCode};

use super::common::{add_security_headers, respond_json, respond_json_str};
use crate::engine::LibraryStorageManager;
use crate::parser::FontParser;
use crate::server::state::{AppState, FamilyGroup, FontRecord};

pub fn filter_fonts(st: &AppState, q: &HashMap<String, String>) -> Vec<FontRecord> {
    let active_only = q.get("activeOnly").map(|v| v == "true").unwrap_or(false);
    let inactive_only = q.get("inactiveOnly").map(|v| v == "true").unwrap_or(false);
    let favorite_only = q.get("favoriteOnly").map(|v| v == "true").unwrap_or(false);
    let is_recent = q.get("recent").map(|v| v == "true").unwrap_or(false);
    let provider = q.get("provider").map(|s| s.to_lowercase());
    let category = q.get("category").map(|s| s.as_str());
    let sub_category = q.get("subCategory").map(|s| s.as_str());
    let style = q.get("style").map(|s| s.as_str());
    let format = q.get("format").map(|s| s.as_str());
    let collection = q.get("collection").map(|s| s.as_str());
    let search = q.get("search").map(|s| s.to_lowercase());
    let local_only = q
        .get("localOnly")
        .or_else(|| q.get("downloadedOnly"))
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let source_filter = q.get("source").map(|s| s.trim().to_ascii_lowercase());
    let script_filter = q
        .get("scriptFilter")
        .or_else(|| q.get("script_filter"))
        .or_else(|| q.get("script"))
        .map(|s| s.trim().to_ascii_lowercase());

    let col_ids: Option<HashSet<usize>> = collection.and_then(|c| {
        st.collections
            .get(c)
            .map(|ids| ids.iter().cloned().collect())
    });

    let mut filtered: Vec<FontRecord> = st
        .fonts
        .iter()
        .filter(|f| {
            if active_only && !f.is_active {
                return false;
            }
            if inactive_only && f.is_active {
                return false;
            }
            if favorite_only && !f.is_favorite {
                return false;
            }
            if local_only && !f.is_local {
                return false;
            }

            if let Some(ref src) = source_filter {
                if !src.is_empty() && src != "all" {
                    let font_src = if f.source.is_empty() {
                        crate::server::state::classify_font_source(
                            &f.path,
                            f.sub_category.as_deref(),
                        )
                    } else {
                        f.source.to_ascii_lowercase()
                    };
                    if font_src != *src {
                        return false;
                    }
                }
            }

            if let Some(ref sf) = script_filter {
                if !sf.is_empty() && sf != "all" {
                    let matched = match sf.as_str() {
                        "arabic" => f.is_arabic || f.category.contains("Arabic"),
                        "latin" | "english" => {
                            f.is_latin || (!f.is_arabic && !f.category.contains("Symbols"))
                        }
                        "bilingual" => f.is_bilingual || (f.is_arabic && f.is_latin),
                        "tashkeel" => f.has_tashkeel,
                        "variable" => f.is_variable,
                        _ => true,
                    };
                    if !matched {
                        return false;
                    }
                }
            }

            if let Some(ref prov) = provider {
                if prov == "google" {
                    let name = f.name.to_lowercase();
                    let path = f.path.to_lowercase();
                    let is_google = path.contains("google")
                        || name.contains("cairo")
                        || name.contains("amiri")
                        || name.contains("almarai")
                        || name.contains("tajawal")
                        || name.contains("changa")
                        || name.contains("el messiri")
                        || name.contains("lateef")
                        || name.contains("scheherazade")
                        || name.contains("mada")
                        || name.contains("rakkas")
                        || name.contains("reem kufi")
                        || name.contains("katibeh")
                        || name.contains("marhey")
                        || name.contains("vazirmatn")
                        || name.contains("noto")
                        || name.contains("roboto")
                        || name.contains("open sans")
                        || name.contains("lato")
                        || name.contains("montserrat")
                        || name.contains("poppins")
                        || name.contains("inter")
                        || name.contains("oswald")
                        || name.contains("raleway")
                        || name.contains("ubuntu")
                        || name.contains("merriweather")
                        || name.contains("playfair")
                        || name.contains("lora")
                        || name.contains("fira")
                        || name.contains("nunito")
                        || name.contains("rubik")
                        || name.contains("karla")
                        || name.contains("quicksand")
                        || name.contains("barlow")
                        || name.contains("manrope")
                        || name.contains("dm sans")
                        || name.contains("bebas");
                    if !is_google {
                        return false;
                    }
                }
            }

            if let Some(cat) = category {
                if cat != "all" {
                    if cat.eq_ignore_ascii_case("arabic") {
                        if !f.is_arabic && !f.category.contains("Arabic") {
                            return false;
                        }
                    } else if cat.eq_ignore_ascii_case("english") {
                        if f.is_arabic || f.category.contains("Symbols") {
                            return false;
                        }
                    } else if cat.eq_ignore_ascii_case("symbols") {
                        if !f.category.contains("Symbols") {
                            return false;
                        }
                    } else {
                        if !f.category.to_lowercase().contains(&cat.to_lowercase()) {
                            return false;
                        }
                    }
                }
            }

            if let Some(sub) = sub_category {
                if f.sub_category.as_deref().unwrap_or("").to_lowercase() != sub.to_lowercase() {
                    return false;
                }
            }

            if let Some(st_val) = style {
                if st_val != "all"
                    && f.style.as_deref().unwrap_or("").to_lowercase() != st_val.to_lowercase()
                {
                    return false;
                }
            }

            if let Some(fmt_val) = format {
                if fmt_val != "all" && f.format.to_lowercase() != fmt_val.to_lowercase() {
                    return false;
                }
            }

            if let Some(ref c_ids) = col_ids {
                if !c_ids.contains(&f.id) {
                    return false;
                }
            }

            if let Some(ref term) = search {
                let t = term.trim();
                if !t.is_empty() {
                    let matches = f.name.to_lowercase().contains(t)
                        || f.display_name
                            .as_deref()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(t)
                        || f.family.as_deref().unwrap_or("").to_lowercase().contains(t)
                        || f.category.to_lowercase().contains(t)
                        || f.style.as_deref().unwrap_or("").to_lowercase().contains(t);
                    if !matches {
                        return false;
                    }
                }
            }

            true
        })
        .cloned()
        .collect();

    if is_recent {
        filtered.sort_by(|a, b| b.id.cmp(&a.id));
        filtered.truncate(100);
    }

    // Apply server-side sort if requested via `sortBy` or `sort` query param
    let sort_by = q
        .get("sortBy")
        .or_else(|| q.get("sort"))
        .map(|s| s.trim().to_ascii_lowercase());

    if let Some(ref mode) = sort_by {
        match mode.as_str() {
            "name-asc" => {
                filtered.sort_by(|a, b| {
                    let an = a
                        .family
                        .as_deref()
                        .or(a.display_name.as_deref())
                        .unwrap_or(&a.name)
                        .to_lowercase();
                    let bn = b
                        .family
                        .as_deref()
                        .or(b.display_name.as_deref())
                        .unwrap_or(&b.name)
                        .to_lowercase();
                    an.cmp(&bn)
                        .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                });
            }
            "name-desc" => {
                filtered.sort_by(|a, b| {
                    let an = a
                        .family
                        .as_deref()
                        .or(a.display_name.as_deref())
                        .unwrap_or(&a.name)
                        .to_lowercase();
                    let bn = b
                        .family
                        .as_deref()
                        .or(b.display_name.as_deref())
                        .unwrap_or(&b.name)
                        .to_lowercase();
                    bn.cmp(&an)
                        .then_with(|| b.name.to_lowercase().cmp(&a.name.to_lowercase()))
                });
            }
            "size-desc" => {
                filtered.sort_by(|a, b| b.size.cmp(&a.size));
            }
            "size-asc" => {
                filtered.sort_by(|a, b| a.size.cmp(&b.size));
            }
            "recent" | "id-desc" => {
                filtered.sort_by(|a, b| b.id.cmp(&a.id));
            }
            _ => {}
        }
    }

    filtered
}

pub fn handle_stats(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    let total = st.fonts.len();
    // Active count ONLY includes fonts explicitly activated in Fontivo RAM (NEVER Windows system fonts)
    let active = st
        .fonts
        .iter()
        .filter(|f| f.is_active && f.source != "system" && st.active_font_ids.contains(&f.id))
        .count();
    let favorites = st
        .fonts
        .iter()
        .filter(|f| f.is_favorite || st.favorite_font_ids.contains(&f.id))
        .count();
    let arabic_count = st
        .fonts
        .iter()
        .filter(|f| f.is_arabic || f.category.contains("Arabic"))
        .count();
    let english_count = st
        .fonts
        .iter()
        .filter(|f| !f.is_arabic && !f.category.contains("Symbols"))
        .count();
    let latin_count = st
        .fonts
        .iter()
        .filter(|f| f.is_latin || (!f.is_arabic && !f.category.contains("Symbols")))
        .count();
    let bilingual_count = st
        .fonts
        .iter()
        .filter(|f| f.is_bilingual || (f.is_arabic && f.is_latin))
        .count();
    let tashkeel_count = st.fonts.iter().filter(|f| f.has_tashkeel).count();
    let variable_count = st.fonts.iter().filter(|f| f.is_variable).count();
    let symbols_count = st
        .fonts
        .iter()
        .filter(|f| f.category.contains("Symbols"))
        .count();

    let family_set: HashSet<String> = st
        .fonts
        .iter()
        .map(|f| {
            f.family
                .clone()
                .unwrap_or_else(|| f.name.clone())
                .to_lowercase()
        })
        .collect();

    // Exact non-overlapping source counts: system + local + google + cloud == total
    let mut system_count = 0usize;
    let mut local_count = 0usize;
    let mut google_count = 0usize;
    let mut cloud_count = 0usize;
    for f in &st.fonts {
        let src = if f.source.is_empty() {
            crate::server::state::classify_font_source(&f.path, f.sub_category.as_deref())
        } else {
            f.source.to_ascii_lowercase()
        };
        match src.as_str() {
            "system" => system_count += 1,
            "google" => google_count += 1,
            "cloud" => cloud_count += 1,
            _ => local_count += 1,
        }
    }

    // Dynamic packs count
    let packs_dir = LibraryStorageManager::get_packs_dir();
    let extracted_dir = LibraryStorageManager::get_extracted_dir();
    let mut packs_count = 0;
    if let Ok(entries) = fs::read_dir(&packs_dir) {
        packs_count += entries
            .flatten()
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("zip"))
            .count();
    }
    if let Ok(entries) = fs::read_dir(&extracted_dir) {
        packs_count = packs_count.max(entries.flatten().filter(|e| e.path().is_dir()).count());
    }

    // Dynamic missing files count (only count local library records whose disk file is missing)
    let missing_files_count = st
        .fonts
        .iter()
        .filter(|f| f.is_local && !Path::new(&f.path).exists())
        .count();

    // Dynamic storage used bytes
    let storage_used_bytes = LibraryStorageManager::calculate_used_space();

    // Formats breakdown
    let mut formats_breakdown: HashMap<String, usize> = HashMap::new();
    for f in &st.fonts {
        let fmt = f.format.to_lowercase();
        *formats_breakdown.entry(fmt).or_insert(0) += 1;
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct StatsRes {
        total: usize,
        active: usize,
        active_count: usize,
        inactive: usize,
        recent: usize,
        favorites: usize,
        favorites_count: usize,
        arabic_count: usize,
        english_count: usize,
        latin_count: usize,
        bilingual_count: usize,
        tashkeel_count: usize,
        variable_count: usize,
        symbols_count: usize,
        families_count: usize,
        collections_count: usize,
        system_count: usize,
        local_count: usize,
        google_count: usize,
        cloud_count: usize,
        packs_count: usize,
        storage_used_bytes: u64,
        missing_files_count: usize,
        formats_breakdown: HashMap<String, usize>,
    }

    let res_obj = StatsRes {
        total,
        active,
        active_count: active,
        inactive: total.saturating_sub(active),
        recent: 100.min(total),
        favorites,
        favorites_count: favorites,
        arabic_count,
        english_count,
        latin_count,
        bilingual_count,
        tashkeel_count,
        variable_count,
        symbols_count,
        families_count: family_set.len(),
        collections_count: st.collections.len(),
        system_count,
        local_count,
        google_count,
        cloud_count,
        packs_count,
        storage_used_bytes,
        missing_files_count,
        formats_breakdown,
    };

    respond_json_str(
        req,
        200,
        serde_json::to_string(&res_obj).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

pub fn handle_fonts(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    let filtered = filter_fonts(&st, query_params);
    let total = filtered.len();

    let limit: usize = query_params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(60);
    let page: usize = query_params
        .get("page")
        .and_then(|s| s.parse().ok())
        .unwrap_or(1);
    let offset: usize = query_params
        .get("offset")
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| if page > 0 { (page - 1) * limit } else { 0 });

    let total_pages = if limit > 0 { total.div_ceil(limit) } else { 1 };
    let current_page = if limit > 0 { (offset / limit) + 1 } else { 1 };

    let paged: Vec<FontRecord> = filtered.into_iter().skip(offset).take(limit).collect();

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PagedRes {
        total: usize,
        offset: usize,
        limit: usize,
        page: usize,
        total_pages: usize,
        fonts: Vec<FontRecord>,
    }

    respond_json_str(
        req,
        200,
        serde_json::to_string(&PagedRes {
            total,
            offset,
            limit,
            page: current_page,
            total_pages,
            fonts: paged,
        })
        .unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

/// Groups fonts into families and sorts them across the full library according to `sortBy` / `sort`.
pub fn sort_families(families: &mut [FamilyGroup], sort_by: Option<&str>) {
    match sort_by.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        Some("name-desc") => {
            families.sort_by(|a, b| b.family.to_lowercase().cmp(&a.family.to_lowercase()));
        }
        Some("styles-desc") | Some("count-desc") => {
            families.sort_by(|a, b| {
                b.count
                    .cmp(&a.count)
                    .then_with(|| a.family.to_lowercase().cmp(&b.family.to_lowercase()))
            });
        }
        Some("styles-asc") | Some("count-asc") => {
            families.sort_by(|a, b| {
                a.count
                    .cmp(&b.count)
                    .then_with(|| a.family.to_lowercase().cmp(&b.family.to_lowercase()))
            });
        }
        _ => {
            families.sort_by(|a, b| a.family.to_lowercase().cmp(&b.family.to_lowercase()));
        }
    }
}

pub fn handle_families(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let st = state.read().unwrap();
    let filtered = filter_fonts(&st, query_params);

    let mut map: HashMap<String, FamilyGroup> = HashMap::new();
    for f in filtered {
        let fam_display = f
            .family
            .clone()
            .unwrap_or_else(|| f.display_name.clone().unwrap_or_else(|| f.name.clone()));
        let fam_key = fam_display.trim().to_lowercase();
        let font_src = if f.source.is_empty() {
            crate::server::state::classify_font_source(&f.path, f.sub_category.as_deref())
        } else {
            f.source.clone()
        };
        let entry = map.entry(fam_key).or_insert_with(|| FamilyGroup {
            family: fam_display,
            is_arabic: f.is_arabic,
            is_latin: f.is_latin,
            is_bilingual: f.is_bilingual,
            is_variable: f.is_variable,
            source: font_src,
            category: f.category.clone(),
            sub_category: f.sub_category.clone(),
            count: 0,
            is_active: false,
            is_all_active: false,
            is_favorite: false,
            fonts: Vec::new(),
            has_tashkeel: false,
            has_extended_arabic: false,
            has_arabic_numerals: false,
            has_western_numerals: false,
            is_local: false,
        });
        entry.fonts.push(f);
    }

    let mut families: Vec<FamilyGroup> = map
        .into_values()
        .map(|mut fam| {
            // Sort variants by numeric weight ascending, Regular before Italic
            fam.fonts.sort_by(|a, b| {
                let wa = if a.weight > 0 {
                    a.weight
                } else {
                    crate::server::state::style_to_weight(a.style.as_deref())
                };
                let wb = if b.weight > 0 {
                    b.weight
                } else {
                    crate::server::state::style_to_weight(b.style.as_deref())
                };
                let ia = a
                    .style
                    .as_deref()
                    .unwrap_or("")
                    .to_ascii_lowercase()
                    .contains("italic");
                let ib = b
                    .style
                    .as_deref()
                    .unwrap_or("")
                    .to_ascii_lowercase()
                    .contains("italic");
                wa.cmp(&wb).then_with(|| ia.cmp(&ib)).then_with(|| {
                    a.style
                        .as_deref()
                        .unwrap_or("")
                        .cmp(b.style.as_deref().unwrap_or(""))
                })
            });
            fam.count = fam.fonts.len();
            let act_count = fam.fonts.iter().filter(|f| f.is_active).count();
            let fav_count = fam.fonts.iter().filter(|f| f.is_favorite).count();
            fam.is_active = act_count > 0;
            fam.is_all_active = act_count == fam.count && fam.count > 0;
            fam.is_favorite = fav_count > 0;
            fam.is_arabic = fam.fonts.iter().any(|f| f.is_arabic);
            fam.is_latin = fam.fonts.iter().any(|f| f.is_latin);
            fam.is_bilingual =
                fam.fonts.iter().any(|f| f.is_bilingual) || (fam.is_arabic && fam.is_latin);
            fam.is_variable = fam.fonts.iter().any(|f| f.is_variable);
            fam.has_tashkeel = fam.fonts.iter().any(|f| f.has_tashkeel);
            fam.has_extended_arabic = fam.fonts.iter().any(|f| f.has_extended_arabic);
            fam.has_arabic_numerals = fam.fonts.iter().any(|f| f.has_arabic_numerals);
            fam.has_western_numerals = fam.fonts.iter().any(|f| f.has_western_numerals);
            fam.is_local = fam.fonts.iter().any(|f| f.is_local);
            fam
        })
        .collect();

    let sort_param = query_params
        .get("sortBy")
        .or_else(|| query_params.get("sort"))
        .map(|s| s.as_str());
    sort_families(&mut families, sort_param);

    let total = families.len();

    let limit: usize = query_params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(40);
    let page: usize = query_params
        .get("page")
        .and_then(|s| s.parse().ok())
        .unwrap_or(1);
    let offset: usize = query_params
        .get("offset")
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| if page > 0 { (page - 1) * limit } else { 0 });

    let total_pages = if limit > 0 { total.div_ceil(limit) } else { 1 };
    let current_page = if limit > 0 { (offset / limit) + 1 } else { 1 };

    let paged: Vec<FamilyGroup> = families.into_iter().skip(offset).take(limit).collect();

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PagedFamRes {
        total: usize,
        offset: usize,
        limit: usize,
        page: usize,
        total_pages: usize,
        families: Vec<FamilyGroup>,
    }

    respond_json_str(
        req,
        200,
        serde_json::to_string(&PagedFamRes {
            total,
            offset,
            limit,
            page: current_page,
            total_pages,
            families: paged,
        })
        .unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

/// Returns the canonical font MIME type for a given file path extension.
pub fn font_mime_type_for_path(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttc" | "otc" => "font/collection",
        _ => "application/octet-stream",
    }
}

pub fn handle_font_file(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    font_id: usize,
    cors_origin: Header,
) {
    let font_info = {
        let st = state.read().unwrap();
        st.fonts
            .iter()
            .find(|f| f.id == font_id)
            .map(|f| (f.path.clone(), f.family.clone()))
    };

    if let Some((path_str, family_opt)) = font_info {
        let direct = Path::new(&path_str);
        let resolved_path = if direct.exists() && direct.is_file() {
            Some(direct.to_path_buf())
        } else if let Some(ref fam) = family_opt {
            crate::google::GoogleFontsManager::is_family_downloaded(fam)
        } else {
            None
        };

        if let Some(real_path) = resolved_path {
            if let Ok(bytes) = fs::read(&real_path) {
                let mime = font_mime_type_for_path(&real_path);
                let mime_header =
                    Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap();
                let cache_header =
                    Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000"[..])
                        .unwrap();

                let mut res = Response::from_data(bytes);
                res.add_header(cors_origin);
                res.add_header(mime_header);
                res.add_header(cache_header);
                add_security_headers(&mut res);
                let _ = req.respond(res);
                return;
            }
        }
    }

    let mut res = Response::from_string("Font file not found").with_status_code(StatusCode(404));
    res.add_header(cors_origin);
    add_security_headers(&mut res);
    let _ = req.respond(res);
}

pub fn handle_font_glyphs(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    font_id: usize,
    cors_origin: Header,
    json_header: Header,
) {
    let glyphs_res = {
        let st = state.read().unwrap();
        st.inspect_glyphs(font_id)
    };

    match glyphs_res {
        Ok(data) => {
            respond_json_str(
                req,
                200,
                serde_json::to_string(&data).unwrap_or_default(),
                cors_origin,
                json_header,
            );
        }
        Err(err) => {
            respond_json(
                req,
                404,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
        }
    }
}

pub fn handle_font_metadata(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    query_params: &HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let font_id: Option<usize> = query_params.get("id").and_then(|s| s.parse().ok());
    let font_path_req = query_params.get("path").cloned();

    let resolved_path = {
        let st = state.read().unwrap();
        if let Some(id) = font_id {
            st.fonts.iter().find(|f| f.id == id).map(|f| f.path.clone())
        } else {
            font_path_req
        }
    };

    if let Some(path_str) = resolved_path {
        let p = Path::new(&path_str);
        if p.exists() {
            match FontParser::parse_file(p) {
                Ok(meta) => {
                    respond_json_str(
                        req,
                        200,
                        serde_json::to_string(&meta).unwrap_or_default(),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
                Err(err) => {
                    respond_json(
                        req,
                        400,
                        serde_json::json!({ "error": format!("{:?}", err) }),
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
        serde_json::json!({ "error": "Font file not found on disk" }),
        cors_origin,
        json_header,
    );
}

pub use super::fonts_lifecycle::handle_import_folder;
