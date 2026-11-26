# Third-Party Notices & Open-Source Acknowledgments

Fontivo is built with and benefits from outstanding open-source projects across the Rust, JavaScript, and typography communities. This document acknowledges the primary third-party libraries and licenses utilized in Fontivo.

---

## Rust Core Dependencies

The native core daemon (`src/fontivo_*` / `Cargo.toml`) incorporates the following key libraries:

- **wry & tao** (Apache-2.0 / MIT) — Cross-platform webview rendering and native window creation.
 Copyright (c) Tauri Programme within The Commons Conservancy.
- **tiny_http** (Apache-2.0 / MIT) — Ultra-lightweight, zero-dependency HTTP server daemon.
 Copyright (c) Pierre Krieger.
- **serde & serde_json** (MIT / Apache-2.0) — High-performance serialization framework.
 Copyright (c) Erick Tryzelaar and David Tolnay.
- **ttf-parser** (Apache-2.0 / MIT) — High-level, safe, zero-allocation TrueType and OpenType font parser.
 Copyright (c) Yevhenii Reizner.
- **ureq** (Apache-2.0 / MIT) — Minimalist, secure HTTP client for font package downloads.
 Copyright (c) Martin Algesten.
- **notify** (CC0-1.0 / MIT) — Cross-platform filesystem event monitoring.
 Copyright (c) Félix Saparelli and contributors.
- **include_dir** (MIT) — Compile-time static asset embedding.
 Copyright (c) Michael Bryan.
- **sha2** (MIT / Apache-2.0) — Pure Rust cryptographic SHA-256 implementation.
 Copyright (c) RustCrypto project developers.
- **windows-sys** (MIT / Apache-2.0) — Minimal zero-cost Win32 API bindings (GDI32, DirectWrite, Shell32, ProcessThreadsApi).
 Copyright (c) Microsoft Corporation.

---

## Frontend & Web Dependencies

The user interface (`src/ui/` and `Fontivo-Site/`) incorporates:

- **React 19 & React DOM** (MIT) — Declarative user interface library.
 Copyright (c) Meta Platforms, Inc.
- **Next.js 15** (MIT) — React production web framework.
 Copyright (c) Vercel, Inc.
- **Tailwind CSS** (MIT) — Utility-first CSS framework.
 Copyright (c) Tailwind Labs, Inc.
- **Vite** (MIT) — Modern frontend build tooling.
 Copyright (c) Yuxi (Evan) You and Vite contributors.
- **Lucide React** (ISC) — Clean, consistent iconography suite.
 Copyright (c) Lucide Contributors.

---

## Open-Source Fonts Catalog

The pre-indexed typography library incorporates open-source typefaces from the **Google Fonts** archive and global typographic foundries. Each typeface included in the catalog maintains its individual open-source license:

- **SIL Open Font License (OFL 1.1)** — Allows free use, study, modification, and redistribution for both personal and commercial projects.
- **Apache License, Version 2.0** — Open-source permissive software and typeface license.

Individual font copyright notices, designers, and licensing details are preserved within the metadata of each respective font package and inspected in real time via Fontivo's font information inspector.

---

## Creative Software Integration

- **Adobe Swatch Exchange (`.ASE`)**: Fontivo's binary swatches export implements the Adobe Swatch Exchange 1.0 binary specification (Big-Endian IEEE 754 floating-point RGB with UTF-16BE naming).
- **Adobe Creative Cloud Bridge**: Uses standard local TCP socket communication (`127.0.0.1:27715`) for interoperability with Adobe CEP (Common Extensibility Platform) automation.
