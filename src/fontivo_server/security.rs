use std::fmt;
use std::fs;
use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use url::Url;

/// Security error categories for Fontivo
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecurityError {
    InvalidOrigin(String),
    InvalidFamilyName(String),
    PathTraversalAttempt(String),
    SsrfBlocked(String),
    InvalidFileSignature(String),
    FileTooLarge { size: u64, max_allowed: u64 },
    CommandExecutionDenied(String),
    HttpError { status: u16, message: String },
    NetworkError(String),
}

impl fmt::Display for SecurityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SecurityError::InvalidOrigin(msg) => write!(f, "Invalid or untrusted origin: {}", msg),
            SecurityError::InvalidFamilyName(msg) => write!(f, "Invalid font family name: {}", msg),
            SecurityError::PathTraversalAttempt(msg) => {
                write!(f, "Path traversal attempt blocked: {}", msg)
            }
            SecurityError::SsrfBlocked(msg) => write!(f, "SSRF attempt blocked: {}", msg),
            SecurityError::InvalidFileSignature(msg) => {
                write!(f, "File signature mismatch: {}", msg)
            }
            SecurityError::FileTooLarge { size, max_allowed } => {
                write!(
                    f,
                    "File size {} exceeds maximum allowed limit {}",
                    size, max_allowed
                )
            }
            SecurityError::CommandExecutionDenied(msg) => {
                write!(f, "Command execution denied: {}", msg)
            }
            SecurityError::HttpError { status, message } => {
                write!(f, "HTTP error {}: {}", status, message)
            }
            SecurityError::NetworkError(msg) => {
                write!(f, "Network error: {}", msg)
            }
        }
    }
}

impl std::error::Error for SecurityError {}

// =========================================================================
// A. CORS & Origin Validation
// =========================================================================

/// Known trusted ports for local development and application communication
const ALLOWED_LOCAL_PORTS: &[u16] = &[
    3920,  // Default Fontivo Core REST API port
    27715, // Adobe CC auto-activation bridge port
    5173,  // Vite dev server default
    5174,  // Vite dev server alternate
    3000,  // Standard React/Node dev server
    8080,  // Generic local preview
    4173,  // Vite preview server
];

/// Structurally validates an Origin header against strict local loopback policies.
/// Returns Ok(Some(canonical_origin)) if valid, Ok(None) if header is absent (non-browser local request),
/// or Err(SecurityError) if origin is invalid, malformed, or hostile.
pub fn validate_origin(
    origin_header: Option<&str>,
    active_port: u16,
) -> Result<Option<String>, SecurityError> {
    let raw = match origin_header {
        Some(o) => o.trim(),
        None => return Ok(None),
    };

    if raw.is_empty() {
        return Ok(None);
    }

    // Explicitly reject "null" origin (used by sandboxed iframes and data: URIs)
    if raw.eq_ignore_ascii_case("null") {
        return Err(SecurityError::InvalidOrigin(
            "Null origin is rejected".into(),
        ));
    }

    // Reject wildcards
    if raw == "*" {
        return Err(SecurityError::InvalidOrigin(
            "Wildcard origin is forbidden".into(),
        ));
    }

    // Check custom application schemes (wry://, tauri://)
    if raw.starts_with("wry://") || raw.starts_with("tauri://") {
        return Ok(Some(raw.to_string()));
    }

    // Parse origin structurally with Url parser
    let parsed = Url::parse(raw)
        .map_err(|e| SecurityError::InvalidOrigin(format!("Malformed origin URL: {}", e)))?;

    // Scheme must be strictly HTTP (local desktop loopback does not run TLS locally)
    if parsed.scheme() != "http" {
        return Err(SecurityError::InvalidOrigin(format!(
            "Untrusted origin scheme: '{}' (only http or local webview schemes allowed)",
            parsed.scheme()
        )));
    }

    // Host must be strictly loopback: localhost, 127.0.0.1, or [::1]
    let host = parsed.host_str().unwrap_or("");
    let is_valid_host = host == "localhost" || host == "127.0.0.1" || host == "[::1]";

    if !is_valid_host {
        return Err(SecurityError::InvalidOrigin(format!(
            "Untrusted origin host: '{}' (must be strictly localhost, 127.0.0.1 or [::1])",
            host
        )));
    }

    // Port validation: port must match active server port or known local dev ports
    if let Some(port) = parsed.port() {
        let is_allowed_port = port == active_port || ALLOWED_LOCAL_PORTS.contains(&port);
        if !is_allowed_port {
            return Err(SecurityError::InvalidOrigin(format!(
                "Origin port {} is not in allowed local ports",
                port
            )));
        }
    }

    // Reconstruct canonical origin string without trailing slash or path components
    let canonical = match parsed.port() {
        Some(p) => format!("http://{}:{}", host, p),
        None => format!("http://{}", host),
    };

    Ok(Some(canonical))
}

