from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Compra, Copia, Juego, Persona
from app.services.juegos import generos_por_juego


def obtener_biblioteca(
    db: Session,
    email_persona: str,
) -> dict:
    if db.get(Persona, email_persona) is None:
        raise HTTPException(
            status_code=404,
            detail="Persona no encontrada",
        )

    filas = (
        db.query(Juego, Compra)
        .join(Copia, Copia.IdJuego == Juego.IdJuego)
        .outerjoin(
            Compra,
            (Compra.IdJuego == Copia.IdJuego)
            & (Compra.EmailPersona == Copia.EmailPersona),
        )
        .filter(Copia.EmailPersona == email_persona)
        .order_by(Juego.NombreJuego)
        .all()
    )

    generos = generos_por_juego(db, [juego.IdJuego for juego, _ in filas])

    juegos = [
        {
            "id_juego": juego.IdJuego,
            "nombre": juego.NombreJuego,
            "generos": generos[juego.IdJuego],
            "fecha_compra": compra.FechaHoraCompra if compra else None,
            "costo_compra": compra.CostoCompra if compra else None,
        }
        for juego, compra in filas
    ]

    return {
        "email_persona": email_persona,
        "total_juegos": len(juegos),
        "juegos": juegos,
    }
