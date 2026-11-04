import { Card, Comando } from '../components/ui';
import { PATRONES_UT5 } from '../lib/patrones';

export default function Inicio() {
  return <div className="page">
    <header className="pattern-head"><span className="tag tag-gray">UT5 · Service-Based Architecture</span>
      <h1>Tienda de juegos</h1><p className="lead">Catálogo y Compras/Biblioteca cooperan mediante contratos y se despliegan por separado.</p>
    </header>
    <div className="grid grid-2">
      <Card titulo="Catálogo"><p>Administra juegos y géneros. Publica ObtenerJuego y ObtenerJuegos mediante SOAP/XML, con WSDL versionado.</p><a href="/api/soap/catalogo?wsdl" target="_blank" rel="noreferrer">Ver contrato WSDL</a></Card>
      <Card titulo="Compras y Biblioteca"><p>Administra perfiles, compras y adquisiciones. Consulta Catálogo por SOAP y confirma Compra y Copia en una transacción local.</p><a className="btn btn-primary" href="#/tienda">Abrir la tienda</a></Card>
    </div>
    <Card titulo="Decisiones de esta evolución"><p>MySQL permanece compartido y conserva sus claves foráneas. Cada servicio administra sus datos; Biblioteca compone adquisiciones locales con metadatos actuales del catálogo.</p><p>Keycloak conserva la identidad federada con PKCE. Redis usa namespaces por servicio. El cliente SOAP aplica Circuit Breaker, Retry acotado y un presupuesto total de espera.</p></Card>
    <Card titulo="Del monolito modular a Service-Based">
      <table className="table">
        <thead><tr><th>Aspecto</th><th>TFU4 · Monolito modular</th><th>UT5 · Dos servicios</th></tr></thead>
        <tbody>
          <tr><td>Publicación</td><td>Backend completo con Blue/Green</td><td>Catálogo puede actualizarse conservando Comercial</td></tr>
          <tr><td>Comunicación de negocio</td><td>Llamadas locales y SQL</td><td>Contrato SOAP, serialización XML y espera de red</td></tr>
          <tr><td>Fallo de Catálogo</td><td>Comparte proceso con los demás módulos</td><td>Las consultas locales continúan; comprar requiere Catálogo</td></tr>
          <tr><td>Datos</td><td>Una base compartida</td><td>MySQL sigue compartido: conserva integridad y acoplamiento</td></tr>
        </tbody>
      </table>
      <p>La separación reduce el alcance de los despliegues y de ciertos fallos. Agrega llamadas remotas y tareas de diagnóstico; el rendimiento y la disponibilidad deben observarse por operación.</p>
    </Card>
    <div className="grid grid-2">{PATRONES_UT5.map(p => <Card key={p.id} titulo={p.nombre}><p>{p.resumen}</p><a href={`#/${p.id}`}>Ver demostración</a></Card>)}</div>
    <Card titulo="Operación y demostraciones">
      <Comando>python scripts/manage.py status</Comando>
      <p>Consultá el estado de los servicios y seguí las demostraciones desde la consola.</p>
      <a href="#/resilience">Probar caída y recuperación de Catálogo</a>
      <a href="#/deploy">Probar el despliegue independiente</a>
    </Card>
    <Card titulo="Demos antiguas">
      <p>Las demostraciones de TFU2, TFU3 y TFU4 se conservan agrupadas. Health, Cache-Aside y CQRS se reutilizan en UT5 para observar las nuevas fronteras.</p>
      <a href="#/demos-antiguas">Abrir demos antiguas</a>
    </Card>
  </div>;
}
