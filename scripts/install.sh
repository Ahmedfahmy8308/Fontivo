#!/usr/bin/env bash
# install.sh -- Verified one-line installer for Fontivo (macOS & Linux)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Ahmedfahmy8308/Fontivo/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Ahmedfahmy8308/Fontivo/main/scripts/install.sh | bash -s -- --version v1.0.0
#   curl -fsSL https://raw.githubusercontent.com/Ahmedfahmy8308/Fontivo/main/scripts/install.sh | bash -s -- --from-source
#   curl -fsSL https://raw.githubusercontent.com/Ahmedfahmy8308/Fontivo/main/scripts/install.sh | bash -s -- --prefix ~/.local

set -euo pipefail

REPO="${FONTIVO_REPO:-Ahmedfahmy8308/Fontivo}"
VERSION="${FONTIVO_VERSION:-latest}"
PREFIX="${FONTIVO_PREFIX:-}"
BIN_DIR="${FONTIVO_BIN_DIR:-}"
NO_PATH="${FONTIVO_NO_PATH:-}"
FROM_SOURCE="${FONTIVO_FROM_SOURCE:-}"
PATH_DRY_RUN=""

C_CYAN=""; C_YELLOW=""; C_RED=""; C_GREEN=""; C_OFF=""
setup_colors() {
  if [ -t 1 ] && [ -t 2 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
    C_CYAN=$'\033[1;36m'; C_YELLOW=$'\033[1;33m'; C_RED=$'\033[1;31m'
    C_GREEN=$'\033[1;32m'; C_OFF=$'\033[0m'
  fi
}

info() { printf '%s==>%s %s\n' "$C_CYAN" "$C_OFF" "$*"; }
ok()   { printf '%s[ok]%s %s\n' "$C_GREEN" "$C_OFF" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_YELLOW" "$C_OFF" "$*" >&2; }
die()  { local code="$1"; shift; printf '%s[fail]%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit "$code"; }

usage() {
  cat <<'EOF'
install.sh -- Install Fontivo Desktop Font Manager (macOS & Linux)

Options:
  --version <v>     Release tag to install (default: latest)
  --prefix <dir>    Install prefix (default: ~/.local, or /usr/local as root)
  --bin-dir <dir>   Direct binary directory (default: <prefix>/bin)
  --no-path         Do not modify shell startup files (.bashrc, .zshrc)
  --path-dry-run    Show proposed PATH changes without writing
  --from-source     Compile directly from GitHub source instead of downloading release tarball
  -h, --help        Show this help message
EOF
}

detect_platform() {
  local os_type arch_type
  os_type="$(uname -s)"
  arch_type="$(uname -m)"

  case "$os_type" in
    Linux)  OS="linux" ;;
    Darwin) OS="macos" ;;
    *)      die 1 "Unsupported operating system: $os_type" ;;
  esac

  case "$arch_type" in
    x86_64|amd64)   ARCH="x86_64" ;;
    arm64|aarch64)  ARCH="arm64" ;;
    *)              die 1 "Unsupported architecture: $arch_type" ;;
  esac
}

compute_sha256() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print tolower($1)}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print tolower($1)}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$file" | awk '{print tolower($NF)}'
  else
    die 1 "No SHA-256 verification tool found (sha256sum, shasum, or openssl required)."
  fi
}

finalize_macos_binary() {
  local bin_path="$1"
  if [ "$OS" != "macos" ]; then
    return 0
  fi
  if command -v xattr >/dev/null 2>&1; then
    xattr -d com.apple.quarantine "$bin_path" 2>/dev/null || true
  fi
  if command -v codesign >/dev/null 2>&1; then
    codesign --force --sign - "$bin_path" >/dev/null 2>&1 || true
  fi
}

