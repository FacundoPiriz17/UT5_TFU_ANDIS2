from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app import cache
from app.aspects.audit import auditar
from app.database import get_db
from app.schemas import CompraCreate, CompraUpdate, CompraLectura, ResumenCompras
from app.services.compras_commands import (
    crear_compra,
    eliminar_compra,
    recalcular_compra,
)
from app.services import compras_queries
from security.dependencies import Identidad, autorizar_persona, obtener_usuario_actual

router = APIRouter(
    prefix="/compras",
    tags=["Compras"],
    dependencies=[Depends(obtener_usuario_actual)],
)


def _respuesta(compra, politica: str | None = None):
    return {
        "email_persona": compra.EmailPersona,
        "id_juego": compra.IdJuego,
        "fecha_hora": compra.FechaHoraCompra,
        "costo_compra": compra.CostoCompra,
        "politica": politica,
    }


@router.get("/{email_persona}", response_model=list[CompraLectura])
def listar_compras(
    email_persona: str,
    response: Response,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, email_persona, db)
    return cache.obtener_o_cargar(
        cache.clave_compras(email_persona),
        lambda: compras_queries.listar_compras(db, email_persona),
        response,
    )


@router.get("/{email_persona}/resumen", response_model=ResumenCompras)
def resumen_compras(
    email_persona: str,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, email_persona, db)
    return compras_queries.resumir_compras(db, email_persona)


@router.post("", status_code=status.HTTP_201_CREATED)
@auditar("GENERAR_COMPRA")
def generar_compra(
    datos: CompraCreate,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, datos.email_persona, db)
    compra = crear_compra(
        db=db,
        email_persona=datos.email_persona,
        id_juego=datos.id_juego,
        costo_base=datos.costo_base,
        politica=datos.politica,
    )

    return _respuesta(compra, datos.politica)


@router.put("/{email_persona}/{id_juego}")
@auditar("ACTUALIZAR_COMPRA")
def actualizar_compra(
    email_persona: str,
    id_juego: int,
    datos: CompraUpdate,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, email_persona, db)
    compra = recalcular_compra(
        db=db,
        email_persona=email_persona,
        id_juego=id_juego,
        costo_base=datos.costo_base,
        politica=datos.politica,
    )

    return _respuesta(compra, datos.politica)


@router.delete(
    "/{email_persona}/{id_juego}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@auditar("ELIMINAR_COMPRA")
def borrar_compra(
    email_persona: str,
    id_juego: int,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, email_persona, db)
    eliminar_compra(
        db=db,
        email_persona=email_persona,
        id_juego=id_juego,
    )

    return None
