use std::collections::HashSet;
use Fontivo::server::AppState;

#[test]
fn test_app_state_initialization() {
    let state = AppState::new();
    println!("Loaded fonts count in AppState: {}", state.fonts.len());

    assert!(
        !state.fonts.is_empty(),
        "AppState should load real installed Windows system fonts and user library"
    );
    assert!(
        state.fonts.len() >= 50,
        "Should load installed Windows system fonts out of the box"
    );

    // Verify properties of loaded fonts
    let sample_font = &state.fonts[0];
    assert!(!sample_font.name.is_empty(), "Font should have a name");
    assert!(!sample_font.path.is_empty(), "Font should have a path");
    assert!(!sample_font.format.is_empty(), "Font should have a format");
    assert_eq!(
        sample_font.source, "system",
        "First loaded fonts should be real installed Windows system fonts"
    );
    assert_eq!(
        sample_font.sub_category.as_deref(),
        Some("Windows System Fonts")
    );
    assert!(
        !sample_font.is_active,
        "Windows system fonts must NEVER be marked active in Fontivo RAM"
    );

    // Verify exact non-overlapping source breakdown and no un-downloaded ghost Google fonts
    let mut system_count = 0usize;
    let mut google_count = 0usize;
    let mut cloud_count = 0usize;
    let mut local_count = 0usize;
    for f in &state.fonts {
        assert!(
            f.is_local && std::path::Path::new(&f.path).exists(),
            "Every font in AppState must exist on disk: {}",
            f.path
        );
        match f.source.as_str() {
            "system" => {
                system_count += 1;
                assert!(
                    !f.is_active,
                    "Windows system font {} must not be active in Fontivo RAM",
                    f.name
                );
            }
            "google" => google_count += 1,
            "cloud" => cloud_count += 1,
            "local" => local_count += 1,
            other => panic!("Unexpected font source '{}'", other),
        }
    }
    assert!(system_count > 0, "systemCount must be > 0 on Windows");
    assert_eq!(
        system_count + google_count + cloud_count + local_count,
        state.fonts.len()
    );
}

#[test]
fn test_arabic_fonts_filtering() {
    let state = AppState::new();
    let arabic_fonts: Vec<_> = state
        .fonts
        .iter()
        .filter(|f| f.is_arabic || f.category.contains("Arabic"))
        .collect();

    println!("Total Arabic fonts in library: {}", arabic_fonts.len());
    assert!(
        !arabic_fonts.is_empty(),
        "Should detect Arabic-capable Windows system fonts"
    );
}

#[test]
fn test_family_grouping() {
    let state = AppState::new();
    let mut families = HashSet::new();
    for f in &state.fonts {
        let fam_name = f.family.clone().unwrap_or_else(|| f.name.clone());
        families.insert(fam_name);
    }

    println!("Total unique font families: {}", families.len());
    assert!(
        families.len() >= 30,
        "Should group installed fonts into multiple unique families"
    );
}
