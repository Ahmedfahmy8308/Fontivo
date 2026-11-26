#!/usr/bin/env python3
"""
Test Suite: Adobe Creative Cloud Bridge & Socket Protocol
Tests port 27715 auto-activation listener:
  - Raw TCP socket connection & HTTP/1.1 handshake
  - GET / (app=Fontivo, version=1.0.0, fontBaseCompatible=true)
  - GET /status (running=true, activeFonts count)
  - POST /activate (by family e.g. 'Cairo' or 'Amiri', returns success=true)
  - POST /deactivate (deactivates activated font, returns success=true)
  - POST /activate (unknown/non-existent font family gracefully handled, success=false)
  - Security origin validation (Origin: https://malicious.com rejected with 403 Forbidden)
"""

import os
import sys
import time
import json
import socket
import unittest
import subprocess
import requests

API_HOST = "127.0.0.1"
API_PORT = 3920
ADOBE_PORT = 27715
BASE_URL = f"http://{API_HOST}:{API_PORT}"
ADOBE_URL = f"http://{API_HOST}:{ADOBE_PORT}"

def find_fontivo_exe():
    curr = os.path.abspath(os.path.dirname(__file__))
    candidates = []
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

class TestAdobeBridge(unittest.TestCase):
    server_process = None

    @classmethod
    def setUpClass(cls):
        try:
            r = requests.get(f"{ADOBE_URL}/", timeout=1)
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
                r = requests.get(f"{ADOBE_URL}/", timeout=1)
                if r.status_code == 200:
                    server_ready = True
                    break
            except Exception:
                time.sleep(0.5)

        if not server_ready:
            cls.tearDownClass()
            raise RuntimeError(f"Adobe CC Bridge server failed to boot within 15s at {ADOBE_URL}")

    @classmethod
    def tearDownClass(cls):
        if cls.server_process:
            cls.server_process.terminate()
            try:
                cls.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.server_process.kill()
            cls.server_process = None

    def test_01_adobe_tcp_raw_socket(self):
        """Verify raw TCP connection and HTTP/1.1 protocol response on port 27715."""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3)
        try:
            s.connect((API_HOST, ADOBE_PORT))
            s.sendall(b"GET / HTTP/1.1\r\nHost: 127.0.0.1:27715\r\n\r\n")
            raw_resp = s.recv(2048).decode("utf-8", errors="ignore")
            self.assertIn("HTTP/1.1 200 OK", raw_resp, "Adobe bridge must return 200 OK over TCP")
        finally:
            s.close()

    def test_02_adobe_handshake_root(self):
        """Verify root discovery endpoint GET / returns Fontivo compatibility metadata."""
        res = requests.get(f"{ADOBE_URL}/", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("app"), "Fontivo")
        self.assertIn(data.get("version"), ["1.0.0", "2.0.0"])
        self.assertTrue(data.get("fontBaseCompatible"))

    def test_03_adobe_bridge_status(self):
        """Verify GET /status returns bridge health and active fonts count."""
        res = requests.get(f"{ADOBE_URL}/status", timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("running"), "Bridge status must report running: true")
        self.assertIn("activeFonts", data)
        self.assertIsInstance(data.get("activeFonts"), int)

    def test_04_adobe_font_auto_activation_and_deactivation(self):
        """Verify POST /activate auto-activates font by family and POST /deactivate deactivates it."""
        act_res = requests.post(f"{ADOBE_URL}/activate", json={"family": "Cairo"}, timeout=5)
        self.assertEqual(act_res.status_code, 200)
        act_data = act_res.json()
        self.assertTrue(act_data.get("success"), f"Adobe font activation failed: {act_data}")
        self.assertIn("font", act_data)

        deact_res = requests.post(f"{ADOBE_URL}/deactivate", json={"family": "Cairo"}, timeout=5)
        self.assertEqual(deact_res.status_code, 200)
        deact_data = deact_res.json()
        self.assertTrue(deact_data.get("success"), f"Adobe font deactivation failed: {deact_data}")

    def test_05_adobe_unknown_font_graceful_handling(self):
        """Verify POST /activate with unknown font gracefully reports not found without failure."""
        res = requests.post(f"{ADOBE_URL}/activate", json={"family": "NonExistentFontXYZ999"}, timeout=5)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data.get("success"))
        self.assertIn("not found", data.get("message", "").lower())

    def test_06_adobe_origin_security_validation(self):
        """Verify cross-origin requests from untrusted origins are rejected with 403 Forbidden."""
        malicious_headers = {"Origin": "https://malicious-site.com"}
        res = requests.get(f"{ADOBE_URL}/", headers=malicious_headers, timeout=5)
        self.assertEqual(res.status_code, 403, "Requests from untrusted origin must be rejected with 403 Forbidden")

if __name__ == "__main__":
    unittest.main()
