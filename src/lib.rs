//! # Fontivo Core Engine
//!
//! Next-generation, high-performance desktop font management engine and typography workstation.
//!
//! ## Architecture Overview
//!
//! Fontivo is architected around zero-copy memory-mapped font activation, instant kernel typography
//! cache synchronization, and real-time integration with creative suites (Adobe Photoshop, Illustrator, InDesign).
//!
//! ### Core Subsystems
//!
//! - **[`engine`]**: Core font activation, deactivation, RAM lifecycle management, system font health, and screen color sampling.
//! - **[`parser`]**: Zero-copy TrueType (`.ttf`), OpenType (`.otf`), Collection (`.ttc`), and Web Font (`.woff`/`.woff2`) table parsing.
//! - **[`scanner`]**: Fast parallel directory traversing, metadata indexing, and Adobe CC project format reverse-engineering (`.psd`, `.ai`, `.indd`).
//! - **[`server`]**: Embedded high-throughput local REST API server (`127.0.0.1:3920`) and Adobe CC WebSocket/HTTP auto-activation bridge (`127.0.0.1:27715`).
//! - **[`collections`]**: Tagging, smart collections, and hierarchical organization for thousands of font families.
//! - **[`google`]**: Local-first Google Fonts catalog caching and streaming download manager.
//! - **[`updater`]**: Cryptographically verified SHA-256 in-app self-updater.
//! - **[`watcher`]**: Hot-reloading cross-platform filesystem watcher for font library directories.
//!
//! ## Performance Guarantees
//!
//! - **RAM-Only Font Injection**: Instant typography availability (0ms system reboot requirement, zero disk pollution in `C:\Windows\Fonts`).
//! - **Atomic Session Cleanup**: Automatic de-registration of temporary fonts on process termination or window close.
//! - **Low Memory Overhead**: Sub-10MB base memory footprint with jemalloc/system allocator and aggressive profile optimizations.

#![allow(non_snake_case)]

pub mod fontivo_collections;
pub mod fontivo_core;
pub mod fontivo_google;
pub mod fontivo_parser;
pub mod fontivo_scanner;
pub mod fontivo_server;
pub mod fontivo_updater;
pub mod fontivo_watcher;

// Module aliases matching domain conventions and backward compatibility:
pub use fontivo_collections as collections;
pub use fontivo_core as engine;
pub use fontivo_google as google;
pub use fontivo_parser as parser;
pub use fontivo_scanner as scanner;
pub use fontivo_server as server;
pub use fontivo_updater as updater;
pub use fontivo_watcher as watcher;

// Re-exports for backward compatibility and internal convenience
pub use fontivo_collections::*;
pub use fontivo_core::*;
pub use fontivo_google::*;
pub use fontivo_parser::*;
pub use fontivo_scanner::*;
pub use fontivo_server::*;
pub use fontivo_updater::*;
pub use fontivo_watcher::*;

/// Curated prelude providing idiomatic, high-level facade exports for library consumers
pub mod prelude {
    pub use crate::collections::CollectionStore;
    pub use crate::engine::{ActiveRamFont, DownloadManager, FontActivator, SystemHealthChecker};
    pub use crate::parser::{FontMetadata, FontParser};
    pub use crate::scanner::{AdobeScanner, DesignFontItem, DesignInspectionResult};
    pub use crate::server::{AdobeListener, ApiServer, AppState, UserEvent};
    pub use crate::BUILD_INFO;
}

/// Compile-time build and version metadata embedded by `build.rs`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuildInfo {
    /// Full version string including semver and git commit hash (e.g., `v1.0.0 (a30225b)`)
    pub version: &'static str,
    /// Semantic version (e.g., `1.0.0`)
    pub semver: &'static str,
    /// Short git commit hash
    pub git_hash: &'static str,
    /// Git branch at build time
    pub git_branch: &'static str,
    /// Gregorian build date (`YYYY-MM-DD`)
    pub build_date: &'static str,
    /// Unix timestamp in seconds
    pub build_timestamp: &'static str,
    /// Compilation profile (`release` or `debug`)
    pub profile: &'static str,
    /// Target triple
    pub target: &'static str,
}

impl BuildInfo {
    /// Formatted summary string for diagnostics and CLI outputs
    pub fn display_summary(&self) -> String {
        format!(
            "Fontivo Core {} [target: {}, profile: {}, git: {}, built: {}]",
            self.version, self.target, self.profile, self.git_hash, self.build_date
        )
    }
}

/// Static build metadata instance available at runtime
pub const BUILD_INFO: BuildInfo = BuildInfo {
    version: match option_env!("FONTIVO_VERSION") {
        Some(v) => v,
        None => env!("CARGO_PKG_VERSION"),
    },
    semver: match option_env!("FONTIVO_SEMVER") {
        Some(s) => s,
        None => env!("CARGO_PKG_VERSION"),
    },
    git_hash: match option_env!("FONTIVO_GIT_HASH") {
        Some(h) => h,
        None => "release",
    },
    git_branch: match option_env!("FONTIVO_GIT_BRANCH") {
        Some(b) => b,
        None => "main",
    },
    build_date: match option_env!("FONTIVO_BUILD_DATE") {
        Some(d) => d,
        None => "2026-11-23",
    },
    build_timestamp: match option_env!("FONTIVO_BUILD_TIMESTAMP") {
        Some(t) => t,
        None => "0",
    },
    profile: match option_env!("FONTIVO_PROFILE") {
        Some(p) => p,
        None => {
            if cfg!(debug_assertions) {
                "debug"
            } else {
                "release"
            }
        }
    },
    target: match option_env!("FONTIVO_TARGET") {
        Some(t) => t,
        None => "x86_64-pc-windows-msvc",
    },
};

/// Alias for [`BUILD_INFO`] matching crate-prefixed naming conventions
pub const FONTIVO_BUILD_INFO: BuildInfo = BUILD_INFO;
