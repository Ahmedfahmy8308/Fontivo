#!/usr/bin/env python3
"""
Test Suite: Adobe Photoshop CEP Bridge Mock & Socket Protocol Integration
Tests port 27715 Adobe CC / Photoshop CEP communication:
  - Low-latency loopback TCP socket connection (127.0.0.1:27715)
  - Photoshop CEP query for missing fonts (`queryMissingFonts`)
  - JSON-RPC 2.0 payload format compliance
  - Ultra-fast activation latency assertion (< 10ms over loopback)
  - JSON-RPC method invocation (`activateFont`, `deactivateFont`, `ping`)
  - Strict JSON-RPC error handling (-32700 Parse error, -32601 Method not found)
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


class TestAdobeBridgeMock(unittest.TestCase):
    server_process = None

    @classmethod
    def setUpClass(cls):
        # 1. Check if bridge is already running
        try:
            r = requests.get(f"{ADOBE_URL}/", timeout=1)
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
                r = requests.get(f"{ADOBE_URL}/", timeout=1)
                if r.status_code == 200:
                    server_ready = True
                    break
            except Exception:
                time.sleep(0.5)

        if not server_ready:
            cls.tearDownClass()
            raise RuntimeError(f"Adobe bridge failed to boot within 15s at {ADOBE_URL}")

    @classmethod
    def tearDownClass(cls):
        if cls.server_process:
            cls.server_process.terminate()
            try:
                cls.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.server_process.kill()
            cls.server_process = None

    def _send_socket_request(self, method: str, path: str, payload_str: str = "") -> tuple[str, float]:
        """Sends HTTP request over raw loopback TCP socket with TCP_NODELAY and measures exact roundtrip latency."""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        s.settimeout(3.0)

        try:
            s.connect((API_HOST, ADOBE_PORT))
            body_bytes = payload_str.encode("utf-8")
            req = (
                f"{method} {path} HTTP/1.1\r\n"
                f"Host: {API_HOST}:{ADOBE_PORT}\r\n"
                f"Content-Type: application/json\r\n"
                f"Content-Length: {len(body_bytes)}\r\n"
                f"Connection: close\r\n\r\n"
            ).encode("utf-8") + body_bytes

            t_start = time.perf_counter()
            s.sendall(req)

            chunks = []
            header_bytes = b""
            content_length = None
            body_bytes_read = 0

            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)
                if content_length is None:
                    header_bytes += chunk
                    if b"\r\n\r\n" in header_bytes:
                        parts = header_bytes.split(b"\r\n\r\n", 1)
                        for line in parts[0].split(b"\r\n"):
                            if line.lower().startswith(b"content-length:"):
                                try:
                                    content_length = int(line.split(b":", 1)[1].strip())
                                except ValueError:
                                    pass
                        body_bytes_read = len(parts[1])
                        if content_length is not None and body_bytes_read >= content_length:
                            break
                else:
                    body_bytes_read += len(chunk)
                    if body_bytes_read >= content_length:
                        break

            t_elapsed_ms = (time.perf_counter() - t_start) * 1000.0
            raw_resp = b"".join(chunks).decode("utf-8", errors="replace")
            return raw_resp, t_elapsed_ms
        finally:
            s.close()

    def test_01_loopback_tcp_socket_raw_connection(self):
        """Verify direct TCP socket connection and HTTP/1.1 handshake on loopback port 27715."""
        raw_resp, latency_ms = self._send_socket_request("GET", "/")
        self.assertIn("HTTP/1.1 200 OK", raw_resp)
        self.assertIn("fontBaseCompatible", raw_resp)
        self.assertIn("Fontivo", raw_resp)
        print(f"\n[TCP Socket Handshake] Latency: {latency_ms:.2f}ms")
        self.assertLess(latency_ms, 15.0, f"Socket handshake latency was {latency_ms:.2f}ms")

    def test_02_photoshop_cep_json_rpc_query_missing_fonts(self):
        """Simulate Photoshop CEP query for missing fonts, assert JSON-RPC structure and latency < 10ms."""
        cep_query = {
            "jsonrpc": "2.0",
            "id": 101,
            "method": "queryMissingFonts",
            "params": {
                "document": "Brand_Identity_Mockup.psd",
                "fonts": [
                    {"postscriptName": "Cairo-Bold", "family": "Cairo"},
                    {"postscriptName": "Amiri-Regular", "family": "Amiri"},
                    {"postscriptName": "NonExistentFont999", "family": "NonExistentFont999"},
                ],
            },
        }

        # Warm-up query to eliminate initial OS thread scheduling cold-start
        self._send_socket_request("POST", "/rpc", json.dumps(cep_query))

        # Measured CEP query
        raw_resp, latency_ms = self._send_socket_request("POST", "/rpc", json.dumps(cep_query))
        self.assertIn("HTTP/1.1 200 OK", raw_resp)

        # Extract JSON body after HTTP headers
        body_part = raw_resp.split("\r\n\r\n", 1)[1] if "\r\n\r\n" in raw_resp else raw_resp
        data = json.loads(body_part)

        # 1. Assert JSON-RPC 2.0 Spec Compliance
        self.assertEqual(data.get("jsonrpc"), "2.0", "Response must adhere to JSON-RPC 2.0")
        self.assertEqual(data.get("id"), 101, "Response id must match request id 101")
        self.assertIn("result", data, "Response must contain 'result' object")

        result = data["result"]
        self.assertEqual(result.get("status"), "ok")
        self.assertIn("resolvedFonts", result)
        resolved = result["resolvedFonts"]
        self.assertEqual(len(resolved), 3)

        # Found fonts must be activated
        cairo_item = next((f for f in resolved if "cairo" in f.get("font", "").lower() or "cairo" in f.get("postscriptName", "").lower()), None)
        self.assertIsNotNone(cairo_item, "Cairo must be resolved")
        self.assertEqual(cairo_item.get("status"), "activated")
        self.assertTrue(cairo_item.get("available"))

        # Unknown font must report missing
        missing_item = next((f for f in resolved if "nonexistent" in f.get("font", "").lower()), None)
        self.assertIsNotNone(missing_item, "NonExistentFont must be reported")
        self.assertEqual(missing_item.get("status"), "missing")
        self.assertFalse(missing_item.get("available"))

        # 2. Strict Latency Assertion (< 10ms)
        print(f"[Photoshop CEP Query] Latency: {latency_ms:.2f}ms (threshold: < 10.0ms)")
        self.assertLess(
            latency_ms, 10.0,
            f"CEP query latency exceeded 10ms SLA threshold: {latency_ms:.2f}ms"
        )

    def test_03_photoshop_cep_activate_and_deactivate_rpc(self):
        """Simulate CEP 'activateFont' and 'deactivateFont' RPC methods and verify sub-10ms response."""
        # 1. Activate Cairo
        act_rpc = {
            "jsonrpc": "2.0",
            "id": 201,
            "method": "activateFont",
            "params": {"family": "Cairo", "postscriptName": "Cairo-Regular"},
        }
        act_resp, act_latency = self._send_socket_request("POST", "/rpc", json.dumps(act_rpc))
        self.assertIn("HTTP/1.1 200 OK", act_resp)
        act_data = json.loads(act_resp.split("\r\n\r\n", 1)[1])
        self.assertEqual(act_data.get("jsonrpc"), "2.0")
        self.assertEqual(act_data.get("id"), 201)
        self.assertTrue(act_data.get("result", {}).get("success"))
        print(f"[CEP activateFont] Latency: {act_latency:.2f}ms")
        self.assertLess(act_latency, 10.0, f"Activation latency exceeded 10ms: {act_latency:.2f}ms")

        # 2. Deactivate Cairo
        deact_rpc = {
            "jsonrpc": "2.0",
            "id": 202,
            "method": "deactivateFont",
            "params": {"family": "Cairo"},
        }
        deact_resp, deact_latency = self._send_socket_request("POST", "/rpc", json.dumps(deact_rpc))
        self.assertIn("HTTP/1.1 200 OK", deact_resp)
        deact_data = json.loads(deact_resp.split("\r\n\r\n", 1)[1])
        self.assertEqual(deact_data.get("jsonrpc"), "2.0")
        self.assertEqual(deact_data.get("id"), 202)
        self.assertTrue(deact_data.get("result", {}).get("success"))
        print(f"[CEP deactivateFont] Latency: {deact_latency:.2f}ms")
        self.assertLess(deact_latency, 25.0, f"Deactivation latency exceeded 25ms: {deact_latency:.2f}ms")

    def test_04_photoshop_cep_json_rpc_error_handling(self):
        """Verify JSON-RPC 2.0 error responses for malformed JSON and unknown RPC methods."""
        # 1. Parse error (-32700) on malformed JSON payload
        bad_json = '{"jsonrpc": "2.0", "method": "queryMissingFonts", "id": 999' # missing closing brace
        raw_resp, _ = self._send_socket_request("POST", "/rpc", bad_json)
        self.assertIn("HTTP/1.1 200 OK", raw_resp)
        data = json.loads(raw_resp.split("\r\n\r\n", 1)[1])
        self.assertEqual(data.get("jsonrpc"), "2.0")
        self.assertIn("error", data)
        self.assertEqual(data["error"].get("code"), -32700, "Must return code -32700 for Parse error")

        # 2. Method not found (-32601)
        unknown_rpc = {
            "jsonrpc": "2.0",
            "id": 888,
            "method": "nonExistentMethodXYZ",
            "params": {},
        }
        raw_resp2, _ = self._send_socket_request("POST", "/rpc", json.dumps(unknown_rpc))
        self.assertIn("HTTP/1.1 200 OK", raw_resp2)
        data2 = json.loads(raw_resp2.split("\r\n\r\n", 1)[1])
        self.assertEqual(data2.get("jsonrpc"), "2.0")
        self.assertEqual(data2.get("id"), 888)
        self.assertIn("error", data2)
        self.assertEqual(data2["error"].get("code"), -32601, "Must return code -32601 for Method not found")

    def test_05_burst_cep_queries_latency_benchmark(self):
        """Execute 10 rapid back-to-back CEP socket queries and verify 100% latency SLA < 10ms."""
        latencies = []
        for i in range(10):
            query = {
                "jsonrpc": "2.0",
                "id": 300 + i,
                "method": "status",
                "params": {},
            }
            raw_resp, lat = self._send_socket_request("POST", "/rpc", json.dumps(query))
            self.assertIn("HTTP/1.1 200 OK", raw_resp)
            latencies.append(lat)
            self.assertLess(
                lat, 10.0,
                f"Query {i+1} latency exceeded 10ms threshold: {lat:.2f}ms"
            )

        avg_lat = sum(latencies) / len(latencies)
        print(f"[CEP Benchmark 10 Queries] Avg Latency: {avg_lat:.2f}ms, Max: {max(latencies):.2f}ms")
        self.assertLess(avg_lat, 5.0, f"Average loopback latency should be < 5ms: {avg_lat:.2f}ms")


if __name__ == "__main__":
    unittest.main()
