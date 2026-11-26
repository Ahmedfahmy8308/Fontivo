use std::fs;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use Fontivo::server::security::{
    self, sanitize_and_validate_font_family, validate_design_file, validate_download_url,
    validate_executable_path, validate_font_magic_bytes, validate_ip_is_public, validate_origin,
    MAX_DESIGN_FILE_SIZE_BYTES,
};

// =========================================================================
// A. Path Traversal & Safe Filename Validation Tests
// =========================================================================

#[test]
fn test_path_traversal_relative_parent_dotdot() {
    let malicious = [
        "../evil",
        "..\\evil",
        "../../Windows/System32",
        "..\\..\\Windows\\System32",
        "fonts/../../../etc/passwd",
        "normal/../traversal",
    ];

    for name in malicious {
        let res = sanitize_and_validate_font_family(name);
        assert!(
            res.is_err(),
            "Expected traversal attempt '{}' to be blocked, but got: {:?}",
            name,
            res
        );
    }
}

#[test]
fn test_path_traversal_path_separators_and_null_bytes() {
    let invalid_names = [
        "Cairo/Bold",
        "Amiri\\Regular",
        "Test\0Font",
        "Test\nFont",
        "Test\rFont",
        "/etc/shadow",
        "C:\\Windows\\System32\\cmd.exe",
    ];

    for name in invalid_names {
        let res = sanitize_and_validate_font_family(name);
        assert!(
            res.is_err(),
            "Expected name with separators/null bytes '{}' to fail validation",
            name
        );
    }
}

#[test]
fn test_path_traversal_windows_reserved_device_names() {
    let reserved = [
        "CON", "con", "PRN", "prn", "AUX", "aux", "NUL", "nul", "COM1", "com1", "COM9", "LPT1",
        "lpt1", "LPT9", "CON.ttf", "nul.otf", "aux.woff",
    ];

    for name in reserved {
        let res = sanitize_and_validate_font_family(name);
        assert!(
            res.is_err(),
            "Expected Windows reserved name '{}' to be rejected",
            name
        );
    }
}

#[test]
fn test_path_traversal_boundary_lengths_and_allowed_chars() {
    // Empty string
    assert!(sanitize_and_validate_font_family("").is_err());
    assert!(sanitize_and_validate_font_family("   ").is_err());

    // Excessive length (>64)
    let too_long = "A".repeat(65);
    assert!(sanitize_and_validate_font_family(&too_long).is_err());

    // Valid 64 chars
    let valid_64 = "A".repeat(64);
    assert!(sanitize_and_validate_font_family(&valid_64).is_ok());

    // Valid typical font names
    assert!(sanitize_and_validate_font_family("Cairo").is_ok());
    assert!(sanitize_and_validate_font_family("Amiri Regular").is_ok());
    assert!(sanitize_and_validate_font_family("Fira-Code_v2").is_ok());
    assert!(sanitize_and_validate_font_family("Open-Sans 2026").is_ok());

    // Special characters outside whitelist (e.g., quotes, semicolons, brackets, backticks)
    assert!(sanitize_and_validate_font_family("Font;rm -rf /").is_err());
    assert!(sanitize_and_validate_font_family("Font`calc`").is_err());
    assert!(sanitize_and_validate_font_family("Font<script>").is_err());
}

#[test]
fn test_path_traversal_resolve_safe_font_path_containment() {
    let temp_dir = std::env::temp_dir().join("fontivo_security_test_storage");
    let _ = fs::create_dir_all(&temp_dir);

    // Valid family
    let resolved = security::resolve_safe_font_path(&temp_dir, "Amiri Regular", "ttf");
    assert!(resolved.is_ok());
    let path = resolved.unwrap();
    assert!(path.starts_with(temp_dir.canonicalize().unwrap()));
    assert!(path.ends_with("Amiri_Regular.ttf"));

    // Traversal attempt
    let escape = security::resolve_safe_font_path(&temp_dir, "../../escaped", "ttf");
    assert!(escape.is_err());

    // Forbidden extensions
    assert!(security::resolve_safe_font_path(&temp_dir, "ValidFont", "exe").is_err());
    assert!(security::resolve_safe_font_path(&temp_dir, "ValidFont", "bat").is_err());
    assert!(security::resolve_safe_font_path(&temp_dir, "ValidFont", "dll").is_err());

    let _ = fs::remove_dir_all(&temp_dir);
}

