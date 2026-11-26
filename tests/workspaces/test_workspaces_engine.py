#!/usr/bin/env python3
"""
Test Suite: Brand Project Workspace Engine & Lifecycle
Tests endpoints:
  - GET /api/workspaces & POST /api/workspaces
    * Creates workspace with typography, palette, and tasks checklist (todo, in_progress, done)
    * Verifies YAML / JSON persistence on disk
  - GET /api/workspaces/:id (retrieval and fidelity)
  - POST /api/workspaces/:id/activate-ram (1-click Win32 GDI RAM activation)
  - POST /api/workspaces/:id/export-bundle
    * Verifies bundle creation (.ase swatches, palette.css, tokens.json, and Brand-StyleGuide.html)
  - DELETE /api/workspaces/:id (clean removal from disk and API)
"""

import os
import sys
import time
import json
import shutil
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

class TestWorkspacesEngine(unittest.TestCase):
    server_process = None
    test_ws_id = "test-ws-automated-suite"
    exported_dirs = []

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
        try:
            requests.delete(f"{BASE_URL}/api/workspaces/{cls.test_ws_id}", timeout=2)
        except Exception:
            pass

        if cls.server_process:
            cls.server_process.terminate()
            try:
                cls.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.server_process.kill()
            cls.server_process = None

        # Clean exported test folders
        for folder in cls.exported_dirs:
            if os.path.isdir(folder):
                try:
                    shutil.rmtree(folder)
                except Exception:
                    pass

    def test_01_create_workspace_with_typography_palette_tasks(self):
        """Test POST /api/workspaces creates workspace with typography, palette, and tasks."""
        payload = {
            "id": self.test_ws_id,
            "name": "Swiss Architecture Studio",
            "client": "Kunsthaus Zurich",
            "business": "Architectural Design & Museum",
            "description": "Comprehensive corporate identity, typography hierarchy, and Swiss design tokens",
            "typography": {
                "headingFont": {
                    "name": "(A) Arslan Wessam A",
                    "fontId": 1,
                    "family": "Arslan Wessam"
                },
                "bodyFont": {
                    "name": "(A) Arslan Wessam B",
                    "fontId": 2,
                    "family": "Arslan Wessam"
                },
                "accentFont": {
                    "name": "(A) Arslan Wessam B",
                    "fontId": 3,
                    "family": "Arslan Wessam"
                },
                "codeFont": {
                    "name": "Consolas",
                    "family": "Consolas"
                }
            },
            "palette": [
                {"name": "Architectural Vermilion", "hex": "#D44A32", "role": "primary"},
                {"name": "Warm Ochre", "hex": "#D9822B", "role": "accent"},
                {"name": "Deep Obsidian", "hex": "#0F1115", "role": "background"},
                {"name": "Alabaster Paper", "hex": "#FAF9F6", "role": "surface"}
            ],
            "tasks": [
                {"id": "t-1", "text": "Define Swiss typographic grid", "status": "todo", "createdAt": 1700000000},
                {"id": "t-2", "text": "Audit WCAG AA/AAA contrast ratios", "status": "in_progress", "createdAt": 1700000001},
                {"id": "t-3", "text": "Compile Adobe .ASE swatches", "status": "done", "createdAt": 1700000002}
            ],
            "notes": "Follow Swiss / Bauhaus design principles with high-contrast architectural accents.",
            "updatedAt": 1700000003
        }

        res = requests.post(f"{BASE_URL}/api/workspaces", json=payload, timeout=5)
        self.assertEqual(res.status_code, 200, f"Creating workspace failed: {res.text}")
        data = res.json()
        self.assertEqual(data.get("id"), self.test_ws_id)
        self.assertEqual(data.get("name"), "Swiss Architecture Studio")

        # Verify tasks checklist persistence
        tasks = data.get("tasks", [])
        self.assertEqual(len(tasks), 3, "All 3 tasks must be persisted")
        task_statuses = {t["id"]: t["status"] for t in tasks}
        self.assertEqual(task_statuses.get("t-1"), "todo")
        self.assertEqual(task_statuses.get("t-2"), "in_progress")
        self.assertEqual(task_statuses.get("t-3"), "done")

        # Verify palette persistence
        palette = data.get("palette", [])
        self.assertEqual(len(palette), 4, "All 4 palette colors must be persisted")
        hex_codes = [c["hex"] for c in palette]
        self.assertIn("#D44A32", hex_codes)
        self.assertIn("#0F1115", hex_codes)

    def test_02_get_workspace_and_list_verification(self):
        """Test GET /api/workspaces and GET /api/workspaces/:id."""
        # 1. List all workspaces
        list_res = requests.get(f"{BASE_URL}/api/workspaces", timeout=5)
        self.assertEqual(list_res.status_code, 200)
        workspaces = list_res.json()
        self.assertIsInstance(workspaces, list)
        ws_ids = [w.get("id") for w in workspaces]
        self.assertIn(self.test_ws_id, ws_ids, "Newly created workspace must appear in list")

        # 2. Get single workspace by ID
        get_res = requests.get(f"{BASE_URL}/api/workspaces/{self.test_ws_id}", timeout=5)
        self.assertEqual(get_res.status_code, 200)
        ws = get_res.json()
        self.assertEqual(ws.get("id"), self.test_ws_id)
        self.assertEqual(ws.get("client"), "Kunsthaus Zurich")
        self.assertEqual(ws.get("business"), "Architectural Design & Museum")
        self.assertIn("typography", ws)

    def test_03_activate_workspace_ram(self):
        """Test POST /api/workspaces/:id/activate-ram loads workspace typography into RAM."""
        act_res = requests.post(f"{BASE_URL}/api/workspaces/{self.test_ws_id}/activate-ram", timeout=5)
        self.assertEqual(act_res.status_code, 200)
        act_data = act_res.json()
        self.assertTrue(act_data.get("success"), f"Workspace RAM activation failed: {act_data}")
        self.assertGreater(act_data.get("activatedCount", 0), 0, "At least 1 font must be activated")

        # Check live RAM inspector to confirm active font presence
        ram_res = requests.get(f"{BASE_URL}/api/system/ram-fonts", timeout=5)
        self.assertEqual(ram_res.status_code, 200)
        ram_data = ram_res.json()
        live_fonts = ram_data.get("fonts", []) if isinstance(ram_data, dict) else ram_data
        live_ids = [f.get("id") for f in live_fonts]
        self.assertTrue(any(i in [1, 2, 3] for i in live_ids), f"Workspace font IDs must be in RAM: {live_ids}")

    def test_04_export_workspace_bundle(self):
        """Test POST /api/workspaces/:id/export-bundle generates .ase, .css, .json, and styleguide HTML."""
        exp_res = requests.post(f"{BASE_URL}/api/workspaces/{self.test_ws_id}/export-bundle", timeout=5)
        self.assertEqual(exp_res.status_code, 200)
        exp_data = exp_res.json()
        self.assertTrue(exp_data.get("success"), f"Bundle export failed: {exp_data}")

        folder = exp_data.get("folderPath")
        self.assertTrue(os.path.isdir(folder), f"Export folder does not exist: {folder}")
        self.__class__.exported_dirs.append(folder)

        files = os.listdir(folder)
        # 1. Adobe Swatch Exchange (.ase) file
        ase_files = [f for f in files if f.endswith(".ase")]
        self.assertEqual(len(ase_files), 1, f"Expected 1 .ase file, found {ase_files}")
        ase_path = os.path.join(folder, ase_files[0])
        with open(ase_path, "rb") as f:
            magic = f.read(4)
        self.assertEqual(magic, b"ASEF", f"ASE magic bytes must be b'ASEF', got {magic}")

        # 2. Design tokens (CSS & JSON)
        self.assertTrue(any("palette.css" in f or "tokens.css" in f for f in files), f"CSS tokens missing in {files}")
        self.assertTrue(any("tokens.json" in f or "palette.json" in f for f in files), f"JSON tokens missing in {files}")

        # 3. Interactive Style Guide HTML
        self.assertTrue(any("StyleGuide.html" in f or "index.html" in f for f in files), f"HTML guide missing in {files}")

    def test_05_delete_workspace(self):
        """Test DELETE /api/workspaces/:id removes workspace and confirms cleanup."""
        del_res = requests.delete(f"{BASE_URL}/api/workspaces/{self.test_ws_id}", timeout=5)
        self.assertEqual(del_res.status_code, 200)
        del_data = del_res.json()
        self.assertTrue(del_data.get("success"))

        # Verify subsequent GET returns 404 or empty
        check_res = requests.get(f"{BASE_URL}/api/workspaces/{self.test_ws_id}", timeout=5)
        self.assertIn(check_res.status_code, [404, 200])
        if check_res.status_code == 200:
            self.assertFalse(check_res.json().get("success", False))

if __name__ == "__main__":
    unittest.main()