// =========================================================================
// B. Google Fonts Path Traversal & Safe Filename Generation
// =========================================================================

/// Windows reserved filenames that must not be created or accessed
const WINDOWS_RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Validates and sanitizes a font family name.
/// Rejects directory traversal tokens (`..`), path separators (`/`, `\`), null bytes,
/// Windows device names, and non-whitelisted characters.
pub fn sanitize_and_validate_font_family(family: &str) -> Result<String, SecurityError> {
    let trimmed = family.trim();

    if trimmed.is_empty() {
        return Err(SecurityError::InvalidFamilyName(
            "Family name cannot be empty".into(),
        ));
    }

    if trimmed.len() > 64 {
        return Err(SecurityError::InvalidFamilyName(
            "Family name exceeds 64 characters".into(),
        ));
    }

    // Reject null bytes, control characters, and path separators
    if trimmed.contains('\0') || trimmed.contains('/') || trimmed.contains('\\') {
        return Err(SecurityError::PathTraversalAttempt(
            "Family name contains illegal path separators or control characters".into(),
        ));
    }

    // Reject directory traversal sequence
    if trimmed.contains("..") {
        return Err(SecurityError::PathTraversalAttempt(
            "Family name contains directory traversal sequence ('..')".into(),
        ));
    }

    // Check Windows reserved names
    let upper = trimmed.to_ascii_uppercase();
    let base_name = upper.split('.').next().unwrap_or(&upper);
    if WINDOWS_RESERVED_NAMES.contains(&base_name) {
        return Err(SecurityError::InvalidFamilyName(format!(
            "Family name '{}' is a reserved operating system device name",
            trimmed
        )));
    }

    // Whitelist allowed characters: alphanumeric, spaces, dashes, underscores
    let is_valid = trimmed
        .chars()
        .all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_');

    if !is_valid {
        return Err(SecurityError::InvalidFamilyName(
            "Family name contains forbidden special characters (only alphanumeric, space, -, _ allowed)".into(),
        ));
    }

    Ok(trimmed.to_string())
}

