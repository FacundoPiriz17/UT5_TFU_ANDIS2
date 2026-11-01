import { useEffect, useRef, useState } from 'react';
import health from '../assets/diagramas/health_endpoint_monitoring.png';
import throttling from '../assets/diagramas/throttling.png';
import cache from '../assets/diagramas/cache_aside.png';
import cqrs from '../assets/diagramas/cqrs.png';
import identity from '../assets/diagramas/federated_identity.png';
import offloading from '../assets/diagramas/gateway_offloading.png';
import deploy from '../assets/diagramas/blue_green.png';
import configuration from '../assets/diagramas/external_configuration_store.png';

const DIAGRAMAS = { health, throttling, cache, cqrs, identity, offloading, deploy, configuration };

export default function DiagramaPatron({ id, nombre }) {
  const dialogo = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [tamanoReal, setTamanoReal] = useState(false);
  const imagen = DIAGRAMAS[id];

  useEffect(() => {
    if (!abierto) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, [abierto]);

  if (!imagen) return null;

  const ampliar = () => {
    setTamanoReal(false);
    dialogo.current.showModal();
    setAbierto(true);
  };

  return (
    <section className="pattern-diagram" aria-label={`Diagrama de ${nombre}`}>
      <div className="pattern-diagram-head">
        <h2>Diagrama del patrón</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={ampliar}>Ver ampliado</button>
      </div>
      <button type="button" className="pattern-diagram-preview" onClick={ampliar} aria-label={`Ampliar diagrama de ${nombre}`}>
        <img src={imagen} alt={`Diagrama de arquitectura de ${nombre}`} />
      </button>
      <dialog
        ref={dialogo}
        className="pattern-diagram-dialog"
        aria-labelledby={`diagrama-titulo-${id}`}
        onClose={() => setAbierto(false)}
        onClick={(event) => { if (event.target === event.currentTarget) dialogo.current.close(); }}
      >
        <div className="pattern-diagram-viewer">
          <div className="pattern-diagram-head">
            <h2 id={`diagrama-titulo-${id}`}>{nombre}</h2>
            <div className="pattern-diagram-actions">
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={tamanoReal} onClick={() => setTamanoReal((valor) => !valor)}>
                {tamanoReal ? 'Ajustar a pantalla' : 'Tamaño original'}
              </button>
              <a className="btn btn-ghost btn-sm" href={imagen} target="_blank" rel="noreferrer">Abrir imagen</a>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dialogo.current.close()} autoFocus>Cerrar</button>
            </div>
          </div>
          <div className={`pattern-diagram-canvas${tamanoReal ? ' pattern-diagram-canvas-original' : ''}`}>
            <img src={imagen} alt={`Diagrama de arquitectura de ${nombre}`} />
          </div>
        </div>
      </dialog>
    </section>
  );
}
