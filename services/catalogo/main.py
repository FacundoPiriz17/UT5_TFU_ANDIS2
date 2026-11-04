import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from app.configuration import ConfigurationUnavailable
from app.observability import install, event
from app.service_health import install_health
from services.catalogo import routers, soap

app = FastAPI(title="UT5 - Catálogo", version=os.getenv("API_VERSION", "ut5-v1"),
              swagger_ui_init_oauth={"clientId": "andis-swagger", "usePkceWithAuthorizationCodeGrant": True})
install(app, "catalogo")
install_health(app, "catalogo")
app.include_router(routers.router)
app.include_router(soap.router)


@app.exception_handler(ConfigurationUnavailable)
@app.exception_handler(SQLAlchemyError)
async def unavailable(request, exc):
    event("dependency_failure", error=type(exc).__name__)
    if request.url.path == "/soap/catalogo":
        return soap.fault("FalloTecnico", "Dependencia de Catálogo no disponible", 503)
    return JSONResponse({"detail": "Dependencia de Catálogo no disponible"}, status_code=503)
