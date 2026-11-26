use Fontivo::google::google_fonts::GoogleFontsManager;

#[test]
fn test_google_fonts_catalog() {
    let catalog = GoogleFontsManager::get_curated_catalog();
    assert!(
        !catalog.is_empty(),
        "Google Fonts catalog should contain fonts"
    );
    assert!(
        catalog.len() >= 120,
        "Should have 120+ popular Google fonts pre-indexed in curated catalog, got {}",
        catalog.len()
    );

    let families: Vec<&str> = catalog.iter().map(|f| f.family.as_str()).collect();
    assert!(
        families.contains(&"Cairo"),
        "Catalog should include Cairo font"
    );
    assert!(
        families.contains(&"Roboto"),
        "Catalog should include Roboto font"
    );
    assert!(
        families.contains(&"Tajawal"),
        "Catalog should include Tajawal font"
    );
    assert!(
        families.contains(&"Amiri"),
        "Catalog should include Amiri font"
    );

    let cairo = catalog.iter().find(|f| f.family == "Cairo").unwrap();
    assert!(cairo.is_arabic, "Cairo should be marked as Arabic");
    assert!(
        !cairo.download_url.is_empty(),
        "Download URL should be valid"
    );
}

#[test]
fn test_google_fonts_categories() {
    let catalog = GoogleFontsManager::get_curated_catalog();

    let arabic_fonts: Vec<_> = catalog.iter().filter(|f| f.is_arabic).collect();
    assert!(
        arabic_fonts.len() >= 4,
        "Should have at least 4 Arabic families in curated list"
    );

    let sans_serif: Vec<_> = catalog
        .iter()
        .filter(|f| f.category == "sans-serif")
        .collect();
    assert!(
        !sans_serif.is_empty(),
        "Should contain sans-serif category fonts"
    );

    let serif: Vec<_> = catalog.iter().filter(|f| f.category == "serif").collect();
    assert!(!serif.is_empty(), "Should contain serif category fonts");
}

#[test]
fn test_storage_dir_resolution() {
    let dir = GoogleFontsManager::get_storage_dir();
    assert!(dir.to_string_lossy().contains("Fontivo"));
}

#[test]
fn test_download_roboto_resolves_and_succeeds() {
    let path = GoogleFontsManager::download_font("Roboto");
    assert!(
        path.is_ok(),
        "Roboto download should succeed without 404, got: {:?}",
        path.err()
    );
    let p = path.unwrap();
    assert!(p.exists(), "Downloaded font file should exist on disk");
}
