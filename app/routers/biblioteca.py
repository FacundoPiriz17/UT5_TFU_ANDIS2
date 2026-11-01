from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app import cache
from app.database import get_db
from app.services.biblioteca import obtener_biblioteca
from security.dependencies import Identidad, autorizar_persona, obtener_usuario_actual

router = APIRouter(
    prefix="/biblioteca",
    tags=["Biblioteca"],
    dependencies=[Depends(obtener_usuario_actual)],
)


def _biblioteca_cacheada(
    db: Session,
    email_persona: str,
    response: Response,
):
    return cache.obtener_o_cargar(
        cache.clave_biblioteca(email_persona),
        lambda: obtener_biblioteca(db, email_persona),
        response,
    )


@router.get("")
def mi_biblioteca(
    response: Response,
    usuario: Identidad = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    autorizar_persona(usuario, usuario.email, db)
    return _biblioteca_cacheada(db, usuario.email, response)


@router.get("/{email_persona}")
def biblioteca_de(
    email_persona: str,
    response: Response,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, email_persona, db)
    return _biblioteca_cacheada(db, email_persona, response)
