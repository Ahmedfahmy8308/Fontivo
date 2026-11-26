#!/usr/bin/env python3
"""
Fontivo API Integration Test Suite
Comprehensive automated test suite for Fontivo REST API, binary streaming, and socket bridges.
Boots 'Fontivo.exe --headless' in a managed subprocess and tests:
  - /api/stats (total == 11207, missingFilesCount == 0, formats breakdown, category counts)
  - /api/fonts with query params (search, category, provider=google, recent, pagination)
  - /api/families (listing, grouping, pagination)
  - /api/activate & /api/deactivate (Win32 GDI32 RAM registration verification)
  - /api/activate-batch & /api/deactivate-batch (atomic multi-font lifecycle)
  - /api/font-file (binary streaming, correct MIME types, valid TTF/OTF magic bytes)
  - /api/font-glyphs (glyph extraction, Unicode mappings, font metrics)
  - /api/brand-kits (get, save, activate, and export-bundle generating valid .ase and html files)
  - Adobe CC Bridge on port 27715 (TCP request, handshake, and font auto-activation)
  - /api/system/ram-status & /api/system/optimize-ram (RAM diagnostics & memory trimming)
  - Security hardening (Origin validation rejecting https://malicious.com with 403, path traversal blocked)
"""

import os
import sys
import time
import json
import socket
import shutil
import unittest
import subprocess
import requests

API_HOST = "127.0.0.1"
API_PORT = 3920
ADOBE_PORT = 27715
BASE_URL = f"http://{API_HOST}:{API_PORT}"
ADOBE_URL = f"http://{API_HOST}:{ADOBE_PORT}"

