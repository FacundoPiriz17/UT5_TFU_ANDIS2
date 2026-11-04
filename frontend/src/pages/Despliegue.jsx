import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Comando, EncabezadoPatron, RequiereLogin } from '../components/ui';
import CompararOperaciones from '../components/CompararOperaciones';

export default function Despliegue() {
  const [services, setServices] = useState([]);
  useEffect(() => { const refresh = async () => { const r = await api('/deployment/status', { auth: false, silencioso: true }); if (r.ok) setServices(r.data.services); }; refresh(); const t = setInterval(refresh, 2000); return () => clearInterval(t); }, []);
  return <div className="page">
    <EncabezadoPatron id="deploy" atributo="Facilidad de despliegue">Un cambio compatible en Catálogo puede publicarse sin reconstruir ni reemplazar Comercial. La consola muestra el estado y la versión de cada servicio.</EncabezadoPatron>
    <Card titulo="Unidades independientes"><table className="table"><thead><tr><th>Servicio</th><th>Estado</th><th>Versión</th><th>Proceso</th><th>Configuración</th></tr></thead><tbody>{services.map(s => <tr key={s.service}><td>{s.service}</td><td>{s.status}</td><td>{s.version ?? '—'}</td><td>{s.process_id ?? '—'}</td><td>{s.configuration_hash?.slice(0, 12) ?? '—'}</td></tr>)}</tbody></table></Card>
    <div className="grid grid-2">
      <Card titulo="Actualizar sólo Catálogo">
        <Comando>python scripts/manage.py deploy v2 --service catalogo</Comando>
        <p>El comando construye y recrea únicamente el servicio indicado. La tabla permite comprobar su nueva versión.</p>
        <p>Un cambio incompatible en el contrato o esquema puede requerir coordinación.</p>
      </Card>
      <Card titulo="Comprobar la independencia">
        <Comando>docker compose ps -q comercial</Comando>
        <p>Ejecutá este comando antes y después del despliegue de Catálogo: el identificador del contenedor Comercial debe permanecer igual.</p>
        <p>Las consultas de compras registradas siguen disponibles. Las operaciones que necesitan Catálogo pueden devolver 503 mientras ese servicio se reinicia.</p>
      </Card>
    </div>
    <RequiereLogin><CompararOperaciones /></RequiereLogin>
    <Card titulo="Alcance de la ventaja">
      <p>En TFU4 Blue/Green ya permitía controlar la transición entre versiones, pero publicaba el backend completo. En UT5 se reduce la unidad que se reconstruye y reemplaza.</p>
      <p>Los cambios incompatibles en SOAP o en MySQL compartido requieren coordinación. El monitor permite observar errores durante el reinicio de Catálogo y la continuidad de las consultas locales.</p>
      <a href="#/ut4-blue-green">Ver Blue/Green en Demos antiguas</a>
    </Card>
  </div>;
}
