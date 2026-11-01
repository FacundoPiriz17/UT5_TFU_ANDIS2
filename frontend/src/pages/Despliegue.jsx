import { useEffect, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useSesion } from '../lib/auth';
import { Aviso, Boton, Card, Comando, ComoFunciona, EncabezadoPatron, Estado } from '../components/ui';

export default function Despliegue() {
  const session = useSesion();
  const admin = session?.roles.includes('admin');
  const [state, setState] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [traffic, setTraffic] = useState([]);
  const [monitor, setMonitor] = useState(true);

  useEffect(() => {
    let alive = true;
    let polling = false;
    const read = async () => {
      if (polling) return;
      polling = true;
      try {
        const [status, request] = await Promise.all([
          api('/deployment/status', { auth: false, silencioso: true }),
          api('/instance', { auth: false, silencioso: true }),
        ]);
        if (!alive) return;
        if (status.ok) setState(status.data);
        else setMessage({ tipo: 'err', text: mensajeError(status) });
        setTraffic((rows) => [{ at: new Date(), status: request.status, ms: request.ms,
          ...request.data }, ...rows].slice(0, 60));
      } finally { polling = false; }
    };
    read();
    const timer = monitor ? setInterval(read, 2000) : null;
    return () => { alive = false; clearInterval(timer); };
  }, [monitor]);

  const promote = async (slot) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api(`/deployment/promote/${slot}`, { method: 'POST' });
      setMessage({ tipo: response.ok ? 'ok' : 'err', text: response.ok
        ? `Tráfico dirigido a ${slot}. El frontend y los datos siguen disponibles.` : mensajeError(response) });
      const result = await api('/deployment/status', { auth: false, silencioso: true });
      if (result.ok) setState(result.data);
    } catch (error) { setMessage({ tipo: 'err', text: error.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <EncabezadoPatron id="deploy" atributo="Facilidad de despliegue">
        Blue y Green mantienen dos versiones del backend en paralelo. Antes de promover un color se verifican sus dos réplicas.
        Nginx cambia el tráfico mediante una recarga; el frontend se mantiene en el puerto 3200.
      </EncabezadoPatron>
      <div className="toolbar">
        <span className="tag tag-amber">Color activo: {state?.active_slot ?? 'consultando…'}</span>
        <Boton variante="ghost" onClick={() => setMonitor((v) => !v)}>{monitor ? 'Pausar monitoreo' : 'Reanudar monitoreo'}</Boton>
        <span className="muted small">Las dos versiones comparten MySQL, Redis, Keycloak y el JSON de configuración.</span>
      </div>
      {message && <Aviso tipo={message.tipo}>{message.text}</Aviso>}
      <div className="grid grid-2">
        {['blue', 'green'].map((slot) => (
          <Card key={slot} className={`slot-card slot-${slot} ${state?.active_slot === slot ? 'slot-active' : ''}`}
            titulo={slot === 'blue' ? 'Blue' : 'Green'} subtitulo={state?.active_slot === slot ? 'Atiende el tráfico del gateway' : 'Disponible para verificar y promover'}>
            <div className="replicas">
              {(state?.slots?.[slot] ?? []).map((instance) => (
                <div key={instance.host} className={`replica replica-${instance.status}`}>
                  <b className="mono">{instance.instance ?? instance.host}</b>
                  <div className="replica-version">{instance.version ? `v${instance.version}` : '—'}</div>
                  <Estado valor={instance.status} />
                </div>
              ))}
            </div>
            <Boton onClick={() => promote(slot)} cargando={busy} disabled={!admin || state?.active_slot === slot || !state}>
              Dirigir tráfico a {slot === 'blue' ? 'Blue' : 'Green'}
            </Boton>
          </Card>
        ))}
      </div>
      {!admin && <Aviso>Iniciá sesión como administrador para cambiar el color. El monitoreo está disponible sin sesión.</Aviso>}
      <div className="grid grid-2">
        <Card titulo="Solicitudes durante el cambio" subtitulo="GET /instance cada 2 s; una respuesta real por muestra">
          <div className="table-scroll"><table className="table">
            <thead><tr><th>Hora</th><th>Estado</th><th>Color</th><th>Versión / réplica</th><th>ms</th></tr></thead>
            <tbody>{traffic.slice(0, 15).map((row, i) => <tr key={i}>
              <td>{row.at.toLocaleTimeString()}</td><td>{row.status}</td><td>{row.slot ?? '—'}</td>
              <td className="mono">{row.version ?? '—'} · {row.instance ?? 'sin respuesta'}</td><td>{row.ms}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="muted small">Las muestras ayudan a observar continuidad; la prueba por script envía más solicitudes durante la promoción.</p>
        </Card>
        <Card titulo="Historial de promociones" subtitulo="Persistido por el gateway, incluso si se recarga Nginx">
          {!state?.events?.length && <div className="empty">Todavía no se cambió el color.</div>}
          <ul className="events">{state?.events?.map((event, i) => <li key={i}>
            <span>{new Date(event.at).toLocaleTimeString()}</span><b>{event.from} → {event.to}</b>
            <span>v{event.version}</span><small className="muted">{event.actor}</small>
          </li>)}</ul>
        </Card>
      </div>
      <div className="grid grid-2">
        <Card titulo="Cómo comprobar la facilidad de despliegue">
          <ComoFunciona items={[
            'Observar Blue activo y Green sano con otra versión; promover Green y ver cambiar las respuestas.',
            'Volver a Blue sin reconstruir imágenes ni reiniciar el frontend.',
            'Detener una réplica del color inactivo e intentar promoverlo: la operación se rechaza y el color activo se conserva.',
            'Mantener los esquemas de datos y formatos de caché compatibles con las dos versiones durante la transición.',
          ]} />
        </Card>
        <Card titulo="Alternativa por terminal">
          <Comando>.\scripts\promote.ps1 green</Comando>
          <Comando>.\scripts\promote.ps1 blue</Comando>
          <Comando>python scripts/manage.py demo_blue_green</Comando>
          <p className="muted small">El rollback de reemplazo de imagen de la TFU anterior está en Demos antiguas → UT2.</p>
        </Card>
      </div>
    </div>
  );
}
