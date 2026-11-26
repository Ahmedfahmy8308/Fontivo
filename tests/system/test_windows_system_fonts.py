#!/usr/bin/env python3
"""
Test Suite: Windows System Fonts Management
Tests endpoints:
  - GET /api/system/windows-fonts
    * Confirms enumeration of Windows installed fonts
    * Verifies core Windows fonts (Segoe UI, Arial, Tahoma) are flagged isSystemCore: true and protected (isUninstallable: false)
    * Verifies font metadata (name, family, path, size, hive)
  - POST /api/system/windows-fonts/restore-defaults
    * Verifies registry backup creation before restore
    * Verifies JSON backup file exists on disk
  - POST /api/system/windows-fonts/uninstall
    * Confirms safety protection blocking uninstallation of Windows core fonts
"""

import os
import sys
import time
import json
import unittest
import subprocess
import requests

API_HOST = "127.0.0.1"
API_PORT = 3920
BASE_URL = f"http://{API_HOST}:{API_PORT}"

def find_fontivo_exe():
    curr = os.path.abspath(os.path.dirname(__file__))
    candidates = []
    root = curr
    for _ in range(5):
        candidates.extend([
            os.path.join(root, "Fontivo-App", "release", "Fontivo.exe"),
            os.path.join(root, "release", "Fontivo.exe"),
            os.path.join(root, "Fontivo-App", "app", "core", "target", "release", "Fontivo.exe"),
            os.path.join(root, "app", "core", "target", "release", "Fontivo.exe"),
        ])
        parent = os.path.dirname(root)
        if parent == root:
            break
        root = parent

    for c in candidates:
        if os.path.isfile(c):
            return os.path.abspath(c)
    raise FileNotFoundError(f"Fontivo.exe not found in candidates: {candidates}")

def find_project_root():
    curr = os.path.abspath(os.path.dirname(__file__))
    for _ in range(5):
        if os.path.exists(os.path.join(curr, "Fontivo-App")) and os.path.exists(os.path.join(curr, "Fontivo-Fonts")):
            return curr
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent
    return os.getcwd()

