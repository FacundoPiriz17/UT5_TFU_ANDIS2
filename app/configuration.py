"""External Configuration Store: JSON compartido, validado y leído en runtime."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import tempfile
from threading import RLock

from pydantic import BaseModel, ConfigDict, Field


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    cache_ttl_seconds: int = Field(default=60, ge=1, le=3600)
    winter_discount_percent: int = Field(default=50, ge=0, le=100)
    purchases_enabled: bool = True
    store_notice: str = Field(default="Bienvenido a la tienda de juegos", max_length=160)


class Document(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    revision: int = Field(ge=1)
    settings: Settings


class ConfigurationConflict(Exception):
    pass


class ConfigurationUnavailable(Exception):
    pass


class ConfigurationStore:
    def __init__(self, path):
        self.path = Path(path)
        self._last_valid = None
        self._lock = RLock()

    @staticmethod
    def fingerprint(document):
        value = json.dumps(document.model_dump(), sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(value.encode()).hexdigest()

    def snapshot(self):
        with self._lock:
            error = None
            try:
                document = Document.model_validate_json(self.path.read_text(encoding="utf-8-sig"))
                self._last_valid = document
            except (OSError, ValueError) as exc:
                error = "El JSON no está disponible o no cumple el esquema; se conserva la última configuración válida."
                if self._last_valid is None:
                    raise ConfigurationUnavailable(error) from exc
                document = self._last_valid
            return {"document": document.model_dump(), "hash": self.fingerprint(document),
                    "status": "last_valid" if error else "ok", "error": error,
                    "source": "config/settings.json"}

    def settings(self):
        return Settings.model_validate(self.snapshot()["document"]["settings"])

    @contextmanager
    def _writer_lock(self):
        # El lock de archivo coordina también escritores de otras réplicas.
        with self._lock, self.path.with_suffix(".lock").open("a+b") as handle:
            if os.name == "nt":
                import msvcrt
                handle.write(b"0")
                handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                if os.name == "nt":
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(handle, fcntl.LOCK_UN)

    def update(self, settings: Settings, expected_hash: str):
        with self._writer_lock():
            current = self.snapshot()
            if current["hash"] != expected_hash:
                raise ConfigurationConflict("El JSON cambió desde que lo abriste. Recargá antes de guardar.")
            document = Document(revision=current["document"]["revision"] + 1, settings=settings)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent,
                                                 suffix=".tmp", delete=False) as output:
                    temporary = output.name
                    output.write(document.model_dump_json(indent=2) + "\n")
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, self.path)
            finally:
                if temporary and os.path.exists(temporary):
                    os.unlink(temporary)
            return self.snapshot()


store = ConfigurationStore(os.getenv("CONFIG_PATH", str(Path(__file__).resolve().parents[1] / "config/settings.json")))
