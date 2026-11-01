from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    email: str
    contrasena: str


class PersonaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    nombre: str = Field(min_length=1, max_length=30)
    apellido: str = Field(min_length=1, max_length=30)


class PersonaUpdate(BaseModel):
    nombre: str = Field(min_length=1, max_length=30)
    apellido: str = Field(min_length=1, max_length=30)


class JuegoCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    generos: list[str] = []


class JuegoUpdate(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    generos: list[str] | None = None


class CompraCreate(BaseModel):
    email_persona: str
    id_juego: int
    costo_base: int = Field(gt=0)
    politica: Literal["normal", "invierno"] = "normal"


class CompraUpdate(BaseModel):
    costo_base: int = Field(gt=0)
    politica: Literal["normal", "invierno"] = "normal"


class CompraLectura(BaseModel):
    email_persona: str
    id_juego: int
    fecha_hora: datetime | None
    costo_compra: int | None
    politica: str | None = None


class ResumenCompras(BaseModel):
    email_persona: str
    cantidad_compras: int
    costo_total: int
