from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session
from app.database import get_db
from services.comercial.biblioteca import obtener_biblioteca
from security.dependencies import Identidad, autorizar_persona, obtener_usuario_actual

router = APIRouter(prefix="/biblioteca", tags=["Biblioteca"])


async def composed(email, request, response, db, usuario):
    autorizar_persona(usuario, email, db)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Cache"] = "COMPOSED"
    return await obtener_biblioteca(db, email, request.app.state.catalogo, usuario.access_token)


@router.get("")
async def mi_biblioteca(request: Request, response: Response,
                        db: Session = Depends(get_db),
                        usuario: Identidad = Depends(obtener_usuario_actual)):
    return await composed(usuario.email, request, response, db, usuario)


@router.get("/{email_persona}")
async def biblioteca_de(email_persona: str, request: Request, response: Response,
                        db: Session = Depends(get_db),
                        usuario: Identidad = Depends(obtener_usuario_actual)):
    return await composed(email_persona, request, response, db, usuario)
