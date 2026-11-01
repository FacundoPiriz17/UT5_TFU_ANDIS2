"""Comandos de Compras: validaciones de negocio y una transacción por operación."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import cache
from app.configuration import store
from app.models import Compra, Copia, Juego, Persona
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

def crear_compra(
    db: Session,
    email_persona: str,
    id_juego: int,
    costo_base: int,
    politica: str,
) -> Compra:
    if not store.settings().purchases_enabled:
        raise HTTPException(503, "Las compras están pausadas por configuración")
    if db.get(Persona, email_persona) is None:
        raise HTTPException(
            status_code=404,
            detail="Persona no encontrada",
        )

    if db.get(Juego, id_juego) is None:
        raise HTTPException(
            status_code=404,
            detail="Juego no encontrado",
        )

    if _buscar_compra(db, email_persona, id_juego):
        raise HTTPException(
            status_code=409,
            detail="La persona ya posee una compra de ese juego",
        )

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
        db.add(copia)
        db.add(compra)
        db.commit()
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
