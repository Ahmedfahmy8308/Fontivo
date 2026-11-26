use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontMetadata {
    pub family: String,
    pub subfamily: String,
    pub full_name: String,
    pub postscript_name: String,
    pub version: String,
    pub unique_id: String,
    pub designer: Option<String>,
    pub manufacturer: Option<String>,
    pub copyright: Option<String>,
    pub license_description: Option<String>,
    pub license_url: Option<String>,
    pub format: String,
    pub weight_class: u16,
    pub width_class: u16,
    pub is_italic: bool,
    pub is_bold: bool,
    pub is_monospace: bool,
    #[serde(default)]
    pub is_variable: bool,
    pub units_per_em: u16,
    pub glyph_count: u16,
    pub metrics: TypographicMetrics,
    pub features: OpenTypeFeatures,
    pub coverage: UnicodeCoverage,
    pub panose: Option<PanoseClassification>,
    pub embedding: EmbeddingLicense,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TypographicMetrics {
    pub ascender: i16,
    pub descender: i16,
    pub line_gap: i16,
    pub win_ascent: u16,
    pub win_descent: u16,
    pub x_height: Option<i16>,
    pub cap_height: Option<i16>,
    pub underline_position: i16,
    pub underline_thickness: i16,
    pub italic_angle: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenTypeFeatures {
    pub standard_ligatures: bool,      // liga
    pub discretionary_ligatures: bool, // dlig
    pub contextual_alternates: bool,   // calt
    pub small_caps: bool,              // smcp
    pub caps_to_small_caps: bool,      // c2sc
    pub oldstyle_figures: bool,        // onum
    pub tabular_figures: bool,         // tnum
    pub fractions: bool,               // frac
    pub swashes: bool,                 // swsh
    pub kerning: bool,                 // kern
    pub stylistic_sets: Vec<String>,   // ss01 - ss20
    pub available_tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UnicodeCoverage {
    pub supports_arabic: bool,
    pub supports_latin: bool,
    pub supports_cyrillic: bool,
    pub supports_greek: bool,
    pub supports_hebrew: bool,
    pub supports_cjk: bool,
    pub supports_devanagari: bool,
    #[serde(default)]
    pub has_tashkeel: bool,
    #[serde(default)]
    pub has_extended_arabic: bool,
    #[serde(default)]
    pub has_arabic_numerals: bool,
    #[serde(default)]
    pub has_western_numerals: bool,
    pub primary_script: String,
    pub character_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PanoseClassification {
    pub family_type: u8,
    pub serif_style: u8,
    pub weight: u8,
    pub proportion: u8,
    pub contrast: u8,
    pub stroke_variation: u8,
    pub arm_style: u8,
    pub letterform: u8,
    pub midline: u8,
    pub x_height: u8,
    pub category_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingLicense {
    pub installable: bool,
    pub editable: bool,
    pub preview_print_only: bool,
    pub restricted_license: bool,
    pub description: String,
}

impl Default for EmbeddingLicense {
    fn default() -> Self {
        Self {
            installable: true,
            editable: true,
            preview_print_only: false,
            restricted_license: false,
            description: "Installable Embedding".to_string(),
        }
    }
}

pub struct FontParser;

impl FontParser {
    /// Detect format from raw bytes SFNT header
    pub fn detect_format(bytes: &[u8]) -> &'static str {
        if bytes.len() < 4 {
            return "unknown";
        }
        let tag = &bytes[0..4];
        if tag == b"\x00\x01\x00\x00" {
            "ttf"
        } else if tag == b"OTTO" {
            "otf"
        } else if tag == b"ttcf" {
            "ttc"
        } else if tag == b"wOFF" {
            "woff"
        } else if tag == b"wOF2" {
            "woff2"
        } else {
            "ttf"
        }
    }

    /// Read font file from disk and perform deep inspection
    pub fn parse_file<P: AsRef<Path>>(path: P) -> Result<FontMetadata, String> {
        let path_ref = path.as_ref();
        let mut file = File::open(path_ref).map_err(|e| format!("Failed to open file: {}", e))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        Self::parse_bytes(
            &bytes,
            path_ref
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("font"),
        )
    }

    /// Parse raw font binary bytes into structured FontMetadata
    pub fn parse_bytes(bytes: &[u8], fallback_name: &str) -> Result<FontMetadata, String> {
        let attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            Self::parse_bytes_guarded(bytes, fallback_name)
        }));

        match attempt {
            Ok(res) => res,
            Err(_) => Err(
                "ttf_parser panicked during font parsing (corrupted or malformed font binary)"
                    .to_string(),
            ),
        }
    }

    fn validate_sfnt_bounds(bytes: &[u8]) -> Result<(), String> {
        if bytes.len() < 12 {
            return Err("Font binary shorter than 12-byte SFNT header".to_string());
        }
        let tag = &bytes[0..4];
        if tag == b"\x00\x01\x00\x00" || tag == b"OTTO" || tag == b"true" || tag == b"typ1" {
            let num_tables = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
            let dir_end = 12usize.saturating_add(num_tables.saturating_mul(16));
            if dir_end > bytes.len() {
                return Err("SFNT table directory exceeds buffer length".to_string());
            }
            for i in 0..num_tables {
                let rec = 12 + i * 16;
                let offset = u32::from_be_bytes([
                    bytes[rec + 8],
                    bytes[rec + 9],
                    bytes[rec + 10],
                    bytes[rec + 11],
                ]) as u64;
                let length = u32::from_be_bytes([
                    bytes[rec + 12],
                    bytes[rec + 13],
                    bytes[rec + 14],
                    bytes[rec + 15],
                ]) as u64;
                if offset + length > u32::MAX as u64 {
                    return Err("Corrupted SFNT table record overflows u32".to_string());
                }
            }
        }
        Ok(())
    }

    fn parse_bytes_guarded(bytes: &[u8], fallback_name: &str) -> Result<FontMetadata, String> {
        Self::validate_sfnt_bounds(bytes)?;
        let format_str = Self::detect_format(bytes).to_string();

        let face =
            ttf_parser::Face::parse(bytes, 0).map_err(|e| format!("ttf_parser failed: {:?}", e))?;

        let units_per_em = face.units_per_em();
        let glyph_count = face.number_of_glyphs();
        let is_italic = face.is_italic();
        let is_bold = face.is_bold();
        let is_monospace = face.is_monospaced();
        let is_variable = face.is_variable();
        let weight = face.weight().to_number();
        let width = face.width().to_number();

        // Names extraction
        let mut family = None;
        let mut subfamily = None;
        let mut full_name = None;
        let mut postscript_name = None;
        let mut version = None;
        let mut unique_id = None;
        let mut designer = None;
        let mut manufacturer = None;
        let mut copyright = None;
        let mut license_description = None;
        let mut license_url = None;

        let mut family_is_en = false;
        let mut subfamily_is_en = false;
        let mut full_name_is_en = false;
        let mut postscript_name_is_en = false;

        for name in face.names() {
            let string_val = name.to_string();
            if let Some(val) = string_val {
                let trimmed = val.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                let is_en = (name.language_id & 0x00FF) == 0x09 || name.language_id == 0;
                match name.name_id {
                    ttf_parser::name_id::FAMILY => {
                        if is_en {
                            family = Some(trimmed);
                            family_is_en = true;
                        } else if !family_is_en && (family.is_none() || name.is_unicode()) {
                            family = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::SUBFAMILY => {
                        if is_en {
                            subfamily = Some(trimmed);
                            subfamily_is_en = true;
                        } else if !subfamily_is_en && (subfamily.is_none() || name.is_unicode()) {
                            subfamily = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::FULL_NAME => {
                        if is_en {
                            full_name = Some(trimmed);
                            full_name_is_en = true;
                        } else if !full_name_is_en && (full_name.is_none() || name.is_unicode()) {
                            full_name = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::POST_SCRIPT_NAME => {
                        if is_en {
                            postscript_name = Some(trimmed);
                            postscript_name_is_en = true;
                        } else if !postscript_name_is_en
                            && (postscript_name.is_none() || name.is_unicode())
                        {
                            postscript_name = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::VERSION => {
                        if version.is_none() || name.is_unicode() {
                            version = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::UNIQUE_ID => {
                        if unique_id.is_none() || name.is_unicode() {
                            unique_id = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::DESIGNER => {
                        if designer.is_none() || name.is_unicode() {
                            designer = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::MANUFACTURER => {
                        if manufacturer.is_none() || name.is_unicode() {
                            manufacturer = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::COPYRIGHT_NOTICE => {
                        if copyright.is_none() || name.is_unicode() {
                            copyright = Some(trimmed);
                        }
                    }
                    13 => {
                        if license_description.is_none() || name.is_unicode() {
                            license_description = Some(trimmed);
                        }
                    }
                    ttf_parser::name_id::LICENSE_URL => {
                        if license_url.is_none() || name.is_unicode() {
                            license_url = Some(trimmed);
                        }
                    }
                    _ => {}
                }
            }
        }

        let family = family.unwrap_or_else(|| {
            fallback_name
                .trim_end_matches(".ttf")
                .trim_end_matches(".otf")
                .trim_end_matches(".woff")
                .trim_end_matches(".woff2")
                .to_string()
        });
        let subfamily = subfamily.unwrap_or_else(|| "Regular".to_string());
        let full_name = full_name.unwrap_or_else(|| format!("{} {}", family, subfamily));
        let postscript_name = postscript_name.unwrap_or_else(|| family.replace(' ', "-"));
        let version = version.unwrap_or_else(|| "Version 1.0".to_string());
        let unique_id = unique_id.unwrap_or_else(|| format!("{}-{}", family, subfamily));

        // Typographic Metrics
        let ascender = face.ascender();
        let descender = face.descender();
        let line_gap = face.line_gap();
        let x_height = face.x_height();
        let cap_height = face.capital_height();
        let italic_angle = face.italic_angle();
        let underline_metrics = face.underline_metrics();
        let (underline_position, underline_thickness) = match underline_metrics {
            Some(u) => (u.position, u.thickness),
            None => (-100, 50),
        };

        let metrics = TypographicMetrics {
            ascender,
            descender,
            line_gap,
            win_ascent: ascender.max(0) as u16,
            win_descent: descender.unsigned_abs(),
            x_height,
            cap_height,
            underline_position,
            underline_thickness,
            italic_angle,
        };

        // Deep OpenType layout table features parsing
        let mut features = OpenTypeFeatures::default();
        let mut found_tags = Vec::new();

        // Scan raw SFNT table directory for GSUB & GPOS tables
        Self::scan_opentype_features(bytes, &mut features, &mut found_tags);
        features.available_tags = found_tags;

        // Unicode script and coverage scan
        let coverage = Self::analyze_unicode_coverage(&face);

        // PANOSE classification
        let panose = Self::extract_panose(bytes);

        // Embedding permissions (OS/2 fsType)
        let embedding = Self::extract_embedding(bytes);

        Ok(FontMetadata {
            family,
            subfamily,
            full_name,
            postscript_name,
            version,
            unique_id,
            designer,
            manufacturer,
            copyright,
            license_description,
            license_url,
            format: format_str,
            weight_class: weight,
            width_class: width,
            is_italic,
            is_bold,
            is_monospace,
            is_variable,
            units_per_em,
            glyph_count,
            metrics,
            features,
            coverage,
            panose,
            embedding,
        })
    }

    /// Scan GSUB and GPOS tables directly for layout feature tags
    fn scan_opentype_features(
        bytes: &[u8],
        features: &mut OpenTypeFeatures,
        tags_out: &mut Vec<String>,
    ) {
        if bytes.len() < 12 {
            return;
        }

        let num_tables = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
        let mut offset = 12;

        for _ in 0..num_tables {
            if offset + 16 > bytes.len() {
                break;
            }
            let tag = &bytes[offset..offset + 4];
            let table_offset = u32::from_be_bytes([
                bytes[offset + 8],
                bytes[offset + 9],
                bytes[offset + 10],
                bytes[offset + 11],
            ]) as usize;
            let table_length = u32::from_be_bytes([
                bytes[offset + 12],
                bytes[offset + 13],
                bytes[offset + 14],
                bytes[offset + 15],
            ]) as usize;

            if (tag == b"GSUB" || tag == b"GPOS") && table_offset + table_length <= bytes.len() {
                Self::extract_feature_list(
                    &bytes[table_offset..table_offset + table_length],
                    tags_out,
                );
            }

            if tag == b"kern" {
                features.kerning = true;
                if !tags_out.iter().any(|t| t == "kern") {
                    tags_out.push("kern".to_string());
                }
            }

            offset += 16;
        }

        // Map tags to boolean flags
        for tag in tags_out.iter() {
            match tag.as_str() {
                "liga" => features.standard_ligatures = true,
                "dlig" => features.discretionary_ligatures = true,
                "calt" => features.contextual_alternates = true,
                "smcp" => features.small_caps = true,
                "c2sc" => features.caps_to_small_caps = true,
                "onum" => features.oldstyle_figures = true,
                "tnum" => features.tabular_figures = true,
                "frac" => features.fractions = true,
                "swsh" => features.swashes = true,
                "kern" => features.kerning = true,
                s if s.starts_with("ss") => {
                    if !features.stylistic_sets.contains(tag) {
                        features.stylistic_sets.push(tag.clone());
                    }
                }
                _ => {}
            }
        }
    }

    /// Extract feature tags from a GSUB or GPOS table slice
    fn extract_feature_list(table: &[u8], tags_out: &mut Vec<String>) {
        if table.len() < 10 {
            return;
        }
        let feature_list_offset = u16::from_be_bytes([table[6], table[7]]) as usize;
        if feature_list_offset + 2 > table.len() {
            return;
        }
        let feature_count =
            u16::from_be_bytes([table[feature_list_offset], table[feature_list_offset + 1]])
                as usize;
        let mut cur = feature_list_offset + 2;

        for _ in 0..feature_count {
            if cur + 6 > table.len() {
                break;
            }
            if let Ok(tag_str) = std::str::from_utf8(&table[cur..cur + 4]) {
                let trimmed = tag_str.trim().to_string();
                if !tags_out.contains(&trimmed) {
                    tags_out.push(trimmed);
                }
            }
            cur += 6;
        }
    }

    /// Analyze character coverage across major Unicode blocks
    fn analyze_unicode_coverage(face: &ttf_parser::Face) -> UnicodeCoverage {
        let mut char_count: u32 = 0;
        let mut has_arabic = false;
        let mut has_latin = false;
        let mut has_cyrillic = false;
        let mut has_greek = false;
        let mut has_hebrew = false;
        let mut has_cjk = false;
        let mut has_devanagari = false;

        // Check representative character points
        let check_char = |cp: u32| -> bool {
            if let Some(ch) = char::from_u32(cp) {
                face.glyph_index(ch).is_some()
            } else {
                false
            }
        };

        // Latin sample (A-Z)
        if check_char(0x0041) || check_char(0x0061) {
            has_latin = true;
        }

        // Arabic sample (ا ب ت ث)
        if check_char(0x0627) || check_char(0x0628) || check_char(0x0644) {
            has_arabic = true;
        }

        // Cyrillic (А Б В)
        if check_char(0x0410) || check_char(0x0430) {
            has_cyrillic = true;
        }

        // Greek (Α Β Γ)
        if check_char(0x0391) || check_char(0x03B1) {
            has_greek = true;
        }

        // Hebrew (א ב)
        if check_char(0x05D0) || check_char(0x05D1) {
            has_hebrew = true;
        }

        // CJK (一 字)
        if check_char(0x4E00) || check_char(0x4E8C) {
            has_cjk = true;
        }

        // Devanagari (क ख)
        if check_char(0x0915) || check_char(0x0916) {
            has_devanagari = true;
        }

        // Arabic harakat / tashkeel (U+064B..=U+0652): require >= 3 harakat glyphs in cmap
        let tashkeel_hits = (0x064Bu32..=0x0652u32).filter(|&cp| check_char(cp)).count();
        let has_tashkeel = has_arabic && tashkeel_hits >= 3;

        // Extended Arabic (Persian/Urdu letters: پ چ ژ گ ی)
        let has_extended_arabic = has_arabic
            && (check_char(0x067E)
                || check_char(0x0686)
                || check_char(0x0698)
                || check_char(0x06AF)
                || check_char(0x06CC));

        // Arabic-Indic numerals (٠-٩ U+0660..=U+0669)
        let has_arabic_numerals = (0x0660u32..=0x0669u32).filter(|&cp| check_char(cp)).count() >= 5;

        // Western numerals (0-9 U+0030..=U+0039)
        let has_western_numerals =
            (0x0030u32..=0x0039u32).filter(|&cp| check_char(cp)).count() >= 5;

        // Estimate character count
        for cp in 0x0020..0x007F {
            if check_char(cp) {
                char_count += 1;
            }
        }
        if has_arabic {
            for cp in 0x0600..0x06FF {
                if check_char(cp) {
                    char_count += 1;
                }
            }
        }

        let primary_script = if has_arabic {
            "Arabic".to_string()
        } else if has_cjk {
            "CJK".to_string()
        } else if has_cyrillic {
            "Cyrillic".to_string()
        } else if has_greek {
            "Greek".to_string()
        } else if has_hebrew {
            "Hebrew".to_string()
        } else if has_devanagari {
            "Devanagari".to_string()
        } else {
            "Latin".to_string()
        };

        UnicodeCoverage {
            supports_arabic: has_arabic,
            supports_latin: has_latin,
            supports_cyrillic: has_cyrillic,
            supports_greek: has_greek,
            supports_hebrew: has_hebrew,
            supports_cjk: has_cjk,
            supports_devanagari: has_devanagari,
            has_tashkeel,
            has_extended_arabic,
            has_arabic_numerals,
            has_western_numerals,
            primary_script,
            character_count: char_count,
        }
    }

    /// Extract 10-byte PANOSE structure from OS/2 table
    fn extract_panose(bytes: &[u8]) -> Option<PanoseClassification> {
        let (offset, length) = Self::find_table(bytes, b"OS/2")?;
        if length < 42 || offset + 42 > bytes.len() {
            return None;
        }

        // In OS/2, panose is at offset 32 (10 bytes)
        let panose_bytes = &bytes[offset + 32..offset + 42];
        let family_type = panose_bytes[0];
        let serif_style = panose_bytes[1];
        let weight = panose_bytes[2];
        let proportion = panose_bytes[3];
        let contrast = panose_bytes[4];
        let stroke_variation = panose_bytes[5];
        let arm_style = panose_bytes[6];
        let letterform = panose_bytes[7];
        let midline = panose_bytes[8];
        let x_height = panose_bytes[9];

        let category_name = match family_type {
            2 => {
                if (11..=13).contains(&serif_style) {
                    "Sans-serif"
                } else if (2..=10).contains(&serif_style) {
                    "Serif"
                } else {
                    "Text"
                }
            }
            3 => "Script",
            4 => "Decorative",
            5 => "Symbol",
            _ => "Proportional",
        }
        .to_string();

        Some(PanoseClassification {
            family_type,
            serif_style,
            weight,
            proportion,
            contrast,
            stroke_variation,
            arm_style,
            letterform,
            midline,
            x_height,
            category_name,
        })
    }

    /// Extract fsType embedding permissions from OS/2 table
    fn extract_embedding(bytes: &[u8]) -> EmbeddingLicense {
        let default_license = EmbeddingLicense::default();
        let (offset, length) = match Self::find_table(bytes, b"OS/2") {
            Some(t) => t,
            None => return default_license,
        };

        if length < 10 || offset + 10 > bytes.len() {
            return default_license;
        }

        // fsType is at offset 8 (2 bytes)
        let fs_type = u16::from_be_bytes([bytes[offset + 8], bytes[offset + 9]]);

        let restricted_license = (fs_type & 0x0002) != 0;
        let preview_print_only = (fs_type & 0x0004) != 0;
        let editable = (fs_type & 0x0008) != 0 || fs_type == 0;
        let installable = fs_type == 0;

        let description = if restricted_license {
            "Restricted License (Embedding Not Allowed)".to_string()
        } else if preview_print_only {
            "Preview & Print Only".to_string()
        } else if editable {
            "Editable Embedding".to_string()
        } else {
            "Installable Embedding (Full Rights)".to_string()
        };

        EmbeddingLicense {
            installable,
            editable,
            preview_print_only,
            restricted_license,
            description,
        }
    }

    /// Find offset and length of an SFNT table by 4-byte tag
    fn find_table(bytes: &[u8], target_tag: &[u8; 4]) -> Option<(usize, usize)> {
        if bytes.len() < 12 {
            return None;
        }
        let num_tables = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
        let mut offset = 12;

        for _ in 0..num_tables {
            if offset + 16 > bytes.len() {
                break;
            }
            if &bytes[offset..offset + 4] == target_tag {
                let table_offset = u32::from_be_bytes([
                    bytes[offset + 8],
                    bytes[offset + 9],
                    bytes[offset + 10],
                    bytes[offset + 11],
                ]) as usize;
                let table_length = u32::from_be_bytes([
                    bytes[offset + 12],
                    bytes[offset + 13],
                    bytes[offset + 14],
                    bytes[offset + 15],
                ]) as usize;
                return Some((table_offset, table_length));
            }
            offset += 16;
        }
        None
    }
}
