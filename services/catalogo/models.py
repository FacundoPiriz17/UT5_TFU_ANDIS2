from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class Genero(Base):
    __tablename__ = "Genero"

    NombreGenero = Column(String(30), primary_key=True)
    DescripcionGenero = Column(String(300))


class Juego(Base):
    __tablename__ = "Juego"

    IdJuego = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )
    NombreJuego = Column(String(100), nullable=False)


class JuegoTieneGenero(Base):
    __tablename__ = "JuegoTieneGenero"

    IdJuego = Column(
        Integer,
        ForeignKey("Juego.IdJuego"),
        primary_key=True,
    )
    NombreGenero = Column(
        String(30),
        ForeignKey("Genero.NombreGenero"),
        primary_key=True,
    )


