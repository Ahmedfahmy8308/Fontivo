pub mod backup;
pub mod cache;
pub mod elevation;
pub mod protected;
pub mod registry;
pub mod telemetry;
pub mod types;

pub use backup::*;
pub use cache::*;
pub use elevation::*;
pub use protected::*;
pub use registry::*;
pub use telemetry::*;
pub use types::*;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub fn get_report(library_total: usize) -> SystemHealthReport {
    let (total_registered, dead_entries) = registry::scan_registry_fonts();

    // Calculate cache file size
    let mut cache_size = 8.5;
    let win_dir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let cache_file = PathBuf::from(&win_dir)
        .join("System32")
        .join("FNTCACHE.DAT");
    if let Ok(meta) = fs::metadata(cache_file) {
        cache_size = (meta.len() as f64) / (1024.0 * 1024.0);
    }

    SystemHealthReport {
        registered_fonts_count: total_registered,
        dead_entries_count: dead_entries.len(),
        dead_entries,
        cache_status: "DirectWrite Cache جاهز ومفعل".to_string(),
        cache_size_mb: format!("{:.1}", cache_size),
        library_total,
    }
}

/// Unified facade providing zero-breaking-change static diagnostic & health APIs.
#[cfg(windows)]
pub struct SystemHealthChecker;

impl SystemHealthChecker {
    // === Elevation & Autostart ===
    pub fn is_running_as_admin() -> bool {
        elevation::is_running_as_admin()
    }

    pub fn run_elevated_worker(worker_args: &[&str]) -> Result<serde_json::Value, ElevatedError> {
        elevation::run_elevated_worker(worker_args)
    }

    pub fn restore_windows_fonts_with_profile_elevated(
        profile: &str,
    ) -> Result<serde_json::Value, ElevatedError> {
        elevation::restore_windows_fonts_with_profile_elevated(profile)
    }

    pub fn uninstall_windows_font_elevated(
        name: Option<&str>,
        path_str: &str,
    ) -> Result<serde_json::Value, ElevatedError> {
        elevation::uninstall_windows_font_elevated(name, path_str)
    }

    pub fn undo_restore_backup_elevated(
        backup_id: &str,
    ) -> Result<serde_json::Value, ElevatedError> {
        elevation::undo_restore_backup_elevated(backup_id)
    }

    pub fn relaunch_as_admin() -> Result<(), String> {
        elevation::relaunch_as_admin()
    }

    pub fn get_system_fonts_admin_status() -> (usize, bool) {
        elevation::get_system_fonts_admin_status()
    }

    pub fn get_autostart_status() -> (bool, String) {
        elevation::get_autostart_status()
    }

    pub fn toggle_autostart(enable: Option<bool>) -> Result<(bool, String), String> {
        elevation::toggle_autostart(enable)
    }

    // === Registry & Font Scanning ===
    pub fn normalize_windows_path_for_compare(p: &Path) -> String {
        registry::normalize_windows_path_for_compare(p)
    }

    pub fn is_system_windows_fonts_path(path_str: &str) -> bool {
        registry::is_system_windows_fonts_path(path_str)
    }

    pub fn validate_windows_font_path(path_str: &str) -> Result<PathBuf, String> {
        registry::validate_windows_font_path(path_str)
    }

    pub fn validate_backup_id(backup_id: &str) -> Result<&str, String> {
        registry::validate_backup_id(backup_id)
    }

    pub fn registry_value_matches_font(
        val_name: &str,
        val_data: &str,
        target_name: Option<&str>,
        target_path: &str,
    ) -> bool {
        registry::registry_value_matches_font(val_name, val_data, target_name, target_path)
    }

    pub fn scan_registry_fonts() -> (usize, Vec<DeadFontEntry>) {
        registry::scan_registry_fonts()
    }

    pub fn clean_dead_registry_fonts() -> usize {
        registry::clean_dead_registry_fonts()
    }

