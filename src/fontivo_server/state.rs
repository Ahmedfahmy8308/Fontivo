use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::engine::{FontActivator, JobPhase, LibraryStorageManager};
use crate::google::GoogleFontsManager;
use crate::parser::FontParser;
use crate::scanner::adobe_scanner::DesignFontItem;

fn default_weight() -> u16 {
    400
}

fn default_source() -> String {
    "local".to_string()
}

pub fn style_to_weight(style: Option<&str>) -> u16 {
    let s = style.unwrap_or("regular").to_ascii_lowercase();
    if s.contains("thin") || s.contains("hairline") {
        100
    } else if s.contains("extralight") || s.contains("extra light") || s.contains("ultralight") {
        200
    } else if s.contains("light") {
        300
    } else if s.contains("medium") {
        500
    } else if s.contains("semibold") || s.contains("semi bold") || s.contains("demibold") {
        600
    } else if s.contains("extrabold") || s.contains("extra bold") || s.contains("ultrabold") {
        800
    } else if s.contains("black") || s.contains("heavy") {
        900
    } else if s.contains("bold") {
        700
    } else {
        400
    }
}

pub fn classify_font_source(path: &str, sub_category: Option<&str>) -> String {
    let p = path.replace('/', "\\").to_ascii_lowercase();
    let sc = sub_category.unwrap_or("").to_ascii_lowercase();

    // 1. Strict path-based classification takes highest priority
    if p.contains("\\windows\\fonts\\")
        || p.ends_with("\\windows\\fonts")
        || p.contains("\\microsoft\\windows\\fonts\\")
        || p.ends_with("\\microsoft\\windows\\fonts")
    {
        return "system".to_string();
    }
    if p.contains("\\fonts\\google\\")
        || p.ends_with("\\fonts\\google")
        || p.contains("\\googlefonts\\")
        || p.contains("\\google_fonts\\")
        || p.ends_with("\\googlefonts")
    {
        return "google".to_string();
    }
    if p.contains("\\fonts\\packs\\")
        || p.ends_with("\\fonts\\packs")
        || p.contains("\\extracted\\")
    {
        return "cloud".to_string();
    }
    if p.contains("\\fonts\\custom\\")
        || p.ends_with("\\fonts\\custom")
        || p.contains("\\fonts\\imported\\")
        || p.ends_with("\\fonts\\imported")
        || p.contains("\\customfonts\\")
    {
        return "local".to_string();
    }

    // 2. Sub-category fallback when path is non-standard
    if sc.contains("system") || sc.contains("windows") {
        "system".to_string()
    } else if sc.contains("google") {
        "google".to_string()
    } else if sc.contains("fontivo essential") || sc.contains("cloud") {
        "cloud".to_string()
    } else {
        "local".to_string()
    }
}

pub fn normalize_font_path_key(path: &str) -> String {
    let s = path.replace('/', "\\");
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
    stripped.trim().to_ascii_lowercase()
}

/// Strips Windows `\\?\` extended-length prefix when safe for OS launchers and display.
pub fn strip_windows_verbatim_prefix(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        if !stripped.starts_with("UNC\\") && stripped.len() < 260 {
            return PathBuf::from(stripped);
        }
    }
    path.to_path_buf()
}

/// Resolves the canonical normalized source tag (`system`, `local`, `cloud`, `google`) for a FontRecord.
pub fn resolve_font_source(f: &FontRecord) -> String {
    if f.source.trim().is_empty() {
        classify_font_source(&f.path, f.sub_category.as_deref())
    } else {
        f.source.trim().to_ascii_lowercase()
    }
}

/// Returns true when a font is a physically managed non-system offline font
/// (`local`, `cloud`, or downloaded `google` font whose path is not remote `cloud://` / `http(s)://`).
pub fn is_offline_non_system_font(f: &FontRecord) -> bool {
    let bucket = classify_font_bucket(f);
    bucket != "system" && bucket != "remote"
}

/// Classifies a font into a storage/UI bucket:
/// `system` | `remote` | `imported` | `cloud` | `google` | `custom`.
pub fn classify_font_bucket(f: &FontRecord) -> &'static str {
    let src = resolve_font_source(f);
    let path_trim = f.path.trim();
    let path_low = path_trim.replace('/', "\\").to_ascii_lowercase();

    if src == "system"
        || path_low.contains("\\windows\\fonts\\")
        || path_low.ends_with("\\windows\\fonts")
        || path_low.contains("\\microsoft\\windows\\fonts\\")
        || path_low.ends_with("\\microsoft\\windows\\fonts")
    {
        return "system";
    }

    if path_low.is_empty()
        || path_low.starts_with("cloud://")
        || path_low.starts_with("http://")
        || path_low.starts_with("https://")
        || (src == "google" && !f.is_local)
    {
        return "remote";
    }

    let sub_low = f.sub_category.as_deref().unwrap_or("").to_ascii_lowercase();

    if path_low.contains("\\fonts\\imported\\")
        || path_low.ends_with("\\fonts\\imported")
        || sub_low.starts_with("imported")
    {
        return "imported";
    }

    if src == "cloud"
        || path_low.contains("\\fonts\\packs\\")
        || path_low.ends_with("\\fonts\\packs")
        || path_low.contains("\\extracted\\")
        || sub_low.contains("cloud pack")
    {
        return "cloud";
    }

    if src == "google"
        || path_low.contains("\\fonts\\google\\")
        || path_low.ends_with("\\fonts\\google")
        || path_low.contains("\\googlefonts\\")
        || path_low.contains("\\google_fonts\\")
    {
        return "google";
    }

    "custom"
}

