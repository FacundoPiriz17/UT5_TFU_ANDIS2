from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class JuegoCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    generos: list[str] = []


class JuegoUpdate(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    generos: list[str] | None = None


