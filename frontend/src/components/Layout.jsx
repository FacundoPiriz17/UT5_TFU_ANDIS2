import { useEffect, useState } from 'react';
import { DEMOS_ANTIGUAS, GRUPOS, PATRONES_UT5 } from '../lib/patrones';
import { cerrarSesion, iniciarLogin, useSesion } from '../lib/auth';
import { api } from '../lib/api';
import RequestLog from './RequestLog';

const NAV_GENERAL = [
  { id: 'inicio', nombre: 'Arquitectura', icono: '◎' },
  { id: 'tienda', nombre: 'Tienda de juegos', icono: '🎮' },
];

const ICONOS = { health: '♥', throttling: '⏱', cache: '⚡', cqrs: '⇄', identity: '🔑', offloading: '🛡', deploy: '🚀', configuration: '⚙', resilience: '↻' };
function EstadoGateway() {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      const r = await api('/system/status', { auth: false, silencioso: true });
      if (vivo) setEstado(r.ok ? r.data : { status: 'down', instancias_activas: '0/2' });
    };
    consultar();
    const t = setInterval(consultar, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const s = estado?.status;
  const clase = s === 'ok' ? 'ok' : s === 'degraded' ? 'warn' : s ? 'err' : 'neutral';
  return (
    <div className={`gw gw-${clase}`} title="Estado reportado por /system/status">
      <span className="dot" />
      <span>{s ? `Sistema ${s === 'ok' ? 'operativo' : s === 'degraded' ? 'degradado' : 'caído'}` : 'Consultando…'}</span>
      {estado && <span className="muted">· {estado.services?.filter((s) => s.status === 'ok').length ?? 0}/2 servicios</span>}
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
  const rutaAntigua = ruta === 'demos-antiguas' || DEMOS_ANTIGUAS.some((g) => g.items.some(([id]) => id === ruta));

  return (
    <div className="app">
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#/inicio">
          <span className="brand-logo">▲</span>
          <span>
            <b>ANDIS · UT5</b>
            <small>Arquitectura basada en servicios</small>
          </span>
        </a>
        <nav>
          <div className="nav-section">General</div>
          {NAV_GENERAL.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={`nav-item ${ruta === n.id ? 'active' : ''}`}>
              <span className="nav-icon">{n.icono}</span>{n.nombre}
            </a>
          ))}
          <div className="nav-section">Demostraciones UT5</div>
          {Object.entries(GRUPOS).filter(([gid]) => PATRONES_UT5.some((p) => p.grupo === gid)).map(([gid, g]) => (
            <div key={gid}>
              <div className="nav-section"><span className={`nav-dot bg-${g.color}`} />{g.nombre}</div>
              {PATRONES_UT5.filter((p) => p.grupo === gid).map((p) => (
                <a key={p.id} href={`#/${p.id}`} className={`nav-item ${ruta === p.id ? 'active' : ''}`}>
                  <span className="nav-icon">{ICONOS[p.id]}</span>{p.nombre}
                </a>
              ))}
            </div>
          ))}
          <details className="legacy-nav" open={rutaAntigua || undefined}>
            <summary className="nav-section">Demos antiguas</summary>
            <a href="#/demos-antiguas" className={'nav-item ' + (ruta === 'demos-antiguas' ? 'active' : '')}>Todas las demos anteriores</a>
            {DEMOS_ANTIGUAS.map((grupo) => (
              <details key={grupo.unidad} open={grupo.items.some(([id]) => id === ruta) || undefined}>
                <summary className="nav-section">{grupo.unidad}</summary>
                {grupo.items.map(([id, nombre]) => (
                  <a key={id} href={'#/' + id} className={'nav-item ' + (ruta === id ? 'active' : '')}>{nombre}</a>
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
