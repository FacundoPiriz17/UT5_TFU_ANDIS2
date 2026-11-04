import { useCallback, useEffect, useRef, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useSesion } from '../lib/auth';
import { Aviso, Boton, Card, StatusHttp } from './ui';

export default function CompararOperaciones() {
  const sesion = useSesion();
  const [juego, setJuego] = useState('1');
  const [samples, setSamples] = useState([]);
  const [monitor, setMonitor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const sample = useCallback(async () => {
    if (pending.current || !sesion || !Number.isInteger(Number(juego)) || Number(juego) < 1) return;
    pending.current = true;
    setBusy(true);
    try {
      const [local, remote] = await Promise.all([
        api('/compras/' + encodeURIComponent(sesion.email), { etiqueta: 'consulta-local' }),
        api('/juegos/' + Number(juego), { etiqueta: 'consulta-con-soap' }),
      ]);
      if (alive.current) {
        setSamples((rows) => [{ at: new Date(), local, remote }, ...rows].slice(0, 20));
        setError(null);
      }
    } catch (exc) {
      if (alive.current) { setError(exc.message); setMonitor(false); }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }, [sesion, juego]);

  useEffect(() => {
    if (!monitor) return undefined;
    sample();
    const timer = setInterval(sample, 1500);
    return () => clearInterval(timer);
  }, [monitor, sample]);

  return <Card titulo="Consulta comercial y consulta con SOAP" subtitulo="Muestras reales; el monitor sólo realiza lecturas">
    <div className="toolbar">
      <label className="inline">ID del juego<input type="number" min="1" step="1" value={juego} onChange={(e) => setJuego(e.target.value)} /></label>
      <Boton onClick={sample} cargando={busy} disabled={busy || !juego || Number(juego) < 1}>Tomar muestra</Boton>
      <Boton variante="secondary" onClick={() => setMonitor((v) => !v)} disabled={!juego || Number(juego) < 1}>{monitor ? 'Detener monitoreo' : 'Iniciar monitoreo'}</Boton>
    </div>
    <p>Consultar compras registradas usa los datos de Comercial. Consultar el detalle agrega una llamada SOAP a Catálogo. Al detener Catálogo, observá qué operación continúa y cómo cambia la espera.</p>
    <div className="table-scroll"><table className="table">
      <thead><tr><th>Hora</th><th>Compras · HTTP</th><th>ms</th><th>Detalle con SOAP · HTTP</th><th>ms</th></tr></thead>
      <tbody>{samples.map((row, i) => <tr key={i}>
        <td>{row.at.toLocaleTimeString()}</td><td><StatusHttp status={row.local.status} /></td><td>{row.local.ms}</td>
        <td><StatusHttp status={row.remote.status} /></td><td>{row.remote.ms}</td>
      </tr>)}</tbody>
    </table></div>
    {samples[0] && !samples[0].remote.ok && <Aviso tipo="warn">{mensajeError(samples[0].remote)}</Aviso>}
    {error && <Aviso tipo="err">{error}</Aviso>}
    <p className="muted small">Cada muestra incluye gateway, autenticación y caché. Las operaciones son distintas; estos tiempos permiten observar la demo y sus fallos parciales.</p>
  </Card>;
}
