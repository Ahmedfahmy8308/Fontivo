#!/usr/bin/env python3
"""
Test Suite: Fuzz and Stress Testing for Fontivo Core Server
Tests:
  - Corrupt font upload/drop and import folder handling
  - Invalid/corrupt font activation safety and error reporting
  - High-throughput bulk font activation API stress
  - Graceful degradation and responsiveness under extreme concurrent load
"""

import os
import sys
import time
import json
import shutil
import tempfile
import unittest
import subprocess
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

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
            os.path.join(root, "Fontivo-App", "core", "target", "release", "Fontivo.exe"),
            os.path.join(root, "Fontivo-App", "core", "target", "debug", "Fontivo.exe"),
            os.path.join(root, "core", "target", "debug", "Fontivo.exe"),
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
        if os.path.exists(os.path.join(curr, "Fontivo-App")):
            return curr
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent
    return os.getcwd()


class TestFuzzAndStress(unittest.TestCase):
    server_process = None

    @classmethod
    def setUpClass(cls):
        # 1. Check if daemon is already running
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
            stderr=subprocess.DEVNULL,
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

    def test_01_corrupt_font_upload_and_import_handling(self):
        """Test import-folder endpoint with corrupted/malformed font files does not crash."""
        temp_dir = tempfile.mkdtemp(prefix="fontivo_fuzz_import_")
        try:
            # 1. 0-byte font file
            with open(os.path.join(temp_dir, "empty_corrupt.ttf"), "wb") as f:
                f.write(b"")

            # 2. Truncated header (2 bytes)
            with open(os.path.join(temp_dir, "truncated.otf"), "wb") as f:
                f.write(b"OT")

            # 3. Invalid magic signature
            with open(os.path.join(temp_dir, "fake_magic.ttf"), "wb") as f:
                f.write(b"NOT_A_VALID_FONT_SIGNATURE_AT_ALL!!")

            # 4. Corrupted table length (valid header followed by corrupted offsets)
            corrupt_table_bytes = (
                b"\x00\x01\x00\x00\x00\x01\x00\x10\x00\x00\x00\x00"
                b"head\x12\x34\x56\x78\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF"
            )
            with open(os.path.join(temp_dir, "corrupt_table.ttf"), "wb") as f:
                f.write(corrupt_table_bytes)

            # 5. Pseudo-random fuzz buffer with WOFF extension
            with open(os.path.join(temp_dir, "fuzz_random.woff"), "wb") as f:
                f.write(os.urandom(2048))

            # Send import request to the API
            payload = {"folderPath": temp_dir}
            res = requests.post(f"{BASE_URL}/api/import-folder", json=payload, timeout=10)
            self.assertEqual(res.status_code, 200, "Import endpoint must return 200 OK")
            data = res.json()
            self.assertTrue(data.get("success"), f"Import response indicated failure: {data}")

            # Verify server is still completely responsive after processing corrupted fonts
            stats_res = requests.get(f"{BASE_URL}/api/stats", timeout=5)
            self.assertEqual(stats_res.status_code, 200)
            stats_data = stats_res.json()
            self.assertGreater(stats_data.get("total", 0), 0)
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_02_corrupt_font_activation_error_handling(self):
        """Test activating non-existent, negative, or malformed font IDs fails gracefully."""
        # 1. Non-existent ID
        res1 = requests.post(f"{BASE_URL}/api/activate", json={"id": 99999999}, timeout=5)
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertFalse(data1.get("success"), "Non-existent font ID activation must return success: false")
        self.assertIn("not found", data1.get("error", "").lower())

        # 2. Negative ID
        res2 = requests.post(f"{BASE_URL}/api/activate", json={"id": -10}, timeout=5)
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertFalse(data2.get("success"))

        # 3. Malformed JSON payload
        res3 = requests.post(
            f"{BASE_URL}/api/activate",
            data="NOT_JSON_DATA",
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
        self.assertEqual(res3.status_code, 200)
        data3 = res3.json()
        self.assertFalse(data3.get("success"))

    def test_03_bulk_font_activation_api_stress(self):
        """Test bulk activation and deactivation of 100+ font IDs under high throughput."""
        # Fetch available font IDs
        fonts_res = requests.get(f"{BASE_URL}/api/fonts?limit=25", timeout=5)
        self.assertEqual(fonts_res.status_code, 200)
        fonts = fonts_res.json().get("fonts", [])
        self.assertGreater(len(fonts), 0, "Font library must not be empty")

        valid_ids = [f["id"] for f in fonts]
        # Construct large batch with 100 items (valid IDs repeated under high throughput)
        batch_ids = [valid_ids[i % len(valid_ids)] for i in range(100)]

        # 1. Bulk Activate Stress
        start_act = time.perf_counter()
        act_res = requests.post(f"{BASE_URL}/api/activate-batch", json={"ids": batch_ids}, timeout=10)
        act_duration = time.perf_counter() - start_act

        self.assertEqual(act_res.status_code, 200)
        act_data = act_res.json()
        self.assertEqual(act_data.get("totalRequested"), len(batch_ids))
        self.assertIn("succeeded", act_data)
        self.assertIn("failed", act_data)
        self.assertIn("alreadyInState", act_data)
        self.assertLess(act_duration, 5.0, f"Batch activation took too long: {act_duration:.2f}s")

        # 2. Bulk Deactivate Stress
        start_deact = time.perf_counter()
        deact_res = requests.post(f"{BASE_URL}/api/deactivate-batch", json={"ids": batch_ids}, timeout=10)
        deact_duration = time.perf_counter() - start_deact

        self.assertEqual(deact_res.status_code, 200)
        deact_data = deact_res.json()
        self.assertEqual(deact_data.get("totalRequested"), len(batch_ids))
        self.assertLess(deact_duration, 5.0, f"Batch deactivation took too long: {deact_duration:.2f}s")

    def test_04_graceful_degradation_under_extreme_load(self):
        """Test server maintains 100% reliability under concurrent multithreaded request bursts."""
        endpoints = [
            ("GET", f"{BASE_URL}/api/stats", None),
            ("GET", f"{BASE_URL}/api/fonts?limit=20", None),
            ("GET", f"{BASE_URL}/api/families", None),
            ("GET", f"{BASE_URL}/api/system/health", None),
            ("POST", f"{BASE_URL}/api/activate-batch", {"ids": [1, 2]}),
            ("POST", f"{BASE_URL}/api/deactivate-batch", {"ids": [1, 2]}),
        ]

        total_requests = 60
        tasks = [endpoints[i % len(endpoints)] for i in range(total_requests)]

        def send_request(item):
            method, url, payload = item
            t0 = time.perf_counter()
            if method == "GET":
                resp = requests.get(url, timeout=5)
            else:
                resp = requests.post(url, json=payload, timeout=5)
            elapsed_ms = (time.perf_counter() - t0) * 1000
            return resp.status_code, elapsed_ms

        results = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(send_request, t) for t in tasks]
            for f in as_completed(futures):
                results.append(f.result())

        self.assertEqual(len(results), total_requests)
        status_codes = [r[0] for r in results]
        latencies = [r[1] for r in results]

        # Assert all 60 concurrent requests succeeded with 200 OK
        failed_count = sum(1 for code in status_codes if code != 200)
        self.assertEqual(
            failed_count, 0,
            f"{failed_count}/{total_requests} requests failed during concurrent stress test"
        )

        avg_latency = sum(latencies) / len(latencies)
        max_latency = max(latencies)
        print(f"\n[Stress Test] 60 Concurrent Requests: Avg Latency = {avg_latency:.2f}ms, Max = {max_latency:.2f}ms")
        self.assertLess(avg_latency, 1500, f"Average latency too high: {avg_latency:.2f}ms")

        # Post-test health audit: server must still be responsive
        final_check = requests.get(f"{BASE_URL}/api/stats", timeout=3)
        self.assertEqual(final_check.status_code, 200)


if __name__ == "__main__":
    unittest.main()
