"""Demo interna contra MySQL: usa el servicio real e inyecta fallo tras flush."""
from uuid import uuid4
from sqlalchemy import event
from app.database import SessionLocal
from app.models import Compra, Copia, Juego, Persona
from app.services.compras import crear_compra


class FalloControlado(RuntimeError):
    pass


def _fila_compra(compra):
    return (
        f"Compra(EmailPersona={compra.EmailPersona!r}, IdJuego={compra.IdJuego}, "
        f"CostoCompra={compra.CostoCompra}, FechaHoraCompra={compra.FechaHoraCompra})"
    )


def _fila_copia(copia):
    return f"Copia(IdJuego={copia.IdJuego}, EmailPersona={copia.EmailPersona!r})"


def main():
    email = f"acid-{uuid4().hex}@demo.local"
    costo_base = 100
    politica = "normal"

    with SessionLocal() as setup:
        setup.add(Persona(EmailPersona=email, NombrePersona="Demo", ApellidoPersona="ACID"))
        games = [Juego(NombreJuego="ACID exito"), Juego(NombreJuego="ACID fallo")]
        setup.add_all(games)
        setup.commit()
        ids = [game.IdJuego for game in games]

    print("=== Datos de prueba ===")
    print(f"Persona: EmailPersona={email!r}")
    print(f"Caso A -> IdJuego={ids[0]} ('ACID exito'), costo_base={costo_base}, politica={politica!r}")
    print(f"Caso B -> IdJuego={ids[1]} ('ACID fallo'), costo_base={costo_base}, politica={politica!r}")

    try:
        print("\n=== Caso A: commit exitoso ===")
        with SessionLocal() as db:
            crear_compra(db, email, ids[0], costo_base, politica)
        with SessionLocal() as observer:
            compra_a = observer.get(Compra, (email, ids[0]))
            copia_a = observer.get(Copia, (ids[0], email))
            assert compra_a is not None
            assert copia_a is not None
            print(f"Leido en otra sesion -> {_fila_compra(compra_a)}")
            print(f"Leido en otra sesion -> {_fila_copia(copia_a)}")
        print("Caso A: Compra y Copia persistidas (lectura en otra sesion).")

        print("\n=== Caso B: fallo forzado antes del commit ===")
        flushed = []

        def fail_after_flush(session, context):
            # Las dos escrituras ya alcanzaron MySQL, pero no el commit.
            compra_pendiente = session.get(Compra, (email, ids[1]))
            copia_pendiente = session.get(Copia, (ids[1], email))
            assert compra_pendiente is not None
            assert copia_pendiente is not None
            print(f"Tras flush (dentro de la transaccion, sin commit) -> {_fila_compra(compra_pendiente)}")
            print(f"Tras flush (dentro de la transaccion, sin commit) -> {_fila_copia(copia_pendiente)}")
            flushed.append(True)
            raise FalloControlado("Fallo deliberado despues de INSERT y antes de COMMIT")

        with SessionLocal() as db:
            event.listen(db, "after_flush_postexec", fail_after_flush)
            try:
                crear_compra(db, email, ids[1], costo_base, politica)
            except FalloControlado as exc:
                print(f"Excepcion capturada: {exc}")
                assert not db.in_transaction(), "Falta rollback explicito"
            else:
                raise AssertionError("No se produjo el fallo controlado")
            finally:
                event.remove(db, "after_flush_postexec", fail_after_flush)
        assert flushed
        with SessionLocal() as observer:
            compra_b = observer.get(Compra, (email, ids[1]))
            copia_b = observer.get(Copia, (ids[1], email))
            assert compra_b is None
            assert copia_b is None
            print(f"Leido en otra sesion -> Compra: {compra_b} (no existe)")
            print(f"Leido en otra sesion -> Copia: {copia_b} (no existe)")
        print("Caso B: Compra NO persistida; Copia NO persistida. Rollback verificado.")
    finally:
        with SessionLocal() as cleanup:
            cleanup.query(Compra).filter_by(EmailPersona=email).delete()
            cleanup.query(Copia).filter_by(EmailPersona=email).delete()
            cleanup.query(Juego).filter(Juego.IdJuego.in_(ids)).delete(synchronize_session=False)
            cleanup.query(Persona).filter_by(EmailPersona=email).delete()
            cleanup.commit()


if __name__ == "__main__":
    main()
