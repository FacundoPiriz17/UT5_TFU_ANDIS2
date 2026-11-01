from pathlib import Path

from fastapi import APIRouter, Depends

from app.aspects.audit import LOG_PATH
from security.dependencies import requerir_admin

router = APIRouter(
    prefix="/auditoria",
    tags=["Auditoria"],
    dependencies=[Depends(requerir_admin)],
)


@router.get("")
def obtener_auditoria():
    path = Path(LOG_PATH)

    if not path.exists():
        return {"lineas": []}

    lineas = path.read_text(
        encoding="utf-8"
    ).splitlines()

    return {"lineas": lineas[-100:]}
