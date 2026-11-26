use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));

    // 1. Cargo rerun triggers
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("Cargo.toml").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("build.rs").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("app.ico").display()
    );
    println!("cargo:rerun-if-env-changed=FONTIVO_GIT_HASH");
    println!("cargo:rerun-if-env-changed=FONTIVO_GIT_BRANCH");
    println!("cargo:rerun-if-env-changed=FONTIVO_BUILD_VERSION");

    // 2. Resolve Version and Git Metadata
    let pkg_version = env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "1.0.0".to_string());
    let git_hash = resolve_git_hash(&manifest_dir);
    let git_branch = resolve_git_branch(&manifest_dir);
    let (timestamp_secs, build_date) = resolve_build_time();
    let profile = env::var("PROFILE").unwrap_or_else(|_| "release".to_string());
    let target = env::var("TARGET").unwrap_or_else(|_| "x86_64-pc-windows-msvc".to_string());

    let full_version = format!("v{} ({})", pkg_version, git_hash);

    // 3. Emit Rustc Environment Variables for Compile-Time Reflection
    println!("cargo:rustc-env=FONTIVO_VERSION={}", full_version);
    println!("cargo:rustc-env=FONTIVO_SEMVER={}", pkg_version);
    println!("cargo:rustc-env=FONTIVO_GIT_HASH={}", git_hash);
    println!("cargo:rustc-env=FONTIVO_GIT_BRANCH={}", git_branch);
    println!("cargo:rustc-env=FONTIVO_BUILD_DATE={}", build_date);
    println!("cargo:rustc-env=FONTIVO_BUILD_TIMESTAMP={}", timestamp_secs);
    println!("cargo:rustc-env=FONTIVO_PROFILE={}", profile);
    println!("cargo:rustc-env=FONTIVO_TARGET={}", target);

    // 4. Windows Resource Compilation (Icon, VersionInfo, High-DPI & UTF-8 Manifest)
    #[cfg(windows)]
    configure_windows_resources(&manifest_dir, &pkg_version);
}

fn resolve_git_hash(manifest_dir: &Path) -> String {
    if let Ok(hash) = env::var("FONTIVO_GIT_HASH") {
        if !hash.trim().is_empty() {
            return hash.trim().to_string();
        }
    }
    if let Ok(hash) = env::var("GIT_HASH") {
        if !hash.trim().is_empty() {
            return hash.trim().to_string();
        }
    }
    if let Ok(hash) = env::var("GITHUB_SHA") {
        if !hash.trim().is_empty() {
            let short = if hash.len() >= 7 { &hash[..7] } else { &hash };
            return short.to_string();
        }
    }

    // Try git command at manifest dir and repo ancestors
    for candidate in [
        manifest_dir.to_path_buf(),
        manifest_dir
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_default(),
        manifest_dir
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_default(),
    ] {
        if candidate.as_os_str().is_empty() {
            continue;
        }
        if let Ok(output) = Command::new("git")
            .current_dir(&candidate)
            .args(["rev-parse", "--short", "HEAD"])
            .output()
        {
            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() {
                    return s;
                }
            }
        }
    }

    "a30225b".to_string()
}

fn resolve_git_branch(manifest_dir: &Path) -> String {
    if let Ok(branch) = env::var("FONTIVO_GIT_BRANCH") {
        if !branch.trim().is_empty() {
            return branch.trim().to_string();
        }
    }
    if let Ok(branch) = env::var("GITHUB_REF_NAME") {
        if !branch.trim().is_empty() {
            return branch.trim().to_string();
        }
    }

    for candidate in [
        manifest_dir.to_path_buf(),
        manifest_dir
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_default(),
        manifest_dir
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_default(),
    ] {
        if candidate.as_os_str().is_empty() {
            continue;
        }
        if let Ok(output) = Command::new("git")
            .current_dir(&candidate)
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .output()
        {
            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() {
                    return s;
                }
            }
        }
    }

    "main".to_string()
}

fn resolve_build_time() -> (u64, String) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Gregorian date from Unix timestamp seconds (UTC)
    let days = (now / 86400) as i64;
    let mut year = 1970;
    let mut remaining = days;

    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if remaining >= days_in_year {
            remaining -= days_in_year;
            year += 1;
        } else {
            break;
        }
    }

    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let days_in_months = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 1;
    for &dim in &days_in_months {
        if remaining >= dim {
            remaining -= dim;
            month += 1;
        } else {
            break;
        }
    }
    let day = remaining + 1;
    let date_str = format!("{:04}-{:02}-{:02}", year, month, day);

    (now, date_str)
}

#[cfg(windows)]
fn configure_windows_resources(manifest_dir: &Path, pkg_version: &str) {
    let mut res = winres::WindowsResource::new();

    let icon_path = manifest_dir.join("app.ico");
    if icon_path.exists() {
        res.set_icon(icon_path.to_str().unwrap_or("app.ico"));
    }

    res.set("ProductName", "Fontivo");
    res.set(
        "FileDescription",
        "Fontivo — Next-Gen Desktop Font & Color Manager",
    );
    res.set("CompanyName", "Eng. Ahmed Fahmy (Fontivo Open Source)");
    res.set(
        "LegalCopyright",
        "Copyright (c) 2026 Eng. Ahmed Fahmy & Eng. Mohamed Elashwah (MIT)",
    );
    res.set("OriginalFilename", "Fontivo.exe");
    res.set("ProductVersion", pkg_version);
    res.set("FileVersion", pkg_version);
    res.set("InternalName", "Fontivo");
    res.set(
        "Comments",
        "Ultra-fast zero-latency font manager and typography workstation",
    );

    // Parse version triplet into u64 for Windows VERSIONINFO resource
    let mut parts = pkg_version.split('.');
    let major: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(1);
    let minor: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let version_u64 = (major << 48) | (minor << 32) | (patch << 16);
    res.set_version_info(winres::VersionInfo::FILEVERSION, version_u64);
    res.set_version_info(winres::VersionInfo::PRODUCTVERSION, version_u64);

    // Least Privilege + High-DPI (PerMonitorV2) + UTF-8 + LongPathAware Manifest
    let manifest = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
    <assemblyIdentity version="1.0.0.0" processorArchitecture="*" name="Fontivo" type="win32"/>
    <description>Fontivo — Next-Gen Desktop Font &amp; Color Manager</description>
    <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
        <security>
            <requestedPrivileges>
                <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
            </requestedPrivileges>
        </security>
    </trustInfo>
    <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
        <application>
            <!-- Windows 10 and Windows 11 -->
            <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
            <!-- Windows 8.1 -->
            <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>
            <!-- Windows 8 -->
            <supportedOS Id="{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}"/>
            <!-- Windows 7 -->
            <supportedOS Id="{35138b9a-5d96-4fbd-8e2d-a2440225f93a}"/>
        </application>
    </compatibility>
    <application xmlns="urn:schemas-microsoft-com:asm.v3">
        <windowsSettings>
            <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
            <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2, PerMonitor</dpiAwareness>
            <longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware>
            <activeCodePage xmlns="http://schemas.microsoft.com/SMI/2019/WindowsSettings">UTF-8</activeCodePage>
        </windowsSettings>
    </application>
    <dependency>
        <dependentAssembly>
            <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
        </dependentAssembly>
    </dependency>
</assembly>"#;

    res.set_manifest(manifest);
    if let Err(e) = res.compile() {
        eprintln!("winres error: {}", e);
    }
}