    pub fn enumerate_windows_fonts() -> Vec<WindowsFontItem> {
        registry::enumerate_windows_fonts()
    }

    pub fn uninstall_windows_font(name: Option<&str>, path_str: &str) -> Result<String, String> {
        registry::uninstall_windows_font(name, path_str)
    }

    // === Cache ===
    pub fn rebuild_font_cache() -> Result<String, String> {
        cache::rebuild_font_cache()
    }

    // === Report & Telemetry ===
    pub fn get_report(library_total: usize) -> SystemHealthReport {
        get_report(library_total)
    }

    pub fn get_current_process_ram_mb() -> f64 {
        telemetry::get_current_process_ram_mb()
    }

    pub fn get_system_ram_detailed() -> (f64, f64, f64, f64) {
        telemetry::get_system_ram_detailed()
    }

    pub fn get_system_ram_stats() -> (f64, f64, f64) {
        telemetry::get_system_ram_stats()
    }

    pub fn enumerate_top_processes(limit: usize) -> (Vec<ProcessTelemetryItem>, f64) {
        telemetry::enumerate_top_processes(limit)
    }

    pub fn get_system_resources(active_ram_fonts: usize) -> SystemResourcesResponse {
        telemetry::get_system_resources(active_ram_fonts)
    }

    pub fn trim_process_working_set(target_pid: Option<u32>, trim_all: bool) -> TrimProcessResult {
        telemetry::trim_process_working_set(target_pid, trim_all)
    }

    pub fn optimize_system_ram() -> RamOptimizationResult {
        telemetry::optimize_system_ram()
    }

    pub fn optimize_system_ram_with_cleared_fonts(
        active_fonts_cleared: usize,
    ) -> RamOptimizationResult {
        telemetry::optimize_system_ram_with_cleared_fonts(active_fonts_cleared)
    }

    // === Protected Fonts ===
    pub fn is_essential_creative_font(name: &str, family: &str) -> bool {
        protected::is_essential_creative_font(name, family)
    }

    pub fn is_protected_system_font(name: &str, family: &str, path: &str) -> bool {
        protected::is_protected_system_font(name, family, path)
    }

    pub fn is_core_font(name: &str, family: &str) -> bool {
        protected::is_core_font(name, family)
    }

    // === Backup & Restore ===
    pub fn restore_default_windows_fonts() -> Result<(usize, String), String> {
        backup::restore_default_windows_fonts()
    }

    pub fn move_font_file_to_backup(src_path: &Path, dest_path: &Path) -> Result<bool, String> {
        backup::move_font_file_to_backup(src_path, dest_path)
    }

    pub fn snapshot_fonts_registry() -> Vec<RegistrySnapshotEntry> {
        backup::snapshot_fonts_registry()
    }

    pub fn validate_protected_fonts_post_op(
        pre_snapshot: &[RegistrySnapshotEntry],
        post_snapshot: &[RegistrySnapshotEntry],
    ) -> Result<(), Vec<String>> {
        backup::validate_protected_fonts_post_op(pre_snapshot, post_snapshot)
    }

    pub fn restore_windows_fonts_with_profile(
        profile: &str,
    ) -> Result<RestoreProfileResult, String> {
        backup::restore_windows_fonts_with_profile(profile)
    }

    pub fn get_fontivo_backups() -> Vec<BackupFolderInfo> {
        backup::get_fontivo_backups()
    }

    pub fn open_backup_folder(path: &str) -> Result<(), String> {
        backup::open_backup_folder(path)
    }

    pub fn build_undo_registry_entries(
        font_item: &serde_json::Value,
    ) -> Vec<RegistrySnapshotEntry> {
        backup::build_undo_registry_entries(font_item)
    }

    pub fn undo_restore_backup(backup_id: &str) -> Result<usize, String> {
        backup::undo_restore_backup(backup_id)
    }
}
