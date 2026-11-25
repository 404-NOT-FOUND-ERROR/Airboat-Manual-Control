"""Serve UNION, optionally forwarding to a single Mosaico on the same LAN."""
import argparse
import http.client
import ipaddress
import json
import base64
import hashlib
import select
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
CONTROL = {"/api", "/photo", "/csi"}
LOCAL_NETWORKS = tuple(map(ipaddress.ip_network, ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")))
DEVICE_PORT = 8080


def device_address(value):
    try:
        uri = urlsplit(value)
        address = ipaddress.IPv4Address(uri.hostname or "")
        if (uri.scheme == "http" and uri.port == 8080 and uri.path in ("", "/")
                and not (uri.username or uri.password or uri.query or uri.fragment)
                and any(address in network for network in LOCAL_NETWORKS)):
            return str(address)
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("Use the private IPv4 address shown on Mosaico, including http:// and :8080.")


def bind_address(value):
    try:
        address = ipaddress.IPv4Address(value)
    except ipaddress.AddressValueError as error:
        raise argparse.ArgumentTypeError("Bind to a private LAN IPv4 address or 127.0.0.1.") from error
    if address.is_loopback or any(address in network for network in LOCAL_NETWORKS):
        return address
    raise argparse.ArgumentTypeError("Bind to a private LAN IPv4 address or 127.0.0.1.")


class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, device=None, **kwargs):
        self.device = device
        super().__init__(*args, directory=str(HERE), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, status, payload, content_type, headers=()):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        for key, value in headers:
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def local_host(self):
        bind, port = self.server.server_address
        names = {bind}
        if bind == "127.0.0.1":
            names.add("localhost")
        return self.headers.get("Host") in {f"{name}:{port}" for name in names}

    def do_GET(self):
        if not self.local_host():
            self.send_error(403)
            return
        route = urlsplit(self.path).path
        if route == "/device-config":
            data = json.dumps({"enabled": self.device is not None}).encode()
            self.reply(200, data, "application/json")
        elif route == "/device-console/" and self.device:
            self.forward("GET", "/", None)
        elif route == "/control" and self.headers.get("Upgrade", "").lower() == "websocket":
            self.forward_websocket()
        elif route in CONTROL or route in ("/control", "/device-console/"):
            self.send_error(404)
        elif any(name.startswith(".") for name in unquote(route).split("/")):
            self.send_error(404)
        else:
            path = Path(self.translate_path(self.path))
            if path.is_dir() and not (path / "index.html").is_file():
                self.send_error(404)
            else:
                super().do_GET()

    do_HEAD = do_GET

    def do_POST(self):
        path = urlsplit(self.path).path
        if not self.device or path not in CONTROL or self.path != path:
            self.send_error(404)
            return
        if (not self.local_host() or self.headers.get("Origin") != f"http://{self.headers['Host']}"
                or self.headers.get("X-AirBoat-Control") != "1"):
            self.send_error(403)
            return
        length = self.headers.get("Content-Length", "")
        if not length.isdecimal() or len(length) > 3 or not 0 < int(length) <= 255:
            self.send_error(400)
            return
        self.connection.settimeout(2)
        try:
            body = self.rfile.read(int(length))
        except TimeoutError:
            self.send_error(408)
            return
        if len(body) != int(length):
            self.send_error(400)
            return
        self.forward("POST", path, body)

    def forward(self, method, path, body):
        host = f"{self.device}:{DEVICE_PORT}"
        headers = {"Host": host, "Accept-Encoding": "identity"}
        if body is not None:
            headers.update({"Origin": f"http://{host}", "X-AirBoat-Control": "1",
                            "Content-Type": "text/plain"})
        connection = http.client.HTTPConnection(self.device, DEVICE_PORT, timeout=1.8)
        try:
            connection.request(method, path, body, headers)
            response = connection.getresponse()
            payload = response.read(160_001)
            if len(payload) > 160_000:
                raise ValueError("oversize")
            preserve = [(key, response.getheader(key)) for key in
                        ("Content-Security-Policy", "X-Content-Type-Options",
                         "Referrer-Policy", "Content-Encoding") if response.getheader(key)]
            self.reply(response.status, payload, response.getheader("Content-Type") or "application/octet-stream", preserve)
        except (OSError, http.client.HTTPException, ValueError):
            self.reply(502, b'{"error":"offline"}', "application/json")
        finally:
            connection.close()

    def forward_websocket(self):
        key = self.headers.get("Sec-WebSocket-Key", "")
        origin = self.headers.get("Origin", "")
        expected_origin = f"http://{self.headers.get('Host', '')}"
        try:
            decoded_key = base64.b64decode(key, validate=True)
        except ValueError:
            decoded_key = b""
        if (not self.device or not self.local_host() or origin != expected_origin
                or self.headers.get("Sec-WebSocket-Version") != "13" or len(decoded_key) != 16
                or self.path != "/control"):
            self.send_error(403)
            return

        upstream = None
        try:
            upstream = socket.create_connection((self.device, DEVICE_PORT), timeout=2)
            upstream.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            device_origin = f"http://{self.device}:{DEVICE_PORT}"
            request = (
                f"GET /control HTTP/1.1\r\nHost: {self.device}:{DEVICE_PORT}\r\n"
                f"Origin: {device_origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
            ).encode("ascii")
            upstream.sendall(request)
            response = bytearray()
            while not response.endswith(b"\r\n\r\n") and len(response) <= 8192:
                byte = upstream.recv(1)
                if not byte:
                    raise ConnectionError("Mosaico closed the WebSocket handshake.")
                response.extend(byte)
            headers = bytes(response).decode("latin-1").split("\r\n")
            accept = base64.b64encode(hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
            ).digest()).decode("ascii")
            if (len(response) > 8192 or not headers[0].startswith("HTTP/1.1 101 ")
                    or not any(line.lower() == f"sec-websocket-accept: {accept}".lower() for line in headers)):
                raise ConnectionError("Mosaico rejected the WebSocket handshake.")
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            self.connection.sendall(response)
            self.connection.settimeout(None)
            upstream.settimeout(None)
            clients = (self.connection, upstream)
            while True:
                readable, _, _ = select.select(clients, (), (), 300)
                if not readable:
                    break
                for source in readable:
                    payload = source.recv(65536)
                    if not payload:
                        return
                    destination = upstream if source is self.connection else self.connection
                    destination.sendall(payload)
        except (OSError, TimeoutError, ValueError):
            if upstream is not None:
                try:
                    self.connection.sendall(
                        b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
                    )
                except OSError:
                    pass
        finally:
            if upstream is not None:
                upstream.close()
            self.close_connection = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1", type=bind_address)
    parser.add_argument("--port", default=8768, type=int)
    parser.add_argument("--device", type=device_address)
    args = parser.parse_args()
    server = ThreadingHTTPServer((str(args.bind), args.port), partial(Preview, device=args.device))
    try:
        print(f"UNION: http://{args.bind}:{server.server_port}/", flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
