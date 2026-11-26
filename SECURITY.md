# Security Policy & Privacy Guarantees

Fontivo is built from the ground up on a **100% Local-First, Zero-Telemetry** architectural philosophy. We believe your fonts, creative assets, brand palettes, and design files belong exclusively to your local machine.

---

## Privacy & Data Sovereignty Guarantees

1. **Zero External Telemetry**: Fontivo collects **no usage analytics, no user tracking, and no crash reports sent to external cloud servers**.
2. **Local Loopback Isolation**: All internal REST endpoints (`127.0.0.1:3920`) and Adobe CC socket bridges (`127.0.0.1:27715`) bind exclusively to the local loopback interface. They never bind to `0.0.0.0` or listen on external network interfaces.
3. **Transient In-Memory Virtualization**: Fontivo loads fonts into RAM using Win32 `AddFontResourceExW` with the `FR_PRIVATE` flag. No font files are copied into `C:\Windows\Fonts`, and no permanent registry entries are written. Upon exiting Fontivo, memory handles are released immediately with zero residual footprint on disk.

---

## Built-in Security Architecture

The Fontivo core daemon incorporates multi-layered defensive security controls:

### 1. Cross-Origin Request Forgery & CORS Defense
- Fontivo implements strict HTTP `Origin` header validation.
- Requests originating from arbitrary web browsers (e.g. malicious third-party websites attempting to query `http://127.0.0.1:3920`) are immediately rejected with `403 Forbidden: Cross-Origin Request Blocked`.
- Only authorized desktop webview origins (`localhost`, `127.0.0.1`, `tauri://`, `wry://`) and direct native desktop callers are accepted.

### 2. Path Traversal & File Boundary Defense (CWE-22)
- All static asset requests, font preview loaders, and custom folder importers enforce cryptographic canonicalization checks:
 `canonical_target.starts_with(canonical_root)`.
- Traversal sequences (`..`), backslashes, and null bytes (`\0`) are strictly intercepted and rejected.

### 3. Archive Safety & Decompression Bomb Mitigations (CWE-400 / CWE-22)
The font downloader uses `SafeZipExtractor` with strict defensive thresholds:
- **Zip-Slip Protection**: Rejects any archive entry attempting relative directory traversal.
- **Decompression Ratio Cap**: Maximum expansion ratio of 200:1 to eliminate zip bomb denial-of-service risks.
- **Volume & Entry Caps**: Enforces a strict 4 GB uncompressed ceiling and 50,000 maximum entries.
- **Magic Byte Validation**: Verifies font binary signatures (`TTF`, `OTTO`, `ttcf`, `wOFF`, `wOF2`) before persisting files to disk.

### 4. Least Privilege Execution (asInvoker)
- Fontivo requires **zero administrator elevation** for standard operations.
- Application manifests declare `requestedExecutionLevel level="asInvoker"`.
- Registry backup and cleanup operations operate safely within user-accessible scopes or provide explicit administrative elevation prompts only when performing requested Windows registry repairs.

---

## Reporting a Vulnerability

If you discover a security vulnerability or security bug in Fontivo, please report it responsibly:

- **Security Contact**: Email **Eng. Ahmed Fahmy** at `ahmedfahmy8308@gmail.com` with the subject tag `[SECURITY VULNERABILITY] Fontivo`.
- **Details to Include**:
 1. Detailed description of the vulnerability and its potential impact.
 2. Reproduction steps, proof-of-concept payload, or test case.
 3. Operating system version and Fontivo release version.
- **Response Timeline**:
 - Initial acknowledgement within **48 hours**.
 - Triage and remediation verification within **7 business days**.

Please refrain from submitting public GitHub issues for undisclosed security vulnerabilities.
