#!/usr/bin/env bash
# install.sh -- One-line automated installer for Fontivo (Linux & macOS)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Ahmedfahmy8308/Fontivo/main/scripts/install.sh | bash
#   curl -fsSL ... | bash -s -- --version v1.0.0
#   curl -fsSL ... | bash -s -- --prefix ~/.local
#   curl -fsSL ... | sudo bash

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
install.sh -- Install Fontivo Desktop Font Manager

Options:
  --version <v>     Release tag to install (default: latest)
  --prefix <dir>    Install prefix (default: ~/.local, or /usr/local as root)
  --bin-dir <dir>   Direct binary directory (default: <prefix>/bin)
  --no-path         Do not modify shell startup files (.bashrc, .zshrc)
  --path-dry-run    Show proposed PATH changes without writing
  --from-source     Force building from source using cargo
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
      --version=*)  VERSION="${1#*=}"; shift ;;
      --version)    VERSION="$2"; shift 2 ;;
      --prefix=*)   PREFIX="${1#*=}"; shift ;;
      --prefix)     PREFIX="$2"; shift 2 ;;
      --bin-dir=*)  BIN_DIR="${1#*=}"; shift ;;
      --bin-dir)    BIN_DIR="$2"; shift 2 ;;
      --no-path)    NO_PATH="1"; shift ;;
      --path-dry-run) PATH_DRY_RUN="1"; shift ;;
      --from-source) FROM_SOURCE="1"; shift ;;
      -h|--help)    usage; exit 0 ;;
      *)            warn "Unknown parameter: $1"; shift ;;
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

  mkdir -p "$BIN_DIR"

  local temp_dir
  temp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t 'fontivo-install')"
  trap 'rm -rf "$temp_dir"' EXIT

  local target_bin="$BIN_DIR/Fontivo"

  if [ -n "$FROM_SOURCE" ] || [ "$OS" != "windows" ]; then
    # Native Linux / macOS build via Cargo
    info "Compiling Fontivo from repository source..."
    if ! command -v cargo >/dev/null 2>&1; then
      die 1 "Cargo (Rust toolchain) is required. Install from https://rustup.rs"
    fi

    local clone_dir="$temp_dir/fontivo"
    git clone --depth 1 "https://github.com/$REPO.git" "$clone_dir"
    cd "$clone_dir"

    if command -v npm >/dev/null 2>&1 && [ -d "Fontivo-App/src/ui" ]; then
      info "Building UI frontend assets..."
      (cd Fontivo-App/src/ui && npm ci && npm run build) || warn "UI build skipped or non-fatal."
    fi

    info "Building Native Rust binary..."
    (cd Fontivo-App && cargo build --release)

    local built_bin
    built_bin="$(find "$clone_dir/Fontivo-App/target/release" -maxdepth 1 -type f -name "Fontivo" -o -name "fontivo" | head -n 1)"
    if [ -z "$built_bin" ]; then
      die 1 "Compiled binary not found in target/release"
    fi

    cp "$built_bin" "$target_bin"
    chmod +x "$target_bin"
  fi

  ok "Installed Fontivo to $target_bin"
  configure_path "$BIN_DIR"

  printf '\n%sFontivo installed successfully!%s\n' "$C_GREEN" "$C_OFF"
  printf 'Run: %sFontivo%s\n\n' "$C_CYAN" "$C_OFF"
}

main "$@"
