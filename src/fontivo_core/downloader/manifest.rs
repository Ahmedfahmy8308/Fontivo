use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FontPackItem {
    pub id: String,
    pub name: String,
    pub version: String,
    pub download_url: String,
    pub file_name: String,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub sha256: String,
    pub font_count: usize,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FontPackManifest {
    pub schema_version: u32,
    pub library_version: String,
    #[serde(default)]
    pub total_fonts: Option<usize>,
    #[serde(default)]
    pub total_families: Option<usize>,
    #[serde(default)]
    pub total_compressed_size: Option<u64>,
    #[serde(default)]
    pub total_uncompressed_size: Option<u64>,
    pub packs: Vec<FontPackItem>,
}

/// Wire format of the live GitHub `Manifests/manifest.json` in `Ahmedfahmy8308/Fontivo-Fonts`
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteManifestWire {
    #[serde(default)]
    library_version: String,
    #[serde(default)]
    summary: Option<RemoteManifestSummary>,
    #[serde(default)]
    packages: HashMap<String, RemotePackageWire>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteManifestSummary {
    #[serde(default)]
    total_unique_fonts: Option<usize>,
    #[serde(default)]
    total_families: Option<usize>,
    #[serde(default)]
    total_compressed_size_bytes: Option<u64>,
    #[serde(default)]
    total_uncompressed_size_bytes: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemotePackageWire {
    id: String,
    file_name: String,
    #[serde(default)]
    version: String,
    url: String,
    font_count: usize,
    compressed_size_bytes: u64,
    uncompressed_size_bytes: u64,
    sha256: String,
}

type ManifestCacheEntry = (Instant, FontPackManifest, bool, String);

static MANIFEST_CACHE: OnceLock<RwLock<Option<ManifestCacheEntry>>> = OnceLock::new();
const MANIFEST_CACHE_TTL: Duration = Duration::from_secs(300);

fn pack_display_metadata(pack_id: &str, font_count: usize) -> (String, String, String) {
    match pack_id {
        "pack-essential-001" => (
            format!("Fontivo Essential Arabic Typography ({} Fonts)", font_count),
            "Arabic".to_string(),
            format!(
                "Curated collection of {} Arabic display, editorial, and UI fonts.",
                font_count
            ),
        ),
        "pack-essential-002" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 1 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 1 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-003" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 2 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 2 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-004" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 3 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 3 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-005" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 4 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 4 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-006" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 5 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 5 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-007" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 6 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 6 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-008" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 7 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 7 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-009" => (
            format!(
                "Fontivo Essential Latin Typography Vol. 8 ({} Fonts)",
                font_count
            ),
            "Latin".to_string(),
            format!(
                "Curated Latin typography collection part 8 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-010" => (
            format!(
                "Fontivo Essential Persian Typography ({} Fonts)",
                font_count
            ),
            "Persian".to_string(),
            format!(
                "Comprehensive Persian script, headline, and editorial archive ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-011" => (
            format!(
                "Fontivo Essential Urdu Typography Vol. 1 ({} Fonts)",
                font_count
            ),
            "Urdu".to_string(),
            format!(
                "Curated Urdu Nastaliq and Naskh collection part 1 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-012" => (
            format!(
                "Fontivo Essential Urdu Typography Vol. 2 ({} Fonts)",
                font_count
            ),
            "Urdu".to_string(),
            format!(
                "Curated Urdu Nastaliq and publication collection part 2 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-013" => (
            format!(
                "Fontivo Essential Urdu Typography Vol. 3 ({} Fonts)",
                font_count
            ),
            "Urdu".to_string(),
            format!(
                "Curated Urdu headline and display collection part 3 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-014" => (
            format!(
                "Fontivo Essential Urdu Typography Vol. 4 ({} Fonts)",
                font_count
            ),
            "Urdu".to_string(),
            format!(
                "Curated Urdu classic calligraphy collection part 4 ({} fonts).",
                font_count
            ),
        ),
        "pack-essential-015" => (
            format!(
                "Fontivo Essential Multilingual Finale ({} Fonts)",
                font_count
            ),
            "Multilingual".to_string(),
            format!(
                "Supplemental bilingual Arabic, Latin, and Persian bundle ({} fonts).",
                font_count
            ),
        ),
        other => (
            format!("Fontivo Cloud Pack {} ({} Fonts)", other, font_count),
            "Multilingual".to_string(),
            format!("Curated Fontivo typography pack ({} fonts).", font_count),
        ),
    }
}

impl FontPackManifest {
    pub const EMBEDDED_LIBRARY_VERSION: &'static str = "1.0.3";
    pub const REMOTE_MANIFEST_URL: &'static str =
        "https://raw.githubusercontent.com/Ahmedfahmy8308/Fontivo-Fonts/main/Manifests/manifest.json";
    pub const REMOTE_RELEASES_API_URL: &'static str =
        "https://api.github.com/repos/Ahmedfahmy8308/Fontivo-Fonts/releases/latest";

    /// Checks live GitHub Releases API for the latest `Fontivo-Fonts` release tag (e.g. "1.0.3").
    pub fn fetch_latest_remote_release_tag() -> Option<String> {
        let agent = ureq::builder()
            .timeout_connect(Duration::from_millis(2500))
            .timeout_read(Duration::from_millis(3500))
            .redirects(3)
            .build();
        let resp = agent
            .get(Self::REMOTE_RELEASES_API_URL)
            .set("User-Agent", "Fontivo-Fonts-Sync/1.0")
            .set("Accept", "application/vnd.github+json")
            .call()
            .ok()?;
        if resp.status() != 200 {
            return None;
        }
        let body = resp.into_string().ok()?;
        let val: serde_json::Value = serde_json::from_str(&body).ok()?;
        val["tag_name"]
            .as_str()
            .map(|t| t.trim().trim_start_matches(['v', 'V']).to_string())
            .filter(|s| !s.is_empty())
    }

    /// Parses either the live GitHub `Manifests/manifest.json` wire schema (`packages` map)
    /// or the normalized `FontPackManifest` JSON schema.
    pub fn parse_manifest_json(raw: &str) -> Result<Self, String> {
        let clean = raw.trim_start_matches('\u{feff}').trim();

        // 1. Try live GitHub `Manifests/manifest.json` wire format first
        if let Ok(wire) = serde_json::from_str::<RemoteManifestWire>(clean) {
            if !wire.packages.is_empty() {
                let mut entries: Vec<RemotePackageWire> = wire.packages.into_values().collect();
                entries.sort_by(|a, b| a.id.cmp(&b.id));

                let mut packs = Vec::with_capacity(entries.len());
                let mut sum_fonts = 0usize;
                let mut sum_compressed = 0u64;
                let mut sum_uncompressed = 0u64;

                for pkg in entries {
                    let (name, category, description) =
                        pack_display_metadata(&pkg.id, pkg.font_count);
                    sum_fonts += pkg.font_count;
                    sum_compressed += pkg.compressed_size_bytes;
                    sum_uncompressed += pkg.uncompressed_size_bytes;
                    packs.push(FontPackItem {
                        id: pkg.id,
                        name,
                        version: if pkg.version.trim().is_empty() {
                            wire.library_version.clone()
                        } else {
                            pkg.version
                        },
                        download_url: pkg.url,
                        file_name: pkg.file_name,
                        compressed_size: pkg.compressed_size_bytes,
                        uncompressed_size: pkg.uncompressed_size_bytes,
                        sha256: pkg.sha256,
                        font_count: pkg.font_count,
                        category: Some(category),
                        description: Some(description),
                    });
                }

                let summary = wire.summary.as_ref();
                let manifest = FontPackManifest {
                    schema_version: 1,
                    library_version: if wire.library_version.trim().is_empty() {
                        "1.0.3".to_string()
                    } else {
                        wire.library_version
                    },
                    total_fonts: Some(
                        summary
                            .and_then(|s| s.total_unique_fonts)
                            .unwrap_or(sum_fonts),
                    ),
                    total_families: Some(summary.and_then(|s| s.total_families).unwrap_or(4430)),
                    total_compressed_size: Some(
                        summary
                            .and_then(|s| s.total_compressed_size_bytes)
                            .unwrap_or(sum_compressed),
                    ),
                    total_uncompressed_size: Some(
                        summary
                            .and_then(|s| s.total_uncompressed_size_bytes)
                            .unwrap_or(sum_uncompressed),
                    ),
                    packs,
                };
                manifest.validate()?;
                return Ok(manifest);
            }
        }

        // 2. Fallback to direct normalized FontPackManifest JSON
        let manifest = serde_json::from_str::<FontPackManifest>(clean)
            .map_err(|e| format!("Failed to parse manifest JSON: {}", e))?;
        manifest.validate()?;
        Ok(manifest)
    }

    /// Returns a cached remote manifest (5-minute TTL) or fetches live from GitHub with
    /// safe fallback to `Self::default_manifest()`.
    pub fn fetch_remote_or_default_cached() -> (Self, bool, String) {
        let cache = MANIFEST_CACHE.get_or_init(|| RwLock::new(None));
        if let Ok(guard) = cache.read() {
            if let Some((fetched_at, manifest, is_remote, source)) = guard.as_ref() {
                if fetched_at.elapsed() < MANIFEST_CACHE_TTL {
                    return (manifest.clone(), *is_remote, source.clone());
                }
            }
        }
        Self::fetch_remote_or_default()
    }

    /// Fetches remote GitHub `Manifests/manifest.json` with a safe 3-second timeout and strict validation,
    /// updating the in-memory cache and falling back to `Self::default_manifest()` if offline.
    pub fn fetch_remote_or_default() -> (Self, bool, String) {
        let agent = ureq::builder()
            .timeout_connect(Duration::from_millis(2500))
            .timeout_read(Duration::from_millis(3500))
            .redirects(3)
            .build();

        let result = if let Ok(resp) = agent.get(Self::REMOTE_MANIFEST_URL).call() {
            if let Ok(body) = resp.into_string() {
                if let Ok(remote_manifest) = Self::parse_manifest_json(&body) {
                    (remote_manifest, true, "github_remote".to_string())
                } else {
                    (
                        Self::default_manifest(),
                        false,
                        "embedded_default".to_string(),
                    )
                }
            } else {
                (
                    Self::default_manifest(),
                    false,
                    "embedded_default".to_string(),
                )
            }
        } else {
            (
                Self::default_manifest(),
                false,
                "embedded_default".to_string(),
            )
        };

        let cache = MANIFEST_CACHE.get_or_init(|| RwLock::new(None));
        if let Ok(mut guard) = cache.write() {
            *guard = Some((Instant::now(), result.0.clone(), result.1, result.2.clone()));
        }

        result
    }

    /// Validates the manifest and all constituent packs against security and integrity rules
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err(format!(
                "Unsupported schemaVersion: {}. Only version 1 is supported.",
                self.schema_version
            ));
        }

        if self.library_version.trim().is_empty() {
            return Err("Manifest libraryVersion cannot be empty.".to_string());
        }

        if self.packs.is_empty() {
            return Err("Manifest contains no packs.".to_string());
        }

        for (idx, pack) in self.packs.iter().enumerate() {
            // 1. Pack ID validation
            if pack.id.trim().is_empty() {
                return Err(format!("Pack at index {} has an empty ID.", idx));
            }
            if !pack
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                return Err(format!(
                    "Pack '{}' has invalid ID characters (allowed: alphanumeric, -, _).",
                    pack.id
                ));
            }

            // 2. Name validation
            if pack.name.trim().is_empty() {
                return Err(format!("Pack '{}' has an empty name.", pack.id));
            }

            // 3. Download URL validation with trusted host policy
            crate::server::security::validate_download_url(&pack.download_url)
                .map_err(|e| format!("Pack '{}' has an untrusted downloadUrl: {}", pack.id, e))?;

            // 4. File name validation
            if !pack.file_name.ends_with(".zip") {
                return Err(format!(
                    "Pack '{}' fileName must end with '.zip', got '{}'.",
                    pack.id, pack.file_name
                ));
            }
            if pack.file_name.contains('/')
                || pack.file_name.contains('\\')
                || pack.file_name.contains("..")
            {
                return Err(format!(
                    "Pack '{}' fileName contains invalid path characters: '{}'.",
                    pack.id, pack.file_name
                ));
            }

            // 5. SHA-256 validation (must be 64 hexadecimal characters)
            let trimmed_hash = pack.sha256.trim();
            if trimmed_hash.len() != 64 || !trimmed_hash.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(format!(
                    "Pack '{}' has an invalid sha256 checksum (expected 64 hex characters, got '{}').",
                    pack.id, pack.sha256
                ));
            }

            // 6. Font count validation
            if pack.font_count == 0 {
                return Err(format!(
                    "Pack '{}' fontCount must be greater than 0.",
                    pack.id
                ));
            }
        }

        Ok(())
    }

    /// Returns the exact v1.0.3 production Fontivo pack manifest (15 packs, 10,939 fonts,
    /// 4,430 families, 905,982,558 bytes / 864.01 MB compressed).
    pub fn default_manifest() -> Self {
        Self {
            schema_version: 1,
            library_version: "1.0.3".to_string(),
            total_fonts: Some(10939),
            total_families: Some(4430),
            total_compressed_size: Some(905982558),
            total_uncompressed_size: Some(1762816362),
            packs: vec![
                FontPackItem {
                    id: "pack-essential-001".to_string(),
                    name: "Fontivo Essential Arabic Typography (970 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-001.zip".to_string(),
                    file_name: "fontivo-essential-001.zip".to_string(),
                    compressed_size: 42825441,
                    uncompressed_size: 92383140,
                    sha256: "8c932847ee9c1c62fd84e202d5c02786b7c9f02174bd8e5edc7b236f77b1c83e".to_string(),
                    font_count: 970,
                    category: Some("Arabic".to_string()),
                    description: Some("Curated collection of 970 Arabic display, editorial, and UI fonts.".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-002".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 1 (848 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-002.zip".to_string(),
                    file_name: "fontivo-essential-002.zip".to_string(),
                    compressed_size: 88664017,
                    uncompressed_size: 155484442,
                    sha256: "99560337d75e007dfbf0e4825b31c77c6e0f388310995a077f1b52f1e0658676".to_string(),
                    font_count: 848,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 1 (848 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-003".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 2 (842 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-003.zip".to_string(),
                    file_name: "fontivo-essential-003.zip".to_string(),
                    compressed_size: 72808361,
                    uncompressed_size: 148868189,
                    sha256: "7b7843495e3ca673a44cc313207aacd841714ce159ed4d31c35c9c2477152ae5".to_string(),
                    font_count: 842,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 2 (842 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-004".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 3 (771 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-004.zip".to_string(),
                    file_name: "fontivo-essential-004.zip".to_string(),
                    compressed_size: 94451341,
                    uncompressed_size: 192989044,
                    sha256: "aac04c88f50280190f81ae9b6a64d75498823a6ed69212073519d663b5eb0f09".to_string(),
                    font_count: 771,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 3 (771 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-005".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 4 (1022 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-005.zip".to_string(),
                    file_name: "fontivo-essential-005.zip".to_string(),
                    compressed_size: 76281781,
                    uncompressed_size: 139621454,
                    sha256: "f7f3d0d560e0fb0b8e4e3a92dfa7d2de9247367362050fb6423a5214f4dadc17".to_string(),
                    font_count: 1022,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 4 (1022 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-006".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 5 (722 Fonts)".to_string(),
                    version: "1.0.3".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-006.zip".to_string(),
                    file_name: "fontivo-essential-006.zip".to_string(),
                    compressed_size: 78127064,
                    uncompressed_size: 152568924,
                    sha256: "ca9b95bdcc2f2c0bfb3367171e2b67fd148d4182a57285fd320ae46f9d4c1851".to_string(),
                    font_count: 722,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 5 (722 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-007".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 6 (1018 Fonts)".to_string(),
                    version: "1.0.3".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-007.zip".to_string(),
                    file_name: "fontivo-essential-007.zip".to_string(),
                    compressed_size: 87580916,
                    uncompressed_size: 139628454,
                    sha256: "81c2bd0589d21963f64a84d17999af2875392ff31e42e8284ce04f0eba7023a0".to_string(),
                    font_count: 1018,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 6 (1018 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-008".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 7 (972 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-008.zip".to_string(),
                    file_name: "fontivo-essential-008.zip".to_string(),
                    compressed_size: 89669029,
                    uncompressed_size: 149223010,
                    sha256: "5be18b9324dde6873327377036ed756c6314692a0eee8dfe6c269bfb5c7d094c".to_string(),
                    font_count: 972,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 7 (972 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-009".to_string(),
                    name: "Fontivo Essential Latin Typography Vol. 8 (936 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-009.zip".to_string(),
                    file_name: "fontivo-essential-009.zip".to_string(),
                    compressed_size: 83469783,
                    uncompressed_size: 150361365,
                    sha256: "a5f2b8c0a60c424ad805865c8ed0d7ed3422e358fa36521f77aad787b77fc6e3".to_string(),
                    font_count: 936,
                    category: Some("Latin".to_string()),
                    description: Some("Curated Latin typography collection part 8 (936 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-010".to_string(),
                    name: "Fontivo Essential Persian Typography (1253 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-010.zip".to_string(),
                    file_name: "fontivo-essential-010.zip".to_string(),
                    compressed_size: 51623892,
                    uncompressed_size: 112825887,
                    sha256: "368a3f5319e7a3f6d1dae1dec6e67b062b447ef4b50c1803c626c40f3f07dd1b".to_string(),
                    font_count: 1253,
                    category: Some("Persian".to_string()),
                    description: Some("Comprehensive Persian script, headline, and editorial archive (1253 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-011".to_string(),
                    name: "Fontivo Essential Urdu Typography Vol. 1 (405 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-011.zip".to_string(),
                    file_name: "fontivo-essential-011.zip".to_string(),
                    compressed_size: 35014024,
                    uncompressed_size: 81359319,
                    sha256: "24cb1d09bb04311c2255b9f41d9041544c1f98ea6fbad0c6ccaf4ca14e1e4639".to_string(),
                    font_count: 405,
                    category: Some("Urdu".to_string()),
                    description: Some("Curated Urdu Nastaliq and Naskh collection part 1 (405 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-012".to_string(),
                    name: "Fontivo Essential Urdu Typography Vol. 2 (393 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-012.zip".to_string(),
                    file_name: "fontivo-essential-012.zip".to_string(),
                    compressed_size: 33230124,
                    uncompressed_size: 81464281,
                    sha256: "d5674cdc76b9eed060ef22def4680a19e21f299e3648cc18a4e660fe202b7549".to_string(),
                    font_count: 393,
                    category: Some("Urdu".to_string()),
                    description: Some("Curated Urdu Nastaliq and publication collection part 2 (393 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-013".to_string(),
                    name: "Fontivo Essential Urdu Typography Vol. 3 (372 Fonts)".to_string(),
                    version: "1.0.3".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-013.zip".to_string(),
                    file_name: "fontivo-essential-013.zip".to_string(),
                    compressed_size: 34782399,
                    uncompressed_size: 80608508,
                    sha256: "5e3055b1be89b9389e719fbf7ccb842735a80594088902a49184c004f69be5e9".to_string(),
                    font_count: 372,
                    category: Some("Urdu".to_string()),
                    description: Some("Curated Urdu headline and display collection part 3 (372 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-014".to_string(),
                    name: "Fontivo Essential Urdu Typography Vol. 4 (395 Fonts)".to_string(),
                    version: "1.0.5".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-014.zip".to_string(),
                    file_name: "fontivo-essential-014.zip".to_string(),
                    compressed_size: 35407865,
                    uncompressed_size: 81702741,
                    sha256: "15c3abb9bead00e121c554642b1806c7865d8496daf5eae6ff36ee58d3376869".to_string(),
                    font_count: 395,
                    category: Some("Urdu".to_string()),
                    description: Some("Curated Urdu classic calligraphy collection part 4 (395 fonts).".to_string()),
                },
                FontPackItem {
                    id: "pack-essential-015".to_string(),
                    name: "Fontivo Essential Multilingual Finale (20 Fonts)".to_string(),
                    version: "1.0.3".to_string(),
                    download_url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-015.zip".to_string(),
                    file_name: "fontivo-essential-015.zip".to_string(),
                    compressed_size: 2046521,
                    uncompressed_size: 3727604,
                    sha256: "3df19618747eef5be3dd576fa962cc912db4c83155e730932b7d163a414a1a5c".to_string(),
                    font_count: 20,
                    category: Some("Multilingual".to_string()),
                    description: Some("Supplemental bilingual Arabic, Latin, and Persian bundle (20 fonts).".to_string()),
                },
            ],
        }
    }
}
