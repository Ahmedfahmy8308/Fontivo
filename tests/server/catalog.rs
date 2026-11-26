use std::collections::HashMap;
use Fontivo::engine::downloader::FontPackManifest;
use Fontivo::google::google_fonts::GoogleFontsManager;
use Fontivo::server::adobe_listener::AdobeListener;
use Fontivo::server::routes::fonts::{is_pack_downloaded, CatalogPackageItem};
use Fontivo::server::routes::system::sample_cursor_pixel_now;
use Fontivo::server::state::AppState;

#[test]
fn test_manifest_15_release_packages_validation() {
    let manifest = FontPackManifest::default_manifest();

    // 1. Manifest structure and schema validation
    assert!(
        manifest.validate().is_ok(),
        "Manifest must pass all security and schema checks"
    );
    assert_eq!(manifest.schema_version, 1);
    assert_eq!(manifest.library_version, "1.0.3");
    assert_eq!(manifest.total_fonts, Some(10939));
    assert_eq!(manifest.total_families, Some(4430));
    assert_eq!(
        manifest.packs.len(),
        15,
        "Manifest must contain exactly 15 production packs"
    );

    // 2. Metrics validation (exact v1.0.3 totals: 10,939 fonts, 4,430 families, 864.01 MB)
    let total_fonts: usize = manifest.packs.iter().map(|p| p.font_count).sum();
    assert_eq!(
        total_fonts, 10939,
        "Total fonts across 15 packages must equal exactly 10,939"
    );

    let total_compressed_bytes: u64 = manifest.packs.iter().map(|p| p.compressed_size).sum();
    assert_eq!(
        total_compressed_bytes, 905982558,
        "Total compressed bytes must equal 905,982,558 bytes (864.01 MB)"
    );

    let total_uncompressed_bytes: u64 = manifest.packs.iter().map(|p| p.uncompressed_size).sum();
    assert_eq!(
        total_uncompressed_bytes, 1762816362,
        "Total uncompressed bytes must equal 1,762,816,362 bytes"
    );

    // 3. URLs, checksums, and verified v1.0.3 script categories validation
    let base_url = "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/";
    for (i, pack) in manifest.packs.iter().enumerate() {
        let expected_id = format!("pack-essential-{:03}", i + 1);
        let expected_file = format!("fontivo-essential-{:03}.zip", i + 1);
        let expected_url = format!("{}{}", base_url, expected_file);

        assert_eq!(pack.id, expected_id);
        assert_eq!(pack.file_name, expected_file);
        assert_eq!(pack.download_url, expected_url);
        assert!(pack.version == "1.0.3" || pack.version == "1.0.5");
        assert_eq!(pack.sha256.len(), 64, "SHA-256 hash must be 64 characters");
        assert!(
            pack.sha256.chars().all(|c| c.is_ascii_hexdigit()),
            "SHA-256 must be valid hex"
        );

        let cat = pack
            .category
            .as_deref()
            .expect("Every pack must specify a category");
        assert!(
            matches!(
                cat,
                "Arabic" | "Latin" | "Persian" | "Urdu" | "Multilingual"
            ),
            "Pack {} has unexpected category '{}'",
            pack.id,
            cat
        );
        let desc = pack.description.as_deref().unwrap_or("");
        for forbidden in ["Hebrew", "Indic", "Symbols"] {
            assert!(
                !cat.contains(forbidden),
                "Category must not contain {}",
                forbidden
            );
            assert!(
                !pack.name.contains(forbidden),
                "Name must not contain {}",
                forbidden
            );
            assert!(
                !desc.contains(forbidden),
                "Description must not contain {}",
                forbidden
            );
        }
    }

    assert_eq!(manifest.packs[0].category.as_deref(), Some("Arabic"));
    assert_eq!(manifest.packs[0].font_count, 970);
    assert_eq!(manifest.packs[1].category.as_deref(), Some("Latin"));
    assert_eq!(manifest.packs[1].font_count, 848);
    assert_eq!(manifest.packs[9].category.as_deref(), Some("Persian"));
    assert_eq!(manifest.packs[9].font_count, 1253);
    assert_eq!(manifest.packs[10].category.as_deref(), Some("Urdu"));
    assert_eq!(manifest.packs[10].font_count, 405);
    assert_eq!(manifest.packs[14].category.as_deref(), Some("Multilingual"));
    assert_eq!(manifest.packs[14].font_count, 20);
}