install_from_release() {
  local temp_dir="$1"
  local bin_dir="$2"
  local data_dir="$3"
  local asset_name="Fontivo-${OS}-${ARCH}.tar.gz"
  local base_url

  if [ "$VERSION" = "latest" ]; then
    base_url="https://github.com/$REPO/releases/latest/download"
  else
    base_url="https://github.com/$REPO/releases/download/$VERSION"
  fi

  local archive_path="$temp_dir/$asset_name"
  local sha_path="$temp_dir/$asset_name.sha256"

  info "Checking verified release asset: $asset_name ($VERSION)..."
  if ! curl -fsSL -o "$archive_path" "$base_url/$asset_name" 2>/dev/null; then
    return 1
  fi
  if ! curl -fsSL -o "$sha_path" "$base_url/$asset_name.sha256" 2>/dev/null; then
    warn "Release SHA-256 sidecar not found for $asset_name; falling back to source build for cryptographic safety."
    return 1
  fi

  local expected_hash actual_hash
  expected_hash="$(awk 'NF {print tolower($1); exit}' "$sha_path")"
  actual_hash="$(compute_sha256 "$archive_path")"

  if [ -z "$expected_hash" ] || [ "$expected_hash" != "$actual_hash" ]; then
    die 2 "SHA-256 verification failed for $asset_name (expected $expected_hash, got $actual_hash)!"
  fi
  ok "SHA-256 checksum verified: $actual_hash"

  local extract_dir="$temp_dir/extract"
  mkdir -p "$extract_dir"
  tar -xzf "$archive_path" -C "$extract_dir"

  local extracted_bin
  extracted_bin="$(find "$extract_dir" -maxdepth 2 -type f \( -name "Fontivo" -o -name "fontivo" \) | head -n 1)"
  if [ -z "$extracted_bin" ]; then
    warn "Binary not found inside $asset_name; falling back to source build."
    return 1
  fi

  cp "$extracted_bin" "$bin_dir/Fontivo"
  chmod +x "$bin_dir/Fontivo"
  finalize_macos_binary "$bin_dir/Fontivo"

  local extracted_dist
  extracted_dist="$(find "$extract_dir" -maxdepth 2 -type d -name "dist" | head -n 1 || true)"
  if [ -n "$extracted_dist" ]; then
    mkdir -p "$data_dir"
    rm -rf "$data_dir/dist"
    cp -R "$extracted_dist" "$data_dir/dist"
  fi

  return 0
}

install_from_source() {
  local temp_dir="$1"
  local bin_dir="$2"
  local data_dir="$3"

  info "Compiling Fontivo directly from repository source..."
  if ! command -v cargo >/dev/null 2>&1; then
    die 1 "Cargo (Rust toolchain) is required to build from source. Install from https://rustup.rs"
  fi
  if ! command -v git >/dev/null 2>&1; then
    die 1 "Git is required to clone the source repository."
  fi

  local clone_dir="$temp_dir/fontivo"
  if [ "$VERSION" = "latest" ]; then
    git clone --depth 1 "https://github.com/$REPO.git" "$clone_dir"
  else
    git clone --depth 1 --branch "$VERSION" "https://github.com/$REPO.git" "$clone_dir"
  fi

  local app_root="$clone_dir"
  if [ ! -f "$app_root/Cargo.toml" ] && [ -f "$clone_dir/Fontivo-App/Cargo.toml" ]; then
    app_root="$clone_dir/Fontivo-App"
  fi
  if [ ! -f "$app_root/Cargo.toml" ]; then
    die 1 "Cargo.toml not found in cloned repository."
  fi

  if command -v npm >/dev/null 2>&1 && [ -d "$app_root/src/ui" ]; then
    info "Building UI frontend assets..."
    (cd "$app_root/src/ui" && npm ci && npm run build) || warn "UI build skipped or non-fatal."
  fi

  info "Building Native Rust release binary..."
  (cd "$app_root" && FONTIVO_RELEASE_BUILD=1 cargo build --release --locked --bin Fontivo)

  local built_bin
  built_bin="$(find "$app_root/target/release" -maxdepth 1 -type f \( -name "Fontivo" -o -name "fontivo" \) | head -n 1)"
  if [ -z "$built_bin" ]; then
    die 1 "Compiled binary not found in target/release"
  fi

  cp "$built_bin" "$bin_dir/Fontivo"
  chmod +x "$bin_dir/Fontivo"
  finalize_macos_binary "$bin_dir/Fontivo"

  if [ -d "$app_root/src/ui/dist" ]; then
    mkdir -p "$data_dir"
    rm -rf "$data_dir/dist"
    cp -R "$app_root/src/ui/dist" "$data_dir/dist"
  fi
}