/// Resolves and guarantees that the destination font path strictly resides inside `base_storage_dir`.
/// Prevents symlink escapes and directory breakouts.
pub fn resolve_safe_font_path(
    base_storage_dir: &Path,
    family: &str,
    extension: &str,
) -> Result<PathBuf, SecurityError> {
    let safe_family = sanitize_and_validate_font_family(family)?;

    // Ensure extension is strictly safe
    let ext_lower = extension.trim_start_matches('.').to_ascii_lowercase();
    if ext_lower != "ttf" && ext_lower != "otf" && ext_lower != "woff" && ext_lower != "woff2" {
        return Err(SecurityError::InvalidFamilyName(format!(
            "Forbidden font extension '{}'",
            extension
        )));
    }

    // Ensure base directory exists
    fs::create_dir_all(base_storage_dir).map_err(|e| {
        SecurityError::PathTraversalAttempt(format!("Failed to create storage directory: {}", e))
    })?;

    // Canonicalize base storage dir
    let canonical_base = base_storage_dir.canonicalize().map_err(|e| {
        SecurityError::PathTraversalAttempt(format!("Failed to resolve base storage path: {}", e))
    })?;

    // Construct safe filename (replace spaces with underscores for filename stability)
    let file_stem: String = safe_family
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let filename = format!("{}.{}", file_stem, ext_lower);

    // Resolve target path
    let target = canonical_base.join(filename);

    // Enforce that target path starts strictly with canonical_base
    if !target.starts_with(&canonical_base) {
        return Err(SecurityError::PathTraversalAttempt(format!(
            "Resolved target path escapes storage directory: {:?}",
            target
        )));
    }

    // If target exists and is a symlink, verify symlink target does not escape
    if target.exists() {
        if let Ok(meta) = fs::symlink_metadata(&target) {
            if meta.file_type().is_symlink() {
                let resolved = fs::canonicalize(&target).map_err(|e| {
                    SecurityError::PathTraversalAttempt(format!("Cannot resolve symlink: {}", e))
                })?;
                if !resolved.starts_with(&canonical_base) {
                    return Err(SecurityError::PathTraversalAttempt(
                        "Symlink target escapes base storage directory".into(),
                    ));
                }
            }
        }
    }

    Ok(target)
}

// =========================================================================
// C. Server-Side Request Forgery (SSRF) Protection
// =========================================================================

/// Allowed domain allowlist for font file downloads
const TRUSTED_DOWNLOAD_DOMAINS: &[&str] = &[
    "fonts.google.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "raw.githubusercontent.com",
    "github.com",
    "objects.githubusercontent.com",
    "cdn.jsdelivr.net",
];

/// Validates an external download URL against SSRF attacks:
/// - Enforces HTTPS scheme only
/// - Enforces domain allowlist
/// - Rejects IP addresses as hostnames
/// - Resolves DNS and blocks loopback, private ranges, link-local, cloud metadata, and broadcast
pub fn validate_download_url(url_str: &str) -> Result<Url, SecurityError> {
    let parsed = Url::parse(url_str)
        .map_err(|e| SecurityError::SsrfBlocked(format!("Invalid URL syntax: {}", e)))?;

    // 1. Enforce HTTPS only
    if parsed.scheme() != "https" {
        return Err(SecurityError::SsrfBlocked(format!(
            "Scheme '{}' forbidden: only HTTPS is permitted for external asset downloads",
            parsed.scheme()
        )));
    }

    // 2. Reject credentials in URL (user:pass@host)
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(SecurityError::SsrfBlocked(
            "URLs with embedded credentials are forbidden".into(),
        ));
    }

    let host_str = parsed
        .host_str()
        .ok_or_else(|| SecurityError::SsrfBlocked("URL is missing a valid hostname".into()))?;

    // 3. Reject direct IP addresses as hostnames (prevents bypassing domain checks via direct IP)
    if host_str.parse::<IpAddr>().is_ok() {
        return Err(SecurityError::SsrfBlocked(format!(
            "Direct IP address host '{}' is forbidden",
            host_str
        )));
    }

    // 4. Validate against trusted domain allowlist (exact match or subdomain of trusted root)
    let host_lower = host_str.to_ascii_lowercase();
    let is_trusted = TRUSTED_DOWNLOAD_DOMAINS
        .iter()
        .any(|&domain| host_lower == domain || host_lower.ends_with(&format!(".{}", domain)));

    if !is_trusted {
        return Err(SecurityError::SsrfBlocked(format!(
            "Domain '{}' is not in the trusted font providers allowlist",
            host_str
        )));
    }

    // 5. DNS Resolution and IP range validation
    let port = parsed.port_or_known_default().unwrap_or(443);
    let socket_addrs = format!("{}:{}", host_str, port)
        .to_socket_addrs()
        .map_err(|e| {
            SecurityError::SsrfBlocked(format!("DNS resolution failed for '{}': {}", host_str, e))
        })?;

    for addr in socket_addrs {
        validate_ip_is_public(addr.ip())?;
    }

    Ok(parsed)
}

