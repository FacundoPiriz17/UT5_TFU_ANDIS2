from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import cache
from app.aspects.audit import auditar
from app.database import get_db
from app.models import Login, Persona
from app.schemas import PersonaCreate, PersonaUpdate
from security.dependencies import Identidad, autorizar_persona, obtener_usuario_actual, requerir_admin

router = APIRouter(
    prefix="/personas",
    tags=["Personas"],
    dependencies=[Depends(obtener_usuario_actual)],
)


def _respuesta(persona: Persona):
    return {
        "email": persona.EmailPersona,
        "nombre": persona.NombrePersona,
        "apellido": persona.ApellidoPersona,
    }


@router.get("", dependencies=[Depends(requerir_admin)])
def listar_personas(
    db: Session = Depends(get_db),
):
    personas = (
        db.query(Persona)
        .order_by(Persona.EmailPersona)
        .all()
    )

    return [
        _respuesta(persona)
        for persona in personas
    ]


@router.get("/{email}")
def obtener_persona(
    email: str,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, email, db)
    persona = db.get(Persona, email)

    if persona is None:
        raise HTTPException(
            status_code=404,
            detail="Persona no encontrada",
        )

    return _respuesta(persona)


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(requerir_admin)])
@auditar("INSERTAR_PERSONA")
def crear_persona(
    datos: PersonaCreate,
    db: Session = Depends(get_db),
):
    if db.get(Persona, datos.email) is not None:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una persona con ese email",
        )

    persona = Persona(
        EmailPersona=datos.email,
        NombrePersona=datos.nombre,
        ApellidoPersona=datos.apellido,
    )

    try:
        db.add(persona)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo crear la persona",
        )

    return {
        "email": persona.EmailPersona,
        "nombre": persona.NombrePersona,
        "apellido": persona.ApellidoPersona,
    }


@router.put("/{email}")
@auditar("ACTUALIZAR_PERSONA")
def actualizar_persona(
    email: str,
    datos: PersonaUpdate,
    db: Session = Depends(get_db),
    usuario: Identidad = Depends(obtener_usuario_actual),
):
    autorizar_persona(usuario, email, db)
    persona = db.get(Persona, email)

    if persona is None:
        raise HTTPException(
            status_code=404,
            detail="Persona no encontrada",
        )

    persona.NombrePersona = datos.nombre
    persona.ApellidoPersona = datos.apellido

    db.commit()
    db.refresh(persona)

    return {
        "email": persona.EmailPersona,
        "nombre": persona.NombrePersona,
        "apellido": persona.ApellidoPersona,
    }


@router.delete("/{email}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(requerir_admin)])
@auditar("ELIMINAR_PERSONA")
def eliminar_persona(
    email: str,
    db: Session = Depends(get_db),
):
    persona = db.get(Persona, email)

    if persona is None:
        raise HTTPException(
            status_code=404,
            detail="Persona no encontrada",
        )

    try:
        # Se conservan las filas históricas Login, pero al eliminar el perfil
        # deben retirarse en la misma transacción para respetar la FK heredada.
        db.query(Login).filter(Login.EmailPersona == email).delete()
        db.delete(persona)
        db.commit()
        cache.invalidar_persona(email)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="La persona tiene compras asociadas y no puede eliminarse",
        )

    return None
