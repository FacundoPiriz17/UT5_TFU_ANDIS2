import json
import logging
import os
import socket
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from threading import Lock
from typing import Any, Callable

import redis
from redis.backoff import NoBackoff
from redis.retry import Retry
from fastapi import Response
from fastapi.encoders import jsonable_encoder
from app.configuration import store

logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_TIMEOUT = float(os.getenv("REDIS_TIMEOUT_SECONDS", "0.1"))

class RedisProvider:
    """La resolución DNS tampoco puede bloquear indefinidamente al caso de uso.

    Sólo el lookup corre en background, con un máximo de un trabajo pendiente.
    Las operaciones GET/SET/DELETE siguen siendo síncronas y acotadas: nunca
    quedan escrituras retrasadas ejecutándose después de una invalidación.
    """
    def __init__(self, host=REDIS_HOST, port=REDIS_PORT, resolver=socket.gethostbyname):
        self.host, self.port, self.resolver = host, port, resolver
        self.lock = Lock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="redis-dns")
        self.pending = None
        self.refresh_at = 0
        self.address = None
        self.client = None

    def get(self):
        with self.lock:
            now = time.monotonic()
            if self.pending is not None and self.pending.done():
                try:
                    address = self.pending.result()
                    if address != self.address:
                        self.client = redis.Redis(host=address, port=self.port, decode_responses=True,
                            socket_timeout=REDIS_TIMEOUT, socket_connect_timeout=REDIS_TIMEOUT,
                            retry=Retry(NoBackoff(), 0))
                        self.address = address
                except OSError:
                    pass
                self.pending = None
                self.refresh_at = now + 5
            if now >= self.refresh_at and self.pending is None:
                self.pending = self.executor.submit(self.resolver, self.host)
                self.refresh_at = now + 5
            client, pending = self.client, self.pending
        if client is not None:
            return client
        if pending is not None:
            try:
                pending.result(timeout=min(REDIS_TIMEOUT, .05))
            except (FutureTimeout, OSError):
                return None
            return self.get()
        return None


_provider = RedisProvider()


def _client():
    client = _provider.get()
    if client is None:
        raise redis.ConnectionError("DNS de Redis no disponible")
    return client


def clave_compras(email_persona: str) -> str:
    return f"comercial:v1:compras:{email_persona}"


def clave_biblioteca(email_persona: str) -> str:
    return f"comercial:v1:adquisiciones:{email_persona}"


def clave_juego(id_juego: int) -> str:
    return f"catalogo:v1:juego:{id_juego}"


CLAVE_CATALOGO = "catalogo:v1:juegos"


def disponible() -> bool:
    try:
        return bool(_client().ping())
    except redis.RedisError:
        return False


def obtener(clave: str) -> Any | None:
    try:
        valor = _client().get(clave)
    except redis.RedisError:
        logger.warning("Cache no disponible, leyendo de BD")
        return None
    return json.loads(valor) if valor is not None else None


def guardar(clave: str, valor: Any, ttl: int | None = None) -> None:
    try:
        _client().set(clave, json.dumps(valor), ex=ttl if ttl is not None else store.settings().cache_ttl_seconds)
    except redis.RedisError:
        logger.warning("No se pudo guardar en cache: %s", clave)


def invalidar(*claves: str) -> None:
    if not claves:
        return
    try:
        _client().delete(*claves)
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