#[test]
fn test_remote_manifest_wire_parser() {
    let sample_wire = r#"{
        "schemaVersion": "1.0.0",
        "libraryVersion": "1.0.3",
        "summary": {
            "totalUniqueFonts": 10939,
            "totalFamilies": 4430,
            "totalPackages": 1,
            "totalCompressedSizeBytes": 42825441,
            "totalUncompressedSizeBytes": 92383140
        },
        "packages": {
            "pack-essential-001": {
                "id": "pack-essential-001",
                "fileName": "fontivo-essential-001.zip",
                "version": "1.0.5",
                "url": "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-001.zip",
                "fontCount": 970,
                "compressedSizeBytes": 42825441,
                "uncompressedSizeBytes": 92383140,
                "sha256": "8c932847ee9c1c62fd84e202d5c02786b7c9f02174bd8e5edc7b236f77b1c83e"
            }
        }
    }"#;

    let parsed = FontPackManifest::parse_manifest_json(sample_wire)
        .expect("Must parse GitHub Manifests/manifest.json wire schema");
    assert_eq!(parsed.library_version, "1.0.3");
    assert_eq!(parsed.total_fonts, Some(10939));
    assert_eq!(parsed.total_families, Some(4430));
    assert_eq!(parsed.packs.len(), 1);
    assert_eq!(parsed.packs[0].font_count, 970);
    assert_eq!(parsed.packs[0].category.as_deref(), Some("Arabic"));
}

#[test]
fn test_google_fonts_metadata_xssi_parsing() {
    let raw = ")]}'\n{\"familyMetadataList\":[{\"family\":\"Cairo\",\"category\":\"Sans Serif\",\"subsets\":[\"arabic\",\"latin\"],\"fonts\":{\"400\":{},\"700\":{}},\"axes\":[{\"tag\":\"wght\"}],\"designers\":[\"Mohamed Gaber\"],\"popularity\":12},{\"family\":\"Inter\",\"category\":\"Sans Serif\",\"subsets\":[\"latin\"],\"fonts\":{\"300\":{},\"400\":{},\"700i\":{}},\"axes\":[],\"designers\":[\"Rasmus Andersson\"],\"popularity\":3}]}";

    let entries = GoogleFontsManager::parse_metadata_json(raw)
        .expect("Must strip XSSI prefix and parse Google Fonts metadata");
    assert_eq!(entries.len(), 2);
    // Sorted by popularity ascending (Inter = 3 before Cairo = 12)
    assert_eq!(entries[0].family, "Inter");
    assert!(!entries[0].is_arabic);
    assert!(entries[0].is_latin);
    assert!(!entries[0].is_variable);
    assert_eq!(entries[0].variants, vec!["Light", "Regular", "BoldItalic"]);

    assert_eq!(entries[1].family, "Cairo");
    assert!(entries[1].is_arabic);
    assert!(entries[1].is_latin);
    assert!(entries[1].is_variable);
    assert_eq!(entries[1].category, "sans-serif");
    assert_eq!(entries[1].variants, vec!["Regular", "Bold"]);
}

#[test]
fn test_catalog_package_item_serialization() {
    let manifest = FontPackManifest::default_manifest();
    let sample = &manifest.packs[0];

    let item = CatalogPackageItem {
        id: sample.id.clone(),
        name: sample.name.clone(),
        category: sample.category.clone().unwrap_or_default(),
        font_count: sample.font_count,
        compressed_size: sample.compressed_size,
        uncompressed_size: sample.uncompressed_size,
        download_url: sample.download_url.clone(),
        file_name: sample.file_name.clone(),
        is_downloaded: is_pack_downloaded(sample),
        sha256: sample.sha256.clone(),
        description: sample.description.clone(),
    };

    let json_str = serde_json::to_string(&item).expect("Must serialize to JSON");
    assert!(json_str.contains("\"id\":\"pack-essential-001\""));
    assert!(json_str.contains("\"fontCount\":970"));
    assert!(json_str.contains("\"category\":\"Arabic\""));
    assert!(json_str.contains("\"compressedSize\":42825441"));
    assert!(json_str.contains("\"downloadUrl\":"));
    assert!(json_str.contains("\"isDownloaded\":"));
}

