import { useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useSesion } from '../lib/auth';
import { Aviso, Boton, Card, EncabezadoPatron, Json, RequiereLogin } from '../components/ui';

function Demo() {
  const session = useSesion();
  const [r, setResult] = useState(null);
  const [target, setTarget] = useState('/juegos');
  return <Card titulo="Lecturas reales"><select value={target} onChange={e => setTarget(e.target.value)}><option value="/juegos">Catálogo: catalogo:v1:juegos</option><option value={`/compras/${encodeURIComponent(session.email)}`}>Compras: comercial:v1:compras</option><option value="/biblioteca">Biblioteca: composición actual</option></select>{' '}<Boton onClick={async () => setResult(await api(target))}>Consultar</Boton>
    {r && <><Aviso tipo={r.ok ? 'ok' : 'err'}>{r.ok ? `${r.cache ?? 'Sin caché'} · ${r.ms} ms · ${r.instancia}` : mensajeError(r)}</Aviso><Json data={r.data} /></>}
    <p>Catálogo y Comercial invalidan sus propias claves después del commit. Biblioteca cachea las adquisiciones y consulta los nombres y géneros por lote; la respuesta combinada usa Cache-Control: no-store.</p>
    <p>Al editar un juego desde la API de Catálogo y volver a consultar Biblioteca, sus metadatos se actualizan sin invalidar claves comerciales.</p>
  </Card>;
}
export default function CacheAside() { return <div className="page"><EncabezadoPatron id="cache" atributo="Rendimiento" /><RequiereLogin><Demo /></RequiereLogin></div>; }
