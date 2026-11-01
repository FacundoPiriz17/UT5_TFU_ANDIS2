"""Control interno del gateway: promoción Blue/Green sin acceso al socket Docker."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import subprocess
from threading import Lock
import time
from urllib.error import URLError, HTTPError
from urllib.request import urlopen

SLOTS = {"blue": ("api1:8000", "api2:8000"),
         "green": ("api-green1:8000", "api-green2:8000")}
DIRECTORY = Path(os.getenv("GATEWAY_STATE_PATH", "/etc/nginx/deployment"))
LOCK = Lock()


def write_json(path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.replace(path)


def state():
    path = DIRECTORY / "state.json"
    if path.exists():
        data = json.loads(path.read_text())
        if data.get("active_slot") in SLOTS:
            return data
    return {"active_slot": "blue", "events": []}


def upstream(slot):
    servers = "\n".join(f"    server {host};" for host in SLOTS[slot])
    return f"upstream backend {{\n{servers}\n}}\n"


def read_url(host, path):
    with urlopen(f"http://{host}{path}", timeout=3) as response:
        return json.loads(response.read())


def probe(host):
    try:
        info = read_url(host, "/instance")
        read_url(host, "/health")
        readiness = read_url(host, "/health/ready")
        return {"host": host, **info, "status": "ok" if readiness["status"] == "ready" else "unhealthy"}
    except (URLError, OSError, ValueError, KeyError):
        return {"host": host, "status": "down"}


def snapshot():
    hosts = [host for members in SLOTS.values() for host in members]
    with ThreadPoolExecutor(max_workers=4) as pool:
        instances = dict(zip(hosts, pool.map(probe, hosts)))
    with LOCK:
        current = state()
    return {**current, "slots": {slot: [instances[h] for h in members] for slot, members in SLOTS.items()}}


def promote(slot, actor):
    if slot not in SLOTS:
        raise ValueError("Color inválido")
    with LOCK:
        previous = state()
        with ThreadPoolExecutor(max_workers=2) as pool:
            instances = list(pool.map(probe, SLOTS[slot]))
        if any(i["status"] != "ok" or i.get("slot") != slot for i in instances):
            raise ValueError("Las dos réplicas destino deben superar liveness y readiness; se conserva el color activo")
        if len({i.get("version") for i in instances}) != 1:
            raise ValueError("Las réplicas destino deben ejecutar la misma versión")
        if previous["active_slot"] == slot:
            return previous
        config = DIRECTORY / "active.conf"
        old_text = config.read_text()
        # os.replace evita que Nginx observe una configuración escrita parcialmente.
        pending = DIRECTORY / "active.tmp"
        pending.write_text(upstream(slot))
        pending.replace(config)
        try:
            subprocess.run(["nginx", "-t"], check=True, capture_output=True, timeout=10)
            subprocess.run(["nginx", "-s", "reload"], check=True, capture_output=True, timeout=10)
            # Confirmar que workers nuevos realmente atienden el color esperado.
            deadline = time.monotonic() + 8
            while True:
                try:
                    if read_url("127.0.0.1", "/instance").get("slot") == slot:
                        break
                except (URLError, OSError, ValueError):
                    pass
                if time.monotonic() > deadline:
                    raise RuntimeError("El gateway no confirmó el nuevo color")
                time.sleep(0.1)
        except Exception:
            pending.write_text(old_text)
            pending.replace(config)
            subprocess.run(["nginx", "-s", "reload"], check=False, capture_output=True, timeout=10)
            raise
        event = {"at": datetime.now(timezone.utc).isoformat(), "from": previous["active_slot"],
                 "to": slot, "version": instances[0]["version"], "actor": actor}
        current = {"active_slot": slot, "events": [event, *previous["events"]][:50]}
        try:
            write_json(DIRECTORY / "state.json", current)
        except OSError:
            pending.write_text(old_text)
            pending.replace(config)
            subprocess.run(["nginx", "-s", "reload"], check=False, capture_output=True, timeout=10)
            raise
        return current


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, body):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/status":
            self.respond(200, snapshot())
        else:
            self.respond(404, {"detail": "Ruta inexistente"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if self.path != "/promote" or not 0 < length <= 4096:
                self.respond(400, {"detail": "Petición inválida"})
                return
            body = json.loads(self.rfile.read(length))
            result = promote(body.get("slot"), str(body.get("actor", "CLI"))[:100])
            self.respond(200, result)
        except (ValueError, TypeError) as exc:
            self.respond(409, {"detail": str(exc)})
        except Exception:
            self.respond(503, {"detail": "No se pudo promover el destino; se restauró el upstream anterior"})


def main():
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    current = state()
    (DIRECTORY / "active.conf").write_text(upstream(current["active_slot"]))
    write_json(DIRECTORY / "state.json", current)
    nginx = subprocess.Popen(["nginx", "-g", "daemon off;"])
    server = ThreadingHTTPServer(("0.0.0.0", 9001), Handler)
    server.daemon_threads = True
    server.timeout = 1
    stopping = False

    def stop(signum, frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while not stopping and nginx.poll() is None:
            server.handle_request()
    finally:
        server.server_close()
        if nginx.poll() is None:
            nginx.send_signal(signal.SIGQUIT)
            try:
                nginx.wait(timeout=10)
            except subprocess.TimeoutExpired:
                nginx.terminate()
        if not stopping and nginx.returncode:
            raise SystemExit(nginx.returncode)


if __name__ == "__main__":
    main()
