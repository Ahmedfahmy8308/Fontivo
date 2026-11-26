use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use super::extractor::SafeZipExtractor;
use super::manifest::FontPackItem;
use super::storage::LibraryStorageManager;
use crate::parser::FontParser;
use crate::server::state::{AppState, FontRecord};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum JobPhase {
    Queued,
    Downloading,
    Verifying,
    Extracting,
    Indexing,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub job_id: String,
    pub pack_id: String,
    pub pack_name: String,
    pub phase: JobPhase,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub eta_seconds: u64,
    pub progress_percent: f32,
    pub extracted_count: usize,
    pub indexed_count: usize,
    pub error: Option<String>,
}

pub struct DownloadManager {
    jobs: Arc<RwLock<HashMap<String, Arc<RwLock<DownloadProgress>>>>>,
    cancellations: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>>,
    _active_workers: Arc<Mutex<()>>,
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
            cancellations: Arc::new(RwLock::new(HashMap::new())),
            _active_workers: Arc::new(Mutex::new(())),
        }
    }

    /// Queries progress of a specific job
    pub fn get_status(&self, job_id: &str) -> Option<DownloadProgress> {
        let jobs = self.jobs.read().unwrap();
        jobs.get(job_id).map(|p| p.read().unwrap().clone())
    }

    /// Returns list of all tracked download jobs
    pub fn list_jobs(&self) -> Vec<DownloadProgress> {
        let jobs = self.jobs.read().unwrap();
        jobs.values().map(|p| p.read().unwrap().clone()).collect()
    }

    /// Signals cancellation for an active job
    pub fn cancel(&self, job_id: &str) -> bool {
        let cancels = self.cancellations.read().unwrap();
        if let Some(flag) = cancels.get(job_id) {
            flag.store(true, Ordering::SeqCst);
            if let Some(prog) = self.jobs.read().unwrap().get(job_id) {
                let mut p = prog.write().unwrap();
                if p.phase != JobPhase::Completed && p.phase != JobPhase::Failed {
                    p.phase = JobPhase::Cancelled;
                }
            }
            return true;
        }
        false
    }

    /// Validates a pack ID to prevent path traversal and injection
    pub fn sanitize_pack_id(pack_id: &str) -> Result<String, String> {
        let trimmed = pack_id.trim();
        if trimmed.is_empty() || trimmed.len() > 128 {
            return Err("Invalid pack ID: must be 1..=128 characters".to_string());
        }
        if trimmed.contains("..")
            || trimmed.contains('/')
            || trimmed.contains('\\')
            || trimmed.contains('\0')
        {
            return Err(format!(
                "Invalid pack ID '{}': path traversal characters forbidden",
                pack_id
            ));
        }
        if !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(format!(
                "Invalid pack ID '{}': only ASCII alphanumeric, '-', and '_' are allowed",
                pack_id
            ));
        }
        Ok(trimmed.to_string())
    }

    /// Validates a pack archive filename to prevent path traversal and non-zip writes
    pub fn sanitize_pack_filename(file_name: &str) -> Result<String, String> {
        let trimmed = file_name.trim();
        if trimmed.is_empty() || trimmed.len() > 160 {
            return Err("Invalid pack file_name: must be 1..=160 characters".to_string());
        }
        if trimmed.contains("..")
            || trimmed.contains('/')
            || trimmed.contains('\\')
            || trimmed.contains('\0')
            || trimmed.contains(':')
        {
            return Err(format!(
                "Invalid pack file_name '{}': path traversal characters forbidden",
                file_name
            ));
        }
        if !trimmed.to_ascii_lowercase().ends_with(".zip") {
            return Err(format!(
                "Invalid pack file_name '{}': must end with '.zip'",
                file_name
            ));
        }
        if !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        {
            return Err(format!(
                "Invalid pack file_name '{}': contains disallowed characters",
                file_name
            ));
        }
        Ok(trimmed.to_string())
    }

    /// Starts an asynchronous resumable download and indexing pipeline for a font pack
    pub fn start_pack_download(
        &self,
        pack: FontPackItem,
        state: Arc<RwLock<AppState>>,
    ) -> Result<String, String> {
        // Security validation before queuing any download job
        let safe_id = Self::sanitize_pack_id(&pack.id)?;
        let _safe_file_name = Self::sanitize_pack_filename(&pack.file_name)?;
        crate::server::security::validate_download_url(&pack.download_url)
            .map_err(|e| format!("Blocked untrusted download URL: {}", e))?;

        let sha_trimmed = pack.sha256.trim();
        if sha_trimmed.len() != 64 || !sha_trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(
                "Invalid or empty SHA-256 checksum: pack integrity hash (64 hex chars) is required"
                    .to_string(),
            );
        }

        let job_id = format!("job-{}", safe_id);

        // Check if job is already running
        {
            let jobs = self.jobs.read().unwrap();
            if let Some(existing) = jobs.get(&job_id) {
                let p = existing.read().unwrap();
                if matches!(
                    p.phase,
                    JobPhase::Queued
                        | JobPhase::Downloading
                        | JobPhase::Verifying
                        | JobPhase::Extracting
                        | JobPhase::Indexing
                ) {
                    return Ok(job_id);
                }
            }
        }

        // Validate available disk space
        let required_space = pack.compressed_size + pack.uncompressed_size + (50 * 1024 * 1024);
        LibraryStorageManager::check_available_space(required_space)
            .map_err(|e| format!("Storage validation failed: {}", e))?;

        let initial_progress = DownloadProgress {
            job_id: job_id.clone(),
            pack_id: pack.id.clone(),
            pack_name: pack.name.clone(),
            phase: JobPhase::Queued,
            bytes_downloaded: 0,
            total_bytes: pack.compressed_size,
            speed_bps: 0,
            eta_seconds: 0,
            progress_percent: 0.0,
            extracted_count: 0,
            indexed_count: 0,
            error: None,
        };

        let progress_arc = Arc::new(RwLock::new(initial_progress));
        let cancel_flag = Arc::new(AtomicBool::new(false));

        {
            let mut jobs = self.jobs.write().unwrap();
            jobs.insert(job_id.clone(), Arc::clone(&progress_arc));
            let mut cancels = self.cancellations.write().unwrap();
            cancels.insert(job_id.clone(), Arc::clone(&cancel_flag));
        }

        let progress_clone = Arc::clone(&progress_arc);
        let cancel_clone = Arc::clone(&cancel_flag);
        let pack_clone = pack.clone();
        let state_clone = Arc::clone(&state);

        thread::spawn(move || {
            Self::run_download_pipeline(pack_clone, progress_clone, cancel_clone, state_clone);
        });

        Ok(job_id)
    }

    /// Retries a previously failed or cancelled download job
    pub fn retry(&self, job_id: &str, state: Arc<RwLock<AppState>>) -> Result<(), String> {
        let pack_opt = {
            let jobs = self.jobs.read().unwrap();
            jobs.get(job_id).map(|p| p.read().unwrap().pack_id.clone())
        };

        let pack_id = pack_opt.ok_or_else(|| format!("Job '{}' not found", job_id))?;
        let (manifest, _, _) = super::manifest::FontPackManifest::fetch_remote_or_default_cached();
        let pack = manifest
            .packs
            .into_iter()
            .find(|p| p.id == pack_id)
            .ok_or_else(|| format!("Pack '{}' not found in manifest", pack_id))?;

        self.start_pack_download(pack, state)?;
        Ok(())
    }

    fn run_download_pipeline(
        pack: FontPackItem,
        progress: Arc<RwLock<DownloadProgress>>,
        cancel: Arc<AtomicBool>,
        state: Arc<RwLock<AppState>>,
    ) {
        // Defense-in-depth security validation before touching filesystem or network
        let safe_pack_id = match Self::sanitize_pack_id(&pack.id) {
            Ok(id) => id,
            Err(e) => {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Failed;
                p.error = Some(e);
                return;
            }
        };
        let safe_file_name = match Self::sanitize_pack_filename(&pack.file_name) {
            Ok(name) => name,
            Err(e) => {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Failed;
                p.error = Some(e);
                return;
            }
        };
        if let Err(e) = crate::server::security::validate_download_url(&pack.download_url) {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Failed;
            p.error = Some(format!("Blocked untrusted download URL: {}", e));
            return;
        }

        // Phase 1: Downloading
        {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Downloading;
        }

        let packs_dir = LibraryStorageManager::get_packs_dir();
        let final_zip = packs_dir.join(&safe_file_name);
        let part_file = packs_dir.join(format!("{}.part", &safe_file_name));

        // Ensure constructed paths remain strictly inside packs_dir
        if let Ok(canon_packs) = packs_dir.canonicalize() {
            if !final_zip.starts_with(&packs_dir)
                || final_zip
                    .parent()
                    .and_then(|p| p.canonicalize().ok())
                    .as_deref()
                    != Some(&canon_packs)
            {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Failed;
                p.error = Some("Path traversal detected for pack archive destination".to_string());
                return;
            }
        }

        // Attempt download with retries and HTTP Range support
        let max_retries = 3;
        let mut download_success = false;
        let mut last_error = String::new();

        for attempt in 1..=max_retries {
            if cancel.load(Ordering::SeqCst) {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Cancelled;
                return;
            }

            match Self::download_resumable_file(
                &pack.download_url,
                &part_file,
                &progress,
                &cancel,
                pack.compressed_size,
            ) {
                Ok(_) => {
                    download_success = true;
                    break;
                }
                Err(e) => {
                    last_error = e;
                    if cancel.load(Ordering::SeqCst) {
                        let mut p = progress.write().unwrap();
                        p.phase = JobPhase::Cancelled;
                        return;
                    }
                    if attempt < max_retries {
                        // Exponential backoff
                        thread::sleep(Duration::from_millis(1000 * (1 << (attempt - 1))));
                    }
                }
            }
        }

        if !download_success {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Failed;
            p.error = Some(format!(
                "Download failed after {} retries: {}",
                max_retries, last_error
            ));
            return;
        }

        // Phase 2: Verifying Checksum
        {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Verifying;
        }

        if cancel.load(Ordering::SeqCst) {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Cancelled;
            return;
        }

        match Self::verify_sha256(&part_file, &pack.sha256) {
            Ok(true) => {
                // Atomic promotion from .part to final .zip
                if let Err(e) = fs::rename(&part_file, &final_zip) {
                    let mut p = progress.write().unwrap();
                    p.phase = JobPhase::Failed;
                    p.error = Some(format!("Failed to rename verified archive: {}", e));
                    return;
                }
            }
            Ok(false) => {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Failed;
                p.error = Some(format!(
                    "SHA-256 checksum verification failed for pack '{}'",
                    pack.id
                ));
                return;
            }
            Err(e) => {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Failed;
                p.error = Some(format!("Error during checksum calculation: {}", e));
                return;
            }
        }

        // Phase 3: Extracting
        {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Extracting;
        }

        let extract_dir = LibraryStorageManager::get_extracted_dir().join(&safe_pack_id);
        let archive_file = match File::open(&final_zip) {
            Ok(f) => f,
            Err(e) => {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Failed;
                p.error = Some(format!("Failed to open downloaded archive: {}", e));
                return;
            }
        };

        let progress_for_ext = Arc::clone(&progress);
        let extraction_report = match SafeZipExtractor::extract(
            archive_file,
            &extract_dir,
            Some(pack.uncompressed_size * 2 + (100 * 1024 * 1024)),
            Some(50_000),
            move |done, total, _| {
                if let Ok(mut p) = progress_for_ext.write() {
                    p.extracted_count = done;
                    if total > 0 {
                        p.progress_percent = (done as f32 / total as f32) * 100.0;
                    }
                }
            },
        ) {
            Ok(rep) => rep,
            Err(e) => {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Failed;
                p.error = Some(format!("Archive extraction failed: {}", e));
                return;
            }
        };

        // Phase 4: Non-blocking Idempotent Indexing
        {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Indexing;
        }

        let mut indexed_count = 0;
        let font_files: Vec<PathBuf> = extraction_report
            .extracted_files
            .into_iter()
            .filter(|p| {
                p.extension()
                    .and_then(|s| s.to_str())
                    .map(|ext| {
                        let l = ext.to_lowercase();
                        l == "ttf" || l == "otf" || l == "ttc" || l == "woff" || l == "woff2"
                    })
                    .unwrap_or(false)
            })
            .collect();

        // Batch indexing into AppState
        let chunk_size = 200;
        for chunk in font_files.chunks(chunk_size) {
            if cancel.load(Ordering::SeqCst) {
                let mut p = progress.write().unwrap();
                p.phase = JobPhase::Cancelled;
                return;
            }

            let mut new_records = Vec::new();
            {
                let mut st = state.write().unwrap();
                let current_max_id = st.fonts.iter().map(|f| f.id).max().unwrap_or(0);
                let mut next_id = current_max_id + indexed_count + 1;

                for font_path in chunk {
                    let path_str = font_path.to_string_lossy().to_string();
                    let fname = font_path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("font")
                        .to_string();

                    // If font already exists in index, update its path to local extracted copy and mark is_local
                    if let Some(existing) = st
                        .fonts
                        .iter_mut()
                        .find(|f| f.path == path_str || f.name == fname)
                    {
                        existing.path = path_str;
                        existing.is_local = true;
                        indexed_count += 1;
                        continue;
                    }

                    if let Ok(meta) = FontParser::parse_file(font_path) {
                        let size = fs::metadata(font_path)
                            .map(|m| m.len() as usize)
                            .unwrap_or(0);
                        let is_arabic = meta.coverage.supports_arabic
                            || meta.family.to_lowercase().contains("arabic");
                        let is_latin = meta.coverage.supports_latin;
                        let is_bilingual = is_arabic && is_latin;
                        let weight = if meta.weight_class > 0 {
                            meta.weight_class
                        } else {
                            crate::server::state::style_to_weight(Some(&meta.subfamily))
                        };

                        new_records.push(FontRecord {
                            id: next_id,
                            name: fname,
                            path: path_str,
                            category: if is_arabic {
                                "01 - Arabic Fonts".into()
                            } else {
                                "02 - English Fonts".into()
                            },
                            sub_category: Some(pack.name.clone()),
                            family: Some(meta.family),
                            format: meta.format,
                            size,
                            is_arabic,
                            is_latin,
                            is_bilingual,
                            is_variable: meta.is_variable,
                            weight,
                            source: "cloud".to_string(),
                            is_active: false,
                            is_favorite: false,
                            display_name: Some(meta.full_name),
                            style: Some(meta.subfamily),
                            post_script_name: Some(meta.postscript_name),
                            glyph_count: Some(meta.glyph_count as usize),
                            has_tashkeel: meta.coverage.has_tashkeel,
                            has_extended_arabic: meta.coverage.has_extended_arabic,
                            has_arabic_numerals: meta.coverage.has_arabic_numerals,
                            has_western_numerals: meta.coverage.has_western_numerals,
                            is_local: true,
                        });
                        next_id += 1;
                        indexed_count += 1;
                    }
                }

                if !new_records.is_empty() {
                    st.fonts.extend(new_records);
                }
                st.save_user_library_index();
            }

            {
                let mut p = progress.write().unwrap();
                p.indexed_count = indexed_count;
            }
        }

        // Remove temporary compressed ZIP archive once extracted & verified cleanly
        // so the user isn't storing both 864 MB of ZIPs and 1.68 GB of extracted fonts.
        let _ = fs::remove_file(&final_zip);
        let _ = fs::remove_file(&part_file);

        // Phase 5: Completed
        {
            let mut p = progress.write().unwrap();
            p.phase = JobPhase::Completed;
            p.progress_percent = 100.0;
            p.speed_bps = 0;
            p.eta_seconds = 0;
            p.indexed_count = indexed_count;
        }
    }

    fn download_resumable_file(
        url: &str,
        part_path: &Path,
        progress: &Arc<RwLock<DownloadProgress>>,
        cancel: &Arc<AtomicBool>,
        expected_total: u64,
    ) -> Result<(), String> {
        // SSRF protection: validate download URL strictly before issuing any HTTP request
        let validated_url = crate::server::security::validate_download_url(url)
            .map_err(|e| format!("SSRF protection blocked URL: {}", e))?;

        let existing_len = if part_path.exists() {
            fs::metadata(part_path).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        let agent = ureq::builder()
            .timeout_connect(Duration::from_secs(10))
            .timeout_read(Duration::from_secs(60))
            .redirects(5)
            .build();

        let mut req = agent.get(validated_url.as_str());
        let resuming = existing_len > 0;
        if resuming {
            req = req.set("Range", &format!("bytes={}-", existing_len));
        }

        let resp = req
            .call()
            .map_err(|e| format!("HTTP request failed: {}", e))?;
        // Verify final redirected URL is also trusted (prevents open-redirect SSRF)
        if let Err(e) = crate::server::security::validate_download_url(resp.get_url()) {
            return Err(format!("Redirected URL blocked by SSRF protection: {}", e));
        }
        let status = resp.status();

        let (mut file, mut downloaded_so_far, total_expected) = if status == 206 && resuming {
            // Server accepted resume
            let f = OpenOptions::new()
                .append(true)
                .open(part_path)
                .map_err(|e| format!("Failed to open part file for append: {}", e))?;
            (f, existing_len, expected_total.max(existing_len))
        } else {
            // Full download
            let f = File::create(part_path)
                .map_err(|e| format!("Failed to create part file: {}", e))?;
            let header_len = resp
                .header("Content-Length")
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(expected_total);
            (f, 0, header_len)
        };

        let mut reader = resp.into_reader();
        let mut buffer = [0u8; 32 * 1024]; // 32 KB buffer
        let start_time = Instant::now();
        let mut last_progress_time = Instant::now();

        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err("Download cancelled by user".to_string());
            }

            let bytes_read = reader
                .read(&mut buffer)
                .map_err(|e| format!("Error reading network stream: {}", e))?;

            if bytes_read == 0 {
                break;
            }

            file.write_all(&buffer[..bytes_read])
                .map_err(|e| format!("Error writing to part file: {}", e))?;

            downloaded_so_far += bytes_read as u64;

            // Update stats every 250ms
            if last_progress_time.elapsed() >= Duration::from_millis(250) {
                last_progress_time = Instant::now();
                let elapsed_secs = start_time.elapsed().as_secs_f64().max(0.001);
                let speed_bps = ((downloaded_so_far - existing_len) as f64 / elapsed_secs) as u64;
                let remaining_bytes = total_expected.saturating_sub(downloaded_so_far);
                let eta = if speed_bps > 0 {
                    remaining_bytes / speed_bps
                } else {
                    0
                };
                let percent = if total_expected > 0 {
                    ((downloaded_so_far as f32 / total_expected as f32) * 100.0).min(100.0)
                } else {
                    0.0
                };

                if let Ok(mut p) = progress.write() {
                    p.bytes_downloaded = downloaded_so_far;
                    p.total_bytes = total_expected;
                    p.speed_bps = speed_bps;
                    p.eta_seconds = eta;
                    p.progress_percent = percent;
                }
            }
        }

        // Final progress update
        if let Ok(mut p) = progress.write() {
            p.bytes_downloaded = downloaded_so_far;
            p.total_bytes = total_expected;
            p.progress_percent = 100.0;
        }

        Ok(())
    }

    /// Verifies SHA-256 hash of a file on disk.
    /// Rejects empty or malformed expected hashes — never bypasses integrity verification.
    pub fn verify_sha256(path: &Path, expected_hex: &str) -> Result<bool, String> {
        let expected = expected_hex.trim().to_lowercase();
        if expected.is_empty() {
            return Err(
                "Refusing to verify checksum: expected SHA-256 hash cannot be empty".to_string(),
            );
        }
        if expected.len() != 64 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(
                "Invalid expected SHA-256 checksum format (must be 64 hex characters)".to_string(),
            );
        }

        let mut file = File::open(path)
            .map_err(|e| format!("Failed to open file for SHA-256 calculation: {}", e))?;

        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];

        loop {
            let bytes_read = file
                .read(&mut buffer)
                .map_err(|e| format!("Read error during hashing: {}", e))?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        let result = hasher.finalize();
        let computed_hex = hex::encode(result).to_lowercase();

        Ok(computed_hex == expected)
    }

    /// Downloads and indexes an individual Google Font (Regular) directly into storage and AppState
    pub fn download_and_index_google_font(
        family: &str,
        download_url: &str,
        state: &Arc<RwLock<AppState>>,
    ) -> Result<FontRecord, String> {
        Self::download_and_index_google_font_style(family, family, download_url, state)
    }

    /// Downloads and indexes a specific style/weight of a Google Font (e.g. `Poppins-BlackItalic`)
    /// using a style-specific filename so multiple weights of the same family never overwrite each other.
    pub fn download_and_index_google_font_style(
        family: &str,
        file_stem: &str,
        download_url: &str,
        state: &Arc<RwLock<AppState>>,
    ) -> Result<FontRecord, String> {
        let google_dir = LibraryStorageManager::get_google_dir();
        let safe_stem = if file_stem.trim().is_empty() {
            family
        } else {
            file_stem.trim()
        };
        let target_file =
            crate::server::security::resolve_safe_font_path(&google_dir, safe_stem, "ttf")
                .map_err(|e| format!("Safe path resolution error: {}", e))?;

        if !target_file.exists() {
            // Auto-correct stale GitHub paths (e.g. Roboto moved from /apache/ to /ofl/)
            let normalized_url = if download_url.contains("/apache/roboto/") {
                download_url.replace("/apache/roboto/", "/ofl/roboto/")
            } else {
                download_url.to_string()
            };

            // Validate SSRF
            crate::server::security::validate_download_url(&normalized_url)
                .map_err(|e| format!("Security validation error: {}", e))?;

            let mut dl_result = crate::server::security::safe_download_font_bytes(&normalized_url);

            // Fallback 1: try flipping between /apache/ and /ofl/
            if dl_result.is_err() {
                let alt_url = if normalized_url.contains("/apache/") {
                    Some(normalized_url.replace("/apache/", "/ofl/"))
                } else if normalized_url.contains("/ofl/") {
                    Some(normalized_url.replace("/ofl/", "/apache/"))
                } else {
                    None
                };

                if let Some(ref alt) = alt_url {
                    if let Ok(alt_bytes) = crate::server::security::safe_download_font_bytes(alt) {
                        dl_result = Ok(alt_bytes);
                    }
                }
            }

            // Fallback 2: dynamically resolve via Google Fonts CSS2 API
            if dl_result.is_err() {
                let css_url = format!(
                    "https://fonts.googleapis.com/css2?family={}",
                    family.replace(' ', "+")
                );
                if let Some(dynamic_url) =
                    crate::google::google_fonts::GoogleFontsManager::fetch_ttf_url_from_css2(
                        &css_url,
                    )
                {
                    if let Ok(dyn_bytes) =
                        crate::server::security::safe_download_font_bytes(&dynamic_url)
                    {
                        dl_result = Ok(dyn_bytes);
                    }
                }
            }

            let bytes = dl_result.map_err(|e| format!("Network download error: {}", e))?;

            fs::write(&target_file, bytes)
                .map_err(|e| format!("Failed to save font bytes: {}", e))?;
        }

        // Parse downloaded font metadata
        let meta = FontParser::parse_file(&target_file)
            .map_err(|e| format!("Failed to parse font file: {:?}", e))?;

        let fname = target_file
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("font.ttf")
            .to_string();
        let size = fs::metadata(&target_file)
            .map(|m| m.len() as usize)
            .unwrap_or(0);
        let is_arabic =
            meta.coverage.supports_arabic || meta.family.to_lowercase().contains("arabic");
        let is_latin = meta.coverage.supports_latin;
        let is_bilingual = is_arabic && is_latin;
        let weight = if meta.weight_class > 0 {
            meta.weight_class
        } else {
            crate::server::state::style_to_weight(Some(&meta.subfamily))
        };

        let mut st = state.write().unwrap();
        let path_str = target_file.to_string_lossy().to_string();
        let is_regular_request = safe_stem.eq_ignore_ascii_case(family);

        // Check if already in index (exact path, exact PostScript name, or matching Regular catalog stub)
        if let Some(existing) = st.fonts.iter_mut().find(|f| {
            f.path == path_str
                || (!meta.postscript_name.is_empty()
                    && f.post_script_name
                        .as_deref()
                        .map(|ps| ps.eq_ignore_ascii_case(&meta.postscript_name))
                        .unwrap_or(false))
                || (is_regular_request
                    && f.family
                        .as_deref()
                        .unwrap_or("")
                        .eq_ignore_ascii_case(family)
                    && f.style
                        .as_deref()
                        .unwrap_or("Regular")
                        .eq_ignore_ascii_case("Regular"))
        }) {
            existing.name = fname;
            existing.path = path_str;
            existing.size = size;
            existing.is_local = true;
            existing.is_arabic = is_arabic;
            existing.is_latin = is_latin;
            existing.is_bilingual = is_bilingual;
            existing.is_variable = meta.is_variable;
            existing.has_tashkeel = meta.coverage.has_tashkeel;
            existing.has_extended_arabic = meta.coverage.has_extended_arabic;
            existing.has_arabic_numerals = meta.coverage.has_arabic_numerals;
            existing.has_western_numerals = meta.coverage.has_western_numerals;
            existing.weight = weight;
            existing.display_name = Some(meta.full_name);
            existing.style = Some(meta.subfamily);
            existing.post_script_name = Some(meta.postscript_name);
            existing.source = "google".to_string();
            let cloned = existing.clone();
            st.save_user_library_index();
            return Ok(cloned);
        }

        let next_id = st.fonts.iter().map(|f| f.id).max().unwrap_or(0) + 1;
        let record = FontRecord {
            id: next_id,
            name: fname,
            path: path_str,
            category: if is_arabic {
                "01 - Arabic Fonts".into()
            } else {
                "02 - English Fonts".into()
            },
            sub_category: Some("Google Fonts".into()),
            family: Some(meta.family),
            format: meta.format,
            size,
            is_arabic,
            is_latin,
            is_bilingual,
            is_variable: meta.is_variable,
            weight,
            source: "google".to_string(),
            is_active: false,
            is_favorite: false,
            display_name: Some(meta.full_name),
            style: Some(meta.subfamily),
            post_script_name: Some(meta.postscript_name),
            glyph_count: Some(meta.glyph_count as usize),
            has_tashkeel: meta.coverage.has_tashkeel,
            has_extended_arabic: meta.coverage.has_extended_arabic,
            has_arabic_numerals: meta.coverage.has_arabic_numerals,
            has_western_numerals: meta.coverage.has_western_numerals,
            is_local: true,
        };

        st.fonts.push(record.clone());
        st.save_user_library_index();
        Ok(record)
    }
}