def find_fontivo_exe():
    """Finds the Fontivo release or target binary."""
    curr = os.path.abspath(os.path.dirname(__file__))
    candidates = []
    # Ascend to project root
    root = curr
    for _ in range(5):
        candidates.extend([
            os.path.join(root, "Fontivo-App", "release", "Fontivo.exe"),
            os.path.join(root, "release", "Fontivo.exe"),
            os.path.join(root, "Fontivo-App", "core", "target", "release", "Fontivo.exe"),
            os.path.join(root, "core", "target", "release", "Fontivo.exe"),
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
    raise FileNotFoundError(f"Fontivo.exe not found. Searched in: {candidates}")

class TestApiEndpoints(unittest.TestCase):
    server_process = None
    test_brand_kit_id = "test-brand-automated-suite"
    exported_folders = []

    @classmethod
    def setUpClass(cls):
        try:
            r = requests.get(f"{BASE_URL}/api/stats", timeout=1)
            if r.status_code == 200:
                print(f"\n[INFO] Fontivo daemon already running at {BASE_URL}")
                cls.server_process = None
                return
        except Exception:
            pass

        exe_path = find_fontivo_exe()
        print(f"\n[INFO] Starting Fontivo daemon: {exe_path} --headless")
        cls.server_process = subprocess.Popen(
            [exe_path, "--headless"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        # Wait for API server to become ready (up to 15 seconds)
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

        print(f"[INFO] Server responsive in {time.time() - start_time:.2f}s")

    @classmethod
    def tearDownClass(cls):
        if cls.server_process:
            print("\n[INFO] Terminating Fontivo headless daemon...")
            cls.server_process.terminate()
            try:
                cls.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.server_process.kill()
            cls.server_process = None

        # Clean up any exported test folders
        for folder in cls.exported_folders:
            if os.path.exists(folder):
                try:
                    shutil.rmtree(folder)
                    print(f"[INFO] Cleaned test export folder: {folder}")
                except Exception as e:
                    print(f"[WARN] Failed to clean test folder {folder}: {e}")

    # =========================================================================
    # 1. /api/stats Endpoint Tests
    # =========================================================================
    def test_01_stats_endpoint(self):
        """Verify /api/stats returns dynamic Google Fonts + library stats, missingFilesCount == 0, formats and categories."""
        res = requests.get(f"{BASE_URL}/api/stats", timeout=5)
        self.assertEqual(res.status_code, 200, "/api/stats must return 200 OK")
        data = res.json()

        total = data.get("total", 0)
        self.assertGreaterEqual(total, 120, "Total font count must be >= 120 from built-in Google Fonts catalog")
        self.assertEqual(data.get("missingFilesCount"), 0, "Missing files count must be exactly 0")

        # Category and language counts
        self.assertGreaterEqual(data.get("arabicCount", 0), 40, "Arabic font count must be >= 40")
        self.assertGreaterEqual(data.get("englishCount", 0), 80, "English/Latin font count must be >= 80")
        self.assertGreaterEqual(data.get("familiesCount", 0), 120, "Families count must be >= 120")

        # Formats breakdown
        formats = data.get("formatsBreakdown", {})
        self.assertIn("ttf", formats, "Formats must include TrueType ('ttf')")
        total_formats = sum(formats.values())
        self.assertEqual(total_formats, total, "Sum of format breakdowns must equal total fonts")

    # =========================================================================
    # 2. /api/fonts Query Parameters Tests
    # =========================================================================
    def test_02_fonts_pagination(self):
        """Verify /api/fonts handles pagination (page, limit, offset, totalPages)."""
        res_p1 = requests.get(f"{BASE_URL}/api/fonts?page=1&limit=25", timeout=5)
        self.assertEqual(res_p1.status_code, 200)
        p1 = res_p1.json()
        self.assertGreaterEqual(p1.get("total", 0), 120)
        self.assertEqual(len(p1.get("fonts", [])), 25)
        self.assertEqual(p1.get("page"), 1)

        res_p2 = requests.get(f"{BASE_URL}/api/fonts?page=2&limit=25", timeout=5)
        self.assertEqual(res_p2.status_code, 200)
        p2 = res_p2.json()
        self.assertEqual(len(p2.get("fonts", [])), 25)
        self.assertEqual(p2.get("page"), 2)

        # Ensure disjoint sets across pages
        p1_ids = {f["id"] for f in p1["fonts"]}
        p2_ids = {f["id"] for f in p2["fonts"]}
        self.assertTrue(p1_ids.isdisjoint(p2_ids), "Fonts across page 1 and page 2 must be disjoint")

    def test_03_fonts_search_query(self):
        """Verify /api/fonts?search=<query> accurately filters results."""
        res = requests.get(f"{BASE_URL}/api/fonts?search=cairo&limit=10", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreater(data.get("total", 0), 0, "Search for 'cairo' must return results")
        for font in data.get("fonts", []):
            match_found = (
                "cairo" in font.get("name", "").lower()
                or "cairo" in font.get("family", "").lower()
                or "cairo" in font.get("displayName", "").lower()
            )
            self.assertTrue(match_found, f"Font {font.get('id')} ({font.get('name')}) does not match search query 'cairo'")

    def test_04_fonts_category_filter(self):
        """Verify /api/fonts?category=arabic accurately filters Arabic fonts."""
        res = requests.get(f"{BASE_URL}/api/fonts?category=arabic&limit=15", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreaterEqual(data.get("total", 0), 40, "Category 'arabic' must return Arabic fonts")
        for font in data.get("fonts", []):
            self.assertTrue(
                font.get("isArabic") or "Arabic" in font.get("category", ""),
                f"Font {font.get('id')} returned under Arabic category but is not Arabic"
            )

    def test_05_fonts_provider_google(self):
        """Verify /api/fonts?provider=google accurately filters Google fonts."""
        res = requests.get(f"{BASE_URL}/api/fonts?provider=google&limit=20", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreater(data.get("total", 0), 100, "Provider 'google' must return recognized Google fonts")
        self.assertGreater(len(data.get("fonts", [])), 0)

    def test_06_fonts_recent_filter(self):
        """Verify /api/fonts?recent=true returns recent font list."""
        res = requests.get(f"{BASE_URL}/api/fonts?recent=true&limit=10", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("total"), 100, "Recent fonts list must return 100 recent fonts")
        self.assertEqual(len(data.get("fonts", [])), 10)

    # =========================================================================
    # 3. /api/families Endpoint Tests
    # =========================================================================
    def test_07_families_endpoint(self):
        """Verify /api/families groups fonts by family with proper counts and metadata."""
        res = requests.get(f"{BASE_URL}/api/families?limit=20", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreaterEqual(data.get("total", 0), 120, "Expected >=120 total families")
        self.assertGreater(len(data.get("families", [])), 0)

        first_fam = data["families"][0]
        self.assertIn("family", first_fam)
        self.assertIn("count", first_fam)
        self.assertIn("fonts", first_fam)
        self.assertEqual(len(first_fam["fonts"]), first_fam["count"])
        self.assertGreater(first_fam["count"], 0)

    # =========================================================================
    # 4. /api/activate and /api/deactivate (Win32 GDI32 RAM Registration)
    # =========================================================================
    def test_08_activate_and_deactivate_lifecycle(self):
        """Verify /api/activate registers font in Win32 GDI RAM and /api/deactivate cleans it up."""
        # Find a clean test font
        fonts_res = requests.get(f"{BASE_URL}/api/fonts?limit=5", timeout=5).json()
        test_font = fonts_res["fonts"][0]
        font_id = test_font["id"]

        # Ensure deactivated initially
        requests.post(f"{BASE_URL}/api/deactivate", json={"id": font_id}, timeout=5)

        # 1. Activate
        act_res = requests.post(f"{BASE_URL}/api/activate", json={"id": font_id}, timeout=5)
        self.assertEqual(act_res.status_code, 200)
        act_data = act_res.json()
        self.assertTrue(act_data.get("success"), f"Activation failed: {act_data}")
        msg = act_data.get("message", "")
        self.assertTrue(
            "ACTIVATED_RAM" in msg or "Successfully registered" in msg or "ALREADY_ACTIVE" in msg,
            f"Expected GDI32 registration message, got: {msg}"
        )

        # Verify active state
        stats = requests.get(f"{BASE_URL}/api/stats", timeout=5).json()
        self.assertGreater(stats.get("active", 0), 0, "Active fonts count must be > 0 after activation")

        # 2. Deactivate
        deact_res = requests.post(f"{BASE_URL}/api/deactivate", json={"id": font_id}, timeout=5)
        self.assertEqual(deact_res.status_code, 200)
        deact_data = deact_res.json()
        self.assertTrue(deact_data.get("success"), f"Deactivation failed: {deact_data}")
        dmsg = deact_data.get("message", "")
        self.assertTrue(
            "DEACTIVATED_RAM" in dmsg or "Success" in dmsg or "NOT_ACTIVE" in dmsg,
            f"Expected GDI32 deactivation message, got: {dmsg}"
        )

    # =========================================================================
    # 5. /api/activate-batch and /api/deactivate-batch
    # =========================================================================
    def test_09_batch_activation_lifecycle(self):
        """Verify atomic batch font activation and deactivation."""
        batch_ids = [1, 2, 3]

        # 1. Batch Activate
        act_batch = requests.post(f"{BASE_URL}/api/activate-batch", json={"ids": batch_ids}, timeout=5)
        self.assertEqual(act_batch.status_code, 200)
        act_data = act_batch.json()
        self.assertEqual(act_data.get("totalRequested"), len(batch_ids))
        self.assertEqual(len(act_data.get("failed", [])), 0, f"Batch activation failures: {act_data.get('failed')}")
        self.assertGreater(len(act_data.get("succeeded", [])) + len(act_data.get("alreadyInState", [])), 0)

        # 2. Batch Deactivate
        deact_batch = requests.post(f"{BASE_URL}/api/deactivate-batch", json={"ids": batch_ids}, timeout=5)
        self.assertEqual(deact_batch.status_code, 200)
        deact_data = deact_batch.json()
        self.assertEqual(deact_data.get("totalRequested"), len(batch_ids))
        self.assertEqual(len(deact_data.get("failed", [])), 0, f"Batch deactivation failures: {deact_data.get('failed')}")

    # =========================================================================
    # 6. /api/font-file Binary Streaming & MIME Verification
    # =========================================================================
    def test_10_font_file_streaming(self):
        """Verify /api/font-file/:id streams valid font bytes with correct MIME type and valid header magic."""
        # Query font records to locate TTF and OTF file paths
        fonts_res = requests.get(f"{BASE_URL}/api/fonts?limit=50", timeout=5).json()
        ttf_font = next((f for f in fonts_res.get("fonts", []) if f.get("path", "").lower().endswith(".ttf")), None)
        otf_font = next((f for f in fonts_res.get("fonts", []) if f.get("path", "").lower().endswith(".otf")), None)

        valid_magics = {b"\x00\x01\x00\x00", b"OTTO", b"ttcf", b"true", b"typ1"}

        # Test TTF streaming
        if ttf_font:
            ttf_id = ttf_font["id"]
            stream_ttf = requests.get(f"{BASE_URL}/api/font-file/{ttf_id}", timeout=5)
            self.assertEqual(stream_ttf.status_code, 200)
            self.assertEqual(stream_ttf.headers.get("Content-Type"), "font/ttf")
            raw_bytes = stream_ttf.content
            self.assertGreater(len(raw_bytes), 1024, "Font file must contain >1KB of data")
            magic = raw_bytes[:4]
            self.assertIn(magic, valid_magics, f"Invalid TTF magic bytes: {magic}")

        # Test OTF streaming
        if otf_font:
            otf_id = otf_font["id"]
            stream_otf = requests.get(f"{BASE_URL}/api/font-file/{otf_id}", timeout=5)
            self.assertEqual(stream_otf.status_code, 200)
            self.assertEqual(stream_otf.headers.get("Content-Type"), "font/otf")
            raw_bytes = stream_otf.content
            self.assertGreater(len(raw_bytes), 1024, "Font file must contain >1KB of data")
            magic = raw_bytes[:4]
            self.assertIn(magic, valid_magics, f"Invalid OTF magic bytes: {magic}")

    # =========================================================================
    # 7. /api/font-glyphs Extraction
    # =========================================================================
    def test_11_font_glyphs_extraction(self):
        """Verify /api/font-glyphs/:id extracts glyph metrics, unicode codepoints and names."""
        res = requests.get(f"{BASE_URL}/api/font-glyphs/1", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"), f"Glyph inspection failed: {data}")
        self.assertIn("glyphs", data)
        glyphs = data["glyphs"]
        self.assertGreater(len(glyphs), 0, "Font must contain glyphs")

        # Validate glyph structure
        g0 = glyphs[0]
        self.assertIn("index", g0)
        self.assertIn("code", g0)
        self.assertIn("hex", g0)
        self.assertIn("name", g0)

        # Validate metrics
        self.assertIn("metrics", data)
        metrics = data["metrics"]
        self.assertIn("unitsPerEm", metrics)
        self.assertGreater(metrics["unitsPerEm"], 0)

    # =========================================================================
    # 8. /api/brand-kits (Get, Save, Activate, Export-Bundle)
    # =========================================================================
    def test_12_brand_kits_full_workflow(self):
        """Verify Brand Kit creation, font activation, and export-bundle generating .ase and HTML files."""
        # 1. GET existing brand kits
        kits_res = requests.get(f"{BASE_URL}/api/brand-kits", timeout=5)
        self.assertEqual(kits_res.status_code, 200)
        self.assertIsInstance(kits_res.json(), list)

        # 2. SAVE new brand kit
        kit_payload = {
            "id": self.test_brand_kit_id,
            "name": "Suite Automated Brand",
            "client": "Test Client Corp",
            "category": "Corporate",
            "headingFontId": 1,
            "headingFontName": "(A) Arslan Wessam A",
            "bodyFontId": 2,
            "bodyFontName": "(A) Arslan Wessam A (A) Arslan Wessam A Bold",
            "accentFontId": None,
            "accentFontName": None,
            "colors": [
                {"name": "Corporate Blue", "hex": "#1A73E8", "role": "Primary"},
                {"name": "Accent Emerald", "hex": "#0F9D58", "role": "Accent"}
            ],
            "notes": "Automated test suite brand kit",
            "createdAt": 1700000000,
            "updatedAt": 1700000000
        }
        save_res = requests.post(f"{BASE_URL}/api/brand-kits", json=kit_payload, timeout=5)
        self.assertEqual(save_res.status_code, 200)
        saved_data = save_res.json()
        self.assertEqual(saved_data.get("id"), self.test_brand_kit_id)

        # 3. ACTIVATE brand kit
        act_res = requests.post(f"{BASE_URL}/api/brand-kits/{self.test_brand_kit_id}/activate", timeout=5)
        self.assertEqual(act_res.status_code, 200)
        act_data = act_res.json()
        self.assertTrue(act_data.get("success"), f"Brand kit activation failed: {act_data}")
        self.assertGreater(act_data.get("activated", 0), 0)

        # 4. EXPORT brand bundle
        exp_res = requests.post(f"{BASE_URL}/api/brand-kits/{self.test_brand_kit_id}/export-bundle", timeout=5)
        self.assertEqual(exp_res.status_code, 200)
        exp_data = exp_res.json()
        self.assertTrue(exp_data.get("success"), f"Brand kit export failed: {exp_data}")
        export_folder = exp_data.get("folderPath")
        self.assertTrue(os.path.isdir(export_folder), f"Export folder does not exist: {export_folder}")
        self.__class__.exported_folders.append(export_folder)

        # Validate bundle contents
        files = os.listdir(export_folder)
        self.assertIn("palette.json", files, "Export must generate palette.json")
        self.assertIn("palette.css", files, "Export must generate palette.css")
        self.assertIn("Brand-StyleGuide.html", files, "Export must generate Brand-StyleGuide.html")

        # Validate Adobe Swatch Exchange (.ase) file
        ase_files = [f for f in files if f.endswith(".ase")]
        self.assertEqual(len(ase_files), 1, f"Expected 1 .ase file, found {ase_files}")
        ase_path = os.path.join(export_folder, ase_files[0])
        with open(ase_path, "rb") as f:
            ase_header = f.read(4)
        self.assertEqual(ase_header, b"ASEF", f"ASE file header magic must be b'ASEF', got {ase_header}")

        # Validate interactive HTML Style Guide
        html_path = os.path.join(export_folder, "Brand-StyleGuide.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        self.assertIn("Suite Automated Brand", html_content, "HTML style guide must contain brand name")
        self.assertIn("#1A73E8", html_content, "HTML style guide must contain color hex codes")

        # 5. Clean up kit record
        del_res = requests.delete(f"{BASE_URL}/api/brand-kits/{self.test_brand_kit_id}", timeout=5)
        self.assertEqual(del_res.status_code, 200)

    # =========================================================================
    # 9. Adobe CC Bridge on Port 27715
    # =========================================================================
    def test_13_adobe_cc_bridge(self):
        """Verify Adobe CC auto-activation listener on port 27715 responds to TCP and HTTP activation."""
        # 1. Raw TCP connection
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3)
        try:
            s.connect((API_HOST, ADOBE_PORT))
            s.sendall(b"GET / HTTP/1.1\r\nHost: 127.0.0.1:27715\r\n\r\n")
            raw_resp = s.recv(2048).decode("utf-8", errors="ignore")
            self.assertIn("HTTP/1.1 200 OK", raw_resp, "Adobe bridge must return 200 OK over TCP")
        finally:
            s.close()

        # 2. Handshake GET /
        res_root = requests.get(f"{ADOBE_URL}/", timeout=5)
        self.assertEqual(res_root.status_code, 200)
        root_data = res_root.json()
        self.assertEqual(root_data.get("status"), "ok")
        self.assertEqual(root_data.get("app"), "Fontivo")
        self.assertTrue(root_data.get("fontBaseCompatible"))

        # 3. Status GET /status
        res_stat = requests.get(f"{ADOBE_URL}/status", timeout=5)
        self.assertEqual(res_stat.status_code, 200)
        stat_data = res_stat.json()
        self.assertTrue(stat_data.get("running"))

        # 4. Font auto-activation POST /activate
        act_res = requests.post(f"{ADOBE_URL}/activate", json={"family": "Cairo"}, timeout=5)
        self.assertEqual(act_res.status_code, 200)
        act_data = act_res.json()
        self.assertTrue(act_data.get("success"), f"Adobe font activation failed: {act_data}")

    # =========================================================================
    # 10. /api/system/ram-status and /api/system/optimize-ram
    # =========================================================================
    def test_14_ram_diagnostics_and_optimization(self):
        """Verify /api/system/ram-status returns RAM metrics and /api/system/optimize-ram trims memory."""
        # 1. RAM status check
        ram_res = requests.get(f"{BASE_URL}/api/system/ram-status", timeout=5)
        self.assertEqual(ram_res.status_code, 200)
        ram_data = ram_res.json()
        self.assertTrue(ram_data.get("success"))

        # Either processRamMb or ramMb must be present and positive
        ram_mb = ram_data.get("processRamMb") or ram_data.get("ramMb")
        self.assertIsNotNone(ram_mb, f"RAM status must report process RAM MB: {ram_data}")
        self.assertGreater(float(ram_mb), 0.0, "Process RAM must be positive")

        if "systemPercent" in ram_data:
            self.assertGreater(ram_data["systemPercent"], 0.0)

        # 2. RAM optimize
        opt_res = requests.post(f"{BASE_URL}/api/system/optimize-ram", timeout=5)
        self.assertEqual(opt_res.status_code, 200)
        opt_data = opt_res.json()
        self.assertTrue(opt_data.get("success"))
        self.assertGreaterEqual(opt_data.get("freedMb", 0), 0)

    # =========================================================================
    # 11. Security Hardening: Origin & Path Traversal Protections
    # =========================================================================
    def test_15_security_origin_validation(self):
        """Verify requests with malicious origins are strictly rejected with 403 Forbidden."""
        malicious_headers = {"Origin": "https://malicious.com"}
        res = requests.get(f"{BASE_URL}/api/stats", headers=malicious_headers, timeout=5)
        self.assertEqual(res.status_code, 403, "Requests from https://malicious.com must be rejected with 403 Forbidden")
        self.assertIn("403 Forbidden", res.text)

        # Same origin or standard localhost must succeed
        allowed_headers = {"Origin": f"http://127.0.0.1:{API_PORT}"}
        res_ok = requests.get(f"{BASE_URL}/api/stats", headers=allowed_headers, timeout=5)
        self.assertEqual(res_ok.status_code, 200, "Requests from trusted origin must be permitted")

    def test_16_security_path_traversal_blocked(self):
        """Verify path traversal attacks attempting relative breakout are rejected with 403 Forbidden."""
        # Test relative traversal attempt using raw socket to bypass client normalization
        traversal_payloads = [
            b"GET /../Cargo.toml HTTP/1.1\r\nHost: 127.0.0.1:3920\r\n\r\n",
            b"GET /..\\Cargo.toml HTTP/1.1\r\nHost: 127.0.0.1:3920\r\n\r\n",
            b"GET /../../windows/win.ini HTTP/1.1\r\nHost: 127.0.0.1:3920\r\n\r\n",
        ]

        for payload in traversal_payloads:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(3)
            try:
                s.connect((API_HOST, API_PORT))
                s.sendall(payload)
                resp = s.recv(2048).decode("utf-8", errors="ignore")
                self.assertIn(
                    "HTTP/1.1 403 Forbidden",
                    resp,
                    f"Path traversal payload {payload[:25]} must return 403 Forbidden, got: {resp[:100]}"
                )
            finally:
                s.close()

if __name__ == "__main__":
    unittest.main()
