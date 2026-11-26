use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use super::lifecycle::{
    create_platform_backend, BatchFailureItem, BatchSummary, FontLifecycleBackend,
    FontLifecycleError,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRamFont {
    pub id: usize,
    pub name: String,
    pub path: String,
    pub format: String,
    pub registered_at: u64,
    pub memory_mb: f64,
}

pub struct FontActivator {
    backend: Box<dyn FontLifecycleBackend + Send + Sync>,
    /// Set of canonical path strings currently active in memory
    active_paths: Arc<Mutex<HashSet<String>>>,
    /// Specifically tracks fonts activated by this Fontivo process session (for safe shutdown cleanup)
    session_managed_paths: Arc<Mutex<HashSet<String>>>,
    /// Tracks fonts permanently installed by Fontivo (font_name -> installed destination path)
    permanent_manifest: Arc<Mutex<HashMap<String, PathBuf>>>,
    /// Live RAM active font metadata registry
    active_ram_records: Arc<Mutex<HashMap<String, ActiveRamFont>>>,
}

impl Default for FontActivator {
    fn default() -> Self {
        Self::new()
    }
}

impl FontActivator {
    pub fn new() -> Self {
        Self {
            backend: create_platform_backend(),
            active_paths: Arc::new(Mutex::new(HashSet::new())),
            session_managed_paths: Arc::new(Mutex::new(HashSet::new())),
            permanent_manifest: Arc::new(Mutex::new(HashMap::new())),
            active_ram_records: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Construct activator with custom backend (useful for unit testing and mocks)
    pub fn with_backend(backend: Box<dyn FontLifecycleBackend + Send + Sync>) -> Self {
        Self {
            backend,
            active_paths: Arc::new(Mutex::new(HashSet::new())),
            session_managed_paths: Arc::new(Mutex::new(HashSet::new())),
            permanent_manifest: Arc::new(Mutex::new(HashMap::new())),
            active_ram_records: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Broadcast notification to top-level applications that font tables changed
    pub fn broadcast_font_change(&self) {
        self.backend.broadcast_change();
    }

    /// Normalize path string to clean canonical format for consistent keying.
    /// Strips Windows `\\?\` extended-length prefix so Win32 GDI `AddFontResourceW`
    /// and Adobe CoolType always receive a standard `C:\...` path.
    fn normalize_path(path_str: &str) -> (PathBuf, String) {
        let p = Path::new(path_str);
        let canonical = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
        let raw_str = canonical.to_string_lossy().to_string();
        let cleaned = if let Some(stripped) = raw_str.strip_prefix(r"\\?\") {
            if !stripped.starts_with("UNC\\") && stripped.len() < 260 {
                stripped.to_string()
            } else {
                raw_str
            }
        } else {
            raw_str
        };
        (PathBuf::from(&cleaned), cleaned)
    }

    /// Temporary In-Memory (RAM) activation with:
    /// - Strict OS return value verification
    /// - Font file and format validation
    /// - Idempotent duplicate checking (prevents GDI refcount leaks)
    /// - Session tracking for safe shutdown cleanup
    pub fn activate_ram(&self, path_str: &str) -> Result<String, FontLifecycleError> {
        let (canonical_path, norm_str) = Self::normalize_path(path_str);

        if !canonical_path.exists() {
            return Err(FontLifecycleError::FileNotFound(canonical_path));
        }

        // 1. Idempotency Check: if already active in this session, return success without duplicate native registration
        {
            let active = self.active_paths.lock().unwrap();
            if active.contains(&norm_str) || active.contains(path_str) {
                return Ok("ALREADY_ACTIVE: Font is already active in memory".to_string());
            }
        }

        // 2. Invoke OS native backend (validates magic bytes, checks native API return code)
        let added_count = self.backend.activate_ram(&canonical_path)?;

        // 3. Atomically register into active and session sets
        {
            let mut active = self.active_paths.lock().unwrap();
            let mut session = self.session_managed_paths.lock().unwrap();
            active.insert(norm_str.clone());
            session.insert(norm_str.clone());
        }

        let ext = canonical_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("TTF")
            .to_uppercase();
        let font_name = canonical_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Font")
            .to_string();
        let file_size = std::fs::metadata(&canonical_path)
            .map(|m| m.len() as usize)
            .unwrap_or(0);
        let mem_mb = ((file_size as f64) / (1024.0 * 1024.0) * 10.0).round() / 10.0;
        let memory_mb = if mem_mb < 0.1 { 0.1 } else { mem_mb };
        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let ram_info = ActiveRamFont {
            id: 0,
            name: font_name,
            path: norm_str.clone(),
            format: ext,
            registered_at: now_sec,
            memory_mb,
        };
        {
            let mut records = self.active_ram_records.lock().unwrap();
            records.insert(norm_str.clone(), ram_info);
        }

        Ok(format!(
            "ACTIVATED_RAM: Successfully registered {} font resources",
            added_count
        ))
    }

    /// Deactivate from RAM via OS font subsystem
    pub fn deactivate_ram(&self, path_str: &str) -> Result<String, FontLifecycleError> {
        let (canonical_path, norm_str) = Self::normalize_path(path_str);

        // Check if currently tracked
        let was_tracked = {
            let active = self.active_paths.lock().unwrap();
            active.contains(&norm_str) || active.contains(path_str)
        };

        if !was_tracked {
            return Ok("NOT_ACTIVE: Font was not loaded in memory".to_string());
        }

        // 1. Invoke OS native backend
        let removed = self.backend.deactivate_ram(&canonical_path)?;

        // 2. Remove from active and session sets
        {
            let mut active = self.active_paths.lock().unwrap();
            let mut session = self.session_managed_paths.lock().unwrap();
            active.remove(&norm_str);
            active.remove(path_str);
            session.remove(&norm_str);
            session.remove(path_str);
            let mut records = self.active_ram_records.lock().unwrap();
            records.remove(&norm_str);
            records.remove(path_str);
        }

        if removed {
            Ok("DEACTIVATED_RAM: Success".to_string())
        } else {
            Ok("DEACTIVATED_RAM: Font was not loaded in operating system table".to_string())
        }
    }

    /// Batch font activation reporting individual successes and failures
    pub fn activate_batch<F>(&self, items: &[(usize, String)], mut on_item: F) -> BatchSummary
    where
        F: FnMut(usize, bool),
    {
        let mut summary = BatchSummary {
            total_requested: items.len(),
            ..Default::default()
        };

        for (id, path) in items {
            match self.activate_ram(path) {
                Ok(msg) => {
                    if msg.starts_with("ALREADY_ACTIVE") {
                        summary.already_in_state.push(*id);
                    }
                    summary.succeeded.push(*id);
                    on_item(*id, true);
                }
                Err(e) => {
                    summary.failed.push(BatchFailureItem {
                        id: *id,
                        path: Some(path.clone()),
                        error: e.to_string(),
                    });
                    on_item(*id, false);
                }
            }
        }

        summary
    }

    /// Batch font deactivation reporting individual successes and failures
    pub fn deactivate_batch<F>(&self, items: &[(usize, String)], mut on_item: F) -> BatchSummary
    where
        F: FnMut(usize, bool),
    {
        let mut summary = BatchSummary {
            total_requested: items.len(),
            ..Default::default()
        };

        for (id, path) in items {
            match self.deactivate_ram(path) {
                Ok(msg) => {
                    if msg.starts_with("NOT_ACTIVE") {
                        summary.already_in_state.push(*id);
                    }
                    summary.succeeded.push(*id);
                    on_item(*id, true);
                }
                Err(e) => {
                    summary.failed.push(BatchFailureItem {
                        id: *id,
                        path: Some(path.clone()),
                        error: e.to_string(),
                    });
                    on_item(*id, false);
                }
            }
        }

        summary
    }

    /// Deactivate ALL transient RAM fonts
    pub fn deactivate_all(&self) -> usize {
        let paths: Vec<String> = {
            let set = self.active_paths.lock().unwrap();
            let mut unique = HashSet::new();
            for p in set.iter() {
                let (_, norm) = Self::normalize_path(p);
                unique.insert(norm);
            }
            unique.into_iter().collect()
        };

        let mut count = 0;
        for p in &paths {
            if self.deactivate_ram(p).is_ok() {
                count += 1;
            }
        }

        {
            let mut active = self.active_paths.lock().unwrap();
            active.clear();
            let mut session = self.session_managed_paths.lock().unwrap();
            session.clear();
            let mut records = self.active_ram_records.lock().unwrap();
            records.clear();
        }

        self.broadcast_font_change();
        count
    }

    /// Retrieve live list of all fonts currently registered in RAM
    pub fn get_live_ram_fonts(&self) -> Vec<ActiveRamFont> {
        let records = self.active_ram_records.lock().unwrap();
        records.values().cloned().collect()
    }

    /// Record an active font with full metadata into the RAM registry
    pub fn record_active_ram_font(&self, font: ActiveRamFont) {
        let (_, norm_str) = Self::normalize_path(&font.path);
        let mut rec = font;
        rec.path = norm_str.clone();
        let mut records = self.active_ram_records.lock().unwrap();
        records.insert(norm_str, rec);
    }

    /// Rapid purge of all RAM fonts
    pub fn clear_all_ram_fonts(&self) -> usize {
        self.deactivate_all()
    }

    /// Cleanup only fonts activated during THIS session (for safe application shutdown)
    /// Never touches permanently installed fonts or original user source files
    pub fn cleanup_session_fonts(&self) -> usize {
        let session_fonts: Vec<String> = {
            let set = self.session_managed_paths.lock().unwrap();
            let mut unique = HashSet::new();
            for p in set.iter() {
                let (_, norm) = Self::normalize_path(p);
                unique.insert(norm);
            }
            unique.into_iter().collect()
        };

        let mut cleaned = 0;
        for p in &session_fonts {
            if self.deactivate_ram(p).is_ok() {
                cleaned += 1;
            }
        }

        self.broadcast_font_change();
        cleaned
    }

    /// Permanent Font Installation with:
    /// - Format verification (rejects WOFF/WOFF2 natively)
    /// - Destination collision safety
    /// - Checked Registry entry creation on Windows
    /// - Immediate session GDI registration
    pub fn install_permanent(
        &self,
        src_path_str: &str,
        font_name: &str,
    ) -> Result<String, FontLifecycleError> {
        let src = Path::new(src_path_str);
        if !src.exists() {
            return Err(FontLifecycleError::FileNotFound(src.to_path_buf()));
        }

        let installed_dest = self.backend.install_permanent(src, font_name)?;

        // Record in Fontivo permanent manifest
        {
            let mut manifest = self.permanent_manifest.lock().unwrap();
            manifest.insert(font_name.to_string(), installed_dest.clone());
        }

        Ok(format!(
            "INSTALLED_PERMANENT: Successfully installed to {:?}",
            installed_dest
        ))
    }

    /// Permanent Font Uninstallation with:
    /// - Precise Fontivo ownership targeting (avoids deleting unrelated user fonts)
    /// - Complete removal from OS registry & user fonts directory
    /// - System broadcast notification
    pub fn uninstall_permanent(&self, font_name: &str) -> Result<String, FontLifecycleError> {
        let file_name = {
            let manifest = self.permanent_manifest.lock().unwrap();
            manifest.get(font_name).and_then(|p| {
                p.file_name()
                    .and_then(|f| f.to_str())
                    .map(|s| s.to_string())
            })
        };

        let removed = self
            .backend
            .uninstall_permanent(font_name, file_name.as_deref())?;

        // Remove from manifest
        {
            let mut manifest = self.permanent_manifest.lock().unwrap();
            manifest.remove(font_name);
        }

        if removed {
            Ok(format!(
                "UNINSTALLED_PERMANENT: Successfully uninstalled '{}'",
                font_name
            ))
        } else {
            Ok(format!(
                "UNINSTALLED_PERMANENT: No registered entry found for '{}'",
                font_name
            ))
        }
    }

    pub fn get_active_count(&self) -> usize {
        self.active_paths.lock().unwrap().len()
    }

    pub fn is_active(&self, path_str: &str) -> bool {
        let (_, norm_str) = Self::normalize_path(path_str);
        let active = self.active_paths.lock().unwrap();
        active.contains(&norm_str) || active.contains(path_str)
    }

    pub fn get_active_fonts(&self) -> HashSet<String> {
        self.active_paths.lock().unwrap().clone()
    }

    pub fn get_session_managed_count(&self) -> usize {
        self.session_managed_paths.lock().unwrap().len()
    }

    /// Activate font and return an RAII handle that automatically deactivates on drop
    pub fn activate_scoped<'a>(
        &'a self,
        path_str: &str,
    ) -> Result<FontActivationHandle<'a>, FontLifecycleError> {
        self.activate_ram(path_str)?;
        Ok(FontActivationHandle {
            activator: self,
            path: path_str.to_string(),
        })
    }
}

/// RAII handle that guarantees font deactivation upon drop
pub struct FontActivationHandle<'a> {
    activator: &'a FontActivator,
    path: String,
}

impl<'a> FontActivationHandle<'a> {
    pub fn path(&self) -> &str {
        &self.path
    }
}

impl<'a> Drop for FontActivationHandle<'a> {
    fn drop(&mut self) {
        let _ = self.activator.deactivate_ram(&self.path);
    }
}

impl Drop for FontActivator {
    fn drop(&mut self) {
        self.cleanup_session_fonts();
    }
}