// =========================================================================
// B. Server-Side Request Forgery (SSRF) Tests
// =========================================================================

#[test]
fn test_ssrf_reject_forbidden_schemes() {
    let forbidden = [
        "http://fonts.google.com/test.ttf",
        "file:///C:/Windows/win.ini",
        "file:///etc/passwd",
        "ftp://fonts.gstatic.com/test.ttf",
        "gopher://127.0.0.1:70",
        "data:text/html;base64,PHNjcmlwdD4=",
    ];

    for url_str in forbidden {
        let res = validate_download_url(url_str);
        assert!(
            res.is_err(),
            "Expected non-https scheme '{}' to be blocked by SSRF check",
            url_str
        );
    }
}

#[test]
fn test_ssrf_reject_direct_ip_addresses() {
    let ips = [
        "https://127.0.0.1/font.ttf",
        "https://169.254.169.254/latest/meta-data/",
        "https://192.168.1.1/admin",
        "https://10.0.0.1/",
        "https://0.0.0.0/",
    ];

    for url_str in ips {
        let res = validate_download_url(url_str);
        assert!(
            res.is_err(),
            "Expected direct IP host '{}' to be rejected",
            url_str
        );
    }
}

#[test]
fn test_ssrf_reject_untrusted_domains() {
    let untrusted = [
        "https://evil-attacker.com/malicious.ttf",
        "https://pastebin.com/raw/xyz",
        "https://webhook.site/test",
        "https://fonts.google.com.evil.com/font.ttf",
    ];

    for url_str in untrusted {
        let res = validate_download_url(url_str);
        assert!(
            res.is_err(),
            "Expected untrusted domain '{}' to be rejected",
            url_str
        );
    }
}

#[test]
fn test_ssrf_allow_trusted_domains() {
    let trusted = [
        "https://fonts.gstatic.com/s/cairo/v28/SLXVc1nY6HkvalrnW75K77tv.ttf",
        "https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo-Regular.ttf",
        "https://github.com/google/fonts/raw/main/ofl/amiri/Amiri-Regular.ttf",
        "https://objects.githubusercontent.com/github-production-release-asset-2e65be/fontivo-essential-001.zip",
        "https://release-assets.githubusercontent.com/github-production-release-asset/12345/fontivo-essential-001.zip",
        "https://github-releases.githubusercontent.com/12345/fontivo-essential-001.zip",
        "https://codeload.github.com/Ahmedfahmy8308/Fontivo-Fonts/zip/refs/heads/main",
        "https://media.githubusercontent.com/media/Ahmedfahmy8308/Fontivo-Fonts/main/fontivo-essential-001.zip",
    ];

    for url_str in trusted {
        let res = validate_download_url(url_str);
        assert!(
            res.is_ok(),
            "Expected trusted URL '{}' to pass validation, got: {:?}",
            url_str,
            res
        );
    }
}

#[test]
fn test_ssrf_ip_ranges_validation() {
    // Loopback
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))).is_err());
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(127, 10, 20, 30))).is_err());
    assert!(validate_ip_is_public(IpAddr::V6(Ipv6Addr::LOCALHOST)).is_err());

    // Private IPv4
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))).is_err());
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(172, 16, 0, 1))).is_err());
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1))).is_err());

    // Link-local / Cloud metadata (AWS/Azure/GCP metadata)
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254))).is_err());
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(169, 254, 1, 1))).is_err());

    // Carrier Grade NAT
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1))).is_err());

    // Unspecified & Broadcast
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0))).is_err());
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(255, 255, 255, 255))).is_err());
    assert!(validate_ip_is_public(IpAddr::V6(Ipv6Addr::UNSPECIFIED)).is_err());

    // Public IPv4 (Cloudflare 1.1.1.1, Google 8.8.8.8)
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))).is_ok());
    assert!(validate_ip_is_public(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))).is_ok());
}

