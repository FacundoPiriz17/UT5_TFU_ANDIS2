import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Comando, EncabezadoPatron, Estado, Json } from '../components/ui';

export default function Health() {
  const [state, setState] = useState(null);
  const [ready, setReady] = useState(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [s, r] = await Promise.all([api('/system/status', { auth: false, silencioso: true }), api('/health/ready', { auth: false, silencioso: true })]);
      if (alive) { setState(s.ok ? s.data : { status: 'down', services: [] }); setReady(r.data); }
    };
    refresh(); const t = setInterval(refresh, 3000); return () => { alive = false; clearInterval(t); };
  }, []);
  return <div className="page">
    <EncabezadoPatron id="health" atributo="Disponibilidad">Liveness informa si el proceso responde. Readiness informa sus dependencias; una caída de Catálogo permite que Comercial continúe atendiendo las operaciones locales.</EncabezadoPatron>
    <Card titulo="Servicios en ejecución"><Estado valor={state?.status} /><table className="table"><thead><tr><th>Servicio</th><th>Estado</th><th>Versión</th><th>Proceso</th></tr></thead><tbody>{state?.services?.map(s => <tr key={s.service}><td>{s.service}</td><td><Estado valor={s.status} /></td><td>{s.version ?? '—'}</td><td>{s.process_id ?? '—'}</td></tr>)}</tbody></table></Card>
    <div className="grid grid-2"><Card titulo="Readiness comercial"><Json data={ready} /></Card><Card titulo="Fallo parcial"><Comando>docker compose stop catalogo</Comando><p>Las consultas de compras registradas continúan. Comprar o componer una biblioteca que necesita Catálogo devuelve un error temporal controlado.</p><Comando>docker compose start catalogo</Comando></Card></div>
    <Card titulo="Límite del aislamiento: MySQL compartido">
      <p>Ambos servicios dependen del mismo motor y esquema. Separar procesos permite contener un fallo de Catálogo, pero una caída de MySQL afecta las operaciones con datos de los dos servicios.</p>
      <p>Esta es una ventaja operativa de conservar el modelo existente y, al mismo tiempo, una dependencia común que limita la autonomía.</p>
    </Card>
  </div>;
}
