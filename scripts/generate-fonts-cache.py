#!/usr/bin/env python3
"""
generate-fonts-cache.py
Delegates to the canonical Fontivo-Fonts/Scripts/sync-app-cache.py implementation
so Fontivo-App and Fontivo-Fonts always share one consistent category mapping,
Mojibake display-name repair, and FontRecord schema reading from Metadata/fonts.json.
"""

import importlib.util
import sys
from pathlib import Path


def get_workspace_root() -> Path:
    current = Path(__file__).resolve().parent
    for p in [current, current.parent, current.parent.parent]:
        if (p / "Fontivo-Fonts").exists() and (p / "Fontivo-App").exists():
            return p
    cwd = Path.cwd().resolve()
    if (cwd / "Fontivo-Fonts").exists() and (cwd / "Fontivo-App").exists():
        return cwd
    return current.parent.parent


def _load_canonical_sync_module():
    root = get_workspace_root()
    sync_script = root / "Fontivo-Fonts" / "Scripts" / "sync-app-cache.py"
    if not sync_script.exists():
        raise FileNotFoundError(f"Canonical cache sync script not found: {sync_script}")

    scripts_dir = str(sync_script.parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)

    spec = importlib.util.spec_from_file_location("fontivo_sync_app_cache", sync_script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_sync_mod = _load_canonical_sync_module()

# Re-export canonical API so callers importing this script get identical behavior
CATEGORY_ARABIC = _sync_mod.CATEGORY_ARABIC
CATEGORY_ENGLISH = _sync_mod.CATEGORY_ENGLISH
CATEGORY_SYMBOLS = _sync_mod.CATEGORY_SYMBOLS
classify_font_category = _sync_mod.classify_font_category
detect_typographic_features = _sync_mod.detect_typographic_features
build_cache_record = _sync_mod.build_cache_record
generate_cache = _sync_mod.generate_cache


if __name__ == "__main__":
    success = generate_cache()
    sys.exit(0 if success else 1)
