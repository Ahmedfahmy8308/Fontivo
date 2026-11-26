use std::path::{Path, PathBuf};

use super::backend::{FontLifecycleBackend, FontLifecycleError};

pub struct FallbackBackend;

impl Default for FallbackBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl FallbackBackend {
    pub fn new() -> Self {
        Self
    }
}

impl FontLifecycleBackend for FallbackBackend {
    fn is_format_supported(&self, _ext: &str) -> bool {
        false
    }

    fn activate_ram(&self, _path: &Path) -> Result<u32, FontLifecycleError> {
        Err(FontLifecycleError::UnsupportedPlatform(
            "Native font activation is not supported on this platform".into(),
        ))
    }

    fn deactivate_ram(&self, _path: &Path) -> Result<bool, FontLifecycleError> {
        Err(FontLifecycleError::UnsupportedPlatform(
            "Native font deactivation is not supported on this platform".into(),
        ))
    }

    fn install_permanent(
        &self,
        _src: &Path,
        _font_name: &str,
    ) -> Result<PathBuf, FontLifecycleError> {
        Err(FontLifecycleError::UnsupportedPlatform(
            "Permanent font installation is not supported on this platform".into(),
        ))
    }

    fn uninstall_permanent(
        &self,
        _font_name: &str,
        _file_name: Option<&str>,
    ) -> Result<bool, FontLifecycleError> {
        Err(FontLifecycleError::UnsupportedPlatform(
            "Permanent font uninstallation is not supported on this platform".into(),
        ))
    }

    fn broadcast_change(&self) {}
}
