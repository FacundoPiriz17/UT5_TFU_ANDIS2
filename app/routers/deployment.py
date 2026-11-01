import json
import os
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from app.aspects.audit import auditar
from security.dependencies import Identidad, requerir_admin

router = APIRouter(prefix="/deployment", tags=["Blue/Green"])


def gateway(path, data=None):
    url = os.getenv("GATEWAY_CONTROL_URL", "http://nginx:9001") + path
    request = Request(url, data=json.dumps(data).encode() if data is not None else None,
                      headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=25) as response:
            return json.loads(response.read())
    except HTTPError as exc:
        body = json.loads(exc.read())
        raise HTTPException(exc.code, body.get("detail", "El gateway rechazó la operación")) from exc
    except (URLError, OSError, ValueError) as exc:
        raise HTTPException(503, "El control de despliegue no está disponible") from exc


@router.get("/status")
def status():
    return gateway("/status")


@router.post("/promote/{slot}")
@auditar("PROMOVER_BLUE_GREEN")
def promote(slot: Literal["blue", "green"], user: Identidad = Depends(requerir_admin)):
    return gateway("/promote", {"slot": slot, "actor": user.email})
