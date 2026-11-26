use Fontivo::server::state::{AppState, BrandColor, BrandKit};

#[test]
fn test_brand_kits_initialization_and_crud() {
    let mut state = AppState::new();
    let initial_kits = state.get_brand_kits();
    assert!(
        !initial_kits.is_empty(),
        "Default seed brand kits should exist"
    );

    // Create a new custom brand kit
    let new_kit = BrandKit {
        id: "test-fintech-kit".to_string(),
        name: "Test NeoBank App".to_string(),
        client: Some("FinTech Global".to_string()),
        heading_font_id: Some(1),
        heading_font_name: Some("Cairo".to_string()),
        body_font_id: Some(2),
        body_font_name: Some("Inter".to_string()),
        accent_font_id: None,
        accent_font_name: None,
        colors: vec![
            BrandColor {
                name: "Primary Indigo".to_string(),
                hex: "#4f46e5".to_string(),
                role: "primary".to_string(),
            },
            BrandColor {
                name: "Slate Text".to_string(),
                hex: "#0f172a".to_string(),
                role: "text".to_string(),
            },
        ],
        notes: Some("Unit test brand kit".to_string()),
        updated_at: 1000,
    };

    let saved = state.save_brand_kit(new_kit.clone());
    assert_eq!(saved.name, "Test NeoBank App");

    let kits_after = state.get_brand_kits();
    assert!(kits_after.iter().any(|k| k.id == "test-fintech-kit"));

    // Delete
    let deleted = state.delete_brand_kit("test-fintech-kit");
    assert!(deleted);
    let kits_deleted = state.get_brand_kits();
    assert!(!kits_deleted.iter().any(|k| k.id == "test-fintech-kit"));
}

#[test]
fn test_font_arabic_and_glyph_enrichment() {
    let state = AppState::new();
    assert!(!state.fonts.is_empty(), "Fonts cache should be loaded");

    // Check that arabic fonts have glyph coverage flags set
    let arabic_font = state.fonts.iter().find(|f| f.is_arabic);
    if let Some(font) = arabic_font {
        assert!(
            font.has_tashkeel,
            "Arabic fonts should have tashkeel flag set"
        );
        assert!(
            font.has_arabic_numerals,
            "Arabic fonts should have arabic numerals flag set"
        );
    }
}
