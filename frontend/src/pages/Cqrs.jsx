import { useCallback, useEffect, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useSesion } from '../lib/auth';
import { useConfiguration } from '../lib/configuration';
import { Aviso, Boton, Card, ComoFunciona, EncabezadoPatron, Json, RequiereLogin, StatusHttp } from '../components/ui';

function Contenido() {
  const settings = useConfiguration();
  const sesion = useSesion();
  const esAdmin = sesion.roles.includes('admin');
  const [email, setEmail] = useState(sesion.email);
  const [juegos, setJuegos] = useState([]);
  const [form, setForm] = useState({ id_juego: '', costo_base: 100, politica: 'normal' });
  const [ultimoComando, setUltimoComando] = useState(null);
  const [lista, setLista] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(null);

  useEffect(() => {
    api('/juegos').then((r) => {
      if (r.ok) {
        setJuegos(r.data);
        setForm((f) => ({ ...f, id_juego: f.id_juego || r.data[0]?.id_juego || '' }));
      }
    });
  }, []);

  const consultar = useCallback(async () => {
    const [l, s] = await Promise.all([
      api(`/compras/${encodeURIComponent(email)}`, { etiqueta: 'query' }),
      api(`/compras/${encodeURIComponent(email)}/resumen`, { etiqueta: 'query' }),
    ]);
    setLista(l);
    setResumen(s);
  }, [email]);

  useEffect(() => { consultar(); }, [consultar]);

  const comando = async (tipo) => {
    setCargando(tipo);
    const id = Number(form.id_juego);
    const base = `/compras/${encodeURIComponent(email)}/${id}`;
    const r =
      tipo === 'crear' ? await api('/compras', { method: 'POST', etiqueta: 'command', body: { email_persona: email, id_juego: id, costo_base: Number(form.costo_base), politica: form.politica } })
        : tipo === 'recalcular' ? await api(base, { method: 'PUT', etiqueta: 'command', body: { costo_base: Number(form.costo_base), politica: form.politica } })
          : await api(base, { method: 'DELETE', etiqueta: 'command' });
    setUltimoComando({ tipo, ...r });
    setCargando(null);
    await consultar();
  };

  const nombreJuego = (id) => juegos.find((j) => j.id_juego === id)?.nombre ?? `#${id}`;

  return (
    <>
      {esAdmin && (
        <div className="toolbar">
          <label className="inline">Persona
            <select value={email} onChange={(e) => setEmail(e.target.value)}>
              {['demo@adaii.local', 'segundo@adaii.local', 'admin@adaii.local'].map((e) => <option key={e}>{e}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="cqrs">
        <Card className="side-command" titulo="Lado de escritura · Commands" subtitulo="compras_commands.py · validación + transacción + Strategy + invalidación">
          <div className="form">
            <label>Juego
              <select value={form.id_juego} onChange={(e) => setForm({ ...form, id_juego: e.target.value })}>
                {juegos.map((j) => <option key={j.id_juego} value={j.id_juego}>#{j.id_juego} · {j.nombre}</option>)}
              </select>
            </label>
            <div className="row gap">
              <label>Costo base<input type="number" min="1" value={form.costo_base} onChange={(e) => setForm({ ...form, costo_base: e.target.value })} /></label>
              <label>Política (Strategy)
                <select value={form.politica} onChange={(e) => setForm({ ...form, politica: e.target.value })}>
                  <option value="normal">normal (100%)</option>
                  <option value="invierno">invierno (−{settings?.winter_discount_percent ?? '…'}%)</option>
                </select>
              </label>
            </div>
            <div className="row wrap gap-sm">
              <Boton cargando={cargando === 'crear'} disabled={!!cargando} onClick={() => comando('crear')}>POST · Crear compra</Boton>
              <Boton variante="secondary" cargando={cargando === 'recalcular'} disabled={!!cargando} onClick={() => comando('recalcular')}>PUT · Recalcular</Boton>
              <Boton variante="danger" cargando={cargando === 'eliminar'} disabled={!!cargando} onClick={() => comando('eliminar')}>DELETE</Boton>
            </div>
          </div>
          {ultimoComando && (
            <div className="result">
              <div className="row gap-sm"><StatusHttp status={ultimoComando.status} /><b>{ultimoComando.tipo}</b><span className="muted small">{ultimoComando.ms} ms · {ultimoComando.instancia}</span></div>
              {ultimoComando.ok
                ? <Json data={ultimoComando.data ?? '204 No Content'} alto={160} />
                : <Aviso tipo="err">{mensajeError(ultimoComando)}</Aviso>}
            </div>
          )}
        </Card>

        <div className="cqrs-arrow" aria-hidden>
          <span>commit</span>
          <span className="cqrs-line" />
          <span>invalida cache</span>
        </div>

        <Card className="side-query" titulo="Lado de lectura · Queries" subtitulo="compras_queries.py · proyecciones SELECT → DTO, sin commit" acciones={<Boton variante="ghost" onClick={consultar}>Refrescar</Boton>}>
          <div className="metrics metrics-2">
            <div className="metric"><div className="metric-label">Compras</div><div className="metric-value">{resumen?.data?.cantidad_compras ?? '—'}</div></div>
            <div className="metric"><div className="metric-label">Costo total</div><div className="metric-value">${resumen?.data?.costo_total ?? '—'}</div></div>
          </div>
          <p className="muted small">GET /compras/&#123;email&#125;/resumen → agregación <code>COUNT</code>/<code>SUM</code> en SQL.</p>
          <div className="row gap-sm small">
            <span className="muted">GET /compras/&#123;email&#125;</span>
            {lista?.cache && <span className={`cache-tag cache-${lista.cache.toLowerCase()}`}>{lista.cache}</span>}
            {lista && <span className="muted">{lista.ms} ms</span>}
          </div>
          <table className="table">
            <thead><tr><th>Juego</th><th>Fecha</th><th>Costo</th></tr></thead>
            <tbody>
              {Array.isArray(lista?.data) && lista.data.map((c) => (
                <tr key={c.id_juego}>
                  <td>{nombreJuego(c.id_juego)}</td>
                  <td className="muted small">{c.fecha_hora ? new Date(c.fecha_hora).toLocaleString() : '—'}</td>
                  <td className="mono">${c.costo_compra}</td>
                </tr>
              ))}
              {Array.isArray(lista?.data) && lista.data.length === 0 && <tr><td colSpan={3} className="muted center">Sin compras</td></tr>}
            </tbody>
          </table>
          {lista && !lista.ok && <Aviso tipo="err">{mensajeError(lista)}</Aviso>}
        </Card>
      </div>
    </>
  );
}

export default function Cqrs() {
  return (
    <div className="page">
      <EncabezadoPatron id="cqrs" atributo="Rendimiento">
        El módulo Compras separa el modelo que modifica el estado del que lo consulta. Los comandos trabajan con entidades ORM dentro de
        una transacción; las consultas proyectan columnas directamente a DTOs de solo lectura, que además pueden cachearse y escalarse
        de forma independiente.
      </EncabezadoPatron>

      <RequiereLogin><Contenido /></RequiereLogin>

      <div className="grid grid-2">
        <Card titulo="Cómo mejora el rendimiento">
          <ComoFunciona items={[
            'Las queries no cargan entidades completas ni abren unidades de trabajo: un SELECT con las columnas necesarias y mapeo directo a CompraLectura.',
            'Las agregaciones (cantidad y total gastado) se resuelven en MySQL con COUNT/SUM en lugar de traer filas y sumar en Python.',
            'Al no tener efectos colaterales, el lado de lectura es seguro de cachear (Cache-Aside) y de dirigir a réplicas de lectura.',
            'El lado de escritura concentra validaciones, Strategy de precios, la transacción Compra + Copia y la invalidación de cache.',
          ]} />
        </Card>
        <Card titulo="Prueba empírica">
          <p className="small">1. Ejecutar un comando y observar en la consola de tráfico que la consulta posterior es <b>MISS</b> (fue invalidada) y la siguiente <b>HIT</b>.</p>
          <p className="small">2. Crear la misma compra dos veces: el comando responde <b>409</b>, la consulta no cambia.</p>
          <p className="small">3. Medir con carga (ab/k6/JMeter) GET /compras vs POST /compras: las lecturas escalan sin bloquear a las escrituras.</p>
        </Card>
      </div>
    </div>
  );
}
