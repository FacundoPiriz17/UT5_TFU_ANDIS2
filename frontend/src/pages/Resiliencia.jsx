import { useEffect, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { Aviso, Boton, Card, Comando, EncabezadoPatron, Json, RequiereLogin } from '../components/ui';
import CompararOperaciones from '../components/CompararOperaciones';

function Monitor() {
  const [state, setState] = useState(null);
  const [result, setResult] = useState(null);
  const refresh = async () => {
    const r = await api('/resilience', { silencioso: true });
    if (r.ok) setState(r.data);
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 2000); return () => clearInterval(t); }, []);
  return <>
    <div className="grid grid-2">
      <Card titulo="Circuito del proceso comercial" subtitulo="Datos reales del backend; contador de intentos físicos">
        <div className="metric"><div className="metric-label">Estado</div><div className="metric-value">{state?.state ?? '—'}</div></div>
        <p>Fallos consecutivos: {state?.failures ?? '—'} · Umbral: {state?.threshold ?? '—'}</p>
        <p>Llamadas físicas: {state?.physical_calls ?? '—'} · Invocaciones: {state?.logical_calls ?? '—'}</p>
        <Boton onClick={async () => { setResult(await api('/juegos/1')); refresh(); }}>Consultar juego por SOAP</Boton>
        {result && <Aviso tipo={result.ok ? 'ok' : 'err'}>{result.ok ? `${result.data.nombre} · ${result.ms} ms` : mensajeError(result)}</Aviso>}
      </Card>
      <Card titulo="Caída y recuperación">
        <p>Detené Catálogo y repetí la consulta hasta abrir el circuito. Las siguientes solicitudes se rechazan sin nuevas llamadas físicas.</p>
        <Comando>docker compose stop catalogo</Comando>
        <Comando>docker compose start catalogo</Comando>
        <p>Luego del período de recuperación se admite una sonda real. Su respuesta completa la solicitud que la inició.</p>
        <p>Compras ya registradas sigue disponible durante la caída. El estado y los contadores pertenecen a cada proceso comercial.</p>
      </Card>
    </div>
    <CompararOperaciones />
    <div className="grid grid-2">
      <Card titulo="Ventaja y costo de la separación">
        <p>Comercial conserva sus consultas locales cuando Catálogo falla. Las compras y bibliotecas que necesitan metadatos remotos dependen de ambos servicios.</p>
        <p>El circuito y los tiempos máximos acotan la espera. La comunicación remota agrega serialización XML, red y posibilidades de fallo.</p>
        <p>Para distinguir errores de negocio, consultá un ID inexistente en el panel de muestras: un 404 no incrementa los fallos técnicos ni provoca Retry.</p>
      </Card>
      <Card titulo="Demostrar una dependencia lenta">
        <p>El override opcional permite agregar dos segundos de demora a SOAP. Ejecutá desde la raíz del proyecto:</p>
        <Comando>docker compose -f docker-compose.yaml -f docker-compose.demo.yaml up -d --no-deps catalogo</Comando>
        <Comando>{'Set-Content -Path config/demo-faults.json -Value ' + "'{\"delay_seconds\":2}'"}</Comando>
        <p>Tomá una muestra y observá duración, intentos y apertura. Para terminar la demo y volver al arranque normal:</p>
        <Comando>{'Set-Content -Path config/demo-faults.json -Value ' + "'{}'"}</Comando>
        <Comando>docker compose up -d --no-deps catalogo</Comando>
      </Card>
    </div>
    <Card titulo="Política y transiciones"><Json data={state} alto={420} /></Card>
  </>;
}

export default function Resiliencia() {
  return <div className="page">
    <EncabezadoPatron id="resilience" atributo="Disponibilidad">
      Comercial consulta Catálogo por SOAP. Los errores técnicos cuentan para el circuito; un juego inexistente o un rechazo de permisos no generan reintentos.
    </EncabezadoPatron>
    <RequiereLogin rol="admin"><Monitor /></RequiereLogin>
  </div>;
}
