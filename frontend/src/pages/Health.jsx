import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Boton, Card, Comando, ComoFunciona, EncabezadoPatron, Estado, Json } from '../components/ui';

const HISTORIAL = 40;

export default function Health() {
  const [live, setLive] = useState(null);
  const [ready, setReady] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [activo, setActivo] = useState(true);
  const [intervalo, setIntervalo] = useState(3);
  const vivo = useRef(true);

  const consultar = async () => {
    const [l, r] = await Promise.all([
      api('/health/live', { auth: false, etiqueta: 'monitor' }),
      api('/health/ready', { auth: false, etiqueta: 'monitor' }),
    ]);
    if (!vivo.current) return;
    const estadoLive = l.ok ? l.data.status : 'down';
    setLive(l);
    setReady(r);
    setHistorial((h) => [...h, { t: new Date(), live: estadoLive, ready: r.data?.status || 'down', ms: l.ms }].slice(-HISTORIAL));
  };

  useEffect(() => {
    vivo.current = true;
    consultar();
    if (!activo) return () => { vivo.current = false; };
    const t = setInterval(consultar, intervalo * 1000);
    return () => { vivo.current = false; clearInterval(t); };
  }, [activo, intervalo]);

  const instancias = live?.data?.instancias || [];
  const checks = ready?.data?.checks || {};
  const segundaReplica = instancias[1]?.host?.split(':')[0] || 'api2';

  return (
    <div className="page">
      <EncabezadoPatron id="health" atributo="Disponibilidad">
        Cada réplica expone endpoints de salud que un monitor externo (Docker, el gateway o este panel) consulta periódicamente.
        Así una falla se detecta en segundos y el tráfico se aleja de la instancia afectada.
      </EncabezadoPatron>

      <div className="toolbar">
        <Boton variante={activo ? 'ghost' : 'primary'} onClick={() => setActivo((v) => !v)}>
          {activo ? '❚❚ Pausar monitoreo' : '▶ Reanudar monitoreo'}
        </Boton>
        <label className="inline">
          Intervalo
          <select value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
            {[1, 2, 3, 5, 10].map((s) => <option key={s} value={s}>{s} s</option>)}
          </select>
        </label>
        <Boton variante="ghost" onClick={consultar}>Consultar ahora</Boton>
      </div>

      <div className="grid grid-3">
        <Card titulo="Estado global" subtitulo="GET /health/live">
          <div className="big-status">
            <Estado valor={live?.ok ? live.data.status : 'down'} />
            <div className="muted small">Réplicas activas: <b>{live?.data?.instancias_activas ?? '—'}</b></div>
            <div className="muted small">Agregado por: <b className="mono">{live?.data?.respondido_por ?? '—'}</b></div>
          </div>
        </Card>
        {instancias.map((i) => (
          <Card key={i.host} titulo={i.host} subtitulo="Liveness de la réplica">
            <div className="big-status">
              <Estado valor={i.status} />
              <div className="muted small">Instancia: <b className="mono">{i.instance ?? '—'}</b></div>
              <div className="muted small">Versión: <b className="mono">{i.version ?? '—'}</b></div>
            </div>
          </Card>
        ))}
        {instancias.length === 0 && (
          <Card titulo="Réplicas"><p className="muted">Sin datos: el gateway no responde.</p></Card>
        )}
      </div>

      <div className="grid grid-2">
        <Card titulo="Readiness de dependencias" subtitulo="GET /health/ready · 503 si la base no responde">
          <div className="deps">
            <div className="dep"><span className="dep-icon">🗄</span><span>MySQL</span><Estado valor={checks.database ?? (ready ? 'error' : null)} /></div>
            <div className="dep"><span className="dep-icon">⚡</span><span>Redis (cache)</span><Estado valor={checks.cache ?? (ready ? 'error' : null)} /></div>
            <div className="dep"><span className="dep-icon">✓</span><span>Resultado</span><Estado valor={ready?.data?.status ?? 'down'} /></div>
          </div>
          <p className="muted small">Si Redis cae, la API sigue sirviendo desde MySQL (fail-open): cache queda <i>degraded</i> y readiness sigue <i>ready</i>.</p>
        </Card>
        <Card titulo="Línea de tiempo" subtitulo={`Últimos ${HISTORIAL} chequeos (liveness arriba, readiness abajo)`}>
          <div className="timeline">
            {historial.map((h, i) => (
              <div key={i} className="tl-col" title={`${h.t.toLocaleTimeString()} · live=${h.live} · ready=${h.ready} · ${h.ms} ms`}>
                <span className={`tl-cell tl-${h.live}`} />
                <span className={`tl-cell tl-${h.ready}`} />
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i className="tl-cell tl-ok" /> ok / ready</span>
            <span><i className="tl-cell tl-degraded" /> degradado</span>
            <span><i className="tl-cell tl-down" /> caído</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card titulo="Cómo logra la disponibilidad">
          <ComoFunciona items={[
            <><b>/health</b> (liveness): Docker lo usa para marcar la salud del contenedor. La política <code>restart: unless-stopped</code> reinicia procesos que terminan; no reinicia un contenedor solo por estar unhealthy.</>,
            <><b>/health/ready</b> (readiness): verifica MySQL y Redis. Distingue "vivo" de "listo para atender".</>,
            <><b>/health/live</b>: consulta en paralelo a todas las réplicas y reporta <i>ok / degraded / down</i>, detectando fallas parciales.</>,
            'Reducir el tiempo de detección (MTTD) reduce el tiempo de recuperación y aumenta la disponibilidad observada.',
          ]} />
        </Card>
        <Card titulo="Prueba empírica" subtitulo="Ejecutar en otra terminal y mirar este panel">
          <p className="small">1. Simular la caída de una réplica → estado <b>degraded</b> (1/2):</p>
          <Comando>{`docker compose stop ${segundaReplica}`}</Comando>
          <p className="small">2. Simular caída de la cache → readiness con cache <b>degraded</b>, la API sigue respondiendo:</p>
          <Comando>docker compose stop redis</Comando>
          <p className="small">3. Recuperar todo y ver cómo vuelve a <b>ok</b>:</p>
          <Comando>{`docker compose start ${segundaReplica} redis`}</Comando>
        </Card>
      </div>

      <Card titulo="Última respuesta de /health/live">
        <Json data={live?.data} />
      </Card>
    </div>
  );
}