configure_path() {
  local bin_path="$1"
  if [ -n "$NO_PATH" ]; then return 0; fi

  case ":$PATH:" in
    *:"$bin_path":*)
      ok "Binary directory $bin_path is already on PATH."
      return 0
      ;;
  esac

  local export_line="export PATH=\"$bin_path:\$PATH\""
  local files_to_edit=()

  if [ -f "$HOME/.bashrc" ]; then files_to_edit+=("$HOME/.bashrc"); fi
  if [ -f "$HOME/.zshrc" ]; then files_to_edit+=("$HOME/.zshrc"); fi
  if [ -f "$HOME/.profile" ]; then files_to_edit+=("$HOME/.profile"); fi

  if [ ${#files_to_edit[@]} -eq 0 ]; then
    files_to_edit=("$HOME/.profile")
  fi

  for file in "${files_to_edit[@]}"; do
    if [ -n "$PATH_DRY_RUN" ]; then
      info "[DryRun] Would append PATH export to: $file"
    else
      if ! grep -q "$bin_path" "$file" 2>/dev/null; then
        printf '\n# Fontivo PATH\n%s\n' "$export_line" >> "$file"
        ok "Added $bin_path to $file"
      fi
    fi
  done
}

main() {
  setup_colors

  while [ $# -gt 0 ]; do
    case "$1" in
      --version=*)    VERSION="${1#*=}"; shift ;;
      --version)      VERSION="$2"; shift 2 ;;
      --prefix=*)     PREFIX="${1#*=}"; shift ;;
      --prefix)       PREFIX="$2"; shift 2 ;;
      --bin-dir=*)    BIN_DIR="${1#*=}"; shift ;;
      --bin-dir)      BIN_DIR="$2"; shift 2 ;;
      --no-path)      NO_PATH="1"; shift ;;
      --path-dry-run) PATH_DRY_RUN="1"; shift ;;
      --from-source)  FROM_SOURCE="1"; shift ;;
      -h|--help)      usage; exit 0 ;;
      *)              warn "Unknown parameter: $1"; shift ;;
    esac
  done

  info "Installing Fontivo Desktop Font Manager..."
  detect_platform
  info "Detected platform: $OS ($ARCH)"

  if [ -z "$PREFIX" ]; then
    if [ "$(id -u)" -eq 0 ]; then
      PREFIX="/usr/local"
    else
      PREFIX="$HOME/.local"
    fi
  fi

  if [ -z "$BIN_DIR" ]; then
    BIN_DIR="$PREFIX/bin"
  fi
  local data_dir="$PREFIX/share/fontivo"

  mkdir -p "$BIN_DIR"

  local temp_dir
  temp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t 'fontivo-install')"
  trap 'rm -rf "$temp_dir"' EXIT

  if [ -n "$FROM_SOURCE" ]; then
    install_from_source "$temp_dir" "$BIN_DIR" "$data_dir"
  elif ! install_from_release "$temp_dir" "$BIN_DIR" "$data_dir"; then
    warn "Verified prebuilt archive unavailable; building natively from source..."
    install_from_source "$temp_dir" "$BIN_DIR" "$data_dir"
  fi

  ok "Installed Fontivo to $BIN_DIR/Fontivo"
  configure_path "$BIN_DIR"

  printf '\n%sFontivo installed successfully!%s\n' "$C_GREEN" "$C_OFF"
  printf 'Run: %sFontivo%s\n\n' "$C_CYAN" "$C_OFF"
}

main "$@"
