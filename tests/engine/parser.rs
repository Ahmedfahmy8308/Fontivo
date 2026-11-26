use std::path::PathBuf;
use Fontivo::parser::FontParser;

#[test]
fn test_detect_format_ttf() {
    let ttf_header = [0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x00, 0x80];
    assert_eq!(FontParser::detect_format(&ttf_header), "ttf");
}

#[test]
fn test_detect_format_otf() {
    let otf_header = b"OTTO\x00\x08\x00\x80";
    assert_eq!(FontParser::detect_format(otf_header), "otf");
}

#[test]
fn test_detect_format_ttc() {
    let ttc_header = b"ttcf\x00\x01\x00\x00";
    assert_eq!(FontParser::detect_format(ttc_header), "ttc");
}

#[test]
fn test_detect_format_woff() {
    let woff_header = b"wOFF\x00\x01\x00\x00";
    assert_eq!(FontParser::detect_format(woff_header), "woff");
}

#[test]
fn test_detect_format_invalid_short() {
    let invalid = [0x00, 0x01];
    assert_eq!(FontParser::detect_format(&invalid), "unknown");
}

#[test]
fn test_parse_real_font_from_library() {
    let candidates = [
        PathBuf::from("../../01 - Fonts"),
        PathBuf::from("../01 - Fonts"),
        PathBuf::from("01 - Fonts"),
    ];

    let mut found_font = None;
    for base in &candidates {
        if base.exists() {
            for entry in walk_dir(base) {
                if let Some(ext) = entry.extension().and_then(|s| s.to_str()) {
                    let e = ext.to_lowercase();
                    if e == "ttf" || e == "otf" {
                        found_font = Some(entry);
                        break;
                    }
                }
            }
        }
        if found_font.is_some() {
            break;
        }
    }

    if let Some(font_path) = found_font {
        let result = FontParser::parse_file(&font_path);
        assert!(
            result.is_ok(),
            "Failed to parse font {:?}: {:?}",
            font_path,
            result.err()
        );

        let meta = result.unwrap();
        assert!(!meta.family.is_empty(), "Family name should not be empty");
        assert!(meta.units_per_em > 0, "Units per em should be positive");
        assert!(meta.glyph_count > 0, "Glyph count should be positive");
        assert!(
            meta.weight_class >= 100 && meta.weight_class <= 1000,
            "Weight class should be valid"
        );
        assert!(!meta.format.is_empty(), "Format string should be populated");
        assert!(
            !meta.coverage.primary_script.is_empty(),
            "Primary script should be classified"
        );
        assert!(
            !meta.embedding.description.is_empty(),
            "Embedding description should be set"
        );
        assert!(
            meta.metrics.ascender != 0 || meta.metrics.descender != 0,
            "Metrics should be parsed"
        );
    }
}

#[test]
fn test_parse_corrupted_bytes() {
    let corrupt = [0x00, 0x01, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF];
    let res = FontParser::parse_bytes(&corrupt, "corrupt_font");
    assert!(
        res.is_err(),
        "Corrupted font bytes should return error gracefully"
    );
}

fn walk_dir(dir: &std::path::Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                files.extend(walk_dir(&p));
            } else {
                files.push(p);
            }
        }
    }
    files
}
