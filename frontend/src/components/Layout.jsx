import { useEffect, useState } from 'react';
import { GRUPOS, PATRONES } from '../lib/patrones';
import { cerrarSesion, iniciarLogin, useSesion } from '../lib/auth';
import { api } from '../lib/api';
import RequestLog from './RequestLog';

const NAV_GENERAL = [
  { id: 'inicio', nombre: 'Arquitectura', icono: '◎' },
  { id: 'tienda', nombre: 'Tienda de juegos', icono: '🎮' },
];

const ICONOS = { health: '♥', throttling: '⏱', cache: '⚡', cqrs: '⇄', identity: '🔑', offloading: '🛡', deploy: '🚀', configuration: '⚙' };
const ANTIGUAS = [
  { unidad: 'UT2 · Tácticas', items: [
    ['ut2-tacticas', 'Strategy y auditoría'], ['ut2-rollback', 'Rollback'],
  ] },
  { unidad: 'UT3 · Soluciones', items: [
    ['ut3-componentes', 'Componentes y contenedores'], ['ut3-balanceo', 'Escalabilidad horizontal'],
    ['ut3-stateless', 'Servicios sin estado'], ['ut3-acid', 'Transacciones ACID'],
  ] },
];

function EstadoGateway() {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      const r = await api('/health/live', { auth: false, silencioso: true });
      if (vivo) setEstado(r.ok ? r.data : { status: 'down', instancias_activas: '0/2' });
    };
    consultar();
    const t = setInterval(consultar, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const s = estado?.status;
  const clase = s === 'ok' ? 'ok' : s === 'degraded' ? 'warn' : s ? 'err' : 'neutral';
  return (
    <div className={`gw gw-${clase}`} title="Estado reportado por /health/live">
      <span className="dot" />
      <span>{s ? `Sistema ${s === 'ok' ? 'operativo' : s === 'degraded' ? 'degradado' : 'caído'}` : 'Consultando…'}</span>
      {estado && <span className="muted">· {estado.instancias_activas} réplicas</span>}
    </div>
  );
}

function Usuario() {
  const sesion = useSesion();
  if (!sesion) {
    return (
      <div className="user">
        <button className="btn btn-primary btn-sm" onClick={() => iniciarLogin()}>Iniciar sesión</button>
      </div>
    );
  }
  return (
    <div className="user">
      <div className="avatar">{(sesion.nombre || sesion.email || '?').slice(0, 1).toUpperCase()}</div>
      <div className="user-info">
        <div className="user-name">{sesion.nombre || sesion.email}</div>
        <div className="user-roles">
          {sesion.roles.map((r) => <span key={r} className={`role role-${r}`}>{r}</span>)}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={cerrarSesion}>Salir</button>
    </div>
  );
}

export default function Layout({ ruta, children }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [ruta]);

  return (
    <div className="app">
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#/inicio">
          <span className="brand-logo">▲</span>
          <span>
            <b>ANDIS · UT4</b>
            <small>Patrones de arquitectura</small>
          </span>
        </a>
        <nav>
          <div className="nav-section">General</div>
          {NAV_GENERAL.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={`nav-item ${ruta === n.id ? 'active' : ''}`}>
              <span className="nav-icon">{n.icono}</span>{n.nombre}
            </a>
          ))}
          {Object.entries(GRUPOS).map(([gid, g]) => (
            <div key={gid}>
              <div className="nav-section"><span className={`nav-dot bg-${g.color}`} />{g.nombre}</div>
              {PATRONES.filter((p) => p.grupo === gid).map((p) => (
                <a key={p.id} href={`#/${p.id}`} className={`nav-item ${ruta === p.id ? 'active' : ''}`}>
                  <span className="nav-icon">{ICONOS[p.id]}</span>{p.nombre}
                </a>
              ))}
            </div>
          ))}
          <details className="legacy-nav" open={ruta.startsWith('ut') || undefined}>
            <summary className="nav-section">Demos antiguas</summary>
            {ANTIGUAS.map((grupo) => (
              <details key={grupo.unidad} open={grupo.items.some(([id]) => id === ruta) || undefined}>
                <summary className="nav-section">{grupo.unidad}</summary>
                {grupo.items.map(([id, nombre]) => (
                  <a key={id} href={`#/${id}`} className={`nav-item ${ruta === id ? 'active' : ''}`}>{nombre}</a>
                ))}
              </details>
            ))}
          </details>
        </nav>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMenu(true)} aria-label="Menú">☰</button>
          <EstadoGateway />
          <Usuario />
        </header>
        <main className="content">{children}</main>
        <RequestLog />
      </div>
    </div>
  );
}