#[test]
fn test_app_state_is_local_flag_and_script_filters() {
    let state = AppState::new();
    assert!(
        !state.fonts.is_empty(),
        "AppState must load fonts from Google Fonts catalog or local library"
    );
    assert!(
        state.fonts.len() >= 120,
        "Must contain 120+ Google Fonts catalog records out-of-the-box without fonts-cache.json"
    );

    // Check that every font has is_local computed accurately
    for f in &state.fonts {
        let file_exists = std::path::Path::new(&f.path).exists();
        assert_eq!(
            f.is_local, file_exists,
            "f.is_local must match disk existence for {}",
            f.name
        );
        assert!(
            !f.source.is_empty(),
            "Every font must have an explicit source"
        );
    }

    // Verify filter_fonts with localOnly
    let mut q_local = HashMap::new();
    q_local.insert("localOnly".to_string(), "true".to_string());
    let local_fonts = Fontivo::server::routes::fonts::filter_fonts(&state, &q_local);
    for f in &local_fonts {
        assert!(
            f.is_local,
            "localOnly must only return fonts with is_local=true"
        );
    }

    // Verify scriptFilter=arabic, tashkeel, variable, bilingual, source=google
    for (filter_val, predicate) in [
        (
            "arabic",
            (|f: &Fontivo::server::state::FontRecord| f.is_arabic)
                as fn(&Fontivo::server::state::FontRecord) -> bool,
        ),
        ("tashkeel", |f| f.has_tashkeel),
        ("variable", |f| f.is_variable),
        ("bilingual", |f| f.is_bilingual),
    ] {
        let mut q = HashMap::new();
        q.insert("scriptFilter".to_string(), filter_val.to_string());
        let res = Fontivo::server::routes::fonts::filter_fonts(&state, &q);
        assert!(
            !res.is_empty(),
            "scriptFilter={} must return matching fonts",
            filter_val
        );
        for f in &res {
            assert!(
                predicate(f),
                "Font {} failed scriptFilter={}",
                f.name,
                filter_val
            );
        }
    }
}

#[test]
fn test_adobe_window_title_parsing() {
    assert_eq!(
        AdobeListener::parse_adobe_window_title(
            "Photoshop.exe",
            "Ramadan_Campaign.psd @ 100% (RGB/8) * - Adobe Photoshop 2025"
        ),
        Some(("Photoshop".to_string(), "Ramadan_Campaign.psd".to_string()))
    );
    assert_eq!(
        AdobeListener::parse_adobe_window_title(
            "Illustrator.exe",
            "Brand_Logo_v3.ai @ 66.7% (CMYK/GPU Preview)"
        ),
        Some(("Illustrator".to_string(), "Brand_Logo_v3.ai".to_string()))
    );
    assert_eq!(
        AdobeListener::parse_adobe_window_title(
            "InDesign.exe",
            "Annual_Report_2026.indd @ 75% - Adobe InDesign 2025"
        ),
        Some((
            "InDesign".to_string(),
            "Annual_Report_2026.indd".to_string()
        ))
    );
    assert_eq!(
        AdobeListener::parse_adobe_window_title("notepad.exe", "notes.txt - Notepad"),
        None
    );
}

#[test]
fn test_screen_cursor_pixel_sampling() {
    let sample = sample_cursor_pixel_now();
    assert!(sample.success);
    assert!(sample.hex.starts_with('#'));
    assert_eq!(sample.hex.len(), 7);
    assert_eq!(sample.grid5x5.len(), 5);
    assert_eq!(sample.grid5x5[0].len(), 5);
}
