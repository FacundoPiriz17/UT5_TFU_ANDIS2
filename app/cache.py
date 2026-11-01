import json
import logging
import os
from typing import Any, Callable

import redis
from fastapi import Response
from fastapi.encoders import jsonable_encoder
from app.configuration import store

logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

_cliente = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    decode_responses=True,
    socket_timeout=0.5,
    socket_connect_timeout=0.5,
)


def clave_compras(email_persona: str) -> str:
    return f"compras:{email_persona}"


def clave_biblioteca(email_persona: str) -> str:
    return f"biblioteca:{email_persona}"


def clave_juego(id_juego: int) -> str:
    return f"juego:{id_juego}"


CLAVE_CATALOGO = "juegos:catalogo"


def disponible() -> bool:
    try:
        return bool(_cliente.ping())
    except redis.RedisError:
        return False


def obtener(clave: str) -> Any | None:
    try:
        valor = _cliente.get(clave)
    except redis.RedisError:
        logger.warning("Cache no disponible, leyendo de BD")
        return None
    return json.loads(valor) if valor is not None else None


def guardar(clave: str, valor: Any, ttl: int | None = None) -> None:
    try:
        _cliente.set(clave, json.dumps(valor), ex=ttl if ttl is not None else store.settings().cache_ttl_seconds)
    except redis.RedisError:
        logger.warning("No se pudo guardar en cache: %s", clave)


def invalidar(*claves: str) -> None:
    if not claves:
        return
    try:
        _cliente.delete(*claves)
    except redis.RedisError:
        logger.warning("No se pudo invalidar cache: %s", claves)


def obtener_o_cargar(
    clave: str,
    cargar: Callable[[], Any],
    response: Response | None = None,
    ttl: int | None = None,
) -> Any:
    valor = obtener(clave)

    if valor is not None:
        estado = "HIT"
    else:
        valor = jsonable_encoder(cargar())
        guardar(clave, valor, ttl)
        estado = "MISS"

    if response is not None:
        response.headers["X-Cache"] = estado

    return valor


def invalidar_persona(email_persona: str) -> None:
    invalidar(
        clave_compras(email_persona),
        clave_biblioteca(email_persona),
    )
