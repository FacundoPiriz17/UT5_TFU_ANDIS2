import { useEffect, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { CLIENT_ID, KEYCLOAK_URL, REALM, decodificarJwt, iniciarLogin, tokenVigente, useSesion } from '../lib/auth';
import { Boton, Card, ComoFunciona, EncabezadoPatron, Json, StatusHttp } from '../components/ui';

function Cuenta({ hasta }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((hasta - ahora) / 1000));
  return <span className={s < 15 ? 'text-warn' : ''}>{s} s</span>;
}

// Suplanta a otra persona, se otorga admin y extiende la expiración conservando
// la firma original: la firma RS256 deja de coincidir con el payload.
function manipular(token, emailAjeno) {
  const [h, , s] = token.split('.');
  const { payload } = decodificarJwt(token);
  const alterado = {
    ...payload,
    email: emailAjeno,
    realm_access: { roles: ['admin', 'user'] },
    exp: payload.exp + 3600,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(alterado));
  const nuevo = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${h}.${nuevo}.${s}`;
}

export default function FederatedIdentity() {
  const sesion = useSesion();
  const [token, setToken] = useState(null);
  const [me, setMe] = useState(null);
  const [pruebas, setPruebas] = useState({});
  const [corriendo, setCorriendo] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    tokenVigente().then(setToken);
    api('/auth/me').then(setMe);
  }, [sesion]);

  const jwt = token ? decodificarJwt(token) : null;
  const esAdmin = sesion?.roles.includes('admin');
  const otro = sesion?.email === 'demo@adaii.local' ? 'segundo@adaii.local' : 'demo@adaii.local';

  const CASOS = [
    { id: 'sin', desc: 'Petición sin token', esperado: 401, run: () => api('/juegos', { auth: false }) },
    { id: 'manip', desc: 'Token manipulado (otro email, rol admin, +1 h de vida)', esperado: 401, requiere: true, run: async () => api('/auth/me', { auth: manipular(await tokenVigente(), otro) }) },
    { id: 'basura', desc: 'Token no emitido por Keycloak', esperado: 401, run: () => api('/juegos', { auth: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.firma' }) },
    { id: 'legacy', desc: 'Login local retirado (POST /auth/login)', esperado: 410, run: () => api('/auth/login', { method: 'POST', auth: false }) },
    { id: 'valido', desc: 'Token válido de Keycloak (GET /auth/me)', esperado: 200, requiere: true, run: () => api('/auth/me') },
    { id: 'otro', desc: `Ver compras de otra persona (${otro})`, esperado: esAdmin ? 200 : 403, requiere: true, run: () => api(`/compras/${otro}`) },
    { id: 'admin', desc: 'Endpoint de admin (GET /personas)', esperado: esAdmin ? 200 : 403, requiere: true, run: () => api('/personas') },
  ];

  const correr = async () => {
    setCorriendo(true);
    setPruebas({});
    for (const c of CASOS) {
      if (c.requiere && !sesion) continue;
      const r = await c.run();
      setPruebas((p) => ({ ...p, [c.id]: r }));
    }
    setCorriendo(false);
  };

  return (
    <div className="page">
      <EncabezadoPatron id="identity" atributo="Seguridad">
        La autenticación se delega en un proveedor de identidad (Keycloak). La API nunca maneja contraseñas: solo valida que el access
        token esté firmado por el IdP (RS256, clave pública obtenida por JWKS), que el <i>issuer</i> y la <i>audience</i> sean los
        esperados, y luego autoriza localmente por roles.
      </EncabezadoPatron>

      <div className="grid grid-2">
        <Card titulo="Sesión federada" subtitulo={`Realm ${REALM} · cliente ${CLIENT_ID}`}>
          {sesion ? (
            <div className="stack-sm">
              <div className="kv"><span>Usuario</span><b>{sesion.email}</b></div>
              <div className="kv"><span>Roles</span><span>{sesion.roles.map((r) => <span key={r} className={`role role-${r}`}>{r}</span>)}</span></div>
              <div className="kv"><span>Access token vence en</span><b><Cuenta hasta={sesion.expiresAt} /></b></div>
              <div className="kv"><span>Renovación</span><span className="muted small">automática con refresh token</span></div>
              <div className="kv"><span>/auth/me (API)</span>{me && <StatusHttp status={me.status} />}</div>
              <div className="row gap-sm">
                <Boton variante="ghost" onClick={() => iniciarLogin(esAdmin ? 'demo@adaii.local' : 'admin@adaii.local')}>
                  Cambiar a {esAdmin ? 'usuario demo' : 'admin'}
                </Boton>
              </div>
            </div>
          ) : (
            <div className="stack-sm">
              <p className="muted">Al iniciar sesión se redirige a Keycloak (Authorization Code + PKCE). Credenciales de prueba:</p>
              <table className="table">
                <tbody>
                  <tr><td className="mono">demo@adaii.local</td><td className="mono">Demo123!</td><td><span className="role role-user">user</span></td></tr>
                  <tr><td className="mono">segundo@adaii.local</td><td className="mono">Demo123!</td><td><span className="role role-user">user</span></td></tr>
                  <tr><td className="mono">admin@adaii.local</td><td className="mono">AdminDemo123!</td><td><span className="role role-admin">admin</span></td></tr>
                </tbody>
              </table>
              <div className="row gap-sm">
                <Boton onClick={() => iniciarLogin('demo@adaii.local')}>Entrar como demo</Boton>
                <Boton variante="ghost" onClick={() => iniciarLogin('admin@adaii.local')}>Entrar como admin</Boton>
              </div>
            </div>
          )}
        </Card>

        <Card titulo="Flujo" subtitulo="Quién hace qué">
          <div className="flow">
            <div className="flow-step"><b>1. Navegador</b><span>genera code_verifier y redirige a Keycloak</span></div>
            <div className="flow-step"><b>2. Keycloak</b><span>autentica y devuelve un code de un solo uso</span></div>
            <div className="flow-step"><b>3. Navegador</b><span>canjea code + verifier por el access token (60 s)</span></div>
            <div className="flow-step"><b>4. API</b><span>verifica firma vía JWKS, iss, aud, exp, email_verified y roles</span></div>
          </div>
          <p className="muted small">IdP: <span className="mono">{KEYCLOAK_URL}</span></p>
        </Card>
      </div>

      <Card
        titulo="Pruebas de seguridad"
        subtitulo="Cada caso compara el status obtenido con el esperado"
        acciones={<Boton cargando={corriendo} onClick={correr}>Ejecutar pruebas</Boton>}
      >
        <table className="table">
          <thead><tr><th>Caso</th><th>Esperado</th><th>Obtenido</th><th>Detalle</th><th /></tr></thead>
          <tbody>
            {CASOS.map((c) => {
              const r = pruebas[c.id];
              const bien = r && r.status === c.esperado;
              return (
                <tr key={c.id}>
                  <td>{c.desc}{c.requiere && !sesion && <span className="muted small"> (requiere sesión)</span>}</td>
                  <td><StatusHttp status={c.esperado} /></td>
                  <td>{r ? <StatusHttp status={r.status} /> : <span className="muted">—</span>}</td>
                  <td className="muted small">{r ? (r.ok ? 'OK' : mensajeError(r)) : ''}</td>
                  <td>{r && <span className={bien ? 'text-ok' : 'text-err'}>{bien ? '✓' : '✗'}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {jwt && (
        <div className="grid grid-2">
          <Card titulo="Claims del access token" subtitulo="Decodificado en el navegador (no se verifica aquí)">
            <Json data={{
              iss: jwt.payload.iss, aud: jwt.payload.aud, sub: jwt.payload.sub, email: jwt.payload.email,
              email_verified: jwt.payload.email_verified, realm_access: jwt.payload.realm_access,
              azp: jwt.payload.azp, typ: jwt.payload.typ,
              iat: new Date(jwt.payload.iat * 1000).toLocaleTimeString(), exp: new Date(jwt.payload.exp * 1000).toLocaleTimeString(),
            }} />
          </Card>
          <Card titulo="Header JWT">
            <Json data={jwt.header} alto={140} />
            <p className="muted small">La API exige <code>alg: RS256</code> y un <code>kid</code> presente en el JWKS de Keycloak; cualquier otro algoritmo (por ejemplo HS256 o none) se rechaza.</p>
          </Card>
        </div>
      )}

      <Card titulo="Cómo logra la seguridad">
        <ComoFunciona items={[
          'Se elimina el almacenamiento y verificación de contraseñas en la API: menos superficie de ataque y un único lugar para políticas de credenciales.',
          'Tokens de vida corta (60 s) con firma asimétrica: la API solo necesita la clave pública y no puede emitir tokens.',
          <>La identidad sale del token, nunca del body o la URL: <code>autorizar_persona</code> impide acceder a datos ajenos sin rol admin.</>,
          'Prueba empírica: la tabla anterior demuestra que tokens ausentes, ajenos o alterados son rechazados (401) y que la autorización por rol devuelve 403.',
        ]} />
      </Card>
    </div>
  );
}
