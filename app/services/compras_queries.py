"""Consultas CQRS: proyecciones SQL a DTO, sin commit ni efectos colaterales."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Compra
from app.schemas import CompraLectura, ResumenCompras


def listar_compras(db: Session, email_persona: str) -> list[CompraLectura]:
    consulta = select(
        Compra.EmailPersona.label("email_persona"),
        Compra.IdJuego.label("id_juego"),
        Compra.FechaHoraCompra.label("fecha_hora"),
        Compra.CostoCompra.label("costo_compra"),
    ).where(Compra.EmailPersona == email_persona).order_by(Compra.IdJuego)
    return [CompraLectura(**fila) for fila in db.execute(consulta).mappings()]


def resumir_compras(db: Session, email_persona: str) -> ResumenCompras:
    consulta = select(
        func.count(Compra.IdJuego).label("cantidad_compras"),
        func.coalesce(func.sum(Compra.CostoCompra), 0).label("costo_total"),
    ).where(Compra.EmailPersona == email_persona)
    fila = db.execute(consulta).mappings().one()
    return ResumenCompras(email_persona=email_persona, **fila)
