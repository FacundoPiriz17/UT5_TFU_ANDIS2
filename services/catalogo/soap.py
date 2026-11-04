"""SOAP 1.1 document/literal, contrato versionado y procesamiento XML cerrado."""
import asyncio
import json
import os
from pathlib import Path
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from lxml import etree
from sqlalchemy.orm import Session

from app import cache
from app.database import get_db
from app.observability import event
from security.dependencies import oauth2, obtener_usuario_actual
from services.catalogo.queries import generos_por_juego, obtener_juego
from services.catalogo.models import Juego

NS = "urn:andis:catalogo:v1"
SOAP = "http://schemas.xmlsoap.org/soap/envelope/"
CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
MAX_MESSAGE = 65536
schema = etree.XMLSchema(etree.parse(str(CONTRACTS / "catalogo-v1.xsd")))
router = APIRouter(tags=["Contrato SOAP v1"])


def envelope():
    root = etree.Element(f"{{{SOAP}}}Envelope", nsmap={"soap": SOAP, "cat": NS})
    return root, etree.SubElement(root, f"{{{SOAP}}}Body")


def xml_response(root, status=200):
    return Response(etree.tostring(root, xml_declaration=True, encoding="UTF-8"),
                    status_code=status, media_type="text/xml")


def fault(code, message, status=500):
    root, body = envelope()
    node = etree.SubElement(body, f"{{{SOAP}}}Fault")
    etree.SubElement(node, "faultcode").text = "soap:Server" if code == "FalloTecnico" else "soap:Client"
    etree.SubElement(node, "faultstring").text = message
    detail = etree.SubElement(node, "detail")
    error = etree.SubElement(detail, f"{{{NS}}}ErrorCatalogo")
    etree.SubElement(error, f"{{{NS}}}codigo").text = code
    etree.SubElement(error, f"{{{NS}}}mensaje").text = message
    return xml_response(root, status)


async def parse_message(request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_MESSAGE:
            raise ValueError("Mensaje demasiado grande")
    parser = etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True,
                             huge_tree=False, recover=False)
    root = etree.fromstring(bytes(data), parser)
    if root.getroottree().docinfo.doctype:
        raise ValueError("DTD y entidades no permitidas")
    if root.tag != f"{{{SOAP}}}Envelope":
        raise ValueError("Se requiere SOAP 1.1 Envelope")
    bodies = root.findall(f"{{{SOAP}}}Body")
    if len(bodies) != 1 or len(bodies[0]) != 1:
        raise ValueError("Body debe contener una operación")
    operation = bodies[0][0]
    if operation.tag not in (f"{{{NS}}}ObtenerJuego", f"{{{NS}}}ObtenerJuegos"):
        raise ValueError("Operación desconocida")
    schema.assertValid(operation)
    return etree.QName(operation).localname, [int(e.text) for e in operation]


def append_game(parent, game):
    node = etree.SubElement(parent, f"{{{NS}}}juego")
    etree.SubElement(node, f"{{{NS}}}id_juego").text = str(game["id_juego"])
    etree.SubElement(node, f"{{{NS}}}nombre").text = game["nombre"]
    genres = etree.SubElement(node, f"{{{NS}}}generos")
    for value in game["generos"]:
        etree.SubElement(genres, f"{{{NS}}}genero").text = value


@router.get("/soap/catalogo")
def published_wsdl():
    # La única diferencia respecto al WSDL local es la dirección por ambiente.
    document = etree.parse(str(CONTRACTS / "catalogo-v1.wsdl"))
    document.find(".//{http://schemas.xmlsoap.org/wsdl/soap/}address").set(
        "location", os.getenv("CATALOGO_PUBLIC_SOAP_URL", "http://localhost:8055/soap/catalogo"))
    return xml_response(document)


@router.get("/soap/catalogo-v1.xsd")
def published_schema():
    return Response((CONTRACTS / "catalogo-v1.xsd").read_bytes(), media_type="text/xml")


@router.post("/soap/catalogo")
async def soap(request: Request, token: str | None = Depends(oauth2), db: Session = Depends(get_db)):
    started = time.monotonic()
    operation = "SOAP"
    try:
        obtener_usuario_actual(token)
    except HTTPException as exc:
        code = "FalloTecnico" if exc.status_code == 503 else "NoAutorizado"
        return fault(code, str(exc.detail), exc.status_code)
    try:
        operation, ids = await parse_message(request)
    except (ValueError, etree.LxmlError):
        return fault("SolicitudInvalida", "XML, operación o identificador inválido", 400)

    # Solamente el override de demostración habilita fallos artificiales.
    if os.getenv("UT5_DEMO_MODE") == "true":
        try:
            config = json.loads(Path(os.environ["CATALOGO_FAULT_FILE"]).read_text(encoding="utf-8-sig"))
            delay = min(max(float(config.get("delay_seconds", 0)), 0), 10)
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            config, delay = {}, 0
        await asyncio.sleep(delay)
        if config.get("unavailable"):
            event(operation, result="demo_unavailable")
            return fault("FalloTecnico", "Fallo técnico de demostración", 503)

    try:
        if operation == "ObtenerJuego":
            games = [cache.obtener_o_cargar(cache.clave_juego(ids[0]), lambda: obtener_juego(db, ids[0]))]
        else:
            # Una consulta por lote; no consulta tablas comerciales ni recorre detalles remotos.
            rows = db.query(Juego).filter(Juego.IdJuego.in_(ids)).all()
            genres = generos_por_juego(db, ids)
            by_id = {g.IdJuego: {"id_juego": g.IdJuego, "nombre": g.NombreJuego,
                                 "generos": genres[g.IdJuego]} for g in rows}
            if any(value not in by_id for value in ids):
                raise HTTPException(404, "Juego no encontrado")
            games = [by_id[value] for value in dict.fromkeys(ids)]
        root, body = envelope()
        response = etree.SubElement(body, f"{{{NS}}}{operation}Response")
        for game in games:
            append_game(response, game)
        schema.assertValid(response)
        event(operation, result="ok", game_ids=ids,
              duration_ms=round((time.monotonic() - started) * 1000, 2))
        return xml_response(root)
    except HTTPException as exc:
        if exc.status_code == 404:
            event(operation, result="JuegoNoEncontrado", game_ids=ids)
            return fault("JuegoNoEncontrado", "Juego no encontrado")
        raise
