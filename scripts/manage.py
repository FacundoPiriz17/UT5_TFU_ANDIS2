"""Operaciones UT5 compartidas por los launchers Bash y PowerShell."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
HISTORICAL = {"promote", "demo_blue_green", "demo_scaling", "demo_stateless", "demo_rollback", "demo_acid", "demo_tacticas"}
SERVICES = ("db", "redis", "keycloak", "catalogo", "comercial", "nginx", "frontend")


def load_env():
    if not (ROOT / ".env").exists(): shutil.copyfile(ROOT / ".env.example", ROOT / ".env")
    for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def compose(*args, capture=False):
    result = subprocess.run(["docker", "compose", "-f", str(ROOT / "docker-compose.yaml"), *args],
                            cwd=ROOT, text=True, encoding="utf-8", errors="replace", check=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def wait(service, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        output = compose("ps", "--format", "json", service, capture=True)
        if output:
            state = json.loads(output.splitlines()[0])
            if state.get("Health") == "healthy" or service == "frontend" and state.get("State") == "running": return
            if state.get("State") in {"exited", "dead"}: raise RuntimeError(f"Falló {service}")
        time.sleep(2)
    raise RuntimeError(f"Timeout esperando {service}")


def deploy(service, version):
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,100}", version): raise ValueError("Etiqueta inválida")
    key = service.upper() + "_VERSION"
    previous = os.environ.get(key, "v1")
    os.environ[key] = version
    try:
        compose("build", service)
        compose("up", "-d", "--no-deps", "--no-build", "--force-recreate", service)
        wait(service)
    except Exception:
        os.environ[key] = previous
        compose("up", "-d", "--no-deps", "--no-build", "--force-recreate", service)
        raise
    path = ROOT / ".env"
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    lines = [line for line in lines if not line.startswith(key + "=")]
    path.write_text("\n".join(lines + [key + "=" + version]) + "\n", encoding="utf-8")


def status():
    compose("ps")
    base = os.getenv("BASE_URL", "http://localhost:8055")
    with urlopen(base + "/system/status", timeout=5) as response:
        print(json.dumps(json.load(response), ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "stop", "status", "deploy", "build_version", "menu", "demo_configuration", *sorted(HISTORICAL)])
    parser.add_argument("version", nargs="?", default="v2")
    parser.add_argument("--service", choices=["catalogo", "comercial"], default="catalogo")
    args = parser.parse_args()
    if args.action in HISTORICAL:
        parser.error("Esta demo utiliza el entorno UT4. Abrir Demos antiguas en la consola para preparar la version original; no se ejecuta contra los servicios UT5.")
    load_env()
    if args.action in {"start", "menu"}:
        compose("config", "--quiet")
        compose("up", "-d", "--build")
        for service in SERVICES: wait(service)
        print(f"Frontend: http://localhost:{os.getenv('FRONTEND_PORT','3255')}\nAPI: {os.getenv('BASE_URL','http://localhost:8055')}\nWSDL: {os.getenv('BASE_URL','http://localhost:8055')}/soap/catalogo?wsdl")
    elif args.action == "stop": compose("down")  # conserva los volúmenes
    elif args.action == "status": status()
    elif args.action == "deploy": deploy(args.service, args.version)
    elif args.action == "build_version":
        os.environ[args.service.upper() + "_VERSION"] = args.version
        compose("build", args.service)
    elif args.action == "demo_configuration":
        print("Editar config/settings.json o la pantalla Configuración. Ambos servicios incorporan el JSON sin rebuild.")
    return 0


if __name__ == "__main__":
    try: sys.exit(main())
    except (OSError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
