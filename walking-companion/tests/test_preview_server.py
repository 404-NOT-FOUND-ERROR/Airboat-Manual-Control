import base64
import hashlib
import http.client
import json
import socket
import socketserver
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import preview


class DeviceHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        self.server.seen.append((self.path, self.headers.get("Host"),
                                 self.headers.get("Origin"), body))
        if self.path == "/photo":
            payload, content_type = b"\xff\xd8test-photo", "application/octet-stream"
        else:
            payload, content_type = json.dumps({"boot": "a" * 32, "token": "b" * 32,
                                                "seq": 0, "epoch": 0, "ticket": 1}).encode(), "application/json"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_):
        pass


class WebSocketHandler(socketserver.BaseRequestHandler):
    def handle(self):
        header = bytearray()
        while not header.endswith(b"\r\n\r\n") and len(header) <= 8192:
            header.extend(self.request.recv(1))
        self.server.handshake = bytes(header)
        lines = header.decode("latin-1").split("\r\n")
        key = next(line.split(":", 1)[1].strip() for line in lines
                   if line.lower().startswith("sec-websocket-key:"))
        accepted = base64.b64encode(hashlib.sha1(
            (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
        ).digest())
        self.request.sendall(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                             b"Connection: Upgrade\r\nSec-WebSocket-Accept: " + accepted + b"\r\n\r\n")
        payload = self.request.recv(4)
        self.server.frame = payload
        self.request.sendall(payload)


class PreviewProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.device = ThreadingHTTPServer(("127.0.0.1", 0), DeviceHandler)
        cls.device.seen = []
        cls.device_thread = threading.Thread(target=cls.device.serve_forever, daemon=True)
        cls.device_thread.start()
        cls.websocket = socketserver.ThreadingTCPServer(("127.0.0.1", 0), WebSocketHandler)
        cls.websocket_thread = threading.Thread(target=cls.websocket.serve_forever, daemon=True)
        cls.websocket_thread.start()
        cls.old_port = preview.DEVICE_PORT
        preview.DEVICE_PORT = cls.device.server_port
        handler = lambda *args, **kwargs: preview.Preview(*args, device="127.0.0.1", **kwargs)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.device.shutdown()
        cls.device.server_close()
        cls.websocket.shutdown()
        cls.websocket.server_close()
        preview.DEVICE_PORT = cls.old_port

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response.status, payload

    def test_device_settings_and_origin_gate(self):
        status, payload = self.request("GET", "/device-config", headers={"Host": f"127.0.0.1:{self.server.server_port}"})
        self.assertEqual((status, json.loads(payload)), (200, {"enabled": True}))
        status, _ = self.request("POST", "/api", body=b"pair", headers={
            "Host": f"127.0.0.1:{self.server.server_port}",
            "Origin": "http://other.example",
            "X-AirBoat-Control": "1",
        })
        self.assertEqual(status, 403)

    def test_api_and_photo_forward_to_configured_device(self):
        base = f"127.0.0.1:{self.server.server_port}"
        headers = {"Host": base, "Origin": f"http://{base}", "X-AirBoat-Control": "1"}
        status, payload = self.request("POST", "/api", body=b"pair 123 123456", headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload)["boot"], "a" * 32)
        status, photo = self.request("POST", "/photo", body=b"photo request", headers=headers)
        self.assertEqual((status, photo), (200, b"\xff\xd8test-photo"))
        self.assertEqual([row[0] for row in self.device.seen[-2:]], ["/api", "/photo"])
        self.assertTrue(all(row[1] == f"127.0.0.1:{preview.DEVICE_PORT}" for row in self.device.seen[-2:]))
        self.assertTrue(all(row[2] == f"http://127.0.0.1:{preview.DEVICE_PORT}" for row in self.device.seen[-2:]))

    def test_websocket_handshake_and_frames_are_forwarded(self):
        upstream = self.websocket.server_address[1]
        old_port = preview.DEVICE_PORT
        preview.DEVICE_PORT = upstream
        try:
            key = base64.b64encode(b"0123456789abcdef").decode()
            local = f"127.0.0.1:{self.server.server_port}"
            client = socket.create_connection(("127.0.0.1", self.server.server_port), timeout=3)
            client.sendall(
                f"GET /control HTTP/1.1\r\nHost: {local}\r\nOrigin: http://{local}\r\n"
                f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                "Sec-WebSocket-Version: 13\r\n\r\n".encode()
            )
            response = bytearray()
            while not response.endswith(b"\r\n\r\n"):
                response.extend(client.recv(1))
            self.assertIn(b"101 Switching Protocols", response)
            self.assertIn(b"Origin: http://127.0.0.1:" + str(upstream).encode(), self.websocket.handshake)
            client.sendall(b"test")
            self.assertEqual(client.recv(4), b"test")
            client.close()
        finally:
            preview.DEVICE_PORT = old_port


if __name__ == "__main__":
    unittest.main()