/// Checks that an IP address is a public, routable internet address.
/// Blocks loopback, private, link-local, cloud metadata, and documentation addresses.
pub fn validate_ip_is_public(ip: IpAddr) -> Result<(), SecurityError> {
    match ip {
        IpAddr::V4(ipv4) => {
            // Loopback (127.0.0.0/8)
            if ipv4.is_loopback() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is a loopback address",
                    ipv4
                )));
            }
            // Unspecified (0.0.0.0)
            if ipv4.is_unspecified() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is unspecified",
                    ipv4
                )));
            }
            // Broadcast (255.255.255.255)
            if ipv4.is_broadcast() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is a broadcast address",
                    ipv4
                )));
            }
            // Private IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
            if ipv4.is_private() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is in a private network range",
                    ipv4
                )));
            }
            // Link-local / Cloud Metadata (169.254.0.0/16)
            if ipv4.is_link_local() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is a link-local / cloud metadata address",
                    ipv4
                )));
            }
            // Carrier-grade NAT (100.64.0.0/10)
            let octets = ipv4.octets();
            if octets[0] == 100 && (octets[1] & 0xC0) == 64 {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is in Carrier-Grade NAT range",
                    ipv4
                )));
            }
            // Documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
            if (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
                || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
                || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113)
            {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is in a documentation/reserved range",
                    ipv4
                )));
            }
            // Multicast (224.0.0.0/4) and Future use (240.0.0.0/4)
            if octets[0] >= 224 {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is in multicast or reserved space",
                    ipv4
                )));
            }
        }
        IpAddr::V6(ipv6) => {
            // Loopback (::1)
            if ipv6.is_loopback() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is an IPv6 loopback address",
                    ipv6
                )));
            }
            // Unspecified (::)
            if ipv6.is_unspecified() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is unspecified IPv6",
                    ipv6
                )));
            }
            // Multicast (ff00::/8)
            if ipv6.is_multicast() {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is an IPv6 multicast address",
                    ipv6
                )));
            }
            // Unique local (fc00::/7)
            let segments = ipv6.segments();
            if (segments[0] & 0xFE00) == 0xFC00 {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is an IPv6 unique local address",
                    ipv6
                )));
            }
            // Link-local unicast (fe80::/10)
            if (segments[0] & 0xFFC0) == 0xFE80 {
                return Err(SecurityError::SsrfBlocked(format!(
                    "Resolved IP {} is an IPv6 link-local address",
                    ipv6
                )));
            }
            // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
            if let Some(ipv4) = ipv6.to_ipv4() {
                return validate_ip_is_public(IpAddr::V4(ipv4));
            }
        }
    }
    Ok(())
}

/// Maximum size allowed for downloaded font files (30 MB)
pub const MAX_FONT_DOWNLOAD_SIZE_BYTES: u64 = 30 * 1024 * 1024;

/// Safe HTTP download helper:
/// - Validates URL with SSRF checks
/// - Configures 5s connect timeout and 15s total timeout
/// - Streams up to MAX_FONT_DOWNLOAD_SIZE_BYTES
/// - Validates downloaded file magic bytes before returning
pub fn safe_download_font_bytes(raw_url: &str) -> Result<Vec<u8>, SecurityError> {
    let validated_url = validate_download_url(raw_url)?;

    let agent = ureq::builder()
        .timeout_connect(std::time::Duration::from_secs(5))
        .timeout_read(std::time::Duration::from_secs(15))
        .redirects(3)
        .build();

    let resp = agent
        .get(validated_url.as_str())
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(code, resp) => SecurityError::HttpError {
                status: code,
                message: format!("status code {} ({})", code, resp.status_text()),
            },
            ureq::Error::Transport(err) => SecurityError::NetworkError(format!("{}", err)),
        })?;

    // Check Content-Length if present
    if let Some(cl_str) = resp.header("Content-Length") {
        if let Ok(cl) = cl_str.parse::<u64>() {
            if cl > MAX_FONT_DOWNLOAD_SIZE_BYTES {
                return Err(SecurityError::FileTooLarge {
                    size: cl,
                    max_allowed: MAX_FONT_DOWNLOAD_SIZE_BYTES,
                });
            }
        }
    }

    // Read body capped at MAX_FONT_DOWNLOAD_SIZE_BYTES + 1
    let mut reader = resp.into_reader();
    let mut bytes = Vec::new();
    let read_limit = (MAX_FONT_DOWNLOAD_SIZE_BYTES + 1) as usize;
    let _ = reader
        .by_ref()
        .take(read_limit as u64)
        .read_to_end(&mut bytes);

    if bytes.len() as u64 > MAX_FONT_DOWNLOAD_SIZE_BYTES {
        return Err(SecurityError::FileTooLarge {
            size: bytes.len() as u64,
            max_allowed: MAX_FONT_DOWNLOAD_SIZE_BYTES,
        });
    }

    // Verify font magic bytes
    validate_font_magic_bytes(&bytes)?;

    Ok(bytes)
}

