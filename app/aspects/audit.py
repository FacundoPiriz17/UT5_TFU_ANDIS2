import inspect
import os
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from threading import Lock

LOG_PATH = Path(
    os.getenv("AUDIT_LOG_PATH", "/app/logs/operaciones.txt")
)

_lock = Lock()


def _registrar_linea(operacion: str, resultado: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).isoformat()

    with _lock:
        with LOG_PATH.open("a", encoding="utf-8") as archivo:
            archivo.write(
                f"{timestamp} | {operacion} | {resultado}\n"
            )


def auditar(operacion: str):
    def decorador(funcion):
        if inspect.iscoroutinefunction(funcion):

            @wraps(funcion)
            async def wrapper(*args, **kwargs):
                try:
                    resultado = await funcion(*args, **kwargs)
                    _registrar_linea(operacion, "OK")
                    return resultado
                except Exception as exc:
                    _registrar_linea(
                        operacion,
                        f"ERROR:{type(exc).__name__}",
                    )
                    raise

            return wrapper

        @wraps(funcion)
        def wrapper(*args, **kwargs):
            try:
                resultado = funcion(*args, **kwargs)
                _registrar_linea(operacion, "OK")
                return resultado
            except Exception as exc:
                _registrar_linea(
                    operacion,
                    f"ERROR:{type(exc).__name__}",
                )
                raise

        return wrapper

    return decorador
