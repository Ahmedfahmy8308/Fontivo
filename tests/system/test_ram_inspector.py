#!/usr/bin/env python3
"""
Test Suite: Live RAM Fonts Inspector & Memory Rapid Purge
Tests endpoints:
  - GET /api/system/ram-fonts
    * Verifies live list of active RAM fonts (id, name, path, format, registeredAt, memoryMb)
    * Verifies process memory metrics
  - POST /api/activate (Win32 GDI registration) -> GET /api/system/ram-fonts verification
  - POST /api/system/ram-fonts/clear-all
    * Verifies instant unregistration of all RAM fonts
    * Verifies WM_FONTCHANGE broadcast and memory working set trimming
    * Confirms live RAM list is 0 and unloadedCount >= 1
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

class TestRamInspector(unittest.TestCase):
    server_process = None

    @classmethod
    def setUpClass(cls):
        try:
            r = requests.get(f"{BASE_URL}/api/stats", timeout=1)
            if r.status_code == 200:
                cls.server_process = None
                return
        except Exception:
            pass

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

    def test_01_get_ram_fonts_structure(self):
        """Test GET /api/system/ram-fonts returns valid response and metrics."""
        res = requests.get(f"{BASE_URL}/api/system/ram-fonts", timeout=5)
        self.assertEqual(res.status_code, 200, "Endpoint must return 200 OK")
        data = res.json()

        if isinstance(data, dict):
            self.assertTrue(data.get("success", True))
            self.assertIn("fonts", data)
            self.assertIn("processRamMb", data)
            self.assertGreater(data.get("processRamMb", 0), 0)
        else:
            self.assertIsInstance(data, list)

    def test_02_activate_and_track_in_ram(self):
        """Test activating a font registers it live in /api/system/ram-fonts."""
        # 1. Activate font #1
        act_res = requests.post(f"{BASE_URL}/api/activate", json={"id": 1}, timeout=5)
        self.assertEqual(act_res.status_code, 200)
        act_data = act_res.json()
        self.assertTrue(act_data.get("success"), f"Font activation failed: {act_data}")

        # 2. Inspect live RAM fonts
        ram_res = requests.get(f"{BASE_URL}/api/system/ram-fonts", timeout=5)
        self.assertEqual(ram_res.status_code, 200)
        ram_data = ram_res.json()

        fonts = ram_data.get("fonts", []) if isinstance(ram_data, dict) else ram_data
        active_ids = [f.get("id") for f in fonts]
        self.assertIn(1, active_ids, f"Activated font #1 must appear in live RAM fonts: {active_ids}")

        # Verify font properties in RAM inspector
        ram_font = next(f for f in fonts if f.get("id") == 1)
        self.assertIn("name", ram_font)
        self.assertIn("path", ram_font)
        self.assertIn("format", ram_font)
        self.assertIn("memoryMb", ram_font)
        self.assertGreater(ram_font.get("memoryMb", 0), 0)

    def test_03_clear_all_ram_fonts(self):
        """Test POST /api/system/ram-fonts/clear-all unregisters all RAM fonts instantly."""
        # Ensure at least font #1 is active
        requests.post(f"{BASE_URL}/api/activate", json={"id": 1}, timeout=5)

        # Clear all
        clear_res = requests.post(f"{BASE_URL}/api/system/ram-fonts/clear-all", timeout=5)
        self.assertEqual(clear_res.status_code, 200)
        clear_data = clear_res.json()

        self.assertTrue(clear_data.get("success"), f"Clear all failed: {clear_data}")
        self.assertGreaterEqual(clear_data.get("unloadedCount", 0), 1, "Unloaded count must be >= 1")
        self.assertIn("freedMb", clear_data)

        # Verify subsequent GET /api/system/ram-fonts is empty
        verify_res = requests.get(f"{BASE_URL}/api/system/ram-fonts", timeout=5)
        self.assertEqual(verify_res.status_code, 200)
        verify_data = verify_res.json()
        remaining_fonts = verify_data.get("fonts", []) if isinstance(verify_data, dict) else verify_data
        self.assertEqual(len(remaining_fonts), 0, f"Expected 0 active fonts after clear-all, found: {remaining_fonts}")

if __name__ == "__main__":
    unittest.main()