// =========================================================================
// C. CORS & Origin Validation Tests
// =========================================================================

#[test]
fn test_cors_reject_null_and_wildcard() {
    assert!(validate_origin(Some("null"), 3920).is_err());
    assert!(validate_origin(Some("NULL"), 3920).is_err());
    assert!(validate_origin(Some("*"), 3920).is_err());
}

#[test]
fn test_cors_reject_subdomain_spoofing() {
    let spoofed = [
        "http://localhost.attacker.com",
        "http://localhost.attacker.com:3920",
        "http://127.0.0.1.evil.com",
        "http://127.0.0.1.evil.com:5173",
        "http://attacker-localhost:3920",
        "http://evil-127.0.0.1:3920",
    ];

    for origin in spoofed {
        let res = validate_origin(Some(origin), 3920);
        assert!(
            res.is_err(),
            "Expected spoofed origin '{}' to be rejected, got: {:?}",
            origin,
            res
        );
    }
}

#[test]
fn test_cors_reject_external_origins() {
    let external = [
        "https://google.com",
        "http://attacker.org",
        "http://192.168.1.50:3000",
        "http://10.0.0.5:8080",
    ];

    for origin in external {
        assert!(validate_origin(Some(origin), 3920).is_err());
    }
}

#[test]
fn test_cors_reject_unauthorized_ports() {
    // Port 65530 is not in allowed local ports
    assert!(validate_origin(Some("http://localhost:65530"), 3920).is_err());
    assert!(validate_origin(Some("http://127.0.0.1:44444"), 3920).is_err());
}

#[test]
fn test_cors_allow_valid_local_origins() {
    let allowed = [
        ("http://localhost:3920", 3920),
        ("http://127.0.0.1:3920", 3920),
        ("http://localhost:5173", 3920),
        ("http://127.0.0.1:5173", 3920),
        ("http://localhost:3000", 3920),
        ("wry://localhost", 3920),
        ("tauri://localhost", 3920),
    ];

    for (origin, active_port) in allowed {
        let res = validate_origin(Some(origin), active_port);
        assert!(
            res.is_ok(),
            "Expected legitimate origin '{}' to pass, got: {:?}",
            origin,
            res
        );
        let canonical = res.unwrap().unwrap();
        assert!(
            canonical.contains("localhost")
                || canonical.contains("127.0.0.1")
                || canonical.starts_with("wry://")
                || canonical.starts_with("tauri://")
        );
    }
}

#[test]
fn test_cors_missing_origin_returns_none() {
    // Non-browser local requests
    assert_eq!(validate_origin(None, 3920).unwrap(), None);
    assert_eq!(validate_origin(Some(""), 3920).unwrap(), None);
}

// =========================================================================
// D. File Inspector & Magic Signature Tests
// =========================================================================

#[test]
fn test_magic_font_signatures() {
    // TrueType font magic bytes (0x00 0x01 0x00 0x00)
    let ttf_header = [0x00, 0x01, 0x00, 0x00, 0x00, 0x12, 0x01, 0x00];
    assert!(validate_font_magic_bytes(&ttf_header).is_ok());

    // OpenType OTTO
    let otf_header = b"OTTO\x00\x0c\x00\x80";
    assert!(validate_font_magic_bytes(otf_header).is_ok());

    // WOFF
    let woff_header = b"wOFF\x00\x01\x00\x00";
    assert!(validate_font_magic_bytes(woff_header).is_ok());

    // WOFF2
    let woff2_header = b"wOF2\x00\x01\x00\x00";
    assert!(validate_font_magic_bytes(woff2_header).is_ok());

    // TrueType Collection ttcf
    let ttc_header = b"ttcf\x00\x01\x00\x00";
    assert!(validate_font_magic_bytes(ttc_header).is_ok());

    // Fake / malicious payload disguised as font (e.g. PE header or HTML)
    let fake_pe = b"MZ\x90\x00\x03\x00\x00\x00";
    assert!(validate_font_magic_bytes(fake_pe).is_err());

    let fake_html = b"<!DOCTYPE html><html>";
    assert!(validate_font_magic_bytes(fake_html).is_err());

    let fake_sh = b"#!/bin/sh\nrm -rf";
    assert!(validate_font_magic_bytes(fake_sh).is_err());
}

