use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontCollection {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_smart: bool,
    pub rules: Option<SmartFilterRules>,
    pub font_paths: HashSet<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SmartFilterRules {
    pub script: Option<String>,  // "Arabic", "Latin", etc.
    pub min_weight: Option<u16>, // e.g. 700 for Bold
    pub max_weight: Option<u16>, // e.g. 300 for Thin/Light
    pub format: Option<String>,  // "otf", "ttf"
    pub require_ligatures: Option<bool>,
    pub require_kerning: Option<bool>,
    pub search_query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CollectionStore {
    pub collections: HashMap<String, FontCollection>,
    pub font_tags: HashMap<String, HashSet<String>>, // font_path -> set of tags
}

impl CollectionStore {
    pub fn new() -> Self {
        let mut store = Self {
            collections: HashMap::new(),
            font_tags: HashMap::new(),
        };
        store.init_default_smart_collections();
        store
    }

    /// Pre-populate built-in smart collections matching FontBase standard categories
    pub fn init_default_smart_collections(&mut self) {
        let arabic_coll = FontCollection {
            id: "smart_arabic".to_string(),
            name: "Arabic Fonts (الخطوط العربية)".to_string(),
            description: Some("Fonts with full Arabic script support".to_string()),
            color: Some("#00d304".to_string()),
            icon: Some("globe".to_string()),
            is_smart: true,
            rules: Some(SmartFilterRules {
                script: Some("Arabic".to_string()),
                ..Default::default()
            }),
            font_paths: HashSet::new(),
            created_at: 1700000000,
            updated_at: 1700000000,
        };

        let bold_coll = FontCollection {
            id: "smart_bold".to_string(),
            name: "Bold & Heavy Display".to_string(),
            description: Some("Heavy weights (700+) suitable for headlines".to_string()),
            color: Some("#FF5722".to_string()),
            icon: Some("bold".to_string()),
            is_smart: true,
            rules: Some(SmartFilterRules {
                min_weight: Some(700),
                ..Default::default()
            }),
            font_paths: HashSet::new(),
            created_at: 1700000000,
            updated_at: 1700000000,
        };

        let otf_coll = FontCollection {
            id: "smart_opentype".to_string(),
            name: "OpenType Pro Features".to_string(),
            description: Some(
                "Professional OTF fonts with advanced ligatures & kerning".to_string(),
            ),
            color: Some("#6236FF".to_string()),
            icon: Some("layers".to_string()),
            is_smart: true,
            rules: Some(SmartFilterRules {
                format: Some("otf".to_string()),
                require_ligatures: Some(true),
                ..Default::default()
            }),
            font_paths: HashSet::new(),
            created_at: 1700000000,
            updated_at: 1700000000,
        };

        self.collections.insert(arabic_coll.id.clone(), arabic_coll);
        self.collections.insert(bold_coll.id.clone(), bold_coll);
        self.collections.insert(otf_coll.id.clone(), otf_coll);
    }

    /// Load collections from disk or create if absent
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Self {
        let p = path.as_ref();
        if p.exists() {
            if let Ok(mut f) = File::open(p) {
                let mut content = String::new();
                if f.read_to_string(&mut content).is_ok() {
                    if let Ok(store) = serde_json::from_str::<CollectionStore>(&content) {
                        return store;
                    }
                }
            }
        }
        let store = Self::new();
        let _ = store.save_to_file(p);
        store
    }

    /// Save current collections and tags to disk
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let p = path.as_ref();
        if let Some(parent) = p.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Serialization error: {}", e))?;
        let mut file = File::create(p).map_err(|e| format!("Failed to create file: {}", e))?;
        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write file: {}", e))?;
        Ok(())
    }

    /// Create or update a collection
    pub fn upsert_collection(&mut self, coll: FontCollection) {
        self.collections.insert(coll.id.clone(), coll);
    }

    /// Delete a collection
    pub fn delete_collection(&mut self, id: &str) -> bool {
        self.collections.remove(id).is_some()
    }

    /// Add a font path to a user collection
    pub fn add_font_to_collection(&mut self, coll_id: &str, font_path: &str) -> bool {
        if let Some(coll) = self.collections.get_mut(coll_id) {
            if !coll.is_smart {
                coll.font_paths.insert(font_path.to_string());
                coll.updated_at = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                return true;
            }
        }
        false
    }

    /// Remove a font path from a user collection
    pub fn remove_font_from_collection(&mut self, coll_id: &str, font_path: &str) -> bool {
        if let Some(coll) = self.collections.get_mut(coll_id) {
            if !coll.is_smart {
                let removed = coll.font_paths.remove(font_path);
                if removed {
                    coll.updated_at = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                }
                return removed;
            }
        }
        false
    }

    /// Add a tag to a font
    pub fn add_tag(&mut self, font_path: &str, tag: &str) {
        let entry = self.font_tags.entry(font_path.to_string()).or_default();
        entry.insert(tag.trim().to_lowercase());
    }

    /// Remove a tag from a font
    pub fn remove_tag(&mut self, font_path: &str, tag: &str) -> bool {
        if let Some(tags) = self.font_tags.get_mut(font_path) {
            return tags.remove(&tag.trim().to_lowercase());
        }
        false
    }

    /// Get tags for a font
    pub fn get_tags(&self, font_path: &str) -> Vec<String> {
        self.font_tags
            .get(font_path)
            .map(|tags| tags.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// List all unique tags in library
    pub fn list_all_tags(&self) -> Vec<String> {
        let mut set = HashSet::new();
        for tags in self.font_tags.values() {
            for tag in tags {
                set.insert(tag.clone());
            }
        }
        let mut list: Vec<String> = set.into_iter().collect();
        list.sort();
        list
    }
}
