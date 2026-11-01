from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Juego, JuegoTieneGenero


def generos_por_juego(
    db: Session,
    ids_juego: list[int],
) -> dict[int, list[str]]:
    generos: dict[int, list[str]] = defaultdict(list)

    if not ids_juego:
        return generos

    relaciones = (
        db.query(JuegoTieneGenero)
        .filter(JuegoTieneGenero.IdJuego.in_(ids_juego))
        .order_by(JuegoTieneGenero.NombreGenero)
        .all()
    )

    for relacion in relaciones:
        generos[relacion.IdJuego].append(relacion.NombreGenero)

    return generos


def listar_juegos(db: Session) -> list[dict]:
    juegos = db.query(Juego).order_by(Juego.IdJuego).all()
    generos = generos_por_juego(db, [juego.IdJuego for juego in juegos])

    return [
        {
            "id_juego": juego.IdJuego,
            "nombre": juego.NombreJuego,
            "generos": generos[juego.IdJuego],
        }
        for juego in juegos
    ]


def obtener_juego(
    db: Session,
    id_juego: int,
) -> dict:
    juego = db.get(Juego, id_juego)

    if juego is None:
        raise HTTPException(
            status_code=404,
            detail="Juego no encontrado",
        )

    generos = generos_por_juego(db, [id_juego])

    return {
        "id_juego": juego.IdJuego,
        "nombre": juego.NombreJuego,
        "generos": generos[id_juego],
    }
