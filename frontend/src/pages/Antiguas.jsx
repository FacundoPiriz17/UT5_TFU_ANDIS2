import { useEffect, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useConfiguration } from '../lib/configuration';
import { Aviso, Boton, Card, Comando, ComoFunciona, Estado, Json, RequiereLogin, StatusHttp } from '../components/ui';

const TITULOS = {
  'ut2-tacticas': ['UT2 · Tácticas de arquitectura', 'Strategy y auditoría'],
  'ut2-rollback': ['UT2 · Tácticas de arquitectura', 'Rollback de una imagen defectuosa'],
  'ut3-componentes': ['UT3 · Soluciones de arquitectura', 'Componentes, interfaces y contenedores'],
  'ut3-balanceo': ['UT3 · Soluciones de arquitectura', 'Escalabilidad horizontal'],
  'ut3-stateless': ['UT3 · Soluciones de arquitectura', 'Servicios sin estado'],
  'ut3-acid': ['UT3 · Soluciones de arquitectura', 'Transacciones ACID'],
};

function Repeticiones({ autenticado = false }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setRows([]);
    try {
      for (let i = 0; i < 10; i++) {
        const result = await api(autenticado ? '/auth/me' : '/instance', { auth: autenticado });
        setRows((previous) => [...previous, result]);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } finally { setBusy(false); }
  };
  return <Card titulo={autenticado ? 'Misma identidad en distintas réplicas' : 'Distribución entre las réplicas del color activo'}>
    <Boton onClick={run} cargando={busy}>Ejecutar 10 solicitudes</Boton>
    <p className="muted small">{autenticado ? 'La sesión usa el mismo access token vigente; la identidad se valida en cada réplica sin afinidad de sesión. Keycloak reemplaza al emisor local de las TFU anteriores.' : 'Cada réplica ejecuta la misma imagen y comparte la base de datos. El color activo puede ser Blue o Green.'}</p>
    <table className="table"><thead><tr><th>#</th><th>Status</th><th>Réplica</th><th>Color</th><th>{autenticado ? 'Identidad' : 'Versión'}</th></tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}><td>{i + 1}</td><td><StatusHttp status={row.status} /></td><td>{row.instancia}</td><td>{row.slot}</td><td>{row.data?.email ?? row.data?.version ?? mensajeError(row)}</td></tr>)}</tbody></table>
    {rows.length > 0 && <p>Réplicas observadas: <b>{new Set(rows.filter((row) => row.ok).map((row) => row.instancia)).size}</b> · Respuestas correctas: <b>{rows.filter((row) => row.ok).length}/{rows.length}</b></p>}
  </Card>;
}

function Tacticas() {
  const config = useConfiguration();
  const [quote, setQuote] = useState(null);
  const [audit, setAudit] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const [normal, invierno] = await Promise.all([
        api('/configuration/quote?costo_base=100&politica=normal'),
        api('/configuration/quote?costo_base=100&politica=invierno'),
      ]);
      setQuote({ normal: normal.data, invierno: invierno.data });
    } finally { setBusy(false); }
  };
  const demonstrateAudit = async () => {
    const result = await api('/configuration');
    if (!result.ok) { setMessage(mensajeError(result)); return; }
    // Guardar los mismos valores genera una revisión y un evento real de auditoría.
    const saved = await api('/configuration', { method: 'PUT', body: { expected_hash: result.data.hash, settings: result.data.document.settings } });
    setMessage(saved.ok ? 'Operación auditada: misma configuración, nueva revisión.' : mensajeError(saved));
    setAudit(await api('/auditoria'));
  };
  return <>
    <Card titulo="Binding de la política de precios (Strategy)">
      <p>Una interfaz de cálculo tiene implementaciones normal e invierno. La política se elige por operación, sin cambiar el servicio de compras.</p>
      <Boton onClick={run} cargando={busy}>Comparar políticas con costo base $100</Boton>
      <p className="muted small">El porcentaje actual de invierno es {config?.winter_discount_percent ?? '—'}%; en UT4 se obtiene del JSON externo.</p>
      {quote && <Json data={quote} />}
    </Card>
    <Card titulo="Binding de auditoría mediante decorador">
      <p>El aspecto <code>@auditar</code> registra operaciones y errores sin incorporar escritura de logs en cada servicio. El archivo se comparte entre réplicas y persiste en un volumen Docker.</p>
      <RequiereLogin rol="admin"><div className="row gap-sm wrap">
        <Boton onClick={demonstrateAudit}>Generar operación auditada</Boton>
        <Boton variante="ghost" onClick={async () => setAudit(await api('/auditoria'))}>Leer auditoría</Boton>
      </div></RequiereLogin>
      {message && <Aviso>{message}</Aviso>}
      {audit && (audit.ok ? <Json data={audit.data.lineas?.join('\n')} /> : <Aviso tipo="err">{mensajeError(audit)}</Aviso>)}
      <Comando>docker compose restart api1 api2</Comando>
      <p className="muted small">Después del reinicio, volver a leer el log para comprobar persistencia.</p>
    </Card>
  </>;
}

