from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.database import Base


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
