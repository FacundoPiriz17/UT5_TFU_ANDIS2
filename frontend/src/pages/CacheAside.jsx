import { useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useSesion } from '../lib/auth';
import { Aviso, Boton, Card, ComoFunciona, EncabezadoPatron, Metrica, RequiereLogin } from '../components/ui';

const promedio = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

function Grafico({ puntos }) {
  const max = Math.max(1, ...puntos.map((p) => p.ms));
  return (
    <div className="chart">
      <div className="chart-bars">
        {puntos.map((p, i) => (
          <div key={i} className="chart-col" title={`#${i + 1} · ${p.cache ?? 'sin header'} · ${p.ms} ms · ${p.instancia}`}>
            <span className="chart-val">{p.ms}</span>
            <span className={`chart-bar ${p.cache === 'HIT' ? 'bar-hit' : p.cache === 'MISS' ? 'bar-miss' : 'bar-other'}`} style={{ height: `${(p.ms / max) * 100}%` }} />
            <span className="chart-x">{p.instancia?.replace('.0', '') ?? '?'}</span>
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i className="sw bar-miss" /> MISS (MySQL + escritura en Redis)</span>
        <span><i className="sw bar-hit" /> HIT (Redis)</span>
      </div>
    </div>
  );
}

function Contenido() {
  const sesion = useSesion();
  const claves = [
    { id: 'catalogo', ruta: '/juegos', clave: 'juegos:catalogo' },
    { id: 'juego', ruta: '/juegos/1', clave: 'juego:1' },
    { id: 'biblioteca', ruta: '/biblioteca', clave: `biblioteca:${sesion.email}` },
  ];
  const [sel, setSel] = useState('catalogo');
  const [puntos, setPuntos] = useState([]);
  const [cargando, setCargando] = useState(null);
  const [msg, setMsg] = useState(null);
  const actual = claves.find((c) => c.id === sel);

  const leer = async (n) => {
    setCargando('leer');
    for (let i = 0; i < n; i++) {
      const r = await api(actual.ruta, { etiqueta: 'cache-aside' });
      setPuntos((p) => [...p, { ms: r.ms, cache: r.cache, instancia: r.instancia, status: r.status }].slice(-30));
    }
    setCargando(null);
  };

  const invalidar = async () => {
    setCargando('inv');
    setMsg(null);
    let r;
    if (sel === 'biblioteca') {
      // Una compra (comando) invalida biblioteca:{email}; se revierte para no ensuciar los datos.
      const cat = await api('/juegos');
      const bib = await api('/biblioteca');
      const poseidos = new Set(bib.data?.juegos?.map((j) => j.id_juego));
      const libre = cat.data?.find((j) => !poseidos.has(j.id_juego));
      if (!libre) {
        setMsg({ tipo: 'warn', texto: 'Ya poseés todos los juegos: no hay compra posible para invalidar la biblioteca.' });
        setCargando(null);
        return;
      }
      r = await api('/compras', { method: 'POST', body: { email_persona: sesion.email, id_juego: libre.id_juego, costo_base: 100, politica: 'normal' } });
      if (r.ok) {
        setMsg({ tipo: 'ok', texto: `POST /compras de "${libre.nombre}" ejecutó commit e invalidó ${actual.clave}. La próxima lectura será MISS.` });
      }
    } else {
      const id = sel === 'juego' ? 1 : (await api('/juegos')).data?.[0]?.id_juego;
      const actualJuego = await api(`/juegos/${id}`);
      r = await api(`/juegos/${id}`, { method: 'PUT', body: { nombre: actualJuego.data?.nombre ?? 'Juego' } });
      if (r.ok) setMsg({ tipo: 'ok', texto: `PUT /juegos/${id} hizo commit e invalidó juegos:catalogo, juego:${id} y las bibliotecas afectadas.` });
    }
    if (!r.ok) setMsg({ tipo: 'err', texto: mensajeError(r) });
    setCargando(null);
  };

  const hits = puntos.filter((p) => p.cache === 'HIT').map((p) => p.ms);
  const misses = puntos.filter((p) => p.cache === 'MISS').map((p) => p.ms);
  const ratio = puntos.length ? Math.round((hits.length / puntos.length) * 100) : 0;
  const puedeInvalidar = sel === 'biblioteca' || sesion.roles.includes('admin');

  return (
    <>
      <div className="segmented">
        {claves.map((c) => (
          <button key={c.id} className={sel === c.id ? 'on' : ''} onClick={() => { setSel(c.id); setPuntos([]); setMsg(null); }}>
            <span className="mono">GET {c.ruta}</span>
            <small>clave {c.clave}</small>
          </button>
        ))}
      </div>

      <div className="grid grid-main">
        <Card
          titulo="Latencia por lectura"
          subtitulo="Header X-Cache devuelto por la API · el eje X indica la réplica que respondió"
          acciones={<Boton variante="ghost" onClick={() => setPuntos([])}>Limpiar</Boton>}
        >
          {puntos.length ? <Grafico puntos={puntos} /> : <div className="empty">Ejecutá lecturas para ver HIT vs MISS.</div>}
        </Card>
        <div className="stack">
          <Card titulo="Acciones">
            <div className="stack-sm">
              <Boton cargando={cargando === 'leer'} disabled={!!cargando} onClick={() => leer(10)}>Ejecutar 10 lecturas</Boton>
              <Boton variante="secondary" disabled={!!cargando} onClick={() => leer(1)}>Una lectura</Boton>
              <Boton variante="ghost" cargando={cargando === 'inv'} disabled={!!cargando || !puedeInvalidar} onClick={invalidar}>
                {sel === 'biblioteca' ? 'Comprar un juego (invalida)' : 'Modificar juego (invalida)'}
              </Boton>
              {!puedeInvalidar && <p className="muted small">Modificar juegos requiere rol admin. Probá la clave biblioteca o entrá como admin.</p>}
            </div>
            {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
          </Card>
          <Card titulo="Resultados">
            <div className="metrics metrics-2">
              <Metrica etiqueta="Prom. MISS" valor={promedio(misses)} unidad="ms" tono="warn" />
              <Metrica etiqueta="Prom. HIT" valor={promedio(hits)} unidad="ms" tono="ok" />
              <Metrica etiqueta="Hit ratio" valor={ratio} unidad="%" />
              <Metrica etiqueta="Mejora" valor={misses.length && hits.length ? `${Math.round((1 - promedio(hits) / promedio(misses)) * 100)}` : '—'} unidad="%" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function CacheAside() {
  return (
    <div className="page">
      <EncabezadoPatron id="cache" atributo="Rendimiento">
        La aplicación gestiona la cache explícitamente: lee primero de Redis y solo ante un MISS consulta MySQL y guarda el resultado
        con TTL definido en el JSON externo. Las escrituras hacen commit y después borran las claves afectadas. Redis es compartido, así que lo que
        invalida api1 lo ve api2.
      </EncabezadoPatron>

      <RequiereLogin><Contenido /></RequiereLogin>

      <div className="grid grid-2">
        <Card titulo="Cómo mejora el rendimiento">
          <ComoFunciona items={[
            <><code>cache.obtener_o_cargar(clave, cargar)</code>: si Redis tiene la clave responde sin tocar MySQL (HIT).</>,
            'En un MISS ejecuta las consultas (joins de juegos, géneros y compras), serializa y guarda con TTL.',
            'Las escrituras invalidan después del commit: la siguiente lectura reconstruye el dato fresco (consistencia eventual acotada por el TTL).',
            'Si Redis no responde (timeout de 0,5 s) se lee de MySQL: la cache acelera pero no es un punto único de falla.',
          ]} />
        </Card>
        <Card titulo="Prueba empírica">
          <p className="small">1. Repetir lecturas: la primera es MISS y las siguientes HIT, con menor latencia y menos carga en MySQL.</p>
          <p className="small">2. Invalidar con una escritura: la próxima lectura vuelve a ser MISS, demostrando que no se sirven datos obsoletos.</p>
          <p className="small">3. Alternar réplicas: el HIT se mantiene aunque responda la otra instancia (cache compartida).</p>
          <p className="small muted">Las diferencias son de pocos milisegundos porque los datos de prueba son chicos; con catálogos grandes y BD remota la brecha crece.</p>
        </Card>
      </div>
    </div>
  );
}