function Acid() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setResult(await api('/demos/legacy/acid', { method: 'POST' })); }
    finally { setBusy(false); }
  };
  return <Card titulo="Compra + Copia: commit y rollback transaccional">
    <p>La prueba crea datos temporales, confirma una operación y fuerza una excepción tras el flush de otra, antes del commit. Otra sesión verifica que no queda ni Compra ni Copia del caso fallido. Al terminar limpia sus datos.</p>
    <RequiereLogin rol="admin"><Boton onClick={run} cargando={busy}>Ejecutar prueba ACID real</Boton></RequiereLogin>
    {result && (result.ok ? <Json data={result.data.output} alto={600} /> : <Aviso tipo="err">{mensajeError(result)}</Aviso>)}
    <Comando>python scripts/manage.py demo_acid</Comando>
    <p className="muted small">Esta prueba evidencia especialmente atomicidad y persistencia del commit; no es un ensayo exhaustivo de todos los niveles de aislamiento.</p>
  </Card>;
}

function RollbackMonitor() {
  const [samples, setSamples] = useState([]);
  useEffect(() => {
    let alive = true;
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api('/health/live', { auth: false, silencioso: true });
        if (alive) setSamples((rows) => [{ at: new Date(), status: result.status,
          instances: result.ok ? result.data.instancias : [] }, ...rows].slice(0, 30));
      } finally { pending = false; }
    };
    read();
    const timer = setInterval(read, 1500);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return <Card titulo="Observación del rollback" subtitulo="Dejá este panel abierto al ejecutar el script; consulta cada 1,5 s">
    <div className="table-scroll"><table className="table"><thead><tr><th>Hora</th><th>HTTP</th><th>Réplicas / versiones / salud</th></tr></thead>
      <tbody>{samples.slice(0, 12).map((sample, i) => <tr key={i}>
        <td>{sample.at.toLocaleTimeString()}</td><td><StatusHttp status={sample.status} /></td>
        <td>{sample.instances.length ? sample.instances.map((instance) => <div className="row gap-sm" key={instance.host}>
          <span className="mono">{instance.instance ?? instance.host} · {instance.version ?? '—'}</span><Estado valor={instance.status} />
        </div>) : 'Gateway temporalmente sin respuesta'}</td>
      </tr>)}</tbody></table></div>
  </Card>;
}

export default function Antiguas({ demo }) {
  const [unit, title] = TITULOS[demo];
  return <div className="page">
    <header className="pattern-head"><span className="tag tag-gray">Demos antiguas · {unit}</span><h1>{title}</h1>
      <p className="lead">Conceptos de las TFU anteriores conservados en la aplicación evolucionada.</p></header>
    {demo === 'ut2-tacticas' && <Tacticas />}
    {demo === 'ut2-rollback' && <>
      <RollbackMonitor />
      <Card titulo="Recuperar la versión anterior ante una imagen defectuosa">
        <ComoFunciona items={[
          'La demo selecciona Blue y conserva su imagen sana como versión anterior.',
          'Construye una imagen 2.0-broken cuyo /health devuelve 503 y reemplaza las réplicas Blue.',
          'El script detecta el fallo, restaura la imagen anterior y verifica ambas APIs y la identidad del contenedor MySQL.',
        ]} />
        <Aviso tipo="warn">Esta demo histórica reemplaza el backend activo y puede interrumpir temporalmente la API. Ejecutala separada de la demo Blue/Green.</Aviso>
        <Comando>.\scripts\demo_rollback.ps1</Comando><Comando>bash scripts/demo_rollback.sh</Comando>
        <p>El resultado y la recuperación quedan en <code>deployment_logs/deployment.log</code>.</p>
      </Card>
      <p>La estrategia actual con dos versiones en paralelo está en <a href="#/deploy">Blue/Green Deployment</a>.</p>
    </>}
    {demo === 'ut3-componentes' && <>
      <Card titulo="Componentes e interfaces"><table className="table"><thead><tr><th>Componente</th><th>Interfaz / responsabilidad</th></tr></thead><tbody>
        <tr><td>Routers FastAPI</td><td>REST /juegos, /compras, /personas, /biblioteca.</td></tr>
        <tr><td>Servicios de compras</td><td>Validaciones, Strategy y transacción; hoy separados en comandos y consultas.</td></tr>
        <tr><td>Persistencia</td><td>SQLAlchemy → MySQL. Redis acelera las lecturas en UT4.</td></tr>
        <tr><td>Auditoría</td><td>Decorador compartido y volumen persistente.</td></tr>
        <tr><td>Identidad</td><td>Validación JWT stateless; Keycloak reemplaza el login local en UT4.</td></tr>
      </tbody></table></Card>
      <Card titulo="Contenedores y partición técnica"><p>Las APIs replican el mismo backend modular. Los contenedores de base, caché y gateway corresponden a infraestructura; esta solución no constituye una partición por microservicios de dominio.</p>
        <Comando>docker compose ps</Comando><a href="#/inicio">Ver arquitectura actual</a></Card>
    </>}
    {demo === 'ut3-balanceo' && <Repeticiones />}
    {demo === 'ut3-stateless' && <RequiereLogin><Repeticiones autenticado /></RequiereLogin>}
    {demo === 'ut3-acid' && <Acid />}
  </div>;
}
