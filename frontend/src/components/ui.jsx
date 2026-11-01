import { useState } from 'react';
import DiagramaPatron from './DiagramaPatron';
import { GRUPOS, patron } from '../lib/patrones';
import { iniciarLogin, useSesion } from '../lib/auth';

export function Card({ titulo, subtitulo, acciones, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(titulo || acciones) && (
        <header className="card-head">
          <div>
            {titulo && <h3>{titulo}</h3>}
            {subtitulo && <p className="muted">{subtitulo}</p>}
          </div>
          {acciones && <div className="card-actions">{acciones}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function GrupoTag({ grupo }) {
  const g = GRUPOS[grupo];
  return <span className={`tag tag-${g.color}`}>{g.nombre}</span>;
}

export function EncabezadoPatron({ id, atributo, children }) {
  const p = patron(id);
  return (
    <header className="pattern-head">
      <div className="pattern-head-top">
        <GrupoTag grupo={p.grupo} />
        <span className="muted small">Atributo de calidad: <b>{atributo}</b></span>
      </div>
      <h1>{p.nombre}</h1>
      <p className="lead">{children ?? p.resumen}</p>
      <div className="files">
        {p.archivos.map((a) => (
          <code key={a} className="file-chip">{a}</code>
        ))}
      </div>
      <DiagramaPatron id={id} nombre={p.nombre} />
    </header>
  );
}

export function Boton({ variante = 'primary', cargando, children, ...props }) {
  return (
    <button className={`btn btn-${variante}`} disabled={cargando || props.disabled} {...props}>
      {cargando && <span className="spinner" />}
      {children}
    </button>
  );
}

export function Estado({ valor }) {
  const v = String(valor ?? 'desconocido').toLowerCase();
  const clase =
    ['ok', 'ready', 'hit'].includes(v) ? 'ok'
      : ['degraded', 'miss', 'unhealthy', 'not_ready'].includes(v) ? 'warn'
        : ['down', 'error'].includes(v) ? 'err' : 'neutral';
  return <span className={`pill pill-${clase}`}><span className="dot" />{valor ?? '—'}</span>;
}

export function StatusHttp({ status }) {
  const clase = status === 0 ? 'err' : status < 300 ? 'ok' : status < 400 ? 'neutral' : status === 429 ? 'warn' : 'err';
  return <span className={`http http-${clase}`}>{status === 0 ? 'ERR' : status}</span>;
}

export function Metrica({ etiqueta, valor, unidad, tono }) {
  return (
    <div className={`metric ${tono ? `metric-${tono}` : ''}`}>
      <div className="metric-label">{etiqueta}</div>
      <div className="metric-value">
        {valor}
        {unidad && <span className="metric-unit">{unidad}</span>}
      </div>
    </div>
  );
}

export function Json({ data, alto = 260 }) {
  if (data === undefined) return null;
  return (
    <pre className="json" style={{ maxHeight: alto }}>
      {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function Comando({ children }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    } catch {
      /* portapapeles no disponible */
    }
  };
  return (
    <div className="cmd">
      <code>{children}</code>
      <button className="cmd-copy" onClick={copiar} title="Copiar">{copiado ? '✓' : 'Copiar'}</button>
    </div>
  );
}

// Explicación de cómo el patrón logra el atributo y cómo comprobarlo empíricamente.
export function ComoFunciona({ items }) {
  return (
    <ol className="steps">
      {items.map((t, i) => (
        <li key={i}><span className="step-n">{i + 1}</span><div>{t}</div></li>
      ))}
    </ol>
  );
}

export function Aviso({ tipo = 'info', children }) {
  return <div className={`notice notice-${tipo}`}>{children}</div>;
}

export function RequiereLogin({ children, rol }) {
  const sesion = useSesion();
  if (!sesion) {
    return (
      <div className="gate">
        <div className="gate-icon">🔐</div>
        <h3>Esta demo necesita una sesión</h3>
        <p className="muted">Los endpoints usados requieren un access token emitido por Keycloak (Federated Identity).</p>
        <div className="row center">
          <Boton onClick={() => iniciarLogin('demo@adaii.local')}>Entrar como usuario demo</Boton>
          <Boton variante="ghost" onClick={() => iniciarLogin('admin@adaii.local')}>Entrar como admin</Boton>
        </div>
      </div>
    );
  }
  if (rol && !sesion.roles.includes(rol)) {
    return <Aviso tipo="warn">Esta acción requiere el rol <b>{rol}</b>. Iniciá sesión como <code>admin@adaii.local</code>.</Aviso>;
  }
  return children;
}
