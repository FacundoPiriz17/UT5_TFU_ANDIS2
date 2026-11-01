import { GRUPOS, PATRONES } from '../lib/patrones';
import { Card, GrupoTag } from '../components/ui';

// Diagrama de despliegue simplificado con los patrones ubicados en cada nodo.
function Diagrama() {
  const nodo = (x, y, w, h, titulo, sub, clase, chips = []) => (
    <g transform={`translate(${x},${y})`}>
      <rect width={w} height={h} rx="12" className={`dg-node ${clase}`} />
      <text x={w / 2} y={chips.length ? 26 : h / 2 - 2} className="dg-title" textAnchor="middle">{titulo}</text>
      <text x={w / 2} y={chips.length ? 44 : h / 2 + 16} className="dg-sub" textAnchor="middle">{sub}</text>
      {chips.map((c, i) => (
        <g key={c.t} transform={`translate(${10},${58 + i * 24})`}>
          <rect width={w - 20} height="19" rx="9.5" className={`dg-chip dg-${c.c}`} />
          <text x={(w - 20) / 2} y="13.5" textAnchor="middle" className="dg-chip-text">{c.t}</text>
        </g>
      ))}
    </g>
  );
  const flecha = (d, etiqueta, lx, ly) => (
    <g>
      <path d={d} className="dg-edge" markerEnd="url(#flecha)" />
      {etiqueta && <text x={lx} y={ly} className="dg-edge-label" textAnchor="middle">{etiqueta}</text>}
    </g>
  );

  return (
    <svg viewBox="0 0 940 400" className="diagram" role="img" aria-label="Diagrama de arquitectura">
      <defs>
        <marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="dg-arrow" />
        </marker>
      </defs>

      {nodo(10, 150, 130, 70, 'Navegador', 'React · :3200', 'dg-client')}
      {nodo(10, 30, 165, 70, 'JSON externo', 'compartido por Blue / Green', 'dg-store')}
      {nodo(185, 110, 170, 150, 'Gateway Nginx', 'un color activo', 'dg-gateway', [
        { t: 'Throttling', c: 'green' },
        { t: 'Gateway Offloading', c: 'violet' },
        { t: 'Blue / Green + balanceo', c: 'gray' },
      ])}
      {nodo(410, 40, 190, 130, 'Blue · 2 réplicas', 'api1 + api2 · v1.0 inicial', 'dg-api', [
        { t: 'Health Endpoints', c: 'green' },
        { t: 'CQRS · Cache-Aside', c: 'blue' },
      ])}
      {nodo(410, 200, 190, 130, 'Green · 2 réplicas', 'green1 + green2 · v2.0 inicial', 'dg-api', [
        { t: 'Health Endpoints', c: 'green' },
        { t: 'CQRS · Cache-Aside', c: 'blue' },
      ])}
      {nodo(670, 20, 160, 70, 'Redis', 'cache LRU · TTL configurable', 'dg-store')}
      {nodo(670, 150, 160, 70, 'MySQL 8.4', 'modelo de escritura', 'dg-store')}
      {nodo(670, 290, 250, 96, 'Keycloak', 'IdP OIDC · realm andis-ut4', 'dg-idp', [
        { t: 'Federated Identity', c: 'violet' },
      ])}

      {flecha('M140,185 L183,185')}
      <text x="75" y="242" className="dg-edge-label" textAnchor="middle">/api → gateway</text>
      {flecha('M355,160 L408,110')}
      {flecha('M355,215 L408,262')}
      <path d="M175,65 L408,65 M165,88 C375,30 370,265 408,265" className="dg-edge dg-edge-dashed" markerEnd="url(#flecha)" />
      {flecha('M600,90 L668,60', 'cache', 632, 64)}
      {flecha('M600,262 L668,200')}
      {flecha('M600,110 L668,175', 'SQL', 640, 130)}
      {flecha('M600,300 L668,330', 'JWKS', 632, 304)}
      <path d="M75,252 C75,380 400,388 668,365" className="dg-edge dg-edge-dashed" markerEnd="url(#flecha)" />
      <text x="250" y="362" className="dg-edge-label">login OIDC + PKCE (redirección)</text>
    </svg>
  );
}

export default function Inicio() {
  return (
    <div className="page">
      <header className="hero">
        <div>
          <span className="eyebrow">Trabajo Final · Unidad Temática 4</span>
          <h1>Patrones de arquitectura en la API de Juegos</h1>
          <p className="lead">
            Consola de demostración para comprobar empíricamente cómo cada patrón aporta a su atributo de calidad.
            Todo el tráfico pasa por el gateway real y queda registrado en la consola inferior, con la réplica que respondió y el estado de cache.
          </p>
        </div>
        <div className="hero-stats">
          {Object.entries(GRUPOS).map(([id, g]) => (
            <div key={id} className={`hero-stat border-${g.color}`}>
              <b>{PATRONES.filter((p) => p.grupo === id).length}</b>
              <span>{g.nombre}</span>
            </div>
          ))}
        </div>
      </header>

      <Card titulo="Vista de despliegue" subtitulo="Docker Compose: un frontend, gateway, Blue y Green (2 réplicas cada uno), Redis, MySQL, Keycloak y JSON externo">
        <Diagrama />
      </Card>

      <h2 className="section-title">Patrones y estrategia de despliegue · UT4</h2>
      <div className="grid grid-3">
        {PATRONES.map((p) => (
          <a key={p.id} href={`#/${p.id}`} className="pattern-card">
            <GrupoTag grupo={p.grupo} />
            <h3>{p.nombre}</h3>
            <p>{p.resumen}</p>
            <span className="pattern-card-cta">Abrir demo →</span>
          </a>
        ))}
        <a href="#/tienda" className="pattern-card pattern-card-alt">
          <span className="tag tag-gray">Aplicación</span>
          <h3>Tienda de juegos</h3>
          <p>Usá la API como un cliente real: catálogo, compras con política de precios (Strategy) y biblioteca personal.</p>
          <span className="pattern-card-cta">Abrir →</span>
        </a>
      </div>

      <Card titulo="Guion sugerido para la demo">
        <ol className="script">
          <li><b>Arquitectura:</b> presentar el diagrama y la consola de tráfico.</li>
          <li><b>Federated Identity:</b> iniciar sesión en Keycloak y mostrar los claims y los rechazos 401/403.</li>
          <li><b>Tienda + CQRS:</b> comprar un juego (comando) y ver la proyección de lectura actualizada.</li>
          <li><b>Cache-Aside:</b> repetir lecturas y comparar latencias HIT vs MISS; invalidar con una escritura.</li>
          <li><b>Health Endpoint Monitoring:</b> detener <code>api2</code> y ver el estado degradado en vivo.</li>
          <li><b>Throttling + Gateway Offloading:</b> lanzar una ráfaga y ver los 429; mostrar gzip y estáticos.</li>
          <li><b>Despliegue:</b> cambiar el tráfico de Blue a Green y observar el color y la versión que responden.</li>
          <li><b>Facilidad de modificación:</b> editar el JSON externo y ver la nueva cotización con las mismas APIs.</li>
          <li><b>TFU anteriores:</b> abrir Demos antiguas → UT2 o UT3 para las tácticas y conceptos heredados.</li>
        </ol>
      </Card>
    </div>
  );
}
