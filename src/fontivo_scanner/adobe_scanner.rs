use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DesignFontItem {
    pub name: String,
    pub status: String, // "active", "available", "google", "missing"
    pub font_id: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_id: Option<usize>,
    pub available: bool,
    pub is_matched: bool,
    pub is_active: bool,
    pub family: Option<String>,
    pub path: Option<String>,
    pub post_script_name: Option<String>,
    pub style: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DesignInspectionResult {
    pub success: bool,
    pub file_path: String,
    pub file_name: String,
    pub total_fonts: usize,
    pub total_detected: usize,
    pub matched_count: usize,
    pub already_active_count: usize,
    pub available_ids: Vec<usize>,
    pub available_fonts: Vec<DesignFontItem>,
    pub missing_fonts: Vec<DesignFontItem>,
    pub fonts: Vec<DesignFontItem>,
}

pub struct AdobeScanner;

impl AdobeScanner {
    /// Extracts font names from PSD, PSB, AI, INDD, PDF, EPS, SVG files using
    /// streaming overlapping 8 MB chunks (up to 2 GB) so large 100MB+ PSDs
    /// (whose `/FontSet` & `TySh` metadata sits past 100 MB) are scanned completely
    /// with minimal RAM usage.
    pub fn extract_font_names(path: &Path) -> Result<Vec<String>, String> {
        use std::io::Read;
        let mut file = fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
        let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);

        // Small files (<= 32 MB): fast single-pass in-memory scan
        if file_len <= 32 * 1024 * 1024 {
            let mut bytes = Vec::with_capacity(file_len as usize);
            file.read_to_end(&mut bytes)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            return Ok(Self::extract_font_names_from_bytes(&bytes));
        }

        // Large files (> 32 MB, up to 2 GB): stream in 8 MB chunks with 128 KB overlap
        const CHUNK_SIZE: usize = 8 * 1024 * 1024;
        const OVERLAP: usize = 128 * 1024;
        const MAX_SCAN_BYTES: u64 = 2 * 1024 * 1024 * 1024;

        let mut found_names = HashSet::new();
        let mut buf = vec![0u8; CHUNK_SIZE + OVERLAP];
        let mut carry = 0usize;
        let mut total_read: u64 = 0;

        while total_read < MAX_SCAN_BYTES {
            let n = file
                .read(&mut buf[carry..carry + CHUNK_SIZE])
                .map_err(|e| format!("Failed to read file chunk: {}", e))?;
            if n == 0 {
                break;
            }
            total_read += n as u64;
            let valid_len = carry + n;
            let slice = &buf[..valid_len];

            Self::scan_xmp_metadata(slice, &mut found_names);
            Self::scan_font_set_bytes(slice, &mut found_names);
            Self::scan_pdf_font_dicts(slice, &mut found_names);

            if valid_len > OVERLAP {
                buf.copy_within(valid_len - OVERLAP..valid_len, 0);
                carry = OVERLAP;
            } else {
                carry = valid_len;
            }
        }

        Ok(Self::finalize_found_names(found_names))
    }

    /// Extracts font names directly from an in-memory buffer of PSD, AI, INDD, PDF, EPS, SVG bytes.
    pub fn extract_font_names_from_bytes(bytes: &[u8]) -> Vec<String> {
        let mut found_names = HashSet::new();

        // 1. Scan XMP Packets
        Self::scan_xmp_metadata(bytes, &mut found_names);

        // 2. Scan Binary /FontSet [ ... ]
        Self::scan_font_set_bytes(bytes, &mut found_names);

        // 3. Scan /FontName or /BaseFont /Name
        Self::scan_pdf_font_dicts(bytes, &mut found_names);

        Self::finalize_found_names(found_names)
    }

    fn finalize_found_names(found_names: HashSet<String>) -> Vec<String> {
        // Clean & Filter names
        let mut clean_list: Vec<String> = found_names
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !Self::is_internal_adobe_non_font(s))
            .collect();

        clean_list.sort();
        clean_list.dedup();

        clean_list
    }

    /// Filters out Photoshop / Illustrator / InDesign internal engine tokens
    /// (color spaces, kinsoku/mojikumi rules, paragraph composers, default presets,
    /// XMP/UUID metadata) that appear inside `/FontSet` or XMP streams but are NOT fonts.
    pub fn is_internal_adobe_non_font(raw: &str) -> bool {
        let s = raw.trim();
        if s.is_empty() || s.len() <= 1 {
            return true;
        }
        if s.starts_with("uuid:")
            || s.starts_with("xmp.")
            || s.starts_with("http")
            || s.contains('/')
            || s.contains(':')
        {
            return true;
        }
        if s.len() == 32 && s.chars().all(|c| c.is_ascii_hexdigit()) {
            return true;
        }

        let lower = s.to_ascii_lowercase();

        // Adobe invisible / system / CJK kinsoku & mojikumi & composer internal tokens
        const SUBSTRING_DENYLIST: &[&str] = &[
            "adobeinvisfont",
            "kinsoku",
            "mojikumi",
            "burasagari",
            "singlelinecomposer",
            "everylinecomposer",
            "worldreadycomposer",
            "photoshopdefault",
            "illustratordefault",
        ];
        if SUBSTRING_DENYLIST.iter().any(|tok| lower.contains(tok)) {
            return true;
        }

        // Exact-match Photoshop/Illustrator style & color-space preset names
        const EXACT_DENYLIST: &[&str] = &[
            "normal rgb",
            "normal cmyk",
            "normal lab",
            "normal gray",
            "normal grey",
            "normal",
            "default",
            "standard",
            "nobreak",
            "rgb",
            "cmyk",
            "lab",
            "grayscale",
            "none",
            "auto",
            "all",
            "basic paragraph",
            "[basic paragraph]",
            "[no paragraph style]",
            "[none]",
        ];
        if EXACT_DENYLIST.contains(&lower.as_str()) {
            return true;
        }

        false
    }

    fn scan_xmp_metadata(bytes: &[u8], found: &mut HashSet<String>) {
        let text = String::from_utf8_lossy(bytes);
        let xmp_start_tag = "<x:xmpmeta";
        let xmp_end_tag = "</x:xmpmeta>";

        let mut start_idx = 0;
        while let Some(pos) = text[start_idx..].find(xmp_start_tag) {
            let actual_start = start_idx + pos;
            if let Some(end_pos) = text[actual_start..].find(xmp_end_tag) {
                let actual_end = actual_start + end_pos + xmp_end_tag.len();
                let xmp_chunk = &text[actual_start..actual_end];

                // Extract fonts from photoshop:Fonts block
                if let Some(f_start) = xmp_chunk.find("<photoshop:Fonts>") {
                    if let Some(f_end) = xmp_chunk[f_start..].find("</photoshop:Fonts>") {
                        let fonts_chunk = &xmp_chunk[f_start..f_start + f_end];
                        Self::extract_tag_contents(fonts_chunk, "<rdf:li>", "</rdf:li>", found);
                    }
                }

                // Extract fonts from xmpTPg:Fonts block (Illustrator / InDesign)
                if let Some(f_start) = xmp_chunk.find("<xmpTPg:Fonts>") {
                    if let Some(f_end) = xmp_chunk[f_start..].find("</xmpTPg:Fonts>") {
                        let fonts_chunk = &xmp_chunk[f_start..f_start + f_end];
                        Self::extract_tag_contents(
                            fonts_chunk,
                            "<stFnt:fontName>",
                            "</stFnt:fontName>",
                            found,
                        );
                        Self::extract_tag_contents(
                            fonts_chunk,
                            "<stFnt:fontFamily>",
                            "</stFnt:fontFamily>",
                            found,
                        );
                        Self::extract_attribute_values(
                            fonts_chunk,
                            "stFnt:fontName=\"",
                            "\"",
                            found,
                        );
                        Self::extract_attribute_values(
                            fonts_chunk,
                            "stFnt:fontFamily=\"",
                            "\"",
                            found,
                        );
                    }
                }

                start_idx = actual_end;
            } else {
                break;
            }
        }
    }

    fn extract_tag_contents(
        text: &str,
        open_tag: &str,
        close_tag: &str,
        found: &mut HashSet<String>,
    ) {
        let mut cursor = 0;
        while let Some(pos) = text[cursor..].find(open_tag) {
            let start = cursor + pos + open_tag.len();
            if let Some(end_pos) = text[start..].find(close_tag) {
                let val = &text[start..start + end_pos].trim();
                if !val.is_empty() && !val.contains('<') && !val.contains('>') {
                    found.insert(val.to_string());
                }
                cursor = start + end_pos + close_tag.len();
            } else {
                break;
            }
        }
    }

    fn extract_attribute_values(
        text: &str,
        prefix: &str,
        suffix: &str,
        found: &mut HashSet<String>,
    ) {
        let mut cursor = 0;
        while let Some(pos) = text[cursor..].find(prefix) {
            let start = cursor + pos + prefix.len();
            if let Some(end_pos) = text[start..].find(suffix) {
                let val = &text[start..start + end_pos].trim();
                if !val.is_empty() {
                    found.insert(val.to_string());
                }
                cursor = start + end_pos + suffix.len();
            } else {
                break;
            }
        }
    }

    fn scan_font_set_bytes(bytes: &[u8], found: &mut HashSet<String>) {
        // Look for /Name ( ... ) inside font descriptors
        let name_marker = b"/Name (";
        let mut cursor = 0;
        while cursor + name_marker.len() < bytes.len() {
            if let Some(pos) = bytes[cursor..]
                .windows(name_marker.len())
                .position(|w| w == name_marker)
            {
                let start = cursor + pos + name_marker.len();
                if let Some(end_pos) = bytes[start..].iter().position(|&b| b == b')') {
                    let raw_bytes = &bytes[start..start + end_pos];
                    let clean = Self::decode_font_name_bytes(raw_bytes);
                    if clean.len() > 1 {
                        found.insert(clean);
                    }
                    cursor = start + end_pos + 1;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    fn scan_pdf_font_dicts(bytes: &[u8], found: &mut HashSet<String>) {
        for marker in &[&b"/FontName /"[..], &b"/BaseFont /"[..]] {
            let mut cursor = 0;
            while cursor + marker.len() < bytes.len() {
                if let Some(pos) = bytes[cursor..]
                    .windows(marker.len())
                    .position(|w| w == *marker)
                {
                    let start = cursor + pos + marker.len();
                    let mut end = start;
                    while end < bytes.len()
                        && (bytes[end].is_ascii_alphanumeric()
                            || bytes[end] == b'+'
                            || bytes[end] == b'-'
                            || bytes[end] == b'_')
                    {
                        end += 1;
                    }
                    if end > start {
                        let name_bytes = &bytes[start..end];
                        let mut name = String::from_utf8_lossy(name_bytes).to_string();
                        // Strip subset prefix (e.g. ABCDEF+FontName)
                        if let Some(plus_idx) = name.find('+') {
                            if plus_idx == 6 {
                                name = name[7..].to_string();
                            }
                        }
                        if name.len() > 1 {
                            found.insert(name);
                        }
                    }
                    cursor = end;
                } else {
                    break;
                }
            }
        }
    }

    fn decode_font_name_bytes(raw: &[u8]) -> String {
        // Check if UTF-16BE (starts with FE FF or contains null bytes)
        if raw.len() >= 2 && raw.contains(&0) {
            let mut u16_chars = Vec::new();
            let mut i = 0;
            // Skip BOM if present
            if raw.len() >= 2 && raw[0] == 0xFE && raw[1] == 0xFF {
                i = 2;
            }
            while i + 1 < raw.len() {
                let code = ((raw[i] as u16) << 8) | (raw[i + 1] as u16);
                u16_chars.push(code);
                i += 2;
            }
            let s = String::from_utf16_lossy(&u16_chars);
            s.trim().to_string()
        } else {
            String::from_utf8_lossy(raw).trim().to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filters_photoshop_internal_non_font_tokens() {
        let fake_psd_stream = br#"
            /FontSet [
                << /Name (Poppins-BlackItalic) >>
                << /Name (Raleway-ExtraBold) >>
                << /Name (Normal RGB) >>
                << /Name (Normal CMYK) >>
                << /Name (PhotoshopKinsokuHard) >>
                << /Name (PhotoshopKinsokuSoft) >>
                << /Name (AdobeInvisFont) >>
                << /Name (AdobeEveryLineComposer) >>
                << /Name (MojikumiTable1) >>
                << /Name (MyriadPro-Regular) >>
            ]
        "#;

        let extracted = AdobeScanner::extract_font_names_from_bytes(fake_psd_stream);
        assert!(extracted.contains(&"Poppins-BlackItalic".to_string()));
        assert!(extracted.contains(&"Raleway-ExtraBold".to_string()));
        assert!(extracted.contains(&"MyriadPro-Regular".to_string()));

        assert!(!extracted.contains(&"Normal RGB".to_string()));
        assert!(!extracted.contains(&"Normal CMYK".to_string()));
        assert!(!extracted.contains(&"PhotoshopKinsokuHard".to_string()));
        assert!(!extracted.contains(&"PhotoshopKinsokuSoft".to_string()));
        assert!(!extracted.contains(&"AdobeInvisFont".to_string()));
        assert!(!extracted.contains(&"AdobeEveryLineComposer".to_string()));
        assert!(!extracted.contains(&"MojikumiTable1".to_string()));
    }

    #[test]
    fn test_extract_board_psd_real_file_if_present() {
        let board_path = std::path::Path::new(r"C:\Users\ahmed\Downloads\BOARD.psd");
        if board_path.exists() {
            let res = AdobeScanner::extract_font_names(board_path);
            assert!(res.is_ok(), "Failed to scan BOARD.psd: {:?}", res.err());
            let fonts = res.unwrap();
            println!(
                "Extracted fonts from real BOARD.psd ({} fonts): {:?}",
                fonts.len(),
                fonts
            );
            assert!(
                fonts.len() >= 5,
                "Expected at least 5 fonts from BOARD.psd, got: {:?}",
                fonts
            );
            assert!(fonts.contains(&"BebasNeue-Regular".to_string()));
            assert!(fonts.contains(&"Poppins-BlackItalic".to_string()));
            assert!(fonts.contains(&"Raleway-ExtraBold".to_string()));
            // Ensure no internal non-font tokens leak through
            assert!(!fonts.contains(&"Normal RGB".to_string()));
            assert!(!fonts.contains(&"PhotoshopKinsokuHard".to_string()));
        }
    }
}
