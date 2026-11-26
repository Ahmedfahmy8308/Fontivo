# Contributing to Fontivo

Thank you for your interest in contributing to **Fontivo**! We welcome contributions from developers, typography designers, UI/UX specialists, and documentation authors. This guide will help you set up your environment, understand our architecture, and submit quality contributions.

---

## Repository Architecture

Fontivo is organized into modular workspaces:

| Component | Path | Technology | Role |
| :--- | :--- | :--- | :--- |
| **Native Core Engine** | `src/fontivo_*` / `Cargo.toml` | Rust (2021/2024 Edition), Win32 GDI32, TinyHttp, Tao/Wry | Fast background daemon, RAM font injection, Adobe CC bridge (`27715`), REST API (`3920`), ASE generator |
| **Desktop Frontend** | `src/ui/` | React 19, Tailwind CSS, Vite, TypeScript | Virtualized desktop interface, interactive typography lab, brand kits, color palette extractor |
| **Official Website** | `Fontivo-Site/` | Next.js 15, React 19, Tailwind CSS, TypeScript | Production landing portal, release manifests, documentation viewer |
| **Fonts Archive Data** | `Fontivo-Fonts/` | JSON Metadata, Asynchronous HTTP Range Downloader | 11,207 curated open-source fonts indexed across 4,438 families |

---

## Quick Setup

### Prerequisites

1. **Rust Toolchain**: Rust 1.85+ (MSVC toolchain recommended on Windows).
2. **Node.js**: Node.js 18 or 20+ with `npm`.
3. **PowerShell**: Windows PowerShell 5.1+ or PowerShell 7+.
4. **Git**: Standard Git client.

### Building from Source

#### 1. Desktop Web UI

```powershell
# Navigate to the UI workspace
cd src/ui

# Install dependencies
npm install

# Verify TypeScript types and execute test suites
npx tsc --noEmit
npm test

# Build production bundle
npm run build
cd ../..
```

#### 2. Native Rust Core Engine

```powershell
# From Fontivo-App root:

# Run test suite across all domains
cargo test

# Build optimized release binary (Fontivo.exe)
cargo build --release
```

#### 3. Showcase Website

```powershell
# Navigate to website workspace
cd Fontivo-Site

# Install dependencies and test
npm install
npm test
npm run build
```

---

## Contribution Workflow

1. **Fork the Repository**: Create your feature branch (`git checkout -b feature/amazing-feature`).
2. **Implement Your Changes**: Write clean, modular, and well-tested code following repository standards.
3. **Local Quality Verification**:
 - Rust: Ensure `cargo check` and `cargo test` pass without warnings or regressions.
 - Frontend: Ensure `npx tsc --noEmit` and `npm test` execute cleanly.
4. **Adhere to Code Standards**:
 - **Rust**: Follow standard formatting (`cargo fmt`) and clippy checks (`cargo clippy`). Avoid unhandled unwraps in production request flows.
 - **TypeScript/React**: Maintain strict type definitions. Ensure responsive design with RTL/LTR bilingual readiness.
5. **Commit Message Format**: Follow structured conventional commits:
 - `feat(core): add font subsetting preview`
 - `fix(adobe): handle edge-case psd text layer encoding`
 - `docs: update adobe cc integration steps`
6. **Submit a Pull Request**: Provide a clear explanation of what was changed, referencing any relevant issues.

---

## Security Guidelines

If your contribution impacts network boundaries, file operations, or decompression logic, verify:

- REST API endpoints remain bound strictly to `127.0.0.1`.
- Any external file input passes path canonicalization and containment validation to prevent path traversal (CWE-22).
- Archive decompression logic maintains strict Zip-Slip and ratio caps (CWE-400).

For sensitive security reports, please consult [`SECURITY.md`](SECURITY.md).

---

## Core Maintainers & Leadership

- **Eng. Ahmed Fahmy** — Lead Software & Systems Architect (`ahmedfahmy8308@gmail.com`)
- **Eng. Mohamed Elashwah** — Head of Brand Identity & UI/UX
