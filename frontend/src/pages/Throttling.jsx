import { useState } from 'react';
import { api, registrar } from '../lib/api';
import { Aviso, Boton, Card, Comando, ComoFunciona, EncabezadoPatron, Json, Metrica } from '../components/ui';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function resumir(resultados) {
  const ok = resultados.filter((r) => r.status >= 200 && r.status < 300);
  const rechazadas = resultados.filter((r) => r.status === 429);
  const latOk = ok.map((r) => r.ms);
  return {
    total: resultados.length,
    ok: ok.length,
    rechazadas: rechazadas.length,
    otras: resultados.length - ok.length - rechazadas.length,
    maxOk: latOk.length ? Math.max(...latOk) : 0,
    minOk: latOk.length ? Math.min(...latOk) : 0,
  };
}

function Rejilla({ resultados }) {
  const max = Math.max(1, ...resultados.map((r) => r.ms));
  return (
    <div className="burst">
      {resultados.map((r, i) => (
        <div
          key={i}
          className={`burst-cell ${r.status === 429 ? 'b-429' : r.status >= 200 && r.status < 300 ? 'b-ok' : 'b-err'}`}
          title={`#${i + 1} · HTTP ${r.status} · ${r.ms} ms`}
        >
          <span className="burst-bar" style={{ height: `${Math.max(8, (r.ms / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function Throttling() {
  const [cantidad, setCantidad] = useState(60);
  const [rafaga, setRafaga] = useState(null);
  const [controlado, setControlado] = useState(null);
  const [cargando, setCargando] = useState(null);
  const [ejemplo429, setEjemplo429] = useState(null);

  const lanzarRafaga = async () => {
    setCargando('rafaga');
    setRafaga(null);
    const inicio = performance.now();
    const resultados = await Promise.all(
      Array.from({ length: cantidad }, () => api('/health', { auth: false, silencioso: true })),
    );
    const total = Math.round(performance.now() - inicio);
    const r429 = resultados.find((r) => r.status === 429);
    if (r429) setEjemplo429(r429.data);
    const res = resumir(resultados);
    registrar({ method: 'GET', path: '/health', status: res.rechazadas ? 429 : 200, ms: total, etiqueta: `ráfaga ×${cantidad}: ${res.ok} OK / ${res.rechazadas} 429` });
    setRafaga({ resultados, total, ...res });
    setCargando(null);
  };

  const lanzarControlado = async () => {
    setCargando('controlado');
    setControlado(null);
    await espera(2500); // dejar que se vacíe el bucket de la ráfaga anterior
    const resultados = [];
    const inicio = performance.now();
    for (let i = 0; i < 20; i++) {
      resultados.push(await api('/health', { auth: false, silencioso: true }));
      setControlado({ resultados: [...resultados], ...resumir(resultados) });
      await espera(125); // 8 req/s, por debajo del límite de 10 req/s
    }
    const total = Math.round(performance.now() - inicio);
    const res = resumir(resultados);
    registrar({ method: 'GET', path: '/health', status: 200, ms: total, etiqueta: `ritmo 8 req/s: ${res.ok} OK / ${res.rechazadas} 429` });
    setControlado({ resultados, total, ...res });
    setCargando(null);
  };

  return (
    <div className="page">
      <EncabezadoPatron id="throttling" atributo="Disponibilidad">
        El gateway controla el consumo de recursos por cliente: acepta hasta 10 peticiones por segundo por IP, tolera un
        pico de hasta 20 peticiones extra (burst) y rechaza el resto con <code>429 Too Many Requests</code>. Un cliente abusivo no puede
        saturar a las réplicas y el servicio sigue disponible para los demás.
      </EncabezadoPatron>

      <div className="grid grid-2">
        <Card titulo="1 · Ráfaga que excede el límite" subtitulo="Peticiones concurrentes a GET /health">
          <label className="range">
            <span>Cantidad de peticiones: <b>{cantidad}</b></span>
            <input type="range" min="10" max="150" step="10" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
          </label>
          <Boton cargando={cargando === 'rafaga'} disabled={!!cargando} onClick={lanzarRafaga}>Lanzar ráfaga</Boton>
          {rafaga && (
            <>
              <div className="metrics">
                <Metrica etiqueta="Aceptadas" valor={rafaga.ok} tono="ok" />
                <Metrica etiqueta="Rechazadas 429" valor={rafaga.rechazadas} tono="warn" />
                <Metrica etiqueta="Tiempo total" valor={rafaga.total} unidad="ms" />
              </div>
              <Rejilla resultados={rafaga.resultados} />
              <p className="muted small">
                Cada celda es una petición (verde aceptada, ámbar 429) y su altura la latencia. Se aceptan ≈21 (1 + burst de 20)
                y el resto se corta en el gateway en pocos milisegundos, sin llegar a FastAPI. El bucket se recarga a 10 req/s.
              </p>
            </>
          )}
        </Card>

        <Card titulo="2 · Cliente que respeta el límite" subtitulo="20 peticiones secuenciales a 8 req/s">
          <p className="muted small">Mismo endpoint, pero a un ritmo menor al configurado: ninguna debería ser rechazada.</p>
          <Boton variante="secondary" cargando={cargando === 'controlado'} disabled={!!cargando} onClick={lanzarControlado}>Enviar a ritmo controlado</Boton>
          {controlado && (
            <>
              <div className="metrics">
                <Metrica etiqueta="Aceptadas" valor={controlado.ok} tono="ok" />
                <Metrica etiqueta="Rechazadas 429" valor={controlado.rechazadas} tono={controlado.rechazadas ? 'warn' : undefined} />
                <Metrica etiqueta="Enviadas" valor={`${controlado.total ?? controlado.resultados.length}`} unidad={controlado.total ? 'ms' : '/20'} />
              </div>
              <Rejilla resultados={controlado.resultados} />
            </>
          )}
        </Card>
      </div>

      {rafaga && rafaga.rechazadas === 0 && (
        <Aviso tipo="warn">
          No hubo rechazos. Verificá que el gateway use <code>nginx/default.conf</code> (montado en <code>docker-compose.yaml</code>) y
          recreá el contenedor con <code>docker compose up -d --force-recreate nginx</code>.
        </Aviso>
      )}

      <div className="grid grid-2">
        <Card titulo="Cómo logra la disponibilidad">
          <ComoFunciona items={[
            <><code>limit_req_zone $binary_remote_addr rate=10r/s</code>: algoritmo <i>leaky bucket</i> por IP en memoria compartida (10 MB).</>,
            <><code>burst=20 nodelay</code>: tolera picos cortos legítimos sin agregar latencia; lo que supera el pico se rechaza al instante.</>,
            <><code>limit_req_status 429</code> + <code>error_page</code>: el exceso se corta en el gateway con un JSON uniforme, sin consumir CPU ni conexiones de MySQL en las APIs.</>,
            'Resultado: la capacidad de las réplicas queda reservada para el tráfico legítimo, evitando que una sobrecarga provoque la caída total del servicio.',
          ]} />
        </Card>
        <Card titulo="Prueba empírica por consola">
          <p className="small">Linux/macOS: 60 peticiones en paralelo y conteo de códigos de estado (en Git Bash de Windows los procesos arrancan demasiado lento para superar el límite; usar este panel).</p>
          <Comando>{'seq 60 | xargs -P 60 -I{} curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8000/health | sort | uniq -c'}</Comando>
          <p className="small">Respuesta del gateway ante el exceso:</p>
          <Json data={ejemplo429 ?? { error: 'Too Many Requests', message: 'Has excedido el límite de peticiones' }} alto={120} />
        </Card>
      </div>
    </div>
  );
}