// =========================================================================
// D. File Inspector & Magic Signature Validation
// =========================================================================

/// Maximum size allowed for inspected design files (100 MB)
pub const MAX_DESIGN_FILE_SIZE_BYTES: u64 = 100 * 1024 * 1024;

/// Validates that a file's binary magic signature matches expected font formats:
/// - TrueType (0x00 0x01 0x00 0x00)
/// - OpenType (OTTO)
/// - WOFF (wOFF)
/// - WOFF2 (wOF2)
/// - TrueType Collection (ttcf)
pub fn validate_font_magic_bytes(bytes: &[u8]) -> Result<(), SecurityError> {
    if bytes.len() < 4 {
        return Err(SecurityError::InvalidFileSignature(
            "File is too small to contain a valid font header".into(),
        ));
    }

    let magic = &bytes[0..4];
    let is_font = magic == [0x00, 0x01, 0x00, 0x00]   // TTF
        || magic == b"OTTO"                          // OpenType CFF
        || magic == b"wOFF"                          // WOFF
        || magic == b"wOF2"                          // WOFF2
        || magic == b"ttcf"; // TTC

    if !is_font {
        return Err(SecurityError::InvalidFileSignature(
            "Downloaded file header does not match any recognized font format (TTF, OTF, WOFF, WOFF2, TTC)".into(),
        ));
    }

    Ok(())
}