#[test]
fn test_magic_design_file_validation() {
    let temp_dir = std::env::temp_dir().join("fontivo_design_magic_test");
    let _ = fs::create_dir_all(&temp_dir);

    // 1. Genuine PSD
    let psd_path = temp_dir.join("test.psd");
    let mut psd_data = b"8BPS\x00\x01\x00\x00\x00\x00\x00\x00".to_vec();
    psd_data.resize(100, 0);
    fs::write(&psd_path, &psd_data).unwrap();
    assert!(validate_design_file(&psd_path).is_ok());

    // 2. Fake PSD (text file named .psd)
    let fake_psd_path = temp_dir.join("fake.psd");
    fs::write(&fake_psd_path, b"Hello world! This is a plain text file.").unwrap();
    assert!(validate_design_file(&fake_psd_path).is_err());

    // 3. Genuine PDF
    let pdf_path = temp_dir.join("document.pdf");
    fs::write(&pdf_path, b"%PDF-1.7\n%some content").unwrap();
    assert!(validate_design_file(&pdf_path).is_ok());

    // 4. Fake PDF
    let fake_pdf_path = temp_dir.join("fake.pdf");
    fs::write(&fake_pdf_path, b"NOT A PDF HEADER").unwrap();
    assert!(validate_design_file(&fake_pdf_path).is_err());

    // 5. Genuine AI (PDF format or PostScript format)
    let ai_pdf_path = temp_dir.join("graphic_modern.ai");
    fs::write(&ai_pdf_path, b"%PDF-1.5 Illustrator content").unwrap();
    assert!(validate_design_file(&ai_pdf_path).is_ok());

    let ai_ps_path = temp_dir.join("graphic_legacy.ai");
    fs::write(
        &ai_ps_path,
        b"%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Adobe Illustrator",
    )
    .unwrap();
    assert!(validate_design_file(&ai_ps_path).is_ok());

    // 6. Genuine SVG
    let svg_path = temp_dir.join("icon.svg");
    fs::write(
        &svg_path,
        b"<svg xmlns=\"http://www.w3.org/2000/svg\"><circle/></svg>",
    )
    .unwrap();
    assert!(validate_design_file(&svg_path).is_ok());

    // Clean up
    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_design_file_max_size_rejection() {
    let temp_dir = std::env::temp_dir().join("fontivo_size_limit_test");
    let _ = fs::create_dir_all(&temp_dir);
    let large_file = temp_dir.join("massive.psd");

    // Write file larger than limit (we test using metadata length check)
    let f = fs::File::create(&large_file).unwrap();
    // Set file length to MAX_DESIGN_FILE_SIZE_BYTES + 1024
    let _ = f.set_len(MAX_DESIGN_FILE_SIZE_BYTES + 1024);

    let res = validate_design_file(&large_file);
    assert!(
        res.is_err(),
        "Expected file exceeding {} bytes to be rejected, got: {:?}",
        MAX_DESIGN_FILE_SIZE_BYTES,
        res
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

// =========================================================================
// E. Process Execution Safety Tests
// =========================================================================

#[test]
fn test_validate_executable_path_non_existent() {
    let res = validate_executable_path("non_existent_binary_xyz.exe");
    assert!(res.is_err());
}

#[test]
fn test_validate_executable_path_non_exe_rejected() {
    let temp_dir = std::env::temp_dir().join("fontivo_exe_test");
    let _ = fs::create_dir_all(&temp_dir);

    let bat_file = temp_dir.join("malicious.bat");
    fs::write(&bat_file, b"@echo off\necho test").unwrap();

    let _res = validate_executable_path(bat_file.to_str().unwrap());
    #[cfg(windows)]
    assert!(
        _res.is_err(),
        "Expected non-exe script file to be rejected on Windows"
    );

    let _ = fs::remove_dir_all(&temp_dir);
}
