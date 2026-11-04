"""Correlación y logs JSON. Nunca incluye encabezados de autorización."""
from contextvars import ContextVar
import json
import logging
import os
import re
import time
from uuid import uuid4

correlation_id = ContextVar("correlation_id", default="")
logger = logging.getLogger("ut5")


def event(operation, **fields):
    logger.info(json.dumps({"service": os.getenv("SERVICE_NAME", "local"),
                            "operation": operation, "correlation_id": correlation_id.get(),
                            **fields}, ensure_ascii=False))


def install(app, service):
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    @app.middleware("http")
    async def identify(request, call_next):
        supplied = request.headers.get("X-Correlation-ID", "")
        cid = supplied if re.fullmatch(r"[A-Za-z0-9._-]{1,80}", supplied) else str(uuid4())
        token = correlation_id.set(cid)
        started = time.monotonic()
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = cid
            response.headers["X-Service-Name"] = service
            response.headers["X-Instance-ID"] = os.getenv("INSTANCE_NAME", service)
            response.headers["X-API-Version"] = os.getenv("API_VERSION", "ut5-v1")
            event(request.url.path, method=request.method, status=response.status_code,
                  duration_ms=round((time.monotonic() - started) * 1000, 2))
            return response
        finally:
            correlation_id.reset(token)
