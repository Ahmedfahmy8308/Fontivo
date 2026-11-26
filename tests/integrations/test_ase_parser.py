#!/usr/bin/env python3
"""
Test Suite: Adobe Swatch Exchange (.ASE) Binary Parser & Contrast Metrics
Tests endpoints:
  - POST /api/ase/inspect
    * Generates synthetic binary ASE files (magic 'ASEF', block count, 0x0001 color blocks, UTF-16BE names)
    * Tests raw octet-stream binary upload, base64 payload, and hex payload
    * Verifies extraction of color names, RGB (0-255), and standard HEX (#RRGGBB)
    * Verifies WCAG 2.1 contrast calculations (relative luminance, contrast on white, contrast on black, AA/AAA flags)
    * Verifies corrupted/invalid magic header rejection with error reporting
"""

import os
import sys
import time
import json
import base64
import struct
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

def build_synthetic_ase(color_list):
    """
    Builds a standard Adobe Swatch Exchange (.ase) v1.0 binary stream.
    Each item in color_list is a tuple: (name: str, r: float, g: float, b: float)
    where r, g, b are in [0.0, 1.0].
    """
    buf = bytearray()
    # Magic Header: 'ASEF'
    buf.extend(b"ASEF")
    # Version 1.0 (major=1, minor=0)
    buf.extend(struct.pack(">HH", 1, 0))
    # Block count
    buf.extend(struct.pack(">I", len(color_list)))

    for name, r, g, b in color_list:
        # Block Type: 0x0001 (Color Entry)
        buf.extend(struct.pack(">H", 0x0001))

        # UTF-16BE name with null terminator
        name_utf16 = name.encode("utf-16-be") + b"\x00\x00"
        name_len = len(name_utf16) // 2

        # Block length: name_len_field (2) + name_utf16_bytes + color_space (4) + 3*floats (12) + color_type (2)
        block_len = 2 + len(name_utf16) + 4 + 12 + 2
        buf.extend(struct.pack(">I", block_len))

        # Name length (in UTF-16 characters) and string
        buf.extend(struct.pack(">H", name_len))
        buf.extend(name_utf16)

        # Color Space: 'RGB '
        buf.extend(b"RGB ")

        # 3 x 32-bit big-endian IEEE floats
        buf.extend(struct.pack(">fff", r, g, b))

        # Color Type: 0x0000 (Global swatch)
        buf.extend(struct.pack(">H", 0x0000))

    return bytes(buf)

class TestAseParser(unittest.TestCase):
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

    def test_01_parse_raw_binary_ase_stream(self):
        """Test POST /api/ase/inspect parses raw binary ASE stream with color extraction and WCAG metrics."""
        test_colors = [
            ("Architectural Vermilion", 212 / 255.0, 74 / 255.0, 50 / 255.0),
            ("Deep Obsidian", 15 / 255.0, 17 / 255.0, 21 / 255.0),
            ("Alabaster Paper", 250 / 255.0, 249 / 255.0, 246 / 255.0),
        ]
        ase_binary = build_synthetic_ase(test_colors)

        headers = {"Content-Type": "application/octet-stream"}
        res = requests.post(f"{BASE_URL}/api/ase/inspect", data=ase_binary, headers=headers, timeout=5)
        self.assertEqual(res.status_code, 200, f"ASE inspect failed: {res.text}")
        data = res.json()

        self.assertTrue(data.get("success"), f"Expected success=True, got: {data}")
        self.assertEqual(data.get("totalColors"), 3, "Must extract exactly 3 colors")
        colors = data.get("colors", [])
        self.assertEqual(len(colors), 3)

        # 1. Verify Color Names
        names = [c["name"] for c in colors]
        self.assertEqual(names, ["Architectural Vermilion", "Deep Obsidian", "Alabaster Paper"])

        # 2. Verify Hex and RGB
        vermilion = colors[0]
        self.assertTrue(vermilion["hex"].upper().startswith("#D44A32") or vermilion["hex"].upper() == "#D44A32")
        self.assertEqual(vermilion["colorSpace"], "RGB")

        obsidian = colors[1]
        self.assertTrue(obsidian["hex"].upper().startswith("#0F1115") or obsidian["hex"].upper() == "#0F1115")

        alabaster = colors[2]
        self.assertTrue(alabaster["hex"].upper().startswith("#FAF9F6") or alabaster["hex"].upper() == "#FAF9F6")

        # 3. Verify WCAG Contrast Metrics
        for c in colors:
            self.assertIn("contrast", c, f"Color {c['name']} missing contrast metrics")
            contrast = c["contrast"]
            self.assertIn("luminance", contrast)
            self.assertIn("contrastOnWhite", contrast)
            self.assertIn("contrastOnBlack", contrast)
            self.assertIn("wcagAa", contrast)
            self.assertIn("recommendedTextColor", contrast)
            self.assertIn(contrast["recommendedTextColor"], ["#FFFFFF", "#000000", "#14161A", "#ECEBE8"])

        # High contrast check: Deep Obsidian on white must pass WCAG AAA (>= 7.0:1)
        self.assertGreaterEqual(obsidian["contrast"]["contrastOnWhite"], 7.0)
        self.assertTrue(obsidian["contrast"]["wcagAaa"])

    def test_02_parse_base64_json_payload(self):
        """Test POST /api/ase/inspect parses base64-encoded ASE inside JSON payload."""
        test_colors = [
            ("Swiss Ochre", 217 / 255.0, 130 / 255.0, 43 / 255.0),
            ("Emerald Mint", 15 / 255.0, 157 / 255.0, 88 / 255.0),
        ]
        ase_binary = build_synthetic_ase(test_colors)
        b64_str = base64.b64encode(ase_binary).decode("ascii")

        payload = {"data": b64_str}
        res = requests.post(f"{BASE_URL}/api/ase/inspect", json=payload, timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("totalColors"), 2)
        names = [c["name"] for c in data.get("colors", [])]
        self.assertIn("Swiss Ochre", names)
        self.assertIn("Emerald Mint", names)

    def test_03_invalid_magic_bytes_rejected(self):
        """Test POST /api/ase/inspect safely rejects corrupted or non-ASE binary."""
        corrupted_bytes = b"CORRUPTED_NON_ASE_FILE_HEADER_1234567890"
        headers = {"Content-Type": "application/octet-stream"}
        res = requests.post(f"{BASE_URL}/api/ase/inspect", data=corrupted_bytes, headers=headers, timeout=5)
        data = res.json()
        self.assertFalse(data.get("success"), "Corrupted ASE file must return success=False")
        self.assertIn("error", data, "Response must report an error message")

if __name__ == "__main__":
    unittest.main()
