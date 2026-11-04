"""Cliente SOAP Zeep: contrato local, token delegado, presupuesto total y retry acotado."""
import asyncio
from contextvars import ContextVar
from dataclasses import dataclass
import os
from pathlib import Path
import time

from fastapi import HTTPException
import httpx
from lxml import etree
from zeep import AsyncClient, Settings
from zeep.exceptions import Error as ZeepError, Fault
from zeep.helpers import serialize_object
from zeep.transports import AsyncTransport
from zeep.proxy import AsyncServiceProxy

from app.observability import correlation_id, event
from services.comercial.resilience import CircuitBreaker, CircuitOpen

NS = "urn:andis:catalogo:v1"
HEADERS = ContextVar("soap_headers", default={})
REMAINING = ContextVar("soap_remaining", default=3.0)
CONTRACT = Path(__file__).resolve().parents[2] / "contracts/catalogo-v1.wsdl"


@dataclass(frozen=True)
class Policy:
    connect: float = 0.35
    read: float = 0.7
    total: float = 3.0
    attempts: int = 3
    backoff: float = 0.1
    threshold: int = 3
    recovery: float = 5.0

    @classmethod
    def environment(cls):
        value = cls(connect=float(os.getenv("SOAP_CONNECT_TIMEOUT", ".35")),
                    read=float(os.getenv("SOAP_READ_TIMEOUT", ".7")),
                    total=float(os.getenv("SOAP_TOTAL_BUDGET", "3")),
                    attempts=int(os.getenv("SOAP_MAX_ATTEMPTS", "3")),
                    backoff=float(os.getenv("SOAP_RETRY_BACKOFF", ".1")),
                    threshold=int(os.getenv("CIRCUIT_FAILURE_THRESHOLD", "3")),
                    recovery=float(os.getenv("CIRCUIT_RECOVERY_SECONDS", "5")))
        if min(value.connect, value.read, value.total, value.recovery) <= 0 or value.attempts < 1 or value.backoff < 0:
            raise ValueError("Política SOAP inválida")
        return value


class BoundedTransport(AsyncTransport):
    def __init__(self, policy, http_client=None):
        self.policy = policy
        super().__init__(client=http_client or httpx.AsyncClient(trust_env=False),
                         wsdl_client=httpx.Client(trust_env=False), operation_timeout=policy.read)

    async def post(self, address, message, headers):
        remaining = REMAINING.get()
        timeout = httpx.Timeout(connect=min(self.policy.connect, remaining),
                                read=min(self.policy.read, remaining),
                                write=remaining, pool=remaining)
        async with self.client.stream("POST", address, content=message,
                                      headers={**headers, **HEADERS.get()}, timeout=timeout) as response:
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > 65536:
                    raise ValueError("Respuesta SOAP demasiado grande")
            return httpx.Response(response.status_code, headers=response.headers,
                                  content=bytes(body), request=response.request)


class CatalogClient:
    def __init__(self, endpoint=None, policy=None, http_client=None, clock=time.monotonic, sleep=asyncio.sleep):
        self.policy = policy or Policy.environment()
        self.clock, self.sleep = clock, sleep
        self.breaker = CircuitBreaker(self.policy.threshold, self.policy.recovery, clock)
        self.transport = BoundedTransport(self.policy, http_client)
        self.zeep = AsyncClient(str(CONTRACT), transport=self.transport,
                               settings=Settings(strict=True, forbid_dtd=True, forbid_entities=True,
                                                 forbid_external=True, xml_huge_tree=False))
        # Usa el binding publicado, pero configura la dirección por ambiente sin descargar WSDL.
        self.service = AsyncServiceProxy(
            self.zeep, self.zeep.wsdl.bindings[f"{{{NS}}}CatalogoSoapBinding"],
            address=endpoint or os.getenv("CATALOGO_SOAP_URL", "http://catalogo:8000/soap/catalogo"))

    async def close(self):
        await self.transport.aclose()
        self.transport.wsdl_client.close()

    async def invoke(self, operation, token, **arguments):
        self.breaker.logical_call()
        started = self.clock()
        deadline = started + self.policy.total
        last_error = None
        for attempt in range(1, self.policy.attempts + 1):
            remaining = deadline - self.clock()
            if remaining <= 0:
                break
            try:
                ticket = self.breaker.acquire()
            except CircuitOpen as exc:
                event(operation, result="circuit_open", attempt=attempt)
                raise HTTPException(503, str(exc)) from None
            context = HEADERS.set({"Authorization": f"Bearer {token}",
                                   "X-Correlation-ID": correlation_id.get(), "X-SOAP-Attempt": str(attempt)})
            budget = REMAINING.set(remaining)
            attempt_started = self.clock()
            try:
                # Incluye conexión, lectura completa, las esperas y todos los intentos.
                async with asyncio.timeout(remaining):
                    result = await getattr(self.service, operation)(**arguments)
                self.breaker.success(ticket)
                event(operation, result="ok", attempt=attempt, probe=ticket.probe,
                      duration_ms=round((self.clock() - attempt_started) * 1000, 2))
                return serialize_object(result, target_cls=dict)
            except Fault as exc:
                code = exc.detail.findtext(f".//{{{NS}}}codigo") if exc.detail is not None else None
                if code in {"JuegoNoEncontrado", "NoAutorizado", "SolicitudInvalida"}:
                    self.breaker.success(ticket)
                    event(operation, result=code, attempt=attempt, probe=ticket.probe)
                    status = {"JuegoNoEncontrado": 404, "NoAutorizado": 403, "SolicitudInvalida": 400}[code]
                    raise HTTPException(status, exc.message) from None
                self.breaker.failure(ticket)
                last_error = type(exc).__name__
            except (httpx.HTTPError, TimeoutError, ZeepError, etree.LxmlError, ValueError, OSError) as exc:
                self.breaker.failure(ticket)
                last_error = type(exc).__name__
            except asyncio.CancelledError:
                # Libera la sonda si quien llamó cancela la solicitud.
                self.breaker.failure(ticket)
                raise
            finally:
                HEADERS.reset(context)
                REMAINING.reset(budget)
            event(operation, result="technical_failure", error=last_error, attempt=attempt,
                  probe=ticket.probe, duration_ms=round((self.clock() - attempt_started) * 1000, 2))
            if ticket.probe or self.breaker.snapshot()["state"] == "open" or attempt == self.policy.attempts:
                break
            delay = self.policy.backoff * (2 ** (attempt - 1))
            if self.clock() + delay >= deadline:
                break
            await self.sleep(delay)
        raise HTTPException(503, "Catálogo temporalmente indisponible; no se registró la compra")

    @staticmethod
    def game(value):
        return {"id_juego": value["id_juego"], "nombre": value["nombre"],
                "generos": (value.get("generos") or {}).get("genero", []) or []}

    async def obtener_juego(self, game_id, token):
        result = await self.invoke("ObtenerJuego", token, id_juego=game_id)
        return self.game(result)

    async def obtener_juegos(self, ids, token):
        games = []
        for start in range(0, len(ids), 200):
            result = await self.invoke("ObtenerJuegos", token, id_juego=ids[start:start + 200])
            games.extend(self.game(value) for value in result or [])
        return games
