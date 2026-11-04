from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()

# Sólo metadatos para resolver las FK del esquema compartido. No es un ORM de Juego.
# Ninguna consulta comercial lee esta tabla; los metadatos llegan por SOAP.
Table("Juego", Base.metadata, Column("IdJuego", Integer, primary_key=True))

class Persona(Base):
    __tablename__ = "Persona"

    EmailPersona = Column(String(100), primary_key=True)
    NombrePersona = Column(String(30), nullable=False)
    ApellidoPersona = Column(String(30), nullable=False)


class Login(Base):
    __tablename__ = "Login"

    EmailPersona = Column(
        String(100),
        ForeignKey("Persona.EmailPersona"),
        primary_key=True,
    )

    ContrasenaLogin = Column(
        "ContrasenaLogin",
        String(256),
        nullable=False,
    )

    FechaCreacion = Column(
        DateTime,
        server_default=func.now(),
    )


class Compra(Base):
    __tablename__ = "Compra"

    EmailPersona = Column(
        String(300),
        ForeignKey("Persona.EmailPersona"),
        primary_key=True,
    )
    IdJuego = Column(
        Integer,
        ForeignKey("Juego.IdJuego"),
        primary_key=True,
    )
    FechaHoraCompra = Column(
        DateTime,
        server_default=func.now(),
    )
    CostoCompra = Column(Integer)


class Copia(Base):
    __tablename__ = "Copia"

    IdJuego = Column(
        Integer,
        ForeignKey("Juego.IdJuego"),
        primary_key=True,
    )
    EmailPersona = Column(
        String(300),
        ForeignKey("Persona.EmailPersona"),
        primary_key=True,
    )


