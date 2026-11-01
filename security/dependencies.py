"""Autenticación federada y autorización local sobre claims verificados."""
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2AuthorizationCodeBearer
from sqlalchemy.orm import Session

from app.models import Persona
from security.oidc import issuer, verificar_token_federado

oauth2 = OAuth2AuthorizationCodeBearer(
    authorizationUrl=issuer() + "/protocol/openid-connect/auth",
    tokenUrl=issuer() + "/protocol/openid-connect/token",
    scopes={"openid": "Identidad", "email": "Correo verificado", "profile": "Perfil"},
    auto_error=False,
)


@dataclass(frozen=True)
class Identidad:
    sub: str
    email: str
    roles: frozenset[str]

    @property
    def es_admin(self) -> bool:
        return "admin" in self.roles


def obtener_usuario_actual(token: str | None = Depends(oauth2)) -> Identidad:
    if not token:
        raise HTTPException(401, "Token requerido", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = verificar_token_federado(token)
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(503, "Proveedor de identidad no disponible") from None
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "Token inválido o expirado",
                            headers={"WWW-Authenticate": "Bearer"}) from None
    realm = payload.get("realm_access", {})
    roles = realm.get("roles", []) if isinstance(realm, dict) else []
    if not isinstance(roles, list) or any(not isinstance(role, str) for role in roles):
        raise HTTPException(401, "Roles inválidos", headers={"WWW-Authenticate": "Bearer"})
    identidad = Identidad(payload["sub"], payload["email"], frozenset(roles))
    if not identidad.roles.intersection({"admin", "user"}):
        raise HTTPException(403, "Rol de aplicación requerido")
    return identidad


def requerir_admin(usuario: Identidad = Depends(obtener_usuario_actual)) -> Identidad:
    if not usuario.es_admin:
        raise HTTPException(403, "Rol admin requerido")
    return usuario


def autorizar_persona(usuario: Identidad, email: str, db: Session) -> None:
    # Nunca se obtiene la identidad del correo enviado en el body o URL.
    if not usuario.es_admin and usuario.email != email:
        raise HTTPException(403, "No puede acceder a otra persona")
    if db.get(Persona, email) is None:
        raise HTTPException(404, "Perfil Persona no encontrado")
