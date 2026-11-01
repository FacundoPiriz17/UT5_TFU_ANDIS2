import { useState } from 'react';
import { api } from '../lib/api';
import { Boton, Card, Comando, ComoFunciona, EncabezadoPatron, Json, Metrica, StatusHttp } from '../components/ui';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Resource Timing expone bytes transferidos (comprimidos) y decodificados.
async function tamanos(url) {
  await espera(50);
  const abs = new URL(url, window.location.origin).href;
  const e = performance.getEntriesByName(abs).pop();
  return e ? { comprimido: e.encodedBodySize, real: e.decodedBodySize } : null;
}

const kb = (b) => (b / 1024).toFixed(1);

export default function GatewayOffloading() {
  const [gzip, setGzip] = useState(null);
  const [estatico, setEstatico] = useState(null);
  const [balanceo, setBalanceo] = useState(null);
  const [cargando, setCargando] = useState(null);

  const probarGzip = async () => {
    setCargando('gzip');
    const r = await api(`/openapi.json?t=${Date.now()}`, { auth: false, etiqueta: 'offloading gzip' });
    const t = await tamanos(r.url);
    setGzip({ status: r.status, encoding: r.headers.get('Content-Encoding'), instancia: r.instancia, ...t });
    setCargando(null);
  };

  const probarEstatico = async () => {
    setCargando('static');
    const [s, a] = await Promise.all([
      api('/static/info.json', { auth: false, etiqueta: 'offloading static' }),
      api('/instance', { auth: false }),
    ]);
    setEstatico({
      estatico: { status: s.status, ms: s.ms, instancia: s.instancia, cacheControl: s.headers.get('Cache-Control'), servidoPor: s.headers.get('X-Served-By'), data: s.data },
      api: { status: a.status, ms: a.ms, instancia: a.instancia },
    });
    setCargando(null);
  };

  const probarBalanceo = async () => {
    setCargando('lb');
    const conteo = {};
    const secuencia = [];
    for (let i = 0; i < 12; i++) {
      const r = await api('/instance', { auth: false, silencioso: i > 0 });
      const k = r.instancia || 'sin respuesta';
      conteo[k] = (conteo[k] || 0) + 1;
      secuencia.push(k);
    }
    setBalanceo({ conteo, secuencia });
    setCargando(null);
  };

  const ahorro = gzip?.real ? Math.round((1 - gzip.comprimido / gzip.real) * 100) : null;

  return (
    <div className="page">
      <EncabezadoPatron id="offloading" atributo="Seguridad (y rendimiento)">
        Las responsabilidades transversales se concentran en el gateway nginx: límite de tasa, compresión, servicio de estáticos,
        respuestas de error uniformes y reparto de carga. Las APIs quedan detrás de la red interna de Docker, sin puerto publicado,
        y solo implementan lógica de negocio.
      </EncabezadoPatron>

      <div className="grid grid-3">
        <Card titulo="Compresión gzip" subtitulo="GET /openapi.json">
          <Boton cargando={cargando === 'gzip'} onClick={probarGzip}>Probar compresión</Boton>
          {gzip && (
            <div className="stack-sm">
              <div className="kv"><span>Status</span><StatusHttp status={gzip.status} /></div>
              <div className="kv"><span>Content-Encoding</span><b className="mono">{gzip.encoding || 'ninguno'}</b></div>
              {gzip.real ? (
                <div className="metrics metrics-2">
                  <Metrica etiqueta="Original" valor={kb(gzip.real)} unidad="KB" />
                  <Metrica etiqueta="Transferido" valor={kb(gzip.comprimido)} unidad="KB" tono="ok" />
                </div>
              ) : <p className="muted small">El navegador no expuso tamaños (Resource Timing).</p>}
              {ahorro !== null && <p className="small"><b>{ahorro}%</b> menos bytes. FastAPI no comprime: lo hace el gateway.</p>}
            </div>
          )}
        </Card>

        <Card titulo="Estáticos en el borde" subtitulo="GET /static/info.json vs GET /instance">
          <Boton cargando={cargando === 'static'} onClick={probarEstatico}>Comparar</Boton>
          {estatico && (
            <div className="stack-sm">
              <div className="kv"><span>Estático</span><span><StatusHttp status={estatico.estatico.status} /> {estatico.estatico.ms} ms</span></div>
              <div className="kv"><span>X-Instance-ID</span><b className="mono">{estatico.estatico.instancia || '— (no tocó FastAPI)'}</b></div>
              <div className="kv"><span>X-Served-By</span><b className="mono">{estatico.estatico.servidoPor || '—'}</b></div>
              <div className="kv"><span>Cache-Control</span><span className="mono small">{estatico.estatico.cacheControl || '—'}</span></div>
              <hr />
              <div className="kv"><span>API</span><span><StatusHttp status={estatico.api.status} /> {estatico.api.ms} ms</span></div>
              <div className="kv"><span>X-Instance-ID</span><b className="mono">{estatico.api.instancia}</b></div>
            </div>
          )}
        </Card>

        <Card titulo="Reparto de carga" subtitulo="12 × GET /instance (round-robin)">
          <Boton cargando={cargando === 'lb'} onClick={probarBalanceo}>Distribuir</Boton>
          {balanceo && (
            <div className="stack-sm">
              {Object.entries(balanceo.conteo).map(([k, v]) => (
                <div key={k} className="lb-row">
                  <span className="mono">{k}</span>
                  <span className="lb-bar"><span style={{ width: `${(v / 12) * 100}%` }} /></span>
                  <b>{v}</b>
                </div>
              ))}
              <div className="lb-seq">
                {balanceo.secuencia.map((s, i) => <span key={i} className={`lb-chip ${s.startsWith('api1') || s.startsWith('green1') ? 'c1' : 'c2'}`}>{s.replace('.0', '')}</span>)}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card titulo="Responsabilidades descargadas en el gateway">
          <table className="table">
            <thead><tr><th>Responsabilidad</th><th>Directiva</th><th>Efecto</th></tr></thead>
            <tbody>
              <tr><td>Límite de tasa</td><td className="mono small">limit_req</td><td className="small">Mitiga abuso y DoS antes de llegar a la API (ver <a href="#/throttling">Throttling</a>).</td></tr>
              <tr><td>Errores uniformes</td><td className="mono small">error_page 429</td><td className="small">JSON único para rechazos, sin filtrar detalles internos.</td></tr>
              <tr><td>Compresión</td><td className="mono small">gzip / gzip_types</td><td className="small">Menos bytes en la red sin código en FastAPI.</td></tr>
              <tr><td>Estáticos</td><td className="mono small">location /static/</td><td className="small">Servidos desde disco con cache de 30 días.</td></tr>
              <tr><td>Aislamiento</td><td className="mono small">upstream + expose</td><td className="small">api1/api2 no publican puertos: solo el gateway es alcanzable.</td></tr>
              <tr><td>Cabeceras de origen</td><td className="mono small">X-Forwarded-For</td><td className="small">Trazabilidad de la IP real del cliente.</td></tr>
            </tbody>
          </table>
        </Card>
        <Card titulo="Cómo logra la seguridad · prueba empírica">
          <ComoFunciona items={[
            'Un único punto de entrada endurecido reduce la superficie expuesta: las réplicas no son accesibles desde fuera de la red Docker.',
            'Las políticas transversales se configuran una vez y aplican a todas las réplicas, evitando inconsistencias entre servicios.',
            'Las APIs dedican su CPU a la lógica de negocio: compresión y estáticos los resuelve nginx.',
          ]} />
          <p className="small">Verificar que la API no es accesible directamente y que el gateway comprime:</p>
          <Comando>{'docker compose ps api1 api2   # sin puertos publicados, solo 8000/tcp interno'}</Comando>
          <Comando>{'curl -sI -H "Accept-Encoding: gzip" http://localhost:8000/openapi.json | grep -i content-encoding'}</Comando>
        </Card>
      </div>

      {estatico && <Card titulo="Contenido estático servido por nginx"><Json data={estatico.estatico.data} alto={140} /></Card>}
    </div>
  );
}
