"""Comandos de Compras: validaciones de negocio y una transacción por operación."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app import cache
from app.configuration import store
from services.comercial.models import Compra, Copia, Persona
from app.strategies.costo_compra import obtener_estrategia


def _buscar_compra(
    db: Session,
    email_persona: str,
    id_juego: int,
) -> Compra | None:
    return (
        db.query(Compra)
        .filter(
            Compra.EmailPersona == email_persona,
            Compra.IdJuego == id_juego,
        )
        .first()
    )

async def crear_compra(
    db: Session,
    email_persona: str,
    id_juego: int,
    costo_base: int,
    politica: str,
    catalogo,
    token: str,
) -> Compra:
    if not store.settings().purchases_enabled:
        raise HTTPException(503, "Las compras están pausadas por configuración")
    # Devuelve al pool la conexión de la lectura de autorización antes de esperar
    # la red. Nunca valida Juego mediante un acceso SQL comercial.
    db.rollback()
    await catalogo.obtener_juego(id_juego, token)

    estrategia = obtener_estrategia(politica)
    costo = estrategia.calcular(costo_base)

    copia = Copia(
        IdJuego=id_juego,
        EmailPersona=email_persona,
    )

    compra = Compra(
        EmailPersona=email_persona,
        IdJuego=id_juego,
        CostoCompra=costo,
    )

    try:
        with db.begin():
            if db.get(Persona, email_persona) is None:
                raise HTTPException(404, "Persona no encontrada")
            if _buscar_compra(db, email_persona, id_juego):
                raise HTTPException(409, "La persona ya posee una compra de ese juego")
            db.add(copia)
            db.flush()
            db.add(compra)
            db.flush()
    except IntegrityError as exc:
        db.rollback()
        code = exc.orig.args[0] if exc.orig.args else None
        detail = ("La persona ya posee una compra de ese juego" if code == 1062
                  else "Conflicto de integridad: el juego o la persona cambió durante la compra")
        raise HTTPException(409, detail) from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, "No se pudo confirmar la compra") from None
    except Exception:
        db.rollback()
        raise
    cache.invalidar_persona(email_persona)
    db.refresh(compra)

    return compra


def recalcular_compra(
    db: Session,
    email_persona: str,
    id_juego: int,
    costo_base: int,
    politica: str,
) -> Compra:
    compra = _buscar_compra(
        db,
        email_persona,
        id_juego,
    )

    if compra is None:
        raise HTTPException(
            status_code=404,
            detail="Compra no encontrada",
        )

    estrategia = obtener_estrategia(politica)
    compra.CostoCompra = estrategia.calcular(costo_base)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    cache.invalidar_persona(email_persona)
    db.refresh(compra)

    return compra


def eliminar_compra(
    db: Session,
    email_persona: str,
    id_juego: int,
) -> None:
    compra = _buscar_compra(
        db,
        email_persona,
        id_juego,
    )

    if compra is None:
        raise HTTPException(
            status_code=404,
            detail="Compra no encontrada",
        )

    copia = (
        db.query(Copia)
        .filter(
            Copia.EmailPersona == email_persona,
            Copia.IdJuego == id_juego,
        )
        .first()
    )

    db.delete(compra)

    if copia is not None:
        db.delete(copia)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    cache.invalidar_persona(email_persona)
