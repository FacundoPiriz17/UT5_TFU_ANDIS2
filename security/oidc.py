"""Validación de access tokens del IdP; la API nunca emite credenciales."""
import os
from functools import lru_cache

import jwt
from jwt import PyJWKClient


def issuer() -> str:
    return os.getenv("OIDC_ISSUER", "http://localhost:8081/realms/andis-ut4").rstrip("/")


def audience() -> str:
    return os.getenv("OIDC_AUDIENCE", "andis-api")


@lru_cache(maxsize=1)
def jwks_client() -> PyJWKClient:
    # El issuer público permanece verificado aunque JWKS use la red Docker.
    url = os.getenv("OIDC_JWKS_URL", issuer() + "/protocol/openid-connect/certs")
    return PyJWKClient(url, cache_keys=False, cache_jwk_set=True,
                       lifespan=300, timeout=5)


def verificar_token_federado(token: str) -> dict:
    header = jwt.get_unverified_header(token)
    if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str) or not header["kid"]:
        raise jwt.InvalidTokenError("Algoritmo o kid no permitido")
    key = jwks_client().get_signing_key_from_jwt(token).key
    payload = jwt.decode(
        token, key, algorithms=["RS256"], issuer=issuer(), audience=audience(),
        options={"require": ["exp", "iat", "iss", "aud", "sub", "email", "email_verified"]},
        leeway=0,
    )
    if payload.get("typ") != "Bearer":
        raise jwt.InvalidTokenError("Se requiere un access token")
    if payload["email_verified"] is not True:
        raise jwt.InvalidTokenError("Correo no verificado")
    if not isinstance(payload["email"], str) or not payload["email"] or len(payload["email"]) > 100:
        raise jwt.InvalidTokenError("Correo inválido")
    if not isinstance(payload["sub"], str) or not payload["sub"]:
        raise jwt.InvalidTokenError("Sujeto inválido")
    return payload