/// Validates design file bytes (PSD, AI, INDD, PDF, EPS, SVG) before parsing:
/// - Verifies byte length does not exceed MAX_DESIGN_FILE_SIZE_BYTES
/// - Checks extension against allowed list
/// - Verifies authentic magic bytes / binary signatures
pub fn validate_design_bytes(file_name: &str, bytes: &[u8]) -> Result<(), SecurityError> {
    if bytes.len() as u64 > MAX_DESIGN_FILE_SIZE_BYTES {
        return Err(SecurityError::FileTooLarge {
            size: bytes.len() as u64,
            max_allowed: MAX_DESIGN_FILE_SIZE_BYTES,
        });
    }

    let ext = Path::new(file_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let allowed_exts = ["psd", "ai", "indd", "pdf", "eps", "svg"];
    if !allowed_exts.contains(&ext.as_str()) {
        return Err(SecurityError::InvalidFileSignature(format!(
            "Unsupported design file extension: '.{}'",
            ext
        )));
    }

    if bytes.len() < 4 {
        return Err(SecurityError::InvalidFileSignature(
            "Design file is too small or truncated".into(),
        ));
    }

    let h = &bytes[..bytes.len().min(64)];
    validate_design_header_for_ext(&ext, h)
}

fn validate_design_header_for_ext(ext: &str, h: &[u8]) -> Result<(), SecurityError> {
    match ext {
        "psd" | "psb" => {
            // Photoshop 8BPS signature
            if !h.starts_with(b"8BPS") {
                return Err(SecurityError::InvalidFileSignature(
                    "File has .psd/.psb extension but lacks genuine Photoshop '8BPS' signature"
                        .into(),
                ));
            }
        }
        "pdf" => {
            // PDF document %PDF-
            if !h.starts_with(b"%PDF-") {
                return Err(SecurityError::InvalidFileSignature(
                    "File has .pdf extension but lacks genuine '%PDF-' signature".into(),
                ));
            }
        }
        "ai" => {
            // Modern Illustrator files are PDF-compatible (%PDF-), legacy AI are PostScript (%!PS)
            let is_pdf = h.starts_with(b"%PDF-");
            let is_ps = h.starts_with(b"%!PS-Adobe");
            if !is_pdf && !is_ps {
                return Err(SecurityError::InvalidFileSignature(
                    "File has .ai extension but lacks genuine Illustrator/PDF/EPS signature".into(),
                ));
            }
        }
        "eps" => {
            // PostScript EPS (%!PS-Adobe) or binary EPS header (0xC5D0D3C6)
            let is_ps = h.starts_with(b"%!PS-Adobe");
            let is_binary_eps = h.starts_with(&[0xC5, 0xD0, 0xD3, 0xC6]);
            if !is_ps && !is_binary_eps {
                return Err(SecurityError::InvalidFileSignature(
                    "File has .eps extension but lacks genuine PostScript/EPS header".into(),
                ));
            }
        }
        "indd" => {
            // InDesign Document GUID: 06 06 ED F5 D8 1D 46 E5 BD 31 EF E7 FE 74 B7 1D
            let indd_guid = [
                0x06, 0x06, 0xED, 0xF5, 0xD8, 0x1D, 0x46, 0xE5, 0xBD, 0x31, 0xEF, 0xE7, 0xFE, 0x74,
                0xB7, 0x1D,
            ];
            if !h.starts_with(&indd_guid) {
                return Err(SecurityError::InvalidFileSignature(
                    "File has .indd extension but lacks genuine InDesign binary GUID signature"
                        .into(),
                ));
            }
        }
        "svg" => {
            // SVG is text XML containing <svg
            let text = String::from_utf8_lossy(h).to_ascii_lowercase();
            if !text.contains("<svg") && !text.contains("<?xml") {
                return Err(SecurityError::InvalidFileSignature(
                    "File has .svg extension but lacks genuine XML/<svg> root tag".into(),
                ));
            }
        }
        _ => {}
    }

    Ok(())
}

/// Maximum allowed local disk design file size (2 GB — scanned via streaming 8 MB chunks)
pub const MAX_LOCAL_DESIGN_FILE_SIZE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// Validates design file (PSD, PSB, AI, INDD, PDF, EPS, SVG) before parsing:
/// - Verifies file exists and does not exceed MAX_LOCAL_DESIGN_FILE_SIZE_BYTES (2 GB)
/// - Checks extension against allowed list
/// - Verifies authentic magic bytes / binary signatures
pub fn validate_design_file(path: &Path) -> Result<(), SecurityError> {
    if !path.exists() || !path.is_file() {
        return Err(SecurityError::InvalidFileSignature(
            "Design file does not exist or is not a regular file".into(),
        ));
    }

    let meta = fs::metadata(path).map_err(|e| {
        SecurityError::InvalidFileSignature(format!("Cannot read file metadata: {}", e))
    })?;

    if meta.len() > MAX_LOCAL_DESIGN_FILE_SIZE_BYTES {
        return Err(SecurityError::FileTooLarge {
            size: meta.len(),
            max_allowed: MAX_LOCAL_DESIGN_FILE_SIZE_BYTES,
        });
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let allowed_exts = ["psd", "psb", "ai", "indd", "pdf", "eps", "svg"];
    if !allowed_exts.contains(&ext.as_str()) {
        return Err(SecurityError::InvalidFileSignature(format!(
            "Unsupported design file extension: '.{}'",
            ext
        )));
    }

    // Read initial 64 bytes for magic check
    let mut f = fs::File::open(path).map_err(|e| {
        SecurityError::InvalidFileSignature(format!("Cannot open file for header check: {}", e))
    })?;
    let mut header = [0u8; 64];
    let read_len = f
        .read(&mut header)
        .map_err(|e| SecurityError::InvalidFileSignature(format!("Cannot read header: {}", e)))?;

    if read_len < 4 {
        return Err(SecurityError::InvalidFileSignature(
            "Design file is too small or truncated".into(),
        ));
    }

    let h = &header[..read_len];
    validate_design_header_for_ext(&ext, h)
}

/// Safely parses a `Fontivo://` protocol deep-link argument into a local loopback URL
/// for the embedded WebView. Rejects control characters, traversal, or non-Fontivo schemes.
pub fn parse_deep_link_url(raw_arg: &str, api_port: u16) -> Option<String> {
    let trimmed = raw_arg.trim();
    if !trimmed
        .get(..10)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("fontivo://"))
    {
        return None;
    }

    let parsed = Url::parse(trimmed).ok()?;
    if !parsed.scheme().eq_ignore_ascii_case("fontivo") {
        return None;
    }

    let host = parsed.host_str().unwrap_or("").trim();
    let path_seg = parsed.path().trim_matches('/');

    let safe_token = |s: &str| -> String {
        s.chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
            .take(128)
            .collect()
    };

    let mut params: Vec<(String, String)> = Vec::new();
    let action = safe_token(host).to_ascii_lowercase();
    let target = safe_token(path_seg);

    match action.as_str() {
        "font" if !target.is_empty() => {
            params.push(("deeplink".into(), "font".into()));
            params.push(("fontId".into(), target));
        }
        "workspace" if !target.is_empty() => {
            params.push(("deeplink".into(), "workspace".into()));
            params.push(("tab".into(), "workspaces".into()));
            params.push(("workspaceId".into(), target));
        }
        "tab" if !target.is_empty() => {
            params.push(("deeplink".into(), "tab".into()));
            params.push(("tab".into(), target.to_ascii_lowercase()));
        }
        "search" => {
            params.push(("deeplink".into(), "search".into()));
            if !target.is_empty() {
                params.push(("q".into(), target));
            }
        }
        "" => {
            params.push(("deeplink".into(), "home".into()));
        }
        other => {
            params.push(("deeplink".into(), other.to_string()));
            if !target.is_empty() {
                params.push(("target".into(), target));
            }
        }
    }

    for (k, v) in parsed.query_pairs() {
        let sk = safe_token(&k);
        let sv = safe_token(&v);
        if !sk.is_empty() && !sv.is_empty() && !params.iter().any(|(ek, _)| ek == &sk) {
            params.push((sk, sv));
        }
    }

    let mut local = Url::parse(&format!("http://127.0.0.1:{}/", api_port)).ok()?;
    {
        let mut qp = local.query_pairs_mut();
        for (k, v) in params {
            qp.append_pair(&k, &v);
        }
    }
    Some(local.to_string())
}

// =========================================================================
// E. Process Execution Safety
// =========================================================================

/// Validates executable path before spawning:
/// - Guarantees the binary exists and is a regular file
/// - Canonicalizes the path to eliminate symlink or traversal confusion
/// - On Windows, strictly validates .exe extension
pub fn validate_executable_path(path_str: &str) -> Result<PathBuf, SecurityError> {
    let p = Path::new(path_str);
    if !p.exists() || !p.is_file() {
        return Err(SecurityError::CommandExecutionDenied(format!(
            "Target executable '{:?}' does not exist or is not a file",
            path_str
        )));
    }

    let canonical = p.canonicalize().map_err(|e| {
        SecurityError::CommandExecutionDenied(format!("Failed to canonicalize path: {}", e))
    })?;

    #[cfg(windows)]
    {
        let ext = canonical
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext != "exe" {
            return Err(SecurityError::CommandExecutionDenied(format!(
                "Refusing to execute non-exe file '{:?}'",
                canonical
            )));
        }
    }

    Ok(canonical)
}
