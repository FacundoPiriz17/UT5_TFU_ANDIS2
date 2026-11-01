from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.aspects.audit import auditar
from app.configuration import ConfigurationConflict, Settings, store
from app.strategies.costo_compra import obtener_estrategia
from security.dependencies import requerir_admin

router = APIRouter(prefix="/configuration", tags=["External Configuration Store"])


class Update(BaseModel):
    expected_hash: str = Field(min_length=64, max_length=64)
    settings: Settings


@router.get("")
def read_configuration():
    # El archivo contiene solamente opciones públicas de negocio, nunca secretos.
    return store.snapshot()


@router.put("", dependencies=[Depends(requerir_admin)])
@auditar("MODIFICAR_CONFIGURACION")
def update_configuration(body: Update):
    try:
        return store.update(body.settings, body.expected_hash)
    except ConfigurationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "No se pudo guardar el JSON externo") from exc


@router.get("/quote")
def quote(costo_base: int = Query(default=100, gt=0, le=1000000),
          politica: Literal["normal", "invierno"] = "invierno"):
    snapshot = store.snapshot()
    return {"costo_base": costo_base, "politica": politica,
            "costo_final": obtener_estrategia(politica).calcular(costo_base),
            "configuration_hash": snapshot["hash"], "revision": snapshot["document"]["revision"],
            "purchases_enabled": snapshot["document"]["settings"]["purchases_enabled"]}
