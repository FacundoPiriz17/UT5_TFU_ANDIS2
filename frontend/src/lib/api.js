// Cliente HTTP: todas las llamadas van a /api (gateway nginx) y quedan
// registradas con status, latencia, instancia que respondió y estado de cache.
import { useSyncExternalStore } from 'react';
import { tokenVigente } from './auth';

export const API_BASE = '/api';

const MAX_LOG = 120;
const listeners = new Set();
let registro = [];
let siguienteId = 1;

function emitir() {
  listeners.forEach((l) => l());
}

export function registrar(entrada) {
  registro = [{ id: siguienteId++, hora: new Date(), ...entrada }, ...registro].slice(0, MAX_LOG);
  emitir();
}

export function limpiarRegistro() {
  registro = [];
  emitir();
}

export function useRegistro() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => registro,
  );
}

/**
 * Ejecuta una petición contra la API.
 * opciones.auth: false (sin token) | true (token de sesión) | string (token explícito)
 * opciones.silencioso: no registrar en el log (para ráfagas grandes)
 */
export async function api(path, { method = 'GET', body, auth = true, silencioso = false, etiqueta } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = typeof auth === 'string' ? auth : auth ? await tokenVigente() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = API_BASE + path;
  const inicio = performance.now();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (e) {
    const ms = Math.round(performance.now() - inicio);
    const r = { ok: false, status: 0, data: { error: 'Sin conexión con el gateway', detalle: String(e) }, ms, headers: new Headers() };
    if (!silencioso) registrar({ method, path, status: 0, ms, etiqueta });
    return r;
  }

  const texto = await res.text();
  const ms = Math.round(performance.now() - inicio);
  let data = texto;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    /* respuesta no JSON */
  }

  const resultado = {
    ok: res.ok,
    status: res.status,
    data,
    ms,
    headers: res.headers,
    instancia: res.headers.get('X-Instance-ID'),
    slot: res.headers.get('X-Deployment-Slot'),
    version: res.headers.get('X-API-Version'),
    cache: res.headers.get('X-Cache'),
    url,
  };

  if (!silencioso) {
    registrar({
      method,
      path,
      status: res.status,
      ms,
      instancia: resultado.instancia,
      slot: resultado.slot,
      version: resultado.version,
      cache: resultado.cache,
      etiqueta,
    });
  }
  return resultado;
}

export function mensajeError(r) {
  if (!r) return '';
  const d = r.data;
  if (d && typeof d === 'object') {
    if (typeof d.detail === 'string') return d.detail;
    if (Array.isArray(d.detail)) return d.detail.map((x) => x.msg).join('; ');
    if (d.message) return d.message;
    if (d.error) return d.error;
  }
  return `HTTP ${r.status}`;
}
