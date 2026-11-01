import { useEffect, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useSesion } from '../lib/auth';
import { Aviso, Boton, Card, Comando, ComoFunciona, EncabezadoPatron, Json } from '../components/ui';

export default function Configuracion() {
  const session = useSesion();
  const admin = session?.roles.includes('admin');
  const [loaded, setLoaded] = useState(null);
  const [observed, setObserved] = useState(null);
  const [editor, setEditor] = useState('');
  const [quote, setQuote] = useState(null);
  const [replicas, setReplicas] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const result = await api('/configuration', { auth: false });
    if (result.ok) {
      setLoaded(result.data);
      setEditor(JSON.stringify(result.data.document.settings, null, 2));
      setMessage(null);
    } else setMessage({ tipo: 'err', text: mensajeError(result) });
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    let alive = true;
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      try {
        const [configuration, result, deployment] = await Promise.all([
          api('/configuration', { auth: false, silencioso: true }),
          api('/configuration/quote?costo_base=100&politica=invierno', { auth: false, silencioso: true }),
          api('/deployment/status', { auth: false, silencioso: true }),
        ]);
        if (!alive) return;
        if (configuration.ok) setObserved(configuration.data);
        if (result.ok) setQuote(result);
        if (deployment.ok) setReplicas(deployment.data.slots);
      } finally { pending = false; }
    };
    read();
    const timer = setInterval(read, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const settings = JSON.parse(editor);
      const result = await api('/configuration', { method: 'PUT', body: { settings, expected_hash: loaded.hash } });
      if (result.ok) {
        setLoaded(result.data);
        setObserved(result.data);
        const [price, deployment] = await Promise.all([
          api('/configuration/quote?costo_base=100&politica=invierno', { auth: false, silencioso: true }),
          api('/deployment/status', { auth: false, silencioso: true }),
        ]);
        if (price.ok) setQuote(price);
        if (deployment.ok) setReplicas(deployment.data.slots);
        setMessage({ tipo: 'ok', text: 'JSON guardado. Las cuatro réplicas incorporan el cambio sin reinicio ni rebuild.' });
      } else setMessage({ tipo: 'err', text: mensajeError(result) });
    } catch (error) { setMessage({ tipo: 'err', text: `No se pudo guardar: ${error.message}` }); }
    finally { setBusy(false); }
  };

  return <div className="page">
    <EncabezadoPatron id="configuration" atributo="Facilidad de modificación">
      El comportamiento se obtiene de un JSON externo compartido por Blue y Green. Cada operación consulta la configuración validada;
      modificar el archivo cambia descuentos, disponibilidad de compras y TTL sin reconstruir ni reiniciar las APIs.
    </EncabezadoPatron>
    {message && <Aviso tipo={message.tipo}>{message.text}</Aviso>}
    {observed?.error && <Aviso tipo="warn">{observed.error}</Aviso>}
    {loaded && observed && loaded.hash !== observed.hash && <Aviso tipo="warn">El archivo cambió desde que abriste el editor. Recargá el JSON antes de guardar.</Aviso>}
    <div className="grid grid-2">
      <Card titulo="Editar JSON compartido" subtitulo="config/settings.json → settings · escritura permitida a administradores"
        acciones={<Boton variante="ghost" onClick={reload}>Recargar JSON</Boton>}>
        <label className="form">Contenido de settings
          <textarea className="json-editor" aria-label="Configuración JSON" value={editor} onChange={(event) => setEditor(event.target.value)} spellCheck={false} readOnly={!admin} />
        </label>
        <Boton onClick={save} cargando={busy} disabled={!admin || !loaded}>Guardar JSON</Boton>
        {!admin && <p className="muted small">Iniciá sesión como administrador para editar desde esta pantalla.</p>}
        <p className="muted small">El servidor valida los valores, incrementa la revisión y reemplaza el archivo completo. Detecta ediciones concurrentes.</p>
      </Card>
      <Card titulo="Efecto en vivo" subtitulo="Cotización real del backend; no crea una compra">
        <div className="metrics metrics-2">
          <div className="metric"><div className="metric-label">Costo base</div><div className="metric-value">$100</div></div>
          <div className="metric"><div className="metric-label">Con política invierno</div><div className="metric-value">${quote?.data?.costo_final ?? '—'}</div></div>
        </div>
        <div className="kv"><span>Descuento</span><b>{observed?.document.settings.winter_discount_percent ?? '—'}%</b></div>
        <div className="kv"><span>Compras</span><b>{observed?.document.settings.purchases_enabled ? 'Habilitadas' : 'Pausadas'}</b></div>
        <div className="kv"><span>TTL para nuevas entradas</span><b>{observed?.document.settings.cache_ttl_seconds ?? '—'} s</b></div>
        <div className="kv"><span>Mensaje de la tienda</span><b>{observed?.document.settings.store_notice}</b></div>
        <div className="kv"><span>Revisión</span><b>{observed?.document.revision ?? '—'}</b></div>
        <p className="muted small">Responde {quote?.instancia ?? '—'} · {quote?.slot ?? '—'} v{quote?.version ?? '—'}. Las compras anteriores conservan su importe y las entradas de caché existentes conservan su TTL.</p>
      </Card>
    </div>
    <Card titulo="Misma configuración en las cuatro réplicas" subtitulo="El hash permite verificar también cambios hechos directamente en el archivo">
      <div className="table-scroll"><table className="table"><thead><tr><th>Color</th><th>Réplica</th><th>Versión</th><th>Proceso</th><th>Revisión</th><th>Hash del JSON</th></tr></thead>
        <tbody>{Object.entries(replicas ?? {}).flatMap(([slot, rows]) => rows.map((row) => <tr key={row.host}>
          <td>{slot}</td><td className="mono">{row.instance ?? row.host}</td><td>{row.version ?? '—'}</td><td>{row.process_id ?? '—'}</td>
          <td>{row.configuration_revision ?? '—'}</td><td className="mono">{row.configuration_hash?.slice(0, 16) ?? row.status}</td>
        </tr>))}</tbody></table></div>
    </Card>
    <div className="grid grid-2">
      <Card titulo="Guion de demostración"><ComoFunciona items={[
        'Cambiar winter_discount_percent de 50 a 30: la cotización pasa de $50 a $70, con la misma versión de backend.',
        'Cambiar store_notice y abrir Tienda: el mensaje se actualiza. purchases_enabled=false rechaza nuevas compras en el backend.',
        'Observar el mismo hash en Blue y Green. Los contenedores no se recrean al guardar.',
        'Intentar un porcentaje fuera de 0–100: el servidor rechaza la edición y conserva el JSON anterior.',
      ]} /></Card>
      <Card titulo="Editar también desde el host">
        <Comando>notepad .\config\settings.json</Comando>
        <Comando>python scripts/manage.py demo_configuration</Comando>
        <p className="small">El directorio está montado desde Docker Compose. Si una edición manual deja un JSON inválido, cada proceso conserva su última configuración válida y muestra la advertencia.</p>
        <p className="muted small">Este archivo contiene parámetros de negocio. Las credenciales permanecen fuera del JSON.</p>
      </Card>
    </div>
    <Card titulo="Documento aplicado"><Json data={observed?.document} /></Card>
  </div>;
}
