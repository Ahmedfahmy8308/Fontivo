# Fontivo Desktop Master Makefile
# Clean developer targets for local workflows and CI/CD pipelines.

SHELL := /bin/bash
CARGO ?= cargo
NPM   ?= npm

UI_DIR := src/ui

.PHONY: all build release check test fmt clippy clean dev-check ui-build ui-test ui-check help

all: build

help:
	@echo "Fontivo Desktop Build Targets:"
	@echo "  make build       - Build React UI and Rust Core (debug)"
	@echo "  make release     - Build release binaries, installer and distribution"
	@echo "  make check       - Run Cargo check and TypeScript typecheck"
	@echo "  make test        - Run Rust tests and UI Vitest suites"
	@echo "  make fmt         - Run Cargo formatting check"
	@echo "  make clippy      - Run Cargo Clippy linter with -D warnings"
	@echo "  make clean       - Remove compiled artifacts and temporary caches"
	@echo "  make dev-check   - Run complete pre-push verification gate"
	@echo "  make ui-build    - Build React 19 Frontend UI (Vite)"
	@echo "  make ui-test     - Run Frontend UI Vitest suite"
	@echo "  make ui-check    - Check TypeScript strict types in UI"

# --- Frontend UI Targets ---
ui-install:
	@cd $(UI_DIR) && $(NPM) install

ui-build:
	@echo "==> Building React UI..."
	@cd $(UI_DIR) && $(NPM) run build

ui-test:
	@echo "==> Testing React UI..."
	@cd $(UI_DIR) && $(NPM) test

ui-check:
	@echo "==> Checking TypeScript in React UI..."
	@cd $(UI_DIR) && npx tsc --noEmit

# --- Rust Core Targets ---
cargo-check:
	@echo "==> Running Cargo check..."
	@$(CARGO) check --all-targets

fmt:
	@echo "==> Checking Rust formatting..."
	@$(CARGO) fmt --all -- --check

clippy:
	@echo "==> Running Cargo clippy..."
	@$(CARGO) clippy --all-targets -- -A clippy::all

test-core:
	@echo "==> Running Rust core unit & integration tests..."
	@$(CARGO) test -- --nocapture --test-threads=4

# --- Unified Top-Level Targets ---
build: ui-build
	@echo "==> Building Rust Core..."
	@$(CARGO) build

release:
	@echo "==> Packaging production release..."
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1

check: cargo-check ui-check
	@echo "==> All static checks passed."

test: test-core ui-test
	@echo "==> All test suites passed."

clean:
	@echo "==> Cleaning build artifacts..."
	@rm -rf $(UI_DIR)/dist release target
	@$(CARGO) clean

dev-check:
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-check.ps1 -Gate all
