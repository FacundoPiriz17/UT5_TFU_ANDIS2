from contextlib import asynccontextmanager
import asyncio
import os

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
import httpx
from sqlalchemy.exc import SQLAlchemyError

from app.configuration import ConfigurationUnavailable
from app.observability import install, event
from app.routers import audit, auth, configuration
from app.service_health import install_health, instance
from security.dependencies import Identidad, obtener_usuario_actual, requerir_admin
from services.comercial import routers_biblioteca, routers_compras, routers_personas
from services.comercial.catalog_client import CatalogClient


@asynccontextmanager
async def lifespan(app):
    app.state.catalogo = CatalogClient()
    yield
    await app.state.catalogo.close()


app = FastAPI(title="UT5 - Compras y Biblioteca", version=os.getenv("API_VERSION", "ut5-v1"),
              lifespan=lifespan,
              swagger_ui_init_oauth={"clientId": "andis-swagger", "usePkceWithAuthorizationCodeGrant": True})
install(app, "comercial")
install_health(app, "comercial")
for router in (auth.router, audit.router, configuration.router, routers_personas.router,
               routers_compras.router, routers_biblioteca.router):
    app.include_router(router)


@app.exception_handler(ConfigurationUnavailable)
@app.exception_handler(SQLAlchemyError)
async def unavailable(request, exc):
    event("dependency_failure", error=type(exc).__name__)
    return JSONResponse({"detail": "Dependencia comercial no disponible"}, status_code=503)


async def services_status():
    own = {**instance("comercial"), "status": "ok", "host": "comercial:8000"}
    try:
        async with httpx.AsyncClient(trust_env=False, timeout=.4) as client:
            async with asyncio.timeout(.5):
                response = await client.get(os.getenv("CATALOGO_HTTP_URL", "http://catalogo:8000") + "/instance")
                response.raise_for_status()
                catalog = {**response.json(), "status": "ok", "host": "catalogo:8000"}
    except (httpx.HTTPError, TimeoutError, ValueError):
        catalog = {"service": "catalogo", "host": "catalogo:8000", "status": "down"}
    return {"status": "ok" if catalog["status"] == "ok" else "degraded",
            "architecture": "Service-Based", "services": [catalog, own],
            "circuit": app.state.catalogo.breaker.snapshot()}


@app.get("/system/status")
@app.get("/deployment/status")
async def deployment_status():
    return await services_status()


@app.get("/resilience", dependencies=[Depends(requerir_admin)])
def resilience():
    return {**app.state.catalogo.breaker.snapshot(), "policy": vars(app.state.catalogo.policy)}


@app.get("/juegos/{id_juego}", tags=["Compatibilidad REST a SOAP"])
async def game_adapter(id_juego: int, usuario: Identidad = Depends(obtener_usuario_actual)):
    return await app.state.catalogo.obtener_juego(id_juego, usuario.access_token)
