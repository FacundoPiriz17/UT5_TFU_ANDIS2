import { useState } from 'react';
import { limpiarRegistro, useRegistro } from '../lib/api';
import { StatusHttp } from './ui';

// Consola inferior: cada petición muestra qué réplica respondió y si vino de cache.
export default function RequestLog() {
  const registro = useRegistro();
  const [abierto, setAbierto] = useState(false);
  const ultimo = registro[0];

  return (
    <div className={`log ${abierto ? 'log-open' : ''}`}>
      <button className="log-bar" onClick={() => setAbierto((v) => !v)}>
        <span className="log-title">
          <span className="log-pulse" /> Tráfico HTTP
          <span className="log-count">{registro.length}</span>
        </span>
        {ultimo && (
          <span className="log-last">
            <StatusHttp status={ultimo.status} /> {ultimo.method} {ultimo.path}
            <span className="muted"> · {ultimo.ms} ms{ultimo.instancia ? ` · ${ultimo.instancia}` : ''}</span>
          </span>
        )}
        <span className="log-toggle">{abierto ? '▾' : '▴'}</span>
      </button>
      {abierto && (
        <div className="log-body">
          <div className="log-tools">
            <span className="muted small">Últimas {registro.length} peticiones a través del gateway</span>
            <button className="link" onClick={limpiarRegistro}>Limpiar</button>
          </div>
          <table className="table log-table">
            <thead>
              <tr>
                <th>Hora</th><th>Método</th><th>Ruta</th><th>Status</th><th>Latencia</th><th>Instancia</th><th>Color / versión</th><th>Cache</th>
              </tr>
            </thead>
            <tbody>
              {registro.map((r) => (
                <tr key={r.id}>
                  <td className="mono muted">{r.hora.toLocaleTimeString()}</td>
                  <td className="mono">{r.method}</td>
                  <td className="mono path">{r.path}{r.etiqueta && <span className="muted"> · {r.etiqueta}</span>}</td>
                  <td><StatusHttp status={r.status} /></td>
                  <td className="mono">{r.ms} ms</td>
                  <td className="mono">{r.instancia || <span className="muted">gateway</span>}</td>
                  <td className="mono">{r.slot ? `${r.slot} · ${r.version}` : '—'}</td>
                  <td>{r.cache ? <span className={`cache-tag cache-${r.cache.toLowerCase()}`}>{r.cache}</span> : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {registro.length === 0 && (
                <tr><td colSpan={8} className="muted center">Todavía no hay tráfico. Ejecutá alguna demo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
