#!/usr/bin/env python3
"""
Test Suite: Windows System Autostart Integration
Tests endpoints:
  - GET /api/system/autostart
    * Inspects HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Fontivo registry key
    * Returns enabled boolean and executable path
  - POST /api/system/autostart/toggle
    * Toggles autostart status in Windows registry
    * Confirms registry reflects toggled state
    * Restores original state to preserve environment integrity (non-destructive)
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

class TestSystemAutostart(unittest.TestCase):
    server_process = None
    original_autostart_state = None

    @classmethod
    def setUpClass(cls):
        try:
            r = requests.get(f"{BASE_URL}/api/stats", timeout=1)
            if r.status_code == 200:
                cls.server_process = None
                # Record initial state
                try:
                    init_res = requests.get(f"{BASE_URL}/api/system/autostart", timeout=2)
                    if init_res.status_code == 200:
                        cls.original_autostart_state = init_res.json().get("enabled")
                except Exception:
                    pass
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

        # Record initial autostart state
        try:
            init_res = requests.get(f"{BASE_URL}/api/system/autostart", timeout=2)
            if init_res.status_code == 200:
                cls.original_autostart_state = init_res.json().get("enabled")
        except Exception:
            pass

    @classmethod
    def tearDownClass(cls):
        # Restore initial autostart state if changed
        if cls.original_autostart_state is not None:
            try:
                requests.post(
                    f"{BASE_URL}/api/system/autostart/toggle",
                    json={"enabled": cls.original_autostart_state},
                    timeout=2
                )
            except Exception:
                pass

        if cls.server_process:
            cls.server_process.terminate()
            try:
                cls.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.server_process.kill()
            cls.server_process = None

    def test_01_get_autostart_status(self):
        """Test GET /api/system/autostart returns valid autostart status and path."""
        res = requests.get(f"{BASE_URL}/api/system/autostart", timeout=5)
        self.assertEqual(res.status_code, 200, "Endpoint must return 200 OK")
        data = res.json()

        self.assertTrue(data.get("success"), f"Expected success=True, got {data}")
        self.assertIn("enabled", data, "Response must include 'enabled' boolean")
        self.assertIsInstance(data["enabled"], bool)
        self.assertIn("path", data, "Response must include 'path' string")

    def test_02_toggle_autostart_and_revert(self):
        """Test POST /api/system/autostart/toggle inverts state, then safely restores it."""
        # 1. Get current status
        initial_res = requests.get(f"{BASE_URL}/api/system/autostart", timeout=5)
        self.assertEqual(initial_res.status_code, 200)
        initial_enabled = initial_res.json().get("enabled")

        # 2. Toggle state
        toggle_res = requests.post(f"{BASE_URL}/api/system/autostart/toggle", timeout=5)
        self.assertEqual(toggle_res.status_code, 200)
        toggle_data = toggle_res.json()
        self.assertTrue(toggle_data.get("success"))
        new_enabled = toggle_data.get("enabled")
        self.assertEqual(new_enabled, not initial_enabled, f"Autostart state must be toggled: {initial_enabled} -> {new_enabled}")

        # 3. Verify with subsequent GET
        verify_res = requests.get(f"{BASE_URL}/api/system/autostart", timeout=5)
        self.assertEqual(verify_res.status_code, 200)
        self.assertEqual(verify_res.json().get("enabled"), new_enabled)

        # 4. Toggle back to restore initial state
        revert_res = requests.post(f"{BASE_URL}/api/system/autostart/toggle", timeout=5)
        self.assertEqual(revert_res.status_code, 200)
        self.assertEqual(revert_res.json().get("enabled"), initial_enabled, "Original state must be restored")

if __name__ == "__main__":
    unittest.main()
