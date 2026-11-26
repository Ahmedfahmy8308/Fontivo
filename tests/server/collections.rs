use std::collections::HashSet;
use Fontivo::collections::{CollectionStore, FontCollection};

#[test]
fn test_default_smart_collections() {
    let store = CollectionStore::new();
    assert!(store.collections.contains_key("smart_arabic"));
    assert!(store.collections.contains_key("smart_bold"));
    assert!(store.collections.contains_key("smart_opentype"));

    let arabic = store.collections.get("smart_arabic").unwrap();
    assert!(arabic.is_smart);
    assert_eq!(
        arabic.rules.as_ref().unwrap().script.as_deref(),
        Some("Arabic")
    );
}

#[test]
fn test_custom_collection_crud() {
    let mut store = CollectionStore::new();

    let custom = FontCollection {
        id: "my_branding".to_string(),
        name: "My Branding Project".to_string(),
        description: Some("Fonts used in 2026 rebrand".to_string()),
        color: Some("#5200ea".to_string()),
        icon: Some("folder".to_string()),
        is_smart: false,
        rules: None,
        font_paths: HashSet::new(),
        created_at: 1000,
        updated_at: 1000,
    };

    store.upsert_collection(custom);
    assert!(store.collections.contains_key("my_branding"));

    // Add font to collection
    let added = store.add_font_to_collection("my_branding", "C:/Fonts/Cairo-Bold.ttf");
    assert!(added);
    assert_eq!(
        store
            .collections
            .get("my_branding")
            .unwrap()
            .font_paths
            .len(),
        1
    );

    // Remove font from collection
    let removed = store.remove_font_from_collection("my_branding", "C:/Fonts/Cairo-Bold.ttf");
    assert!(removed);
    assert_eq!(
        store
            .collections
            .get("my_branding")
            .unwrap()
            .font_paths
            .len(),
        0
    );

    // Delete collection
    let deleted = store.delete_collection("my_branding");
    assert!(deleted);
    assert!(!store.collections.contains_key("my_branding"));
}

#[test]
fn test_font_tagging() {
    let mut store = CollectionStore::new();
    let font_path = "C:/Fonts/Amiri-Regular.ttf";

    store.add_tag(font_path, "Quranic");
    store.add_tag(font_path, "Naskh");
    store.add_tag(font_path, "Classical");

    let tags = store.get_tags(font_path);
    assert_eq!(tags.len(), 3);
    assert!(tags.contains(&"quranic".to_string()));

    store.remove_tag(font_path, "classical");
    let updated_tags = store.get_tags(font_path);
    assert_eq!(updated_tags.len(), 2);
    assert!(!updated_tags.contains(&"classical".to_string()));

    let all_tags = store.list_all_tags();
    assert_eq!(all_tags.len(), 2);
}

#[test]
fn test_store_disk_persistence() {
    let temp_file = std::env::temp_dir().join("test_collections_store.json");
    let mut store = CollectionStore::new();
    store.add_tag("dummy.ttf", "Display");
    let save_res = store.save_to_file(&temp_file);
    assert!(save_res.is_ok());

    let loaded_store = CollectionStore::load_from_file(&temp_file);
    assert!(loaded_store.collections.contains_key("smart_arabic"));
    assert_eq!(
        loaded_store.get_tags("dummy.ttf"),
        vec!["display".to_string()]
    );

    let _ = std::fs::remove_file(temp_file);
}
