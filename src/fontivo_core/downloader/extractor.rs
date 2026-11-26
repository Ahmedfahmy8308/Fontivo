use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::ZipArchive;

pub const DEFAULT_MAX_UNCOMPRESSED_BYTES: u64 = 4 * 1024 * 1024 * 1024; // 4 GB
pub const DEFAULT_MAX_ENTRIES: usize = 50_000;
pub const MAX_COMPRESSION_RATIO: u64 = 200;

#[derive(Debug, Clone, Default)]
pub struct ExtractionReport {
    pub extracted_files: Vec<PathBuf>,
    pub total_bytes_written: u64,
    pub font_files_count: usize,
    pub skipped_entries: usize,
}

pub struct SafeZipExtractor;

impl SafeZipExtractor {
    /// Extracts a ZIP archive safely into target_dir with strict Zip Slip, bomb, and extension protections.
    pub fn extract<R: Read + std::io::Seek, F>(
        reader: R,
        dest_dir: &Path,
        max_bytes: Option<u64>,
        max_entries: Option<usize>,
        mut progress_cb: F,
    ) -> Result<ExtractionReport, String>
    where
        F: FnMut(usize, usize, u64), // (current_entry, total_entries, bytes_written)
    {
        fs::create_dir_all(dest_dir)
            .map_err(|e| format!("Failed to create destination directory: {}", e))?;

        let canonical_dest = dest_dir
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize destination directory: {}", e))?;

        let mut archive =
            ZipArchive::new(reader).map_err(|e| format!("Failed to parse ZIP archive: {}", e))?;

        let total_entries = archive.len();
        let entry_limit = max_entries.unwrap_or(DEFAULT_MAX_ENTRIES);
        if total_entries > entry_limit {
            return Err(format!(
                "ZIP archive exceeds maximum entry limit (contains {} entries, limit is {}).",
                total_entries, entry_limit
            ));
        }

        let byte_limit = max_bytes.unwrap_or(DEFAULT_MAX_UNCOMPRESSED_BYTES);
        let mut total_bytes_written: u64 = 0;
        let mut report = ExtractionReport::default();

        for i in 0..total_entries {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read ZIP entry #{}: {}", i, e))?;

            // 1. Zip Slip Prevention
            let raw_name = file.name().to_string();
            if raw_name.contains("..") || raw_name.contains('\0') {
                return Err(format!(
                    "Security violation: malicious path or Zip Slip detected in entry '{}'.",
                    raw_name
                ));
            }

            let enclosed_name = match file.enclosed_name() {
                Some(name) => name.to_path_buf(),
                None => {
                    return Err(format!(
                        "Security violation: dangerous path or Zip Slip attempt detected in entry '{}'.",
                        raw_name
                    ));
                }
            };

            let name_str = enclosed_name.to_string_lossy();

            // Target destination path
            let target_out_path = canonical_dest.join(&enclosed_name);

            // Double check destination containment
            if !target_out_path.starts_with(&canonical_dest) {
                return Err(format!(
                    "Security violation: Zip Slip attempt detected for '{}'. Path resolves outside target root.",
                    name_str
                ));
            }

            // If entry is a directory, create it safely
            if file.is_dir() {
                fs::create_dir_all(&target_out_path).map_err(|e| {
                    format!("Failed to create directory '{:?}': {}", target_out_path, e)
                })?;
                continue;
            }

            // 2. Extension Filtering
            let extension = target_out_path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

            // Explicitly block executable and script formats
            const BLOCKED_EXTENSIONS: &[&str] = &[
                "exe", "dll", "so", "dylib", "bat", "cmd", "ps1", "sh", "vbs", "js", "vbe", "wsf",
                "scr", "msi", "com", "pif",
            ];
            if BLOCKED_EXTENSIONS.contains(&extension.as_str()) {
                report.skipped_entries += 1;
                continue;
            }

            // Only allow font formats and standard license/readme text
            const ALLOWED_EXTENSIONS: &[&str] = &[
                "ttf", "otf", "ttc", "woff", "woff2", "txt", "md", "json", "ofl",
            ];
            if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
                report.skipped_entries += 1;
                continue;
            }

            // 3. Zip Bomb & Compression Ratio check
            let uncompressed_size = file.size();
            let compressed_size = file.compressed_size();
            if compressed_size > 0 && uncompressed_size > 1024 {
                let ratio = uncompressed_size / compressed_size;
                if ratio > MAX_COMPRESSION_RATIO {
                    return Err(format!(
                        "Security violation: ZIP bomb detected in entry '{}' (compression ratio {} exceeds limit {}).",
                        name_str, ratio, MAX_COMPRESSION_RATIO
                    ));
                }
            }

            // Ensure parent directory exists
            if let Some(parent) = target_out_path.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| {
                        format!("Failed to create parent folder '{:?}': {}", parent, e)
                    })?;
                }
            }

            // 4. Stream entry with byte cap
            let mut outfile = File::create(&target_out_path).map_err(|e| {
                format!(
                    "Failed to create output file '{:?}': {}",
                    target_out_path, e
                )
            })?;

            let mut buffer = [0u8; 64 * 1024]; // 64 KB chunk
            let mut first_chunk = true;
            let mut is_valid_font = true;

            loop {
                let bytes_read = file
                    .read(&mut buffer)
                    .map_err(|e| format!("Error decompressing entry '{}': {}", name_str, e))?;

                if bytes_read == 0 {
                    break;
                }

                // Check magic bytes on first chunk for font files
                if first_chunk {
                    first_chunk = false;
                    if ["ttf", "otf", "ttc", "woff", "woff2"].contains(&extension.as_str()) {
                        is_valid_font = Self::verify_font_magic(&buffer[..bytes_read], &extension);
                        if !is_valid_font {
                            // Close and remove invalid font file
                            drop(outfile);
                            let _ = fs::remove_file(&target_out_path);
                            report.skipped_entries += 1;
                            break;
                        }
                    }
                }

                total_bytes_written += bytes_read as u64;

                if total_bytes_written > byte_limit {
                    drop(outfile);
                    let _ = fs::remove_file(&target_out_path);
                    return Err(format!(
                        "Security violation: Total decompressed bytes exceed limit ({} bytes, limit is {}).",
                        total_bytes_written, byte_limit
                    ));
                }

                outfile
                    .write_all(&buffer[..bytes_read])
                    .map_err(|e| format!("Failed writing decompressed data: {}", e))?;
            }

            if is_valid_font && target_out_path.exists() {
                if ["ttf", "otf", "ttc", "woff", "woff2"].contains(&extension.as_str()) {
                    report.font_files_count += 1;
                }
                report.extracted_files.push(target_out_path);
            }

            progress_cb(i + 1, total_entries, total_bytes_written);
        }

        report.total_bytes_written = total_bytes_written;
        Ok(report)
    }

    /// Verifies magic bytes header for font formats
    pub fn verify_font_magic(bytes: &[u8], ext: &str) -> bool {
        if bytes.len() < 4 {
            return false;
        }

        match ext {
            "ttf" => {
                // 0x00010000 or 'true'
                (bytes[0] == 0x00 && bytes[1] == 0x01 && bytes[2] == 0x00 && bytes[3] == 0x00)
                    || (bytes[0] == b't'
                        && bytes[1] == b'r'
                        && bytes[2] == b'u'
                        && bytes[3] == b'e')
            }
            "otf" => {
                // 'OTTO' or 0x00010000
                (bytes[0] == b'O' && bytes[1] == b'T' && bytes[2] == b'T' && bytes[3] == b'O')
                    || (bytes[0] == 0x00
                        && bytes[1] == 0x01
                        && bytes[2] == 0x00
                        && bytes[3] == 0x00)
            }
            "ttc" => {
                // 'ttcf'
                bytes[0] == b't' && bytes[1] == b't' && bytes[2] == b'c' && bytes[3] == b'f'
            }
            "woff" => {
                // 'wOFF'
                bytes[0] == b'w' && bytes[1] == b'O' && bytes[2] == b'F' && bytes[3] == b'F'
            }
            "woff2" => {
                // 'wOF2'
                bytes[0] == b'w' && bytes[1] == b'O' && bytes[2] == b'F' && bytes[3] == b'2'
            }
            _ => true,
        }
    }
}
