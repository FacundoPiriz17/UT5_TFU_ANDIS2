// Federated Identity: el front nunca ve contraseñas. Delega el login en Keycloak
// (Authorization Code + PKCE) y solo guarda el access token emitido por el IdP.
import { useSyncExternalStore } from 'react';

export const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081';
export const REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'andis-ut4';
export const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT || 'andis-frontend';
const OIDC = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect`;

const SESSION_KEY = 'andis.session';
const PKCE_KEY = 'andis.pkce';

const listeners = new Set();
let session = leer();

function leer() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function guardar(nueva) {
  session = nueva;
  try {
    if (nueva) sessionStorage.setItem(SESSION_KEY, JSON.stringify(nueva));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* almacenamiento no disponible: la sesión vive solo en memoria */
  }
  listeners.forEach((l) => l());
}

function redirectUri() {
  return `${window.location.origin}/`;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function aleatorio(n = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(n)));
}

export function decodificarJwt(token) {
  try {
    const [h, p] = token.split('.');
    const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
    return { header: dec(h), payload: dec(p) };
  } catch {
    return null;
  }
}

function desdeRespuesta(data) {
  const claims = decodificarJwt(data.access_token)?.payload || {};
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    refreshExpiresAt: data.refresh_expires_in ? Date.now() + data.refresh_expires_in * 1000 : null,
    email: claims.email,
    nombre: [claims.given_name, claims.family_name].filter(Boolean).join(' ') || claims.preferred_username,
    roles: claims.realm_access?.roles?.filter((r) => r === 'admin' || r === 'user') || [],
  };
}

export async function iniciarLogin(loginHint) {
  const verifier = aleatorio(48);
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = aleatorio(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, volverA: window.location.hash }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  window.location.assign(`${OIDC}/auth?${params}`);
}

// Procesa el ?code=... que devuelve Keycloak tras el login.
export async function procesarCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return null;

  const pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY) || '{}');
  sessionStorage.removeItem(PKCE_KEY);
  window.history.replaceState({}, '', `/${pkce.volverA || ''}`);

  if (error) throw new Error(url.searchParams.get('error_description') || error);
  if (url.searchParams.get('state') !== pkce.state) throw new Error('State OIDC inválido');

  const res = await fetch(`${OIDC}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: pkce.verifier,
    }),
  });
  if (!res.ok) throw new Error(`Keycloak rechazó el código (${res.status})`);
  guardar(desdeRespuesta(await res.json()));
  return session;
}

let refrescando = null;

async function refrescar() {
  const res = await fetch(`${OIDC}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: session.refreshToken,
    }),
  });
  if (!res.ok) {
    guardar(null);
    return null;
  }
  guardar(desdeRespuesta(await res.json()));
  return session;
}

// El realm emite tokens de 60 s: se renuevan con el refresh token antes de vencer.
export async function tokenVigente() {
  if (!session) return null;
  if (session.expiresAt - Date.now() > 10_000) return session.accessToken;
  if (!session.refreshToken) return null;
  refrescando ??= refrescar().finally(() => (refrescando = null));
  const s = await refrescando;
  return s?.accessToken ?? null;
}

export function cerrarSesion() {
  const idToken = session?.idToken;
  guardar(null);
  const params = new URLSearchParams({ client_id: CLIENT_ID, post_logout_redirect_uri: redirectUri() });
  if (idToken) params.set('id_token_hint', idToken);
  window.location.assign(`${OIDC}/logout?${params}`);
}

export function obtenerSesion() {
  return session;
}

function suscribir(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSesion() {
  return useSyncExternalStore(suscribir, obtenerSesion);
}
