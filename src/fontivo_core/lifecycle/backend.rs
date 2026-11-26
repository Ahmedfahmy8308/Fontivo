use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::{Path, PathBuf};

/// Explicit error types for the font lifecycle subsystem
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "details")]
pub enum FontLifecycleError {
    FileNotFound(PathBuf),
    UnsupportedFormat { format: String, reason: String },
    CorruptedFontFile(String),
    NativeActivationFailed { os_code: u32, message: String },
    NativeDeactivationFailed(String),
    AlreadyActive(PathBuf),
    NotActive(PathBuf),
    FileConflict(String),
    RegistryError(String),
    PermissionDenied(String),
    IoError(String),
    UnsupportedPlatform(String),
}

impl fmt::Display for FontLifecycleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FontLifecycleError::FileNotFound(p) => {
                write!(f, "Font file does not exist: {:?}", p)
            }
            FontLifecycleError::UnsupportedFormat { format, reason } => {
                write!(
                    f,
                    "Format '{}' cannot be activated natively: {}",
                    format, reason
                )
            }
            FontLifecycleError::CorruptedFontFile(msg) => {
                write!(f, "Font file validation failed: {}", msg)
            }
            FontLifecycleError::NativeActivationFailed { os_code, message } => {
                write!(
                    f,
                    "Operating system font activation failed (OS error {}): {}",
                    os_code, message
                )
            }
            FontLifecycleError::NativeDeactivationFailed(msg) => {
                write!(f, "Operating system font deactivation failed: {}", msg)
            }
            FontLifecycleError::AlreadyActive(p) => {
                write!(f, "Font is already active in memory: {:?}", p)
            }
            FontLifecycleError::NotActive(p) => {
                write!(f, "Font is not currently active: {:?}", p)
            }
            FontLifecycleError::FileConflict(msg) => {
                write!(f, "Font installation conflict: {}", msg)
            }
            FontLifecycleError::RegistryError(msg) => {
                write!(f, "Windows registry error: {}", msg)
            }
            FontLifecycleError::PermissionDenied(msg) => {
                write!(f, "Permission denied during font operation: {}", msg)
            }
            FontLifecycleError::IoError(msg) => {
                write!(f, "I/O error during font operation: {}", msg)
            }
            FontLifecycleError::UnsupportedPlatform(msg) => {
                write!(f, "Platform not supported for this font operation: {}", msg)
            }
        }
    }
}

impl std::error::Error for FontLifecycleError {}

/// Result of an individual temporary activation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationResult {
    pub path: PathBuf,
    pub native_resources_added: u32,
    pub is_newly_activated: bool,
}

/// Result of an individual deactivation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeactivationResult {
    pub path: PathBuf,
    pub removed_from_os: bool,
}

/// Result of permanent installation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub source_path: PathBuf,
    pub installed_path: PathBuf,
    pub registered_name: String,
}

/// Result of permanent uninstallation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallResult {
    pub font_name: String,
    pub registry_removed: bool,
    pub file_removed: bool,
}

/// Detailed batch reporting to prevent partial failures from appearing as total success
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSummary {
    pub total_requested: usize,
    pub succeeded: Vec<usize>,
    pub failed: Vec<BatchFailureItem>,
    pub already_in_state: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFailureItem {
    pub id: usize,
    pub path: Option<String>,
    pub error: String,
}

/// Trait defining the native operating-system font lifecycle operations
pub trait FontLifecycleBackend {
    /// In-memory/transient font activation via OS font subsystem
    fn activate_ram(&self, path: &Path) -> Result<u32, FontLifecycleError>;

    /// In-memory/transient font deactivation
    fn deactivate_ram(&self, path: &Path) -> Result<bool, FontLifecycleError>;

    /// Permanent font installation to user font folder and system registry / font index
    fn install_permanent(&self, src: &Path, font_name: &str)
        -> Result<PathBuf, FontLifecycleError>;

    /// Permanent font uninstallation and cleanup
    fn uninstall_permanent(
        &self,
        font_name: &str,
        file_name: Option<&str>,
    ) -> Result<bool, FontLifecycleError>;

    /// Broadcast notification to desktop apps (Photoshop, Word, Illustrator) that font tables changed
    fn broadcast_change(&self);

    /// Query whether a font file format can be natively loaded by this OS without format conversion
    fn is_format_supported(&self, ext: &str) -> bool;
}
