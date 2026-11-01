"""Demos heredadas: acciones acotadas, con autorización administrativa."""
import subprocess
import sys

from fastapi import APIRouter, Depends, HTTPException
from app.aspects.audit import auditar
from security.dependencies import requerir_admin

router = APIRouter(prefix="/demos/legacy", tags=["Demos antiguas"],
                   dependencies=[Depends(requerir_admin)])


@router.post("/acid")
@auditar("DEMO_ACID")
def acid():
    try:
        result = subprocess.run([sys.executable, "-m", "scripts.acid_check"],
                                capture_output=True, text=True, timeout=45)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(503, "La prueba ACID superó el tiempo permitido") from exc
    if result.returncode:
        raise HTTPException(500, "La prueba ACID falló. Revisá los logs de la API.")
    return {"ok": True, "output": result.stdout}
