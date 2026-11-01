from fastapi import APIRouter, Depends, HTTPException

from security.dependencies import Identidad, obtener_usuario_actual
from security.oidc import audience, issuer

router = APIRouter(prefix="/auth", tags=["Autenticacion"])


@router.post("/login", deprecated=True)
def login():
    raise HTTPException(410, "Login local retirado; obtenga un access token en Keycloak")


@router.get("/config")
def configuracion():
    return {"issuer": issuer(), "audience": audience(), "flow": "authorization_code_pkce"}


@router.get("/me")
def identidad(usuario: Identidad = Depends(obtener_usuario_actual)):
    return {"sub": usuario.sub, "email": usuario.email, "roles": sorted(usuario.roles)}
