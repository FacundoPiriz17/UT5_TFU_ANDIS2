import { useState } from 'react';
import { api } from '../lib/api';
import { Boton, Card, EncabezadoPatron, Json } from '../components/ui';

export default function GatewayOffloading() {
  const [result, setResult] = useState(null);
  return <div className="page"><EncabezadoPatron id="offloading" atributo="Seguridad y rendimiento">Nginx centraliza compresión, archivos estáticos y límite de tasa. Enruta las operaciones de juegos a Catálogo y las operaciones comerciales a Comercial.</EncabezadoPatron>
    <div className="grid grid-2"><Card titulo="Archivos estáticos"><Boton onClick={async () => { const r = await api('/static/info.json', { auth: false }); setResult({ status: r.status, servedBy: r.headers.get('X-Served-By'), data: r.data }); }}>Consultar estático</Boton></Card><Card titulo="Enrutamiento por responsabilidad"><Boton onClick={async () => { const r = await api('/system/status', { auth: false }); setResult(r.data); }}>Consultar servicios</Boton><p>El gateway no reintenta comandos de compra. El cliente comercial aplica retry solamente a consultas SOAP.</p></Card></div><Card titulo="Respuesta observada"><Json data={result} /></Card>
  </div>;
}