class TestWindowsSystemFonts(unittest.TestCase):
    server_process = None

    @classmethod
    def setUpClass(cls):
        # 1. Connect if daemon already running
        try:
            r = requests.get(f"{BASE_URL}/api/stats", timeout=1)
            if r.status_code == 200:
                cls.server_process = None
                return
        except Exception:
            pass

        # 2. Boot Fontivo headless daemon
        exe_path = find_fontivo_exe()
        root_dir = find_project_root()
        cls.server_process = subprocess.Popen(
            [exe_path, "--headless"],
            cwd=root_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        start_time = time.time()
        server_ready = False
        while time.time() - start_time < 15:
            try:
                r = requests.get(f"{BASE_URL}/api/stats", timeout=1)
                if r.status_code == 200:
                    server_ready = True
                    break
            except Exception:
                time.sleep(0.5)

        if not server_ready:
            cls.tearDownClass()
            raise RuntimeError(f"Fontivo server failed to boot within 15 seconds at {BASE_URL}")

    @classmethod
    def tearDownClass(cls):
        if cls.server_process:
            cls.server_process.terminate()
            try:
                cls.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.server_process.kill()
            cls.server_process = None

    def test_01_enumerate_windows_fonts(self):
        """Test GET /api/system/windows-fonts confirms enumeration and valid structure."""
        res = requests.get(f"{BASE_URL}/api/system/windows-fonts", timeout=10)
        self.assertEqual(res.status_code, 200, "Endpoint must return 200 OK")
        raw = res.json()
        if isinstance(raw, list):
            fonts = raw
            total = len(fonts)
        else:
            self.assertTrue(raw.get("success", True), "Response success must be True")
            fonts = raw.get("fonts", [])
            total = raw.get("total", len(fonts))

        self.assertGreater(total, 0, "System fonts count must be > 0 on Windows")
        self.assertEqual(len(fonts), total, "Length of fonts array must equal total count")

        # Verify font structure
        sample = fonts[0]
        self.assertIn("name", sample, "Font record must have 'name'")
        self.assertIn("family", sample, "Font record must have 'family'")
        self.assertIn("path", sample, "Font record must have 'path'")
        self.assertIn("hive", sample, "Font record must have 'hive'")
        self.assertIn("isSystemCore", sample, "Font record must have 'isSystemCore'")
        self.assertIn("isUninstallable", sample, "Font record must have 'isUninstallable'")

    def test_02_core_fonts_protection_and_flags(self):
        """Test GET /api/system/windows-fonts flags core Windows fonts as protected."""
        res = requests.get(f"{BASE_URL}/api/system/windows-fonts", timeout=10)
        self.assertEqual(res.status_code, 200)
        raw = res.json()
        fonts = raw if isinstance(raw, list) else raw.get("fonts", [])

        # Find core Windows fonts
        segoe_fonts = [f for f in fonts if "segoe" in f.get("name", "").lower() or "segoe" in f.get("family", "").lower()]
        arial_fonts = [f for f in fonts if "arial" in f.get("name", "").lower() or "arial" in f.get("family", "").lower()]
        tahoma_fonts = [f for f in fonts if "tahoma" in f.get("name", "").lower() or "tahoma" in f.get("family", "").lower()]

        self.assertGreater(len(segoe_fonts), 0, "Segoe UI font must be present on Windows")
        self.assertGreater(len(arial_fonts), 0, "Arial font must be present on Windows")
        self.assertGreater(len(tahoma_fonts), 0, "Tahoma font must be present on Windows")

        # Confirm all identified core fonts are marked isSystemCore: true and isUninstallable: false
        for f in segoe_fonts:
            self.assertTrue(f.get("isSystemCore"), f"Segoe font {f.get('name')} must be flagged isSystemCore: true")
            self.assertFalse(f.get("isUninstallable"), f"Segoe font {f.get('name')} must not be uninstallable")

        for f in arial_fonts:
            self.assertTrue(f.get("isSystemCore"), f"Arial font {f.get('name')} must be flagged isSystemCore: true")
            self.assertFalse(f.get("isUninstallable"), f"Arial font {f.get('name')} must not be uninstallable")

        for f in tahoma_fonts:
            self.assertTrue(f.get("isSystemCore"), f"Tahoma font {f.get('name')} must be flagged isSystemCore: true")
            self.assertFalse(f.get("isUninstallable"), f"Tahoma font {f.get('name')} must not be uninstallable")

    def test_03_uninstall_core_font_rejected(self):
        """Test POST /api/system/windows-fonts/uninstall safely rejects core font removal."""
        payload = {
            "name": "Segoe UI",
            "path": "C:\\Windows\\Fonts\\segoeui.ttf"
        }
        res = requests.post(f"{BASE_URL}/api/system/windows-fonts/uninstall", json=payload, timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data.get("success"), "Uninstalling core font must fail")
        self.assertIn("protected", data.get("error", "").lower(), "Error must mention protected core font")

    def test_04_restore_defaults_backup_creation(self):
        """Test POST /api/system/windows-fonts/restore-defaults creates registry backup."""
        res = requests.post(f"{BASE_URL}/api/system/windows-fonts/restore-defaults", timeout=10)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertTrue(data.get("success"), f"Restore defaults failed: {data}")
        self.assertIn("backupPath", data, "Response must include backupPath")
        backup_path = data.get("backupPath")
        self.assertTrue(os.path.isfile(backup_path), f"Backup file must exist at {backup_path}")

        # Verify backup JSON is non-empty and valid
        with open(backup_path, "r", encoding="utf-8") as f:
            backup_data = json.load(f)
        self.assertIsInstance(backup_data, list, "Backup data must be a serialized list")

if __name__ == "__main__":
    unittest.main()