pub fn compute_bytes_sha256(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub fn compute_file_sha256(path: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hex::encode(hasher.finalize()))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFontMatch {
    pub file_name: String,
    pub family: String,
    pub style: String,
    pub existing_id: usize,
    pub existing_path: String,
    pub existing_source: String,
    pub match_reason: String,
}

fn is_symbol_font_name(name: &str) -> bool {
    let low = name.to_ascii_lowercase();
    low.contains("wingding")
        || low.contains("webding")
        || low.contains("symbol")
        || low.contains("marlett")
        || low.contains("mdl2")
        || low.contains("fluent icons")
        || low.contains("emoji")
        || low.contains("dingbat")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontRecord {
    pub id: usize,
    pub name: String,
    pub path: String,
    pub category: String,
    pub sub_category: Option<String>,
    pub family: Option<String>,
    pub format: String,
    pub size: usize,
    pub is_arabic: bool,
    #[serde(default)]
    pub is_latin: bool,
    #[serde(default)]
    pub is_bilingual: bool,
    #[serde(default)]
    pub is_variable: bool,
    #[serde(default = "default_weight")]
    pub weight: u16,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub is_favorite: bool,
    pub display_name: Option<String>,
    pub style: Option<String>,
    pub post_script_name: Option<String>,
    pub glyph_count: Option<usize>,
    #[serde(default)]
    pub has_tashkeel: bool,
    #[serde(default)]
    pub has_extended_arabic: bool,
    #[serde(default)]
    pub has_arabic_numerals: bool,
    #[serde(default)]
    pub has_western_numerals: bool,
    #[serde(default)]
    pub is_local: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FamilyGroup {
    pub family: String,
    pub is_arabic: bool,
    #[serde(default)]
    pub is_latin: bool,
    #[serde(default)]
    pub is_bilingual: bool,
    #[serde(default)]
    pub is_variable: bool,
    #[serde(default = "default_source")]
    pub source: String,
    pub category: String,
    pub sub_category: Option<String>,
    pub count: usize,
    pub is_active: bool,
    pub is_all_active: bool,
    pub is_favorite: bool,
    pub fonts: Vec<FontRecord>,
    #[serde(default)]
    pub has_tashkeel: bool,
    #[serde(default)]
    pub has_extended_arabic: bool,
    #[serde(default)]
    pub has_arabic_numerals: bool,
    #[serde(default)]
    pub has_western_numerals: bool,
    #[serde(default)]
    pub is_local: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PendingAdobeDocument {
    pub id: String,
    pub app_name: String,
    pub window_title: String,
    pub document_name: String,
    pub file_path: Option<String>,
    pub detected_at: u64,
    pub matched_fonts: Vec<DesignFontItem>,
    pub missing_fonts: Vec<DesignFontItem>,
    pub matched_font_ids: Vec<usize>,
    pub already_active_count: usize,
    pub total_fonts: usize,
    pub dismissed: bool,
    pub activated: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BrandColor {
    pub name: String,
    pub hex: String,
    pub role: String, // "primary", "secondary", "accent", "background", "text", "custom"
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BrandKit {
    pub id: String,
    pub name: String,
    pub client: Option<String>,
    pub heading_font_id: Option<usize>,
    pub heading_font_name: Option<String>,
    pub body_font_id: Option<usize>,
    pub body_font_name: Option<String>,
    pub accent_font_id: Option<usize>,
    pub accent_font_name: Option<String>,
    pub colors: Vec<BrandColor>,
    pub notes: Option<String>,
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GlyphItem {
    pub index: u16,
    pub char: String,
    pub code: u32,
    pub hex: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontGlyphsResponse {
    pub success: bool,
    pub id: usize,
    pub name: String,
    pub family: Option<String>,
    pub style: Option<String>,
    pub format: String,
    pub path: String,
    pub size: usize,
    pub metrics: FontMetrics,
    pub metadata: FontMetadata,
    pub glyphs: Vec<GlyphItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontMetrics {
    pub units_per_em: u16,
    pub ascender: i16,
    pub descender: i16,
    pub glyph_count: usize,
    pub extracted_characters: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontMetadata {
    pub font_family: String,
    pub font_subfamily: String,
    pub full_name: String,
    pub post_script_name: String,
    pub version: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemOperation {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub progress_percent: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub processed_items: usize,
    pub total_items: usize,
    pub speed_bps: u64,
    pub message: String,
    pub updated_at: u64,
}

pub struct AppState {
    pub fonts: Vec<FontRecord>,
    pub active_font_ids: HashSet<usize>,
    pub favorite_font_ids: HashSet<usize>,
    pub collections: HashMap<String, Vec<usize>>,
    pub brand_kits: Vec<BrandKit>,
    pub operations: Vec<SystemOperation>,
    pub pending_adobe_docs: Vec<PendingAdobeDocument>,
    pub dismissed_adobe_doc_ids: HashSet<String>,
    pub running_adobe_apps: Vec<String>,
    pub activator: Arc<FontActivator>,
    pub download_manager: Arc<crate::engine::DownloadManager>,
    pub data_dir: PathBuf,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let base_data_dir = crate::engine::lifecycle::get_app_data_dir();
        let _ = fs::create_dir_all(&base_data_dir);

        let activator = Arc::new(FontActivator::new());
        let download_manager = Arc::new(crate::engine::DownloadManager::new());

        let mut state = Self {
            fonts: Vec::new(),
            active_font_ids: HashSet::new(),
            favorite_font_ids: HashSet::new(),
            collections: HashMap::new(),
            brand_kits: Vec::new(),
            operations: Vec::new(),
            pending_adobe_docs: Vec::new(),
            dismissed_adobe_doc_ids: HashSet::new(),
            running_adobe_apps: Vec::new(),
            activator,
            download_manager,
            data_dir: base_data_dir,
        };

        state.load_state();
        state
    }

    /// Resolves `%LOCALAPPDATA%\Fontivo` (unified AppData root)
    pub fn get_local_fontivo_dir(&self) -> PathBuf {
        self.data_dir.clone()
    }

    /// Resolves `%LOCALAPPDATA%\Fontivo\Fonts\Custom`
    pub fn get_custom_fonts_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("Fonts").join("Custom");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    /// Resolves `%LOCALAPPDATA%\Fontivo\Fonts\Imported`
    pub fn get_imported_fonts_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("Fonts").join("Imported");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    /// Resolves `%LOCALAPPDATA%\Fontivo\Updates`
    pub fn get_updates_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("Updates");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    /// Resolves `%LOCALAPPDATA%\Fontivo\user-library-index.json`
    pub fn get_user_library_index_path(&self) -> PathBuf {
        self.data_dir.join("user-library-index.json")
    }

    /// Resolves a usable font file path on disk (falling back to a valid Windows core TTF
    /// when a virtual/cloud Google Font entry hasn't been downloaded yet).
    pub fn resolve_usable_font_path(path_str: &str) -> PathBuf {
        let p = Path::new(path_str);
        if p.exists() && p.is_file() {
            return p.to_path_buf();
        }

        let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
        let win_fonts = PathBuf::from(&win_dir).join("Fonts");
        let is_otf = path_str.to_ascii_lowercase().ends_with(".otf");
        let candidates: &[&str] = if is_otf {
            &["arial.ttf", "tahoma.ttf", "segoeui.ttf", "calibri.ttf"]
        } else {
            &["tahoma.ttf", "arial.ttf", "segoeui.ttf", "calibri.ttf"]
        };
        for c in candidates {
            let cand = win_fonts.join(c);
            if cand.exists() {
                return cand;
            }
        }
        p.to_path_buf()
    }

    /// Optional explicit cache file check (only loaded if a user or test explicitly placed `fonts-cache.json` in `data_dir`)
    fn find_optional_cache_file(&self) -> Option<PathBuf> {
        let candidate = self.data_dir.join("fonts-cache.json");
        if candidate.exists() && candidate.is_file() {
            return Some(candidate);
        }
        None
    }

    /// Checks whether a legacy cached path has been relocated into the clean unified Fonts/ structure.
    fn resolve_migrated_font_path(&self, raw_path: &str) -> Option<PathBuf> {
        let p = Path::new(raw_path);
        if p.is_file() {
            return Some(p.to_path_buf());
        }
        let norm = raw_path.replace('/', "\\");
        let lower = norm.to_ascii_lowercase();
        let fonts_root = self.data_dir.join("Fonts");

        for (needle, sub) in [
            ("\\customfonts\\", "Custom"),
            ("\\library\\googlefonts\\", "Google"),
            ("\\googlefonts\\", "Google"),
            ("\\library\\extracted\\", "Packs"),
        ] {
            if let Some(pos) = lower.find(needle) {
                let rel = &norm[pos + needle.len()..];
                let cand = fonts_root.join(sub).join(rel);
                if cand.is_file() {
                    return Some(cand);
                }
            }
        }
        None
    }

    /// Safely migrates files from a source directory into a destination directory without overwriting
    /// existing destination files, then removes empty directories from `src`.
    fn merge_move_dir(src: &Path, dst: &Path) {
        if !src.exists() || !src.is_dir() || src == dst {
            return;
        }
        let _ = fs::create_dir_all(dst);
        if let Ok(entries) = fs::read_dir(src) {
            for entry in entries.flatten() {
                let s_path = entry.path();
                let d_path = dst.join(entry.file_name());
                if s_path.is_dir() {
                    Self::merge_move_dir(&s_path, &d_path);
                } else if s_path.is_file() {
                    if d_path.exists() {
                        // Already present at destination; remove redundant legacy copy
                        let _ = fs::remove_file(&s_path);
                    } else if fs::rename(&s_path, &d_path).is_err() {
                        if fs::copy(&s_path, &d_path).is_ok() {
                            let _ = fs::remove_file(&s_path);
                        }
                    }
                }
            }
        }
        let _ = fs::remove_dir(src);
    }

    /// Prunes empty directories upward until a protected boundary root is reached.
    pub fn prune_empty_parent_dirs(file_path: &Path, roots: &[PathBuf]) {
        let mut curr_opt = file_path.parent().map(|p| p.to_path_buf());
        while let Some(curr) = curr_opt {
            if roots.iter().any(|r| {
                r == &curr
                    || r.canonicalize()
                        .ok()
                        .zip(curr.canonicalize().ok())
                        .map(|(a, b)| a == b)
                        .unwrap_or(false)
            }) {
                break;
            }
            if curr.exists() && curr.is_dir() {
                let is_empty = fs::read_dir(&curr)
                    .map(|mut it| it.next().is_none())
                    .unwrap_or(false);
                if is_empty {
                    let next = curr.parent().map(|p| p.to_path_buf());
                    if fs::remove_dir(&curr).is_ok() {
                        curr_opt = next;
                        continue;
                    }
                }
            }
            break;
        }
    }

    /// One-time idempotent migration from pre-v1.0.3 split Roaming/Local directories
    /// into the single clean `%LOCALAPPDATA%\Fontivo` hierarchy.
    pub fn migrate_legacy_storage(&self) {
        let fonts_root = self.data_dir.join("Fonts");
        let google_dst = fonts_root.join("Google");
        let packs_dst = fonts_root.join("Packs");
        let custom_dst = fonts_root.join("Custom");
        let workspaces_dst = self.data_dir.join("Workspaces");

        // 1. Consolidate folders inside `self.data_dir`
        Self::merge_move_dir(&self.data_dir.join("CustomFonts"), &custom_dst);
        Self::merge_move_dir(&self.data_dir.join("GoogleFonts"), &google_dst);
        Self::merge_move_dir(
            &self.data_dir.join("Library").join("GoogleFonts"),
            &google_dst,
        );
        Self::merge_move_dir(&self.data_dir.join("Library").join("Extracted"), &packs_dst);

        // Remove empty legacy ghost folders inside `self.data_dir`
        for empty_candidate in [
            self.data_dir.join("Library").join("Downloads"),
            self.data_dir.join("Library").join("Packs"),
            self.data_dir.join("Library"),
            self.data_dir.join("GoogleFonts"),
            self.data_dir.join("CustomFonts"),
            self.data_dir.join("webview_data"),
        ] {
            if empty_candidate.exists() && empty_candidate.is_dir() {
                let is_empty = fs::read_dir(&empty_candidate)
                    .map(|mut it| it.next().is_none())
                    .unwrap_or(false);
                if is_empty {
                    let _ = fs::remove_dir(&empty_candidate);
                }
            }
        }

        // 2. Migrate legacy `%APPDATA%\Fontivo` (Roaming) -> `%LOCALAPPDATA%\Fontivo` (Local)
        if let Some(roaming) = crate::engine::lifecycle::get_legacy_roaming_app_data_dir() {
            if roaming.exists() && roaming.is_dir() {
                Self::merge_move_dir(&roaming.join("GoogleFonts"), &google_dst);
                Self::merge_move_dir(&roaming.join("Library").join("GoogleFonts"), &google_dst);
                Self::merge_move_dir(&roaming.join("Library").join("Extracted"), &packs_dst);
                Self::merge_move_dir(&roaming.join("workspaces"), &workspaces_dst);
                Self::merge_move_dir(&roaming.join("CustomFonts"), &custom_dst);
                Self::merge_move_dir(&roaming.join("Backups"), &self.data_dir.join("Backups"));
                Self::merge_move_dir(&roaming.join("updates"), &self.data_dir.join("updates"));

                // Handle legacy ZIP archives: delete redundant ZIP if extracted pack exists cleanly
                let roaming_packs = roaming.join("Library").join("Packs");
                if roaming_packs.exists() && roaming_packs.is_dir() {
                    if let Ok(entries) = fs::read_dir(&roaming_packs) {
                        let archive_dst = self.data_dir.join("Cache").join("PackArchives");
                        for entry in entries.flatten() {
                            let zp = entry.path();
                            if zp.is_file() {
                                let stem = zp.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                                // Zip names look like `fontivo-essential-001.zip`, extracted id `pack-essential-001`
                                let pack_id_guess =
                                    if let Some(rest) = stem.strip_prefix("fontivo-") {
                                        format!("pack-{}", rest)
                                    } else {
                                        stem.to_string()
                                    };
                                let extracted_pack_dir = packs_dst.join(&pack_id_guess);
                                let already_extracted = extracted_pack_dir.is_dir()
                                    && fs::read_dir(&extracted_pack_dir)
                                        .map(|mut it| it.next().is_some())
                                        .unwrap_or(false);
                                if already_extracted {
                                    let _ = fs::remove_file(&zp);
                                } else {
                                    let _ = fs::create_dir_all(&archive_dst);
                                    let target = archive_dst.join(entry.file_name());
                                    if !target.exists() && fs::rename(&zp, &target).is_err() {
                                        if fs::copy(&zp, &target).is_ok() {
                                            let _ = fs::remove_file(&zp);
                                        }
                                    } else if target.exists() {
                                        let _ = fs::remove_file(&zp);
                                    }
                                }
                            }
                        }
                    }
                    let _ = fs::remove_dir(&roaming_packs);
                }

                // Remove redundant copies from legacy Library\Downloads if present in Fonts/Google or Fonts/Packs
                let roaming_dl = roaming.join("Library").join("Downloads");
                if roaming_dl.exists() && roaming_dl.is_dir() {
                    if let Ok(entries) = fs::read_dir(&roaming_dl) {
                        for entry in entries.flatten() {
                            let f = entry.path();
                            if f.is_file() {
                                if google_dst.join(entry.file_name()).is_file() {
                                    let _ = fs::remove_file(&f);
                                }
                            }
                        }
                    }
                    let _ = fs::remove_dir(&roaming_dl);
                }
                let _ = fs::remove_dir(roaming.join("Library"));

                // Move small JSON config files if not already present locally
                for cfg_name in [
                    "user-library-index.json",
                    "active-fonts.json",
                    "favorites.json",
                    "collections.json",
                    "brand-kits.json",
                    "google-fonts-catalog.json",
                ] {
                    let src_f = roaming.join(cfg_name);
                    let dst_f = self.data_dir.join(cfg_name);
                    if src_f.is_file() {
                        if dst_f.exists() {
                            let _ = fs::remove_file(&src_f);
                        } else if fs::rename(&src_f, &dst_f).is_err() {
                            if fs::copy(&src_f, &dst_f).is_ok() {
                                let _ = fs::remove_file(&src_f);
                            }
                        }
                    }
                }
                for junk in ["library-config.json", "webview_data"] {
                    let j = roaming.join(junk);
                    if j.is_file() {
                        let _ = fs::remove_file(&j);
                    } else if j.is_dir() {
                        let _ = fs::remove_dir_all(&j);
                    }
                }
            }
        }

        // 3. Migrate lowercase `updates` inside data_dir into canonical `Updates`
        let lower_updates = self.data_dir.join("updates");
        let canon_updates = self.data_dir.join("Updates");
        if lower_updates.exists() && lower_updates.is_dir() && lower_updates != canon_updates {
            Self::merge_move_dir(&lower_updates, &canon_updates);
        }

        // 4. Ensure complete structured directory layout exists upfront (Local, Roaming, optional ProgramData)
        self.ensure_directory_layout();
    }

    /// Creates Fontivo's standard, clean directory layout on startup so all managed folders exist
    /// deterministically without scattering stray empty folders across User Downloads.
    pub fn ensure_directory_layout(&self) {
        let fonts_root = self.data_dir.join("Fonts");
        for dir in [
            self.data_dir.clone(),
            fonts_root.clone(),
            fonts_root.join("Google"),
            fonts_root.join("Packs"),
            fonts_root.join("Custom"),
            fonts_root.join("Imported"),
            self.data_dir.join("Backups"),
            self.data_dir.join("Workspaces"),
            self.data_dir.join("Updates"),
            self.data_dir.join("Downloads"),
            self.data_dir.join("Cache"),
            self.data_dir.join("Cache").join("PackArchives"),
            self.data_dir.join("WebView2"),
        ] {
            let _ = fs::create_dir_all(dir);
        }

        // Clean up legacy empty `%USERPROFILE%\Downloads\Fontivo` if present
        if let Ok(home) = env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
            let legacy_dl = PathBuf::from(home).join("Downloads").join("Fontivo");
            if legacy_dl.exists() && legacy_dl.is_dir() {
                let is_empty = fs::read_dir(&legacy_dl)
                    .map(|mut it| it.next().is_none())
                    .unwrap_or(false);
                if is_empty {
                    let _ = fs::remove_dir(&legacy_dl);
                }
            }
        }

        // Lightweight Roaming `%APPDATA%\Fontivo\preferences.json` anchor (skipped during isolated tests)
        if let Some(roaming) = crate::engine::lifecycle::get_legacy_roaming_app_data_dir() {
            if fs::create_dir_all(&roaming).is_ok() {
                let prefs_path = roaming.join("preferences.json");
                let prefs = serde_json::json!({
                    "app": "Fontivo",
                    "localDataDir": self.data_dir.to_string_lossy(),
                    "updatesDir": self.data_dir.join("Updates").to_string_lossy(),
                    "fontsDir": fonts_root.to_string_lossy(),
                    "backupsDir": self.data_dir.join("Backups").to_string_lossy(),
                    "downloadsDir": self.data_dir.join("Downloads").to_string_lossy(),
                });
                if let Ok(json) = serde_json::to_string_pretty(&prefs) {
                    let _ = fs::write(prefs_path, json);
                }
            }
        }

        // Best-effort `%PROGRAMDATA%\Fontivo\runtime-paths.json` when writable (Admin / All-Users setup)
        #[cfg(windows)]
        if env::var("FONTIVO_DATA_DIR")
            .map(|v| v.trim().is_empty())
            .unwrap_or(true)
        {
            if let Ok(pd) = env::var("PROGRAMDATA") {
                if !pd.trim().is_empty() {
                    let pd_dir = PathBuf::from(pd).join("Fontivo");
                    if fs::create_dir_all(&pd_dir).is_ok() {
                        let meta_path = pd_dir.join("runtime-paths.json");
                        let meta = serde_json::json!({
                            "app": "Fontivo",
                            "version": crate::updater::AutoUpdater::CURRENT_VERSION,
                            "localDataDir": self.data_dir.to_string_lossy(),
                        });
                        if let Ok(json) = serde_json::to_string_pretty(&meta) {
                            let _ = fs::write(meta_path, json);
                        }
                    }
                }
            }
        }
    }

    pub fn load_state(&mut self) {
        self.migrate_legacy_storage();

        let mut loaded_fonts: Vec<FontRecord> = Vec::new();
        let mut seen_paths: HashSet<String> = HashSet::new();

        // 1. Optional user/test `fonts-cache.json` in data_dir (never required!)
        if let Some(cache_path) = self.find_optional_cache_file() {
            if let Ok(cache_str) = fs::read_to_string(&cache_path) {
                let clean_str = cache_str.trim_start_matches('\u{feff}').trim();
                if let Ok(mut parsed) = serde_json::from_str::<Vec<FontRecord>>(clean_str) {
                    for f in &mut parsed {
                        f.is_local = Path::new(&f.path).exists();
                        f.has_western_numerals = true;
                        if !f.is_latin && !f.is_arabic && !f.category.contains("Symbols") {
                            f.is_latin = true;
                        }
                        f.is_bilingual = f.is_arabic && f.is_latin;
                        if f.weight == 0 {
                            f.weight = style_to_weight(f.style.as_deref());
                        }
                        f.source = classify_font_source(&f.path, f.sub_category.as_deref());
                        if f.source == "system" {
                            f.is_active = false;
                        }
                        if f.is_arabic || f.category.contains("Arabic") {
                            f.has_tashkeel = true;
                            f.has_extended_arabic = true;
                            f.has_arabic_numerals = true;
                        }
                        seen_paths.insert(normalize_font_path_key(&f.path));
                    }
                    loaded_fonts.extend(parsed);
                }
            }
        }

        // 2. Real Installed Windows System Fonts (C:\Windows\Fonts, HKLM & HKCU\...\Fonts)
        // Always tagged source = "system" and is_active = false (OS-installed, NEVER Fontivo RAM).
        let mut next_id = loaded_fonts.iter().map(|f| f.id).max().unwrap_or(0) + 1;
        let windows_fonts = crate::engine::health::SystemHealthChecker::enumerate_windows_fonts();
        for wf in windows_fonts {
            let font_path = Path::new(&wf.path);
            if !font_path.is_file() {
                continue;
            }
            let norm_key = normalize_font_path_key(&wf.path);
            if !seen_paths.insert(norm_key) {
                continue;
            }

            let fname = font_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(&wf.name)
                .to_string();
            let ext = font_path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("ttf")
                .to_uppercase();
            let size = if wf.size > 0 {
                wf.size
            } else {
                fs::metadata(font_path)
                    .map(|m| m.len() as usize)
                    .unwrap_or(0)
            };

            let meta = FontParser::parse_file(font_path).ok();
            let is_symbol = is_symbol_font_name(&wf.name) || is_symbol_font_name(&wf.family);
            let is_arabic = !is_symbol
                && meta
                    .as_ref()
                    .map(|m| {
                        m.coverage.supports_arabic
                            || m.family.to_ascii_lowercase().contains("arabic")
                            || m.full_name.to_ascii_lowercase().contains("arabic")
                    })
                    .unwrap_or_else(|| wf.name.to_ascii_lowercase().contains("arabic"));
            let is_latin = !is_symbol
                && meta
                    .as_ref()
                    .map(|m| m.coverage.supports_latin)
                    .unwrap_or(!is_arabic);
            let is_bilingual = is_arabic && is_latin;
            let is_variable = meta.as_ref().map(|m| m.is_variable).unwrap_or(false);
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
            let family = meta
                .as_ref()
                .map(|m| m.family.clone())
                .filter(|s| !s.trim().is_empty())
                .or_else(|| Some(wf.family.clone()));
            let display_name = meta
                .as_ref()
                .map(|m| m.full_name.clone())
                .filter(|s| !s.trim().is_empty())
                .or_else(|| Some(wf.name.clone()));
            let style = meta
                .as_ref()
                .map(|m| m.subfamily.clone())
                .filter(|s| !s.trim().is_empty())
                .or_else(|| Some("Regular".to_string()));
            let weight = meta
                .as_ref()
                .map(|m| m.weight_class)
                .filter(|&w| w > 0)
                .unwrap_or_else(|| style_to_weight(style.as_deref()));
            let post_script_name = meta
                .as_ref()
                .map(|m| m.postscript_name.clone())
                .filter(|s| !s.trim().is_empty());
            let glyph_count = meta.as_ref().map(|m| m.glyph_count as usize);

            let category = if is_symbol {
                "03 - Symbols and Dingbats".to_string()
            } else if is_arabic {
                "01 - Arabic Fonts".to_string()
            } else {
                "02 - English Fonts".to_string()
            };

            loaded_fonts.push(FontRecord {
                id: next_id,
                name: fname,
                path: wf.path,
                category,
                sub_category: Some("Windows System Fonts".to_string()),
                family,
                format: ext,
                size,
                is_arabic,
                is_latin,
                is_bilingual,
                is_variable,
                weight,
                source: "system".to_string(),
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
            next_id += 1;
        }

        // 3. Load cached user library index from `%LOCALAPPDATA%\Fontivo\user-library-index.json`
        // (only real files still on disk; never duplicates Windows system fonts)
        let user_index_path = self.get_user_library_index_path();
        let mut index_needs_resave = false;
        if user_index_path.exists() {
            if let Ok(content) = fs::read_to_string(&user_index_path) {
                if let Ok(cached_user_fonts) = serde_json::from_str::<Vec<FontRecord>>(&content) {
                    for mut uf in cached_user_fonts {
                        if let Some(resolved) = self.resolve_migrated_font_path(&uf.path) {
                            let resolved_str = resolved.to_string_lossy().to_string();
                            if !resolved_str.eq_ignore_ascii_case(&uf.path) {
                                uf.path = resolved_str;
                                index_needs_resave = true;
                            }
                            let norm_key = normalize_font_path_key(&uf.path);
                            if seen_paths.insert(norm_key) {
                                uf.id = next_id;
                                uf.is_local = true;
                                if uf.weight == 0 {
                                    uf.weight = style_to_weight(uf.style.as_deref());
                                }
                                uf.source =
                                    classify_font_source(&uf.path, uf.sub_category.as_deref());
                                if uf.source == "system" {
                                    uf.is_active = false;
                                }
                                if !uf.is_latin && !uf.is_arabic && !uf.category.contains("Symbols")
                                {
                                    uf.is_latin = true;
                                }
                                uf.is_bilingual = uf.is_arabic && uf.is_latin;
                                next_id += 1;
                                loaded_fonts.push(uf);
                            } else {
                                index_needs_resave = true;
                            }
                        } else {
                            index_needs_resave = true;
                        }
                    }
                }
            }
        }

        // 4. Dynamically scan real Fontivo directories that already exist on disk
        let fonts_root = self.data_dir.join("Fonts");
        let mut scan_dirs: Vec<PathBuf> = vec![
            LibraryStorageManager::get_google_dir(),
            LibraryStorageManager::get_extracted_dir(),
            fonts_root.join("Custom"),
            fonts_root,
            LibraryStorageManager::get_storage_dir(),
        ];
        // Deduplicate scan dirs case-insensitively
        let mut seen_dirs = HashSet::new();
        scan_dirs.retain(|d| seen_dirs.insert(normalize_font_path_key(&d.to_string_lossy())));

        let mut newly_discovered = false;

        for dir in scan_dirs {
            if !dir.exists() || !dir.is_dir() {
                continue;
            }
            if let Ok(files) = crate::server::routes::common::walk_fonts_in_dir(&dir) {
                for font_path in files {
                    let path_str = font_path.to_string_lossy().to_string();
                    let norm_key = normalize_font_path_key(&path_str);
                    if !seen_paths.insert(norm_key) {
                        continue;
                    }

                    let fname = font_path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("font.ttf")
                        .to_string();
                    let stem = font_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .replace('_', " ");

                    let ext = font_path
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("ttf")
                        .to_uppercase();
                    let size = fs::metadata(&font_path)
                        .map(|m| m.len() as usize)
                        .unwrap_or(0);
                    let meta = FontParser::parse_file(&font_path).ok();
                    let is_arabic = meta
                        .as_ref()
                        .map(|m| {
                            m.coverage.supports_arabic || m.family.to_lowercase().contains("arabic")
                        })
                        .unwrap_or(false);
                    let is_latin = meta
                        .as_ref()
                        .map(|m| m.coverage.supports_latin)
                        .unwrap_or(!is_arabic);
                    let is_bilingual = is_arabic && is_latin;
                    let is_variable = meta.as_ref().map(|m| m.is_variable).unwrap_or(false);
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
                    let family = meta
                        .as_ref()
                        .map(|m| m.family.clone())
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| Some(stem.clone()));
                    let display_name = meta
                        .as_ref()
                        .map(|m| m.full_name.clone())
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| Some(stem.clone()));
                    let style = meta
                        .as_ref()
                        .map(|m| m.subfamily.clone())
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| Some("Regular".to_string()));
                    let weight = meta
                        .as_ref()
                        .map(|m| m.weight_class)
                        .filter(|&w| w > 0)
                        .unwrap_or_else(|| style_to_weight(style.as_deref()));
                    let post_script_name = meta.as_ref().map(|m| m.postscript_name.clone());
                    let glyph_count = meta.as_ref().map(|m| m.glyph_count as usize);

                    let path_low = path_str.replace('/', "\\").to_ascii_lowercase();
                    let sub_cat = if path_low.contains("\\fonts\\google\\")
                        || path_low.contains("\\googlefonts\\")
                        || path_low.contains("\\google_fonts\\")
                    {
                        "Google Fonts".to_string()
                    } else if path_low.contains("\\fonts\\packs\\")
                        || path_low.contains("\\extracted\\")
                    {
                        "Fontivo Cloud Pack".to_string()
                    } else if let Some(imp_idx) = path_low.find("\\fonts\\imported\\") {
                        let norm_orig = path_str.replace('/', "\\");
                        let after = &norm_orig[imp_idx + "\\fonts\\imported\\".len()..];
                        let folder_seg = after
                            .split('\\')
                            .next()
                            .filter(|s| !s.trim().is_empty())
                            .unwrap_or("Imported");
                        format!("Imported · {}", folder_seg)
                    } else if path_low.contains("\\fonts\\custom\\")
                        || path_low.contains("\\customfonts\\")
                    {
                        "Custom Fonts".to_string()
                    } else {
                        "Local Library".to_string()
                    };
                    let source = classify_font_source(&path_str, Some(&sub_cat));

                    loaded_fonts.push(FontRecord {
                        id: next_id,
                        name: fname,
                        path: path_str,
                        category: if is_arabic {
                            "01 - Arabic Fonts".to_string()
                        } else {
                            "02 - English Fonts".to_string()
                        },
                        sub_category: Some(sub_cat),
                        family,
                        format: ext,
                        size,
                        is_arabic,
                        is_latin,
                        is_bilingual,
                        is_variable,
                        weight,
                        source,
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
                    next_id += 1;
                    newly_discovered = true;
                }
            }
        }

        self.fonts = loaded_fonts;
        if newly_discovered || index_needs_resave {
            self.save_user_library_index();
        }

        // Load favorites
        let fav_file = self.data_dir.join("favorites.json");
        if let Ok(content) = fs::read_to_string(&fav_file) {
            if let Ok(favs) = serde_json::from_str::<HashSet<usize>>(&content) {
                self.favorite_font_ids = favs;
            }
        }

        // Load active fonts and reconcile with operating system font table
        // CRITICAL: Windows system fonts (source == "system") are OS-installed and NEVER active in Fontivo RAM!
        let active_file = self.data_dir.join("active-fonts.json");
        let mut verified_active_ids = HashSet::new();
        if let Ok(content) = fs::read_to_string(&active_file) {
            if let Ok(actives) = serde_json::from_str::<HashSet<usize>>(&content) {
                for font in &mut self.fonts {
                    if font.source != "system"
                        && actives.contains(&font.id)
                        && Path::new(&font.path).exists()
                    {
                        if self.activator.activate_ram(&font.path).is_ok() {
                            font.is_active = true;
                            verified_active_ids.insert(font.id);
                        } else {
                            font.is_active = false;
                        }
                    } else {
                        font.is_active = false;
                    }
                }
            }
        }
        self.active_font_ids = verified_active_ids;
        self.save_active_fonts();

        // Load collections
        let col_file = self.data_dir.join("collections.json");
        if let Ok(content) = fs::read_to_string(&col_file) {
            if let Ok(cols) = serde_json::from_str::<HashMap<String, Vec<usize>>>(&content) {
                self.collections = cols;
            }
        }
        if self.collections.is_empty() {
            self.collections
                .insert("Branding & Identity".to_string(), vec![]);
            self.collections
                .insert("Headlines & Posters".to_string(), vec![]);
            self.collections
                .insert("Web & UI Typography".to_string(), vec![]);
            self.collections
                .insert("Calligraphy & Scripts".to_string(), vec![]);
            self.save_collections();
        }

        // Load Brand Kits
        let brand_file = self.data_dir.join("brand-kits.json");
        if let Ok(content) = fs::read_to_string(&brand_file) {
            if let Ok(kits) = serde_json::from_str::<Vec<BrandKit>>(&content) {
                self.brand_kits = kits;
            }
        }
        if self.brand_kits.is_empty() {
            let cairo = self.fonts.iter().find(|f| {
                f.family.as_deref().unwrap_or("").contains("Cairo") || f.name.contains("Cairo")
            });
            let inter = self.fonts.iter().find(|f| {
                f.family.as_deref().unwrap_or("").contains("Inter")
                    || f.name.contains("Inter")
                    || f.name.contains("Roboto")
            });
            let amiri = self.fonts.iter().find(|f| {
                f.family.as_deref().unwrap_or("").contains("Amiri") || f.name.contains("Amiri")
            });

            self.brand_kits = vec![
                BrandKit {
                    id: "bk-fintech".to_string(),
                    name: "Fintech & Mobile Banking App".to_string(),
                    client: Some("FinPay Digital Bank".to_string()),
                    heading_font_id: cairo.map(|f| f.id),
                    heading_font_name: cairo
                        .map(|f| f.family.clone().unwrap_or_else(|| f.name.clone()))
                        .or_else(|| Some("Cairo".to_string())),
                    body_font_id: inter.map(|f| f.id),
                    body_font_name: inter
                        .map(|f| f.family.clone().unwrap_or_else(|| f.name.clone()))
                        .or_else(|| Some("Inter".to_string())),
                    accent_font_id: None,
                    accent_font_name: None,
                    colors: vec![
                        BrandColor {
                            name: "Primary Blue".to_string(),
                            hex: "#2563eb".to_string(),
                            role: "primary".to_string(),
                        },
                        BrandColor {
                            name: "Deep Slate".to_string(),
                            hex: "#0f172a".to_string(),
                            role: "text".to_string(),
                        },
                        BrandColor {
                            name: "Teal Accent".to_string(),
                            hex: "#0d9488".to_string(),
                            role: "accent".to_string(),
                        },
                        BrandColor {
                            name: "Success Green".to_string(),
                            hex: "#10b981".to_string(),
                            role: "secondary".to_string(),
                        },
                        BrandColor {
                            name: "Soft Light".to_string(),
                            hex: "#f8fafc".to_string(),
                            role: "background".to_string(),
                        },
                    ],
                    notes: Some(
                        "Modern bilingual branding for high-trust financial interfaces."
                            .to_string(),
                    ),
                    updated_at: 1731580000,
                },
                BrandKit {
                    id: "bk-luxury-heritage".to_string(),
                    name: "Royal Heritage Coffee & Roastery".to_string(),
                    client: Some("Dar Al-Qahwa".to_string()),
                    heading_font_id: amiri.map(|f| f.id),
                    heading_font_name: amiri
                        .map(|f| f.family.clone().unwrap_or_else(|| f.name.clone()))
                        .or_else(|| Some("Amiri".to_string())),
                    body_font_id: cairo.map(|f| f.id),
                    body_font_name: cairo
                        .map(|f| f.family.clone().unwrap_or_else(|| f.name.clone()))
                        .or_else(|| Some("Cairo".to_string())),
                    accent_font_id: None,
                    accent_font_name: None,
                    colors: vec![
                        BrandColor {
                            name: "Imperial Emerald".to_string(),
                            hex: "#064e3b".to_string(),
                            role: "primary".to_string(),
                        },
                        BrandColor {
                            name: "Warm Gold".to_string(),
                            hex: "#d97706".to_string(),
                            role: "accent".to_string(),
                        },
                        BrandColor {
                            name: "Charcoal Dark".to_string(),
                            hex: "#1c1917".to_string(),
                            role: "text".to_string(),
                        },
                        BrandColor {
                            name: "Desert Sand".to_string(),
                            hex: "#fef3c7".to_string(),
                            role: "secondary".to_string(),
                        },
                        BrandColor {
                            name: "Off White".to_string(),
                            hex: "#fafaf9".to_string(),
                            role: "background".to_string(),
                        },
                    ],
                    notes: Some(
                        "Authentic Arabic calligraphy identity with warm golden tones.".to_string(),
                    ),
                    updated_at: 1731580000,
                },
            ];
            self.save_brand_kits();
        }

        // Sync statuses
        for f in &mut self.fonts {
            f.is_active = self.active_font_ids.contains(&f.id);
            f.is_favorite = self.favorite_font_ids.contains(&f.id);
        }
    }

    /// Persists locally downloaded/custom fonts to `%LOCALAPPDATA%\Fontivo\user-library-index.json`
    /// using fast compact JSON (excluding OS-installed Windows system fonts).
    pub fn save_user_library_index(&self) {
        let local_fonts: Vec<&FontRecord> = self
            .fonts
            .iter()
            .filter(|f| f.is_local && f.source != "system" && Path::new(&f.path).exists())
            .collect();
        let index_path = self.get_user_library_index_path();
        if let Ok(json) = serde_json::to_string(&local_fonts) {
            let _ = fs::write(&index_path, json);
        }
    }

    fn remove_managed_font_file(&self, path_str: &str) {
        let file_path = Path::new(path_str);
        if file_path.exists() && file_path.is_file() {
            if let Ok(canon_file) = file_path.canonicalize() {
                let allowed_roots = [
                    self.get_local_fontivo_dir(),
                    self.data_dir.clone(),
                    LibraryStorageManager::get_storage_dir(),
                    GoogleFontsManager::get_storage_dir(),
                    LibraryStorageManager::get_extracted_dir(),
                ];
                let boundary_roots = [
                    self.data_dir.join("Fonts").join("Google"),
                    self.data_dir.join("Fonts").join("Packs"),
                    self.data_dir.join("Fonts").join("Custom"),
                    self.data_dir.join("Fonts").join("Imported"),
                    self.data_dir.join("Fonts"),
                    self.data_dir.clone(),
                    LibraryStorageManager::get_storage_dir(),
                    LibraryStorageManager::get_google_dir(),
                    LibraryStorageManager::get_extracted_dir(),
                    LibraryStorageManager::get_custom_dir(),
                    LibraryStorageManager::get_imported_dir(),
                ];
                let is_managed = allowed_roots.iter().any(|root| {
                    root.canonicalize()
                        .map(|c| canon_file.starts_with(c))
                        .unwrap_or(false)
                });
                if is_managed && fs::remove_file(&canon_file).is_ok() {
                    Self::prune_empty_parent_dirs(&canon_file, &boundary_roots);
                }
            }
        }
    }

    /// Removes/deletes a single custom or downloaded font from the library, RAM, favorites, collections, and managed disk storage.
    pub fn delete_library_font(
        &mut self,
        id: Option<usize>,
        path: Option<&str>,
    ) -> Result<FontRecord, String> {
        let pos = self
            .fonts
            .iter()
            .position(|f| {
                if let Some(target_id) = id {
                    if f.id == target_id {
                        return true;
                    }
                }
                if let Some(target_path) = path {
                    if !target_path.trim().is_empty()
                        && f.path.eq_ignore_ascii_case(target_path.trim())
                    {
                        return true;
                    }
                }
                false
            })
            .ok_or_else(|| "Font not found in library".to_string())?;

        let removed = self.fonts.remove(pos);

        if self.active_font_ids.remove(&removed.id) || removed.is_active {
            let _ = self.activator.deactivate_ram(&removed.path);
            self.save_active_fonts();
        }
        if self.favorite_font_ids.remove(&removed.id) {
            self.save_favorites();
        }
        let mut col_changed = false;
        for ids in self.collections.values_mut() {
            let before = ids.len();
            ids.retain(|&fid| fid != removed.id);
            if ids.len() != before {
                col_changed = true;
            }
        }
        if col_changed {
            self.save_collections();
        }

        self.remove_managed_font_file(&removed.path);
        self.save_user_library_index();
        Ok(removed)
    }

    /// Deletes an entire non-system font family (all weights/styles) from memory, RAM activation,
    /// favorites, collections, user index, and Fontivo-managed storage folders (pruning empty family folders).
    pub fn delete_library_family(&mut self, family_name: &str) -> Result<Vec<FontRecord>, String> {
        let clean = family_name.trim();
        if clean.is_empty() {
            return Err("Family name cannot be empty".to_string());
        }

        let mut removed_list = Vec::new();
        let mut i = 0;
        while i < self.fonts.len() {
            let matches_family = self.fonts[i]
                .family
                .as_deref()
                .map(|fam| fam.eq_ignore_ascii_case(clean))
                .unwrap_or(false)
                || self.fonts[i].name.eq_ignore_ascii_case(clean);

            if matches_family && !self.fonts[i].source.eq_ignore_ascii_case("system") {
                removed_list.push(self.fonts.remove(i));
            } else {
                i += 1;
            }
        }

        if removed_list.is_empty() {
            return Err(format!(
                "No removable local fonts found for family '{}'",
                clean
            ));
        }

        let mut active_changed = false;
        let mut fav_changed = false;
        let removed_ids: HashSet<usize> = removed_list.iter().map(|f| f.id).collect();

        for removed in &removed_list {
            if self.active_font_ids.remove(&removed.id) || removed.is_active {
                let _ = self.activator.deactivate_ram(&removed.path);
                active_changed = true;
            }
            if self.favorite_font_ids.remove(&removed.id) {
                fav_changed = true;
            }
            self.remove_managed_font_file(&removed.path);
        }

        let mut col_changed = false;
        for ids in self.collections.values_mut() {
            let before = ids.len();
            ids.retain(|fid| !removed_ids.contains(fid));
            if ids.len() != before {
                col_changed = true;
            }
        }

        if active_changed {
            self.save_active_fonts();
        }
        if fav_changed {
            self.save_favorites();
        }
        if col_changed {
            self.save_collections();
        }
        self.save_user_library_index();

        Ok(removed_list)
    }

    /// Safely deletes a Fontivo-managed font folder (`Fonts/Custom`, `Fonts/Imported/<Folder>`,
    /// `Fonts/Packs/<Pack>`, `Fonts/Google`) from RAM activation, state, collections, index, and disk.
    /// Rejects system directories, `Fonts/` root itself, and top-level `Imported`/`Packs` containers.
    pub fn delete_library_folder(
        &mut self,
        folder_path: &str,
    ) -> Result<(String, Vec<FontRecord>), (u16, String)> {
        let raw = folder_path.trim();
        if raw.is_empty() || raw.contains("..") || raw.contains('\0') {
            return Err((
                400,
                "Invalid folderPath: empty or contains forbidden traversal characters".to_string(),
            ));
        }

        let low_raw = raw.replace('/', "\\").to_ascii_lowercase();
        if low_raw.contains("\\windows\\fonts")
            || low_raw.contains("\\microsoft\\windows\\fonts")
            || low_raw.starts_with("c:\\windows")
            || low_raw.starts_with("c:\\program files")
            || low_raw.starts_with("/etc")
            || low_raw.starts_with("/bin")
            || low_raw.starts_with("/usr")
            || low_raw.starts_with("/var")
            || low_raw.starts_with("/system")
            || low_raw.starts_with("/library")
        {
            return Err((
                400,
                "Security violation: deleting OS or system font directories is strictly forbidden"
                    .to_string(),
            ));
        }

        let managed_fonts_dir = self.data_dir.join("Fonts");
        let storage_fonts_dir = LibraryStorageManager::get_storage_dir();
        let data_extracted_dir = self.data_dir.join("Extracted");
        let app_extracted_dir = crate::engine::lifecycle::get_app_data_dir().join("Extracted");
        let candidate = if Path::new(raw).is_absolute() {
            PathBuf::from(raw)
        } else {
            if raw.contains(':') {
                return Err((
                    400,
                    "Security violation: invalid drive prefix in relative folderPath".to_string(),
                ));
            }
            let norm = raw.replace('\\', "/");
            let trimmed = norm.trim_matches('/');
            let low_trimmed = trimmed.to_ascii_lowercase();
            let is_extracted_rel =
                low_trimmed == "extracted" || low_trimmed.starts_with("extracted/");
            if is_extracted_rel {
                let rel_under_extracted = trimmed
                    .get("extracted".len()..)
                    .unwrap_or("")
                    .trim_start_matches('/');
                if rel_under_extracted.is_empty() {
                    return Err((
                        400,
                        "Security violation: cannot delete container 'Extracted'; specify a specific pack subfolder"
                            .to_string(),
                    ));
                }
                let mut p = data_extracted_dir.clone();
                let mut alt_p = app_extracted_dir.clone();
                for seg in rel_under_extracted.split('/').filter(|s| !s.is_empty()) {
                    if seg == "." || seg == ".." {
                        return Err((400, "Invalid path segment in folderPath".to_string()));
                    }
                    p = p.join(seg);
                    alt_p = alt_p.join(seg);
                }
                if !p.exists() && alt_p.exists() {
                    alt_p
                } else {
                    p
                }
            } else {
                let rel_under_fonts = if low_trimmed == "fonts" {
                    ""
                } else if low_trimmed.starts_with("fonts/") {
                    &trimmed[6..]
                } else {
                    trimmed
                };
                if rel_under_fonts.is_empty() {
                    return Err((
                        400,
                        "Security violation: cannot delete Fontivo Fonts root directory"
                            .to_string(),
                    ));
                }
                let mut p = managed_fonts_dir.clone();
                let mut alt_p = storage_fonts_dir.clone();
                for seg in rel_under_fonts.split('/').filter(|s| !s.is_empty()) {
                    if seg == "." || seg == ".." {
                        return Err((400, "Invalid path segment in folderPath".to_string()));
                    }
                    p = p.join(seg);
                    alt_p = alt_p.join(seg);
                }
                if !p.exists() && alt_p.exists() {
                    alt_p
                } else {
                    p
                }
            }
        };

        let validate_rel_segments = |segs: &[String], is_extracted_root: bool| -> Result<(), (u16, String)> {
            if segs.is_empty() {
                return Err((
                    400,
                    if is_extracted_root {
                        "Security violation: cannot delete container 'Extracted'; specify a specific pack subfolder"
                            .to_string()
                    } else {
                        "Security violation: cannot delete Fontivo Fonts root directory".to_string()
                    },
                ));
            }
            if is_extracted_root {
                return Ok(());
            }
            let first = segs[0].to_ascii_lowercase();
            match first.as_str() {
                "custom" | "google" => Ok(()),
                "imported" | "packs" => {
                    if segs.len() < 2 {
                        Err((
                            400,
                            format!(
                                "Security violation: cannot delete container '{}'; specify a specific subfolder",
                                segs[0]
                            ),
                        ))
                    } else {
                        Ok(())
                    }
                }
                _ => Err((
                    400,
                    "Security violation: folderPath must reside under Fonts/Custom, Fonts/Imported/<Folder>, Fonts/Packs/<Pack>, or Fonts/Google"
                        .to_string(),
                )),
            }
        };

        let mut allowed_roots: Vec<(PathBuf, bool)> = vec![(managed_fonts_dir.clone(), false)];
        let push_root_if_unique = |roots: &mut Vec<(PathBuf, bool)>, p: PathBuf, is_ext: bool| {
            let pk = normalize_font_path_key(&p.to_string_lossy());
            if !roots
                .iter()
                .any(|(existing, _)| normalize_font_path_key(&existing.to_string_lossy()) == pk)
            {
                roots.push((p, is_ext));
            }
        };
        push_root_if_unique(&mut allowed_roots, storage_fonts_dir.clone(), false);
        push_root_if_unique(&mut allowed_roots, data_extracted_dir.clone(), true);
        push_root_if_unique(&mut allowed_roots, app_extracted_dir.clone(), true);

        let mut match_keys: Vec<String> = Vec::new();
        let raw_norm_key = normalize_font_path_key(&candidate.to_string_lossy())
            .trim_end_matches('\\')
            .to_string();
        if !raw_norm_key.is_empty() {
            match_keys.push(raw_norm_key.clone());
        }

        let mut canon_target_to_delete: Option<PathBuf> = None;
        let clean_display_path: String;

        if candidate.exists() {
            if !candidate.is_dir() {
                return Err((400, "Target folderPath is not a directory".to_string()));
            }
            let canon_target = candidate.canonicalize().map_err(|e| {
                (
                    400,
                    format!("Failed to resolve target folderPath: {}", e),
                )
            })?;

            let mut matched_root = false;
            for (root, is_ext) in &allowed_roots {
                if let Ok(canon_root) = root.canonicalize() {
                    if canon_target.starts_with(&canon_root) {
                        let rel = canon_target.strip_prefix(&canon_root).map_err(|_| {
                            (400, "Failed to validate relative folder path".to_string())
                        })?;
                        let segs: Vec<String> = rel
                            .components()
                            .filter_map(|c| match c {
                                std::path::Component::Normal(s) => {
                                    Some(s.to_string_lossy().to_string())
                                }
                                _ => None,
                            })
                            .collect();
                        validate_rel_segments(&segs, *is_ext)?;
                        matched_root = true;
                        break;
                    }
                }
            }

            if !matched_root {
                return Err((
                    400,
                    "Security violation: folderPath is outside Fontivo managed Fonts directories"
                        .to_string(),
                ));
            }

            let canon_key = normalize_font_path_key(&canon_target.to_string_lossy())
                .trim_end_matches('\\')
                .to_string();
            if !canon_key.is_empty() && !match_keys.contains(&canon_key) {
                match_keys.push(canon_key);
            }
            clean_display_path = strip_windows_verbatim_prefix(&canon_target)
                .to_string_lossy()
                .to_string();
            canon_target_to_delete = Some(canon_target);
        } else {
            // Even when absent on disk, enforce strict managed-root containment before any state purge
            let mut matched_root = false;
            for (root, is_ext) in &allowed_roots {
                let root_key = normalize_font_path_key(&root.to_string_lossy())
                    .trim_end_matches('\\')
                    .to_string();
                let root_prefix = format!("{}\\", root_key);
                if raw_norm_key == root_key {
                    return Err((
                        400,
                        if *is_ext {
                            "Security violation: cannot delete container 'Extracted'; specify a specific pack subfolder"
                                .to_string()
                        } else {
                            "Security violation: cannot delete Fontivo Fonts root directory"
                                .to_string()
                        },
                    ));
                }
                if let Some(rel_part) = raw_norm_key.strip_prefix(&root_prefix) {
                    let segs: Vec<String> = rel_part
                        .split('\\')
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .collect();
                    validate_rel_segments(&segs, *is_ext)?;
                    matched_root = true;
                    break;
                }
            }
            if !matched_root {
                return Err((
                    400,
                    "Security violation: folderPath is outside Fontivo managed Fonts directories"
                        .to_string(),
                ));
            }
            clean_display_path = strip_windows_verbatim_prefix(&candidate)
                .to_string_lossy()
                .to_string();
        }

        let matches_target = |f: &FontRecord| -> bool {
            if classify_font_bucket(f) == "system" {
                return false;
            }
            let fk = normalize_font_path_key(&f.path);
            if match_keys
                .iter()
                .any(|k| fk == *k || fk.starts_with(&format!("{}\\", k)))
            {
                return true;
            }
            if let Ok(canon_f) = Path::new(&f.path).canonicalize() {
                let cfk = normalize_font_path_key(&canon_f.to_string_lossy());
                return match_keys
                    .iter()
                    .any(|k| cfk == *k || cfk.starts_with(&format!("{}\\", k)));
            }
            false
        };

        let matched_ids: HashSet<usize> = self
            .fonts
            .iter()
            .filter(|f| matches_target(f))
            .map(|f| f.id)
            .collect();
        if canon_target_to_delete.is_none() && matched_ids.is_empty() {
            return Err((404, "Font folder not found".to_string()));
        }

        // 1. Deactivate matching fonts in RAM first so OS releases open file handles before rmdir
        let mut active_changed = false;
        for f in &self.fonts {
            if matched_ids.contains(&f.id) && (self.active_font_ids.contains(&f.id) || f.is_active)
            {
                let _ = self.activator.deactivate_ram(&f.path);
                let usable = AppState::resolve_usable_font_path(&f.path);
                if usable != Path::new(&f.path) {
                    let _ = self.activator.deactivate_ram(&usable.to_string_lossy());
                }
            }
        }

        // 2. Delete directory cleanly from disk
        if let Some(canon_dir) = canon_target_to_delete {
            fs::remove_dir_all(&canon_dir).map_err(|e| {
                (
                    500,
                    format!("Failed to delete font folder from disk: {}", e),
                )
            })?;
        }

        // 3. Remove matching FontRecord entries and update state/favorites/collections/index
        let mut removed_list = Vec::new();
        let mut i = 0;
        while i < self.fonts.len() {
            if matched_ids.contains(&self.fonts[i].id) {
                removed_list.push(self.fonts.remove(i));
            } else {
                i += 1;
            }
        }

        let mut fav_changed = false;
        let removed_ids: HashSet<usize> = removed_list.iter().map(|f| f.id).collect();
        for f in &removed_list {
            if self.active_font_ids.remove(&f.id) || f.is_active {
                active_changed = true;
            }
            if self.favorite_font_ids.remove(&f.id) {
                fav_changed = true;
            }
        }

        let mut col_changed = false;
        for ids in self.collections.values_mut() {
            let before = ids.len();
            ids.retain(|fid| !removed_ids.contains(fid));
            if ids.len() != before {
                col_changed = true;
            }
        }

        if active_changed {
            self.save_active_fonts();
        }
        if fav_changed {
            self.save_favorites();
        }
        if col_changed {
            self.save_collections();
        }
        self.save_user_library_index();

        Ok((clean_display_path, removed_list))
    }

    /// Safely renames a direct subfolder under `%LOCALAPPDATA%\Fontivo\Fonts\Imported\`,
    /// updating all indexed font paths, sub_category labels, collections, and persisting the index.
    /// Returns `(old_clean_path, new_clean_path, old_name, new_name, updated_count)`.
    pub fn rename_imported_folder(
        &mut self,
        old_path: &str,
        new_name: &str,
    ) -> Result<(String, String, String, String, usize), (u16, String)> {
        let raw_old = old_path.trim();
        let raw_new = new_name.trim();

        if raw_old.is_empty() || raw_old.contains("..") || raw_old.contains('\0') {
            return Err((
                400,
                "Invalid oldPath: empty or contains forbidden traversal characters".to_string(),
            ));
        }

        if raw_new.is_empty()
            || raw_new.len() > 64
            || raw_new.contains("..")
            || raw_new.contains('/')
            || raw_new.contains('\\')
            || raw_new.contains('\0')
            || raw_new
                .chars()
                .any(|c| matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control())
        {
            return Err((
                400,
                "Invalid newName: must be 1-64 safe characters without path separators or traversal"
                    .to_string(),
            ));
        }

        let trimmed_new = raw_new.trim().trim_matches('.').trim();
        if trimmed_new.is_empty() {
            return Err((400, "Invalid newName: cannot be empty or dots only".to_string()));
        }

        let upper = trimmed_new.to_ascii_uppercase();
        let base_upper = upper.split('.').next().unwrap_or(&upper);
        const RESERVED: &[&str] = &[
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
            "LPT9",
        ];
        if RESERVED.contains(&base_upper) {
            return Err((
                400,
                format!("Invalid newName: '{}' is a reserved OS device name", trimmed_new),
            ));
        }

        let imported_root = self.get_imported_fonts_dir();
        let canon_imported_root = imported_root.canonicalize().map_err(|e| {
            (
                500,
                format!("Failed to resolve Imported fonts root: {}", e),
            )
        })?;

        let candidate = if Path::new(raw_old).is_absolute() {
            PathBuf::from(raw_old)
        } else {
            if raw_old.contains(':') {
                return Err((
                    400,
                    "Security violation: invalid drive prefix in relative oldPath".to_string(),
                ));
            }
            let norm = raw_old.replace('\\', "/");
            let trimmed = norm.trim_matches('/');
            let low = trimmed.to_ascii_lowercase();
            let rel = if low.starts_with("fonts/imported/") {
                &trimmed["fonts/imported/".len()..]
            } else if low.starts_with("imported/") {
                &trimmed["imported/".len()..]
            } else {
                trimmed
            };
            if rel.is_empty() || rel.contains('/') {
                return Err((
                    400,
                    "Security violation: oldPath must be a direct subfolder under Fonts/Imported/"
                        .to_string(),
                ));
            }
            imported_root.join(rel)
        };

        if !candidate.exists() || !candidate.is_dir() {
            return Err((404, "Imported folder not found".to_string()));
        }

        let canon_old = candidate.canonicalize().map_err(|e| {
            (
                400,
                format!("Failed to resolve oldPath directory: {}", e),
            )
        })?;

        // Strictly enforce direct child of Fonts/Imported/
        if canon_old.parent() != Some(canon_imported_root.as_path()) {
            return Err((
                400,
                "Security violation: rename is strictly restricted to direct subfolders under Fonts/Imported/"
                    .to_string(),
            ));
        }

        let old_name = canon_old
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if old_name.is_empty() {
            return Err((400, "Could not determine existing folder name".to_string()));
        }

        let clean_old_path = strip_windows_verbatim_prefix(&canon_old);
        let new_dir_canon = canon_imported_root.join(trimmed_new);

        if old_name == trimmed_new {
            let clean_str = clean_old_path.to_string_lossy().to_string();
            return Ok((clean_str.clone(), clean_str, old_name.clone(), old_name, 0));
        }

        if new_dir_canon.exists() && !old_name.eq_ignore_ascii_case(trimmed_new) {
            return Err((
                409,
                format!(
                    "An Imported folder named '{}' already exists",
                    trimmed_new
                ),
            ));
        }

        // Build normalized old-directory prefixes (canonical, raw candidate, and non-canonical
        // imported_root/old_name) so Windows 8.3 short paths (e.g. RUNNER~1) match reliably.
        let mut old_keys: Vec<String> = Vec::new();
        for p in [
            clean_old_path.clone(),
            strip_windows_verbatim_prefix(&candidate),
            strip_windows_verbatim_prefix(&imported_root.join(&old_name)),
        ] {
            let k = normalize_font_path_key(&p.to_string_lossy())
                .trim_end_matches('\\')
                .to_string();
            if !k.is_empty() && !old_keys.contains(&k) {
                old_keys.push(k);
            }
        }
        let old_prefixes: Vec<String> = old_keys.iter().map(|k| format!("{}\\", k)).collect();

        // Deactivate any active RAM fonts inside old_dir before renaming so OS releases handles
        let mut reactivate_ids: Vec<usize> = Vec::new();
        for f in &self.fonts {
            let fk = normalize_font_path_key(&f.path);
            let matches_old = old_keys.iter().any(|k| fk == *k)
                || old_prefixes.iter().any(|p| fk.starts_with(p));
            if matches_old && (self.active_font_ids.contains(&f.id) || f.is_active) {
                let _ = self.activator.deactivate_ram(&f.path);
                reactivate_ids.push(f.id);
            }
        }

        // Perform atomic rename on disk
        fs::rename(&canon_old, &new_dir_canon).map_err(|e| {
            (
                500,
                format!("Failed to rename folder on disk: {}", e),
            )
        })?;

        let clean_new_dir = strip_windows_verbatim_prefix(
            &new_dir_canon
                .canonicalize()
                .unwrap_or_else(|_| new_dir_canon.clone()),
        );
        let clean_old_str = clean_old_path.to_string_lossy().to_string();
        let clean_new_str = clean_new_dir.to_string_lossy().to_string();

        // Update indexed font records whose paths reside inside old_dir
        let mut updated_count = 0usize;
        for f in &mut self.fonts {
            let fk = normalize_font_path_key(&f.path);
            if let Some(matched_prefix) = old_prefixes.iter().find(|p| fk.starts_with(p.as_str())) {
                let norm_orig = f.path.replace('/', "\\");
                let stripped_orig = norm_orig.strip_prefix(r"\\?\").unwrap_or(&norm_orig);
                let rel_tail = stripped_orig.get(matched_prefix.len()..).unwrap_or("");
                let mut rebuilt = clean_new_dir.clone();
                for seg in rel_tail.split('\\').filter(|s| !s.is_empty()) {
                    rebuilt = rebuilt.join(seg);
                }
                f.path = rebuilt.to_string_lossy().to_string();
                f.sub_category = Some(format!("Imported · {}", trimmed_new));
                updated_count += 1;
            }
        }

        // Re-activate fonts that were previously active in RAM at their new paths
        for id in reactivate_ids {
            if let Some(f) = self.fonts.iter().find(|x| x.id == id) {
                let _ = self.activator.activate_ram(&f.path);
            }
        }

        // Rename matching collection key cleanly
        if let Some(old_ids) = self.collections.remove(&old_name) {
            let entry = self
                .collections
                .entry(trimmed_new.to_string())
                .or_default();
            for id in old_ids {
                if !entry.contains(&id) {
                    entry.push(id);
                }
            }
            self.save_collections();
        }

        self.save_user_library_index();

        Ok((
            clean_old_str,
            clean_new_str,
            old_name,
            trimmed_new.to_string(),
            updated_count,
        ))
    }

    /// Detects whether a candidate font already exists in the library (Local, Google, Cloud Pack, or System)
    /// by exact normalized path, SHA-256 content hash (O(1) filtered by file size), or font identity metadata.
    pub fn find_duplicate_font(
        &self,
        candidate_path: Option<&Path>,
        candidate_bytes: Option<&[u8]>,
        file_name: &str,
        family: Option<&str>,
        style: Option<&str>,
        postscript_name: Option<&str>,
        file_size: usize,
    ) -> Option<DuplicateFontMatch> {
        let cand_path_key = candidate_path.map(|p| normalize_font_path_key(&p.to_string_lossy()));
        let mut cand_hash: Option<String> = None;

        let norm_family = family
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty());
        let norm_style = style
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty());
        let norm_ps = postscript_name
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty());
        let clean_fname = file_name.trim().to_ascii_lowercase();

        // 1. Exact normalized path check
        if let Some(ref pkey) = cand_path_key {
            if let Some(existing) = self
                .fonts
                .iter()
                .find(|f| normalize_font_path_key(&f.path) == *pkey)
            {
                return Some(DuplicateFontMatch {
                    file_name: file_name.to_string(),
                    family: existing
                        .family
                        .clone()
                        .unwrap_or_else(|| existing.name.clone()),
                    style: existing
                        .style
                        .clone()
                        .unwrap_or_else(|| "Regular".to_string()),
                    existing_id: existing.id,
                    existing_path: existing.path.clone(),
                    existing_source: existing.source.clone(),
                    match_reason: "path".to_string(),
                });
            }
        }

        // 2. Same byte-size SHA-256 hash check (only hashes files of matching size)
        if file_size > 0 {
            for existing in &self.fonts {
                if existing.size == file_size {
                    let ex_path = Path::new(&existing.path);
                    if !ex_path.is_file() {
                        continue;
                    }
                    if cand_hash.is_none() {
                        cand_hash = if let Some(b) = candidate_bytes {
                            Some(compute_bytes_sha256(b))
                        } else if let Some(cp) = candidate_path {
                            compute_file_sha256(cp)
                        } else {
                            None
                        };
                    }
                    if let Some(ref ch) = cand_hash {
                        if let Some(ref eh) = compute_file_sha256(ex_path) {
                            if ch == eh {
                                return Some(DuplicateFontMatch {
                                    file_name: file_name.to_string(),
                                    family: existing
                                        .family
                                        .clone()
                                        .unwrap_or_else(|| existing.name.clone()),
                                    style: existing
                                        .style
                                        .clone()
                                        .unwrap_or_else(|| "Regular".to_string()),
                                    existing_id: existing.id,
                                    existing_path: existing.path.clone(),
                                    existing_source: existing.source.clone(),
                                    match_reason: "sha256".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }

        // 3. Exact identity check (PostScript / family + style + filename)
        for existing in &self.fonts {
            if !Path::new(&existing.path).is_file() && existing.is_local {
                continue;
            }
            let same_ps = norm_ps.as_ref().is_some_and(|ps| {
                existing
                    .post_script_name
                    .as_deref()
                    .map(|eps| eps.trim().eq_ignore_ascii_case(ps))
                    .unwrap_or(false)
            });
            let same_fam_style = norm_family.as_ref().is_some_and(|fam| {
                let efam = existing
                    .family
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase();
                let estyle = existing
                    .style
                    .as_deref()
                    .unwrap_or("regular")
                    .trim()
                    .to_ascii_lowercase();
                let cstyle = norm_style.as_deref().unwrap_or("regular");
                !efam.is_empty() && efam == *fam && estyle == cstyle
            });
            let same_filename = existing.name.eq_ignore_ascii_case(&clean_fname);

            if (same_ps || same_fam_style) && (same_filename || file_size == existing.size) {
                return Some(DuplicateFontMatch {
                    file_name: file_name.to_string(),
                    family: existing
                        .family
                        .clone()
                        .unwrap_or_else(|| existing.name.clone()),
                    style: existing
                        .style
                        .clone()
                        .unwrap_or_else(|| "Regular".to_string()),
                    existing_id: existing.id,
                    existing_path: existing.path.clone(),
                    existing_source: existing.source.clone(),
                    match_reason: "metadata".to_string(),
                });
            }
        }

        None
    }

    /// Records or updates an active/recent system operation in the unified tracker
    pub fn record_operation(&mut self, op: SystemOperation) {
        if let Some(existing) = self.operations.iter_mut().find(|o| o.id == op.id) {
            *existing = op;
        } else {
            self.operations.push(op);
        }
        self.operations
            .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        if self.operations.len() > 50 {
            self.operations.truncate(50);
        }
    }

    /// Returns unified list of active and recent operations (merging DownloadManager jobs + system tasks)
    pub fn get_unified_operations(&self) -> Vec<SystemOperation> {
        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut list = self.operations.clone();
        for job in self.download_manager.list_jobs() {
            let status_str = match job.phase {
                JobPhase::Queued => "queued",
                JobPhase::Downloading => "downloading",
                JobPhase::Verifying => "verifying",
                JobPhase::Extracting => "extracting",
                JobPhase::Indexing => "indexing",
                JobPhase::Completed => "completed",
                JobPhase::Cancelled => "cancelled",
                JobPhase::Failed => "failed",
            };
            let msg = if let Some(ref err) = job.error {
                err.clone()
            } else {
                format!(
                    "{} ({} extracted, {} indexed)",
                    status_str, job.extracted_count, job.indexed_count
                )
            };

            let op = SystemOperation {
                id: job.job_id.clone(),
                title: job.pack_name.clone(),
                kind: "pack_download".to_string(),
                status: status_str.to_string(),
                progress_percent: job.progress_percent,
                downloaded_bytes: job.bytes_downloaded,
                total_bytes: job.total_bytes,
                processed_items: job.indexed_count.max(job.extracted_count),
                total_items: job.extracted_count.max(job.indexed_count),
                speed_bps: job.speed_bps,
                message: msg,
                updated_at: now_sec,
            };

            if let Some(pos) = list.iter().position(|o| o.id == op.id) {
                list[pos] = op;
            } else {
                list.push(op);
            }
        }

        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        list
    }

    /// Clears all completed, failed, or cancelled operations from both `operations`
    /// and `download_manager`, returning the total number of cleared items.
    pub fn clear_finished_operations(&mut self) -> usize {
        let before_ops = self.operations.len();
        self.operations.retain(|op| {
            !matches!(
                op.status.to_ascii_lowercase().as_str(),
                "completed" | "failed" | "cancelled" | "error" | "done"
            )
        });
        let removed_ops = before_ops.saturating_sub(self.operations.len());
        let removed_jobs = self.download_manager.clear_finished_jobs();
        removed_ops + removed_jobs
    }

    pub fn save_favorites(&self) {
        let path = self.data_dir.join("favorites.json");
        if let Ok(json) = serde_json::to_string_pretty(&self.favorite_font_ids) {
            let _ = fs::write(path, json);
        }
    }

    pub fn save_active_fonts(&self) {
        let path = self.data_dir.join("active-fonts.json");
        if let Ok(json) = serde_json::to_string_pretty(&self.active_font_ids) {
            let tmp = self.data_dir.join("active-fonts.json.tmp");
            if fs::write(&tmp, &json).is_ok() {
                let _ = fs::rename(tmp, path);
            } else {
                let _ = fs::write(path, json);
            }
        }
    }

    pub fn save_collections(&self) {
        let path = self.data_dir.join("collections.json");
        if let Ok(json) = serde_json::to_string_pretty(&self.collections) {
            let _ = fs::write(path, json);
        }
    }

    pub fn save_brand_kits(&self) {
        let path = self.data_dir.join("brand-kits.json");
        if let Ok(json) = serde_json::to_string_pretty(&self.brand_kits) {
            let _ = fs::write(path, json);
        }
    }

    pub fn get_brand_kits(&self) -> Vec<BrandKit> {
        self.brand_kits.clone()
    }

    pub fn save_brand_kit(&mut self, mut kit: BrandKit) -> BrandKit {
        if kit.id.is_empty() {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            kit.id = format!("bk-{}", now);
        }
        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        kit.updated_at = now_sec;

        if let Some(pos) = self.brand_kits.iter().position(|k| k.id == kit.id) {
            self.brand_kits[pos] = kit.clone();
        } else {
            self.brand_kits.push(kit.clone());
        }
        self.save_brand_kits();
        kit
    }

    pub fn delete_brand_kit(&mut self, id: &str) -> bool {
        let prev_len = self.brand_kits.len();
        self.brand_kits.retain(|k| k.id != id);
        let removed = self.brand_kits.len() < prev_len;
        if removed {
            self.save_brand_kits();
        }
        removed
    }

    pub fn activate_brand_kit(&mut self, id: &str) -> Result<Vec<usize>, String> {
        let kit = self
            .brand_kits
            .iter()
            .find(|k| k.id == id)
            .cloned()
            .ok_or("Brand kit not found")?;
        let mut activated_ids = Vec::new();

        let target_ids: Vec<usize> = [kit.heading_font_id, kit.body_font_id, kit.accent_font_id]
            .iter()
            .filter_map(|&opt| opt)
            .collect();

        for font_id in target_ids {
            if let Some(font) = self.fonts.iter().find(|f| f.id == font_id) {
                if font.source == "system" {
                    // System fonts are already OS-installed; never register them in Fontivo RAM
                    continue;
                }
                let usable = Self::resolve_usable_font_path(&font.path);
                if usable.exists() {
                    let _ = self.activator.activate_ram(&usable.to_string_lossy());
                    self.active_font_ids.insert(font_id);
                    activated_ids.push(font_id);
                }
            }
        }

        for f in &mut self.fonts {
            if activated_ids.contains(&f.id) {
                f.is_active = true;
            }
        }
        self.save_active_fonts();
        Ok(activated_ids)
    }

    /// Export complete client handoff bundle with fonts, Adobe ASE palette, CSS tokens, and standalone HTML style guide
    pub fn export_brand_bundle(&self, id: &str) -> Result<PathBuf, String> {
        let kit = self
            .brand_kits
            .iter()
            .find(|k| k.id == id)
            .cloned()
            .ok_or("Brand kit not found")?;

        let downloads = env::var("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("Downloads")
            .join("Fontivo Projects");

        let safe_name: String = kit
            .name
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let project_dir = downloads.join(format!("{}-Handoff", safe_name));
        let fonts_dir = project_dir.join("Fonts");

        fs::create_dir_all(&fonts_dir)
            .map_err(|e| format!("Failed to create project folder: {}", e))?;

        // 1. Copy Brand Fonts
        let target_font_ids: Vec<usize> =
            [kit.heading_font_id, kit.body_font_id, kit.accent_font_id]
                .iter()
                .filter_map(|&opt| opt)
                .collect();

        let mut copied_font_names = Vec::new();
        for fid in target_font_ids {
            if let Some(font) = self.fonts.iter().find(|f| f.id == fid) {
                let src_path = Self::resolve_usable_font_path(&font.path);
                if src_path.exists() {
                    let file_name = Path::new(&font.name)
                        .file_name()
                        .or_else(|| src_path.file_name())
                        .unwrap_or_default();
                    let dest = fonts_dir.join(file_name);
                    let _ = fs::copy(&src_path, dest);
                    copied_font_names
                        .push(font.family.clone().unwrap_or_else(|| font.name.clone()));
                }
            }
        }

        // 2. Generate palette.json
        let palette_json_path = project_dir.join("palette.json");
        let palette_data = serde_json::json!({
        "brand": kit.name,
        "client": kit.client,
        "exportedAt": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
        "headingFont": kit.heading_font_name,
        "bodyFont": kit.body_font_name,
        "colors": kit.colors
        });
        let _ = fs::write(
            &palette_json_path,
            serde_json::to_string_pretty(&palette_data).unwrap_or_default(),
        );

        // 3. Generate palette.css (sanitized against CSS injection)
        let palette_css_path = project_dir.join("palette.css");
        let sanitize_font = |s: &str| -> String {
            s.chars()
                .filter(|&c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.')
                .collect()
        };
        let mut css = String::from("/* Generated by Fontivo Brand Engine */\n:root {\n");
        if let Some(ref h) = kit.heading_font_name {
            css.push_str(&format!(
                " --font-heading: '{}', sans-serif;\n",
                sanitize_font(h)
            ));
        }
        if let Some(ref b) = kit.body_font_name {
            css.push_str(&format!(
                " --font-body: '{}', sans-serif;\n",
                sanitize_font(b)
            ));
        }
        for c in &kit.colors {
            let clean_role: String = c
                .name
                .to_lowercase()
                .chars()
                .map(|ch| if ch.is_alphanumeric() { ch } else { '-' })
                .collect();
            let safe_hex = crate::server::routes::workspaces::sanitize_hex_color(&c.hex);
            css.push_str(&format!(" --color-{}: {};\n", clean_role, safe_hex));
        }
        css.push_str("}\n");
        let _ = fs::write(&palette_css_path, css);

        // 4. Generate Adobe Swatch Exchange (.ase) file
        let ase_bytes = Self::generate_ase_swatches(&kit.colors);
        let ase_path = project_dir.join(format!("{}-swatches.ase", safe_name));
        let _ = fs::write(&ase_path, ase_bytes);

        // 5. Generate Standalone Interactive Brand-StyleGuide.html
        let guide_html_path = project_dir.join("Brand-StyleGuide.html");
        let guide_html = Self::generate_style_guide_html(&kit);
        let _ = fs::write(&guide_html_path, guide_html);

        // Open in Windows Explorer
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("explorer")
                .arg(&project_dir)
                .spawn();
        }

        Ok(project_dir)
    }

    /// Generate binary Adobe Swatch Exchange (.ase) v1.0
    fn generate_ase_swatches(colors: &[BrandColor]) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"ASEF");
        buf.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]);
        let block_count = colors.len() as u32;
        buf.extend_from_slice(&block_count.to_be_bytes());

        for color in colors {
            buf.extend_from_slice(&[0x00, 0x01]); // Color entry

            let hex = color.hex.trim_start_matches('#');
            let r =
                u8::from_str_radix(hex.get(0..2).unwrap_or("00"), 16).unwrap_or(0) as f32 / 255.0;
            let g =
                u8::from_str_radix(hex.get(2..4).unwrap_or("00"), 16).unwrap_or(0) as f32 / 255.0;
            let b =
                u8::from_str_radix(hex.get(4..6).unwrap_or("00"), 16).unwrap_or(0) as f32 / 255.0;

            let name_chars: Vec<u16> = color
                .name
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let name_len = name_chars.len() as u16;

            let block_len = (2 + name_chars.len() * 2 + 4 + 12 + 2) as u32;
            buf.extend_from_slice(&block_len.to_be_bytes());

            buf.extend_from_slice(&name_len.to_be_bytes());
            for c in name_chars {
                buf.extend_from_slice(&c.to_be_bytes());
            }

            buf.extend_from_slice(b"RGB ");
            buf.extend_from_slice(&r.to_be_bytes());
            buf.extend_from_slice(&g.to_be_bytes());
            buf.extend_from_slice(&b.to_be_bytes());
            buf.extend_from_slice(&[0x00, 0x00]); // Normal swatch
        }

        buf
    }

    /// Generate beautiful standalone offline Brand Style Guide HTML (XSS-safe)
    pub fn generate_style_guide_html(kit: &BrandKit) -> String {
        use crate::server::routes::workspaces::{escape_html, sanitize_hex_color};

        let mut swatches_html = String::new();
        for c in &kit.colors {
            let safe_hex = escape_html(&sanitize_hex_color(&c.hex));
            let safe_name = escape_html(&c.name);
            let safe_role = escape_html(&c.role.to_uppercase());
            swatches_html.push_str(&format!(
                r#"<div class="swatch-card">
 <div class="swatch-color" style="background-color: {hex};"></div>
 <div class="swatch-info">
 <div class="swatch-name">{name}</div>
 <div class="swatch-hex">{hex}</div>
 <div class="swatch-role">{role}</div>
 </div>
 </div>"#,
                hex = safe_hex,
                name = safe_name,
                role = safe_role
            ));
        }

        format!(
            r#"<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>{name} — Brand & Typography Guidelines</title>
 <style>
 :root {{
 --bg: #130c16;
 --card: #1b1220;
 --border: #43314d;
 --text: #fff9f2;
 --text-muted: #d8cedf;
 --action: #f16b50;
 }}
 * {{ box-sizing: border-box; margin: 0; padding: 0; }}
 body {{
 background: var(--bg);
 color: var(--text);
 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
 padding: 40px 20px;
 line-height: 1.6;
 }}
 .container {{ max-width: 900px; margin: 0 auto; }}
 header {{
 border-bottom: 1px solid var(--border);
 padding-bottom: 24px;
 margin-bottom: 36px;
 }}
 .badge {{
 display: inline-block;
 background: rgba(82,0,234,0.15);
 color: #a78bfa;
 border: 1px solid rgba(82,0,234,0.3);
 padding: 4px 12px;
 border-radius: 9999px;
 font-size: 11px;
 font-weight: 700;
 margin-bottom: 12px;
 }}
 h1 {{ font-size: 32px; font-weight: 800; color: #ffffff; }}
 .subtitle {{ color: var(--text-muted); font-size: 14px; margin-top: 6px; }}
 section {{
 background: var(--card);
 border: 1px solid var(--border);
 border-radius: 16px;
 padding: 24px;
 margin-bottom: 24px;
 }}
 h2 {{
 font-size: 16px;
 font-weight: 700;
 margin-bottom: 16px;
 color: #ffffff;
 border-bottom: 1px solid var(--border);
 padding-bottom: 10px;
 }}
 .grid {{
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
 gap: 16px;
 }}
 .swatch-card {{
 background: rgba(255,255,255,0.03);
 border: 1px solid var(--border);
 border-radius: 12px;
 overflow: hidden;
 }}
 .swatch-color {{ height: 80px; width: 100%; }}
 .swatch-info {{ padding: 12px; }}
 .swatch-name {{ font-weight: 700; font-size: 13px; color: #fff; }}
 .swatch-hex {{ font-family: monospace; font-size: 12px; color: #a1a1aa; margin-top: 2px; }}
 .swatch-role {{ font-size: 10px; color: #00d304; font-weight: 700; margin-top: 4px; }}
 .typo-row {{
 padding: 12px 0;
 border-bottom: 1px solid rgba(255,255,255,0.05);
 }}
 .typo-label {{ font-size: 12px; color: var(--text-muted); }}
 .typo-val {{ font-size: 18px; font-weight: 700; color: #fff; margin-top: 4px; }}
 footer {{ text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 40px; }}
 </style>
</head>
<body>
 <div class="container">
 <header>
 <span class="badge">Fontivo OFFICIAL BRAND GUIDELINES</span>
 <h1>{name}</h1>
 <p class="subtitle">Client: {client} • Generated Automatically</p>
 </header>

 <section>
 <h2> Brand Color Palette (HEX & Swatches)</h2>
 <div class="grid">
 {swatches}
 </div>
 </section>

 <section>
 <h2> Typography & Hierarchy</h2>
 <div class="typo-row">
 <div class="typo-label">Primary Heading Font (العناوين الرئيسية)</div>
 <div class="typo-val">{heading}</div>
 </div>
 <div class="typo-row">
 <div class="typo-label">Body & Content Font (نصوص المحتوى والفقرات)</div>
 <div class="typo-val">{body}</div>
 </div>
 </section>

 <footer>
 Generated by Fontivo • Next-Gen Desktop Font & Brand Engine
 </footer>
 </div>
</body>
</html>"#,
            name = escape_html(&kit.name),
            client = escape_html(kit.client.as_deref().unwrap_or("Internal Project")),
            swatches = swatches_html,
            heading = escape_html(
                kit.heading_font_name
                    .as_deref()
                    .unwrap_or("System Sans-Serif")
            ),
            body = escape_html(kit.body_font_name.as_deref().unwrap_or("System Sans-Serif"))
        )
    }

    /// Extract glyphs from font file using zero-allocation `ttf-parser`
    pub fn inspect_glyphs(&self, font_id: usize) -> Result<FontGlyphsResponse, String> {
        let font = self
            .fonts
            .iter()
            .find(|f| f.id == font_id)
            .ok_or_else(|| "Font not found".to_string())?;

        let usable_path = Self::resolve_usable_font_path(&font.path);
        let bytes =
            fs::read(&usable_path).map_err(|e| format!("Failed to read font file: {}", e))?;
        let face =
            ttf_parser::Face::parse(&bytes, 0).map_err(|e| format!("ttf-parser error: {:?}", e))?;

        let units_per_em = face.units_per_em();
        let ascender = face.ascender();
        let descender = face.descender();
        let glyph_count = face.number_of_glyphs() as usize;

        let mut glyphs = Vec::new();
        let mut seen_chars = HashSet::new();

        if let Some(cmap) = face.tables().cmap {
            for subtable in cmap.subtables {
                subtable.codepoints(|cp| {
                    if let Some(gid) = subtable.glyph_index(cp) {
                        if !seen_chars.contains(&cp) {
                            seen_chars.insert(cp);
                            if let Some(ch) = char::from_u32(cp) {
                                glyphs.push(GlyphItem {
                                    index: gid.0,
                                    char: ch.to_string(),
                                    code: cp,
                                    hex: format!("U+{:04X}", cp),
                                    name: format!("glyph_{}", gid.0),
                                });
                            }
                        }
                    }
                });
            }
        }

        // Names
        let mut family_name = font.family.clone().unwrap_or_else(|| font.name.clone());
        let mut sub_family = font.style.clone().unwrap_or_else(|| "Regular".to_string());
        let mut full_name = font
            .display_name
            .clone()
            .unwrap_or_else(|| font.name.clone());
        let mut post_script = font.post_script_name.clone().unwrap_or_default();
        let mut version = "1.0".to_string();

        if Path::new(&font.path).exists() {
            for name in face.names() {
                if let Some(s) = name.to_string() {
                    match name.name_id {
                        1 => family_name = s,
                        2 => sub_family = s,
                        4 => full_name = s,
                        5 => version = s,
                        6 => post_script = s,
                        _ => {}
                    }
                }
            }
        }

        Ok(FontGlyphsResponse {
            success: true,
            id: font.id,
            name: full_name.clone(),
            family: Some(family_name.clone()),
            style: Some(sub_family.clone()),
            format: font.format.clone(),
            path: font.path.clone(),
            size: font.size,
            metrics: FontMetrics {
                units_per_em,
                ascender,
                descender,
                glyph_count,
                extracted_characters: glyphs.len(),
            },
            metadata: FontMetadata {
                font_family: family_name,
                font_subfamily: sub_family,
                full_name,
                post_script_name: post_script,
                version,
            },
            glyphs,
        })
    }
}
