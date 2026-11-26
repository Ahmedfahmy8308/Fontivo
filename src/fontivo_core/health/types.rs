use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WindowsFontItem {
    pub id: String,
    pub name: String,
    pub family: String,
    pub path: String,
    pub size: usize,
    pub hive: String,
    pub is_system_core: bool,
    pub is_uninstallable: bool,
    #[serde(default)]
    pub pending_reboot_delete: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegistryBackupEntry {
    pub name: String,
    pub data: String,
    pub hive: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySnapshotEntry {
    pub hive: String,
    pub value_name: String,
    pub value_type: u32,
    pub value_data: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TransactionLogEntry {
    pub timestamp: u64,
    pub action: String,
    pub status: String,
    pub font: String,
    pub hive: String,
    pub details: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeadFontEntry {
    pub name: String,
    pub target_path: String,
    pub hive: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RamOptimizationResult {
    pub success: bool,
    pub before_mb: f64,
    pub after_mb: f64,
    pub ram_before_mb: f64,
    pub ram_after_mb: f64,
    pub freed_mb: f64,
    pub freed_percent: f64,
    pub system_ram_before_mb: f64,
    pub system_ram_after_mb: f64,
    pub system_freed_mb: f64,
    pub trimmed_processes_count: usize,
    pub processes_trimmed: usize,
    pub active_fonts_cleared: usize,
    pub purged_temp_mb: f64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RamTelemetry {
    pub used_mb: f64,
    pub total_mb: f64,
    pub available_mb: f64,
    pub cached_mb: f64,
    pub usage_percent: f64,
    pub fontivo_ram_mb: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CpuTelemetry {
    pub usage_percent: f64,
    pub cores_count: usize,
    pub processor_name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuTelemetry {
    pub adapter_name: String,
    pub usage_percent: f64,
    pub vram_used_mb: f64,
    pub vram_total_mb: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessTelemetryItem {
    pub pid: u32,
    pub name: String,
    pub ram_mb: f64,
    pub cpu_percent: f64,
    pub is_system: bool,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CacheBreakdownTelemetry {
    pub active_ram_fonts: usize,
    pub gdi_font_handles: usize,
    pub process_working_sets_mb: f64,
    pub windows_font_cache_mb: f64,
    pub temp_files_mb: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourcesResponse {
    pub success: bool,
    // Nested telemetry objects
    pub ram: RamTelemetry,
    pub cpu: CpuTelemetry,
    pub gpu: GpuTelemetry,
    pub top_processes: Vec<ProcessTelemetryItem>,
    pub cache_breakdown: CacheBreakdownTelemetry,
    // Flat top-level aliases for direct UI consumption (RamInspectorView, status bar, etc.)
    pub process_ram_mb: f64,
    pub ram_mb: f64,
    pub system_used_mb: f64,
    pub system_total_mb: f64,
    pub system_available_mb: f64,
    pub system_cached_mb: f64,
    pub system_percent: f64,
    pub cpu_percent: f64,
    pub cpu_cores: usize,
    pub cpu_model: String,
    pub gpu_name: String,
    pub gpu_percent: f64,
    pub vram_used_mb: f64,
    pub vram_total_mb: f64,
    pub gdi_handles_count: usize,
    pub font_cache_mb: f64,
    pub active_ram_fonts: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrimProcessResult {
    pub success: bool,
    pub pid: Option<u32>,
    pub trimmed_count: usize,
    pub before_mb: f64,
    pub after_mb: f64,
    pub freed_mb: f64,
    pub system_ram_before_mb: f64,
    pub system_ram_after_mb: f64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupFolderInfo {
    pub id: String,
    pub timestamp: u64,
    pub date_formatted: String,
    pub profile: String,
    pub total_fonts: usize,
    #[serde(default)]
    pub removed_count: usize,
    #[serde(default)]
    pub scheduled_reboot_count: usize,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestoreProfileResult {
    pub success: bool,
    pub profile: String,
    pub removed_count: usize,
    pub retained_count: usize,
    #[serde(default)]
    pub scheduled_reboot_count: usize,
    #[serde(default)]
    pub already_scheduled_count: usize,
    #[serde(default)]
    pub skipped_count: usize,
    #[serde(default)]
    pub skipped_fonts: Vec<String>,
    pub backup_path: String,
    pub backup_id: String,
    pub is_admin: bool,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemHealthReport {
    pub registered_fonts_count: usize,
    pub dead_entries_count: usize,
    pub dead_entries: Vec<DeadFontEntry>,
    pub cache_status: String,
    pub cache_size_mb: String,
    pub library_total: usize,
}

#[derive(Debug, Clone)]
pub enum ElevatedError {
    Cancelled(String),
    Failed(String),
}
