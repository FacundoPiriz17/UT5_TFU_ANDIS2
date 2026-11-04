import os
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app import cache
from app.database import engine
from app.configuration import store


def instance(service):
    config = store.snapshot()
    return {"service": service, "instance": os.getenv("INSTANCE_NAME", service),
            "version": os.getenv("API_VERSION", "ut5-v1"), "process_id": os.getpid(),
            "configuration_hash": config["hash"],
            "configuration_revision": config["document"]["revision"],
            "configuration_status": config["status"]}


def install_health(app, service):
    @app.get("/")
    def root():
        return {"message": "API funcionando", "service": service}

    @app.get("/health")
    @app.get("/health/live")
    def live():
        return {"status": "ok", "service": service}

    @app.get("/health/ready")
    def ready():
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except SQLAlchemyError:
            return JSONResponse({"status": "not_ready", "database": "error", "service": service}, 503)
        checks = {"database": "ok", "cache": "ok" if cache.disponible() else "degraded"}
        if service == "comercial":
            state = app.state.catalogo.breaker.snapshot()["state"]
            checks["catalogo"] = "degraded" if state != "closed" else "unknown_until_requested"
        return {"status": "degraded" if "degraded" in checks.values() else "ready",
                "service": service, "checks": checks}

    @app.get("/instance")
    def identity():
        return instance(service)

    @app.get("/version")
    def version():
        return {"service": service, "version": os.getenv("API_VERSION", "ut5-v1")}
