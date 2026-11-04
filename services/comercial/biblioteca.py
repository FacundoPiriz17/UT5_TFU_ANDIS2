"""Adquisiciones locales cacheadas y composición con metadatos actuales por lote."""
from sqlalchemy.orm import Session
from app import cache
from services.comercial.models import Compra, Copia


async def obtener_biblioteca(db: Session, email_persona: str, catalogo, token: str) -> dict:
    def acquisitions():
        rows = (db.query(Copia.IdJuego, Compra.FechaHoraCompra, Compra.CostoCompra)
                .outerjoin(Compra, (Compra.IdJuego == Copia.IdJuego)
                           & (Compra.EmailPersona == Copia.EmailPersona))
                .filter(Copia.EmailPersona == email_persona).all())
        return [{"id_juego": row.IdJuego, "fecha_compra": row.FechaHoraCompra,
                 "costo_compra": row.CostoCompra} for row in rows]

    acquired = cache.obtener_o_cargar(cache.clave_biblioteca(email_persona), acquisitions)
    db.rollback()
    metadata = await catalogo.obtener_juegos([row["id_juego"] for row in acquired], token) if acquired else []
    by_id = {game["id_juego"]: game for game in metadata}
    games = [{**by_id[row["id_juego"]], "fecha_compra": row["fecha_compra"],
              "costo_compra": row["costo_compra"]} for row in acquired]
    games.sort(key=lambda game: (game["nombre"], game["id_juego"]))
    return {"email_persona": email_persona, "total_juegos": len(games), "juegos": games}
