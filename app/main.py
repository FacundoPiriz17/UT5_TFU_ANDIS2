import json
import os
import socket
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import cache
from app.database import engine
from app.routers import audit, auth, biblioteca, compras, juegos, personas, configuration, deployment, legacy
from app.configuration import ConfigurationUnavailable, store

app = FastAPI(
    title="ADAII TFU4 - API de Juegos",
    version=os.getenv("API_VERSION", "dev"),
    swagger_ui_init_oauth={"clientId": "andis-swagger", "usePkceWithAuthorizationCodeGrant": True,
                           "scopes": "openid email profile"},
)

app.include_router(auth.router)
app.include_router(personas.router)
app.include_router(juegos.router)
app.include_router(compras.router)
app.include_router(biblioteca.router)
app.include_router(audit.router)
app.include_router(configuration.router)
app.include_router(deployment.router)
app.include_router(legacy.router)


@app.exception_handler(ConfigurationUnavailable)
async def configuration_unavailable(request, exc):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.middleware("http")
async def identificar_instancia(request, call_next):
    response = await call_next(request)
    response.headers["X-Instance-ID"] = os.getenv("INSTANCE_NAME", socket.gethostname())
    response.headers["X-Deployment-Slot"] = os.getenv("DEPLOYMENT_SLOT", "blue")
    response.headers["X-API-Version"] = os.getenv("API_VERSION", "dev")
    return response


@app.get("/")
def root():
    return {
        "message": "API funcionando",
        "version": os.getenv("API_VERSION", "dev"),
    }


@app.get("/health")
def health():
    if os.getenv("FORCE_UNHEALTHY", "false").lower() == "true":
        raise HTTPException(
            status_code=503,
            detail="Version marcada como defectuosa para demostrar rollback",
        )

    return {"status": "ok"}

def _estado_instancia(host):
    url = f"http://{host}/instance"
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            datos = json.loads(resp.read())
        try:
            urllib.request.urlopen(f"http://{host}/health", timeout=2).close()
            estado = "ok"
        except urllib.error.HTTPError as e:
            estado = "unhealthy" if e.code == 503 else f"error_{e.code}"
        return {"host": host, "status": estado, **datos}
    except (urllib.error.URLError, OSError, ValueError):
        return {"host": host, "status": "down"}


@app.get("/health/live")
def health_live():
    hosts = [h.strip() for h in os.getenv("API_INSTANCES", "api1:8000,api2:8000").split(",") if h.strip()]

    with ThreadPoolExecutor(max_workers=len(hosts) or 1) as pool:
        instancias = list(pool.map(_estado_instancia, hosts))

    activas = sum(1 for i in instancias if i["status"] == "ok")
    if activas == len(instancias):
        status = "ok"
    elif activas > 0:
        status = "degraded"
    else:
        status = "down"

    return {
        "status": status,
        "respondido_por": os.getenv("INSTANCE_NAME", socket.gethostname()),
        "instancias_activas": f"{activas}/{len(instancias)}",
        "instancias": instancias,
    }

@app.get("/health/ready")
def health_ready():
    checks = {}

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except SQLAlchemyError:
        checks["database"] = "error"

    checks["cache"] = "ok" if cache.disponible() else "degraded"

    if checks["database"] != "ok":
        return JSONResponse(status_code=503, content={"status": "not_ready", "checks": checks})

    return {"status": "ready", "checks": checks}


@app.get("/version")
def version():
    return {
        "version": os.getenv("API_VERSION", "dev"),
        "force_unhealthy": os.getenv("FORCE_UNHEALTHY", "false").lower() == "true",
    }
@app.get("/instance")
def instance():
    config = store.snapshot()
    return {
        "instance": os.getenv("INSTANCE_NAME", socket.gethostname()),
        "version": os.getenv("API_VERSION", "dev"),
        "slot": os.getenv("DEPLOYMENT_SLOT", "blue"),
        "process_id": os.getpid(),
        "configuration_hash": config["hash"],
        "configuration_revision": config["document"]["revision"],
        "configuration_status": config["status"],
    }
