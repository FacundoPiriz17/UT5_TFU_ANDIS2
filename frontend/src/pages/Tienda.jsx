import { useCallback, useEffect, useState } from 'react';
import { api, mensajeError } from '../lib/api';
import { useSesion } from '../lib/auth';
import { useConfiguration } from '../lib/configuration';
import { Aviso, Boton, Card, RequiereLogin } from '../components/ui';

const PRECIOS = [100, 250, 500];

function TarjetaJuego({ juego, poseido, onComprar, settings }) {
  const [costo, setCosto] = useState(100);
  const [politica, setPolitica] = useState('normal');
  const [cargando, setCargando] = useState(false);
  const discount = settings?.winter_discount_percent ?? 50;
  // Mismo redondeo a par que usa round() en el servicio Python.
  const scaled = costo * (100 - discount);
  const whole = Math.floor(scaled / 100);
  const winter = scaled % 100 === 50 ? whole + whole % 2 : Math.round(scaled / 100);
  const final = politica === 'invierno' ? winter : costo;
  const tono = (juego.id_juego * 47) % 360;

  return (
    <div className="game">
      <div className="game-cover" style={{ background: `linear-gradient(135deg, hsl(${tono} 70% 55%), hsl(${(tono + 50) % 360} 70% 40%))` }}>
        <span>{juego.nombre.split(/\s+/).filter(Boolean).slice(0, 3).map((p) => p[0]).join('').toUpperCase()}</span>
      </div>
      <div className="game-body">
        <h4>{juego.nombre}</h4>
        <div className="row wrap gap-sm">
          {juego.generos.map((g) => <span key={g} className="tag tag-gray">{g}</span>)}
          {juego.generos.length === 0 && <span className="muted small">Sin género</span>}
        </div>
        {poseido ? (
          <div className="owned">✓ En tu biblioteca</div>
        ) : (
          <div className="buy">
            <div className="row gap-sm">
              <select value={costo} onChange={(e) => setCosto(Number(e.target.value))}>
                {PRECIOS.map((p) => <option key={p} value={p}>${p}</option>)}
              </select>
              <select value={politica} onChange={(e) => setPolitica(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="invierno">Invierno −{discount}%</option>
              </select>
            </div>
            <Boton
              disabled={!settings || !settings.purchases_enabled}
              cargando={cargando}
              onClick={async () => {
                setCargando(true);
                await onComprar(juego, costo, politica);
                setCargando(false);
              }}
            >
              {settings?.purchases_enabled ? `Comprar · $${final}` : 'Compras pausadas'}
            </Boton>
          </div>
        )}
      </div>
    </div>
  );
}

function NuevoJuego({ onCreado }) {
  const [nombre, setNombre] = useState('');
  const [generos, setGeneros] = useState('Accion');
  const [res, setRes] = useState(null);
  const [cargando, setCargando] = useState(false);

  const crear = async (e) => {
    e.preventDefault();
    setCargando(true);
    const r = await api('/juegos', {
      method: 'POST',
      body: { nombre, generos: generos.split(',').map((g) => g.trim()).filter(Boolean) },
    });
    setCargando(false);
    setRes(r);
    if (r.ok) {
      setNombre('');
      onCreado();
    }
  };

  return (
    <form className="form" onSubmit={crear}>
      <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={100} placeholder="Ej. Hollow Knight" /></label>
      <label>Géneros (separados por coma)<input value={generos} onChange={(e) => setGeneros(e.target.value)} /></label>
      <Boton cargando={cargando} type="submit">Crear juego</Boton>
      {res && (res.ok
        ? <Aviso tipo="ok">Juego #{res.data.id_juego} creado. El catálogo cacheado fue invalidado.</Aviso>
        : <Aviso tipo="err">{mensajeError(res)}</Aviso>)}
    </form>
  );
}

function Contenido({ settings }) {
  const sesion = useSesion();
  const [catalogo, setCatalogo] = useState([]);
  const [biblioteca, setBiblioteca] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async () => {
    const [c, b] = await Promise.all([api('/juegos'), api('/biblioteca')]);
    if (c.ok) setCatalogo(c.data);
    if (b.ok) setBiblioteca(b.data);
    else setMensaje({ tipo: 'err', texto: `Biblioteca: ${mensajeError(b)}` });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const poseidos = new Set(biblioteca?.juegos.map((j) => j.id_juego));
  const gastado = biblioteca?.juegos.reduce((s, j) => s + (j.costo_compra || 0), 0) || 0;

  const comprar = async (juego, costo_base, politica) => {
    const r = await api('/compras', {
      method: 'POST',
      body: { email_persona: sesion.email, id_juego: juego.id_juego, costo_base, politica },
    });
    setMensaje(r.ok
      ? { tipo: 'ok', texto: `Compraste "${juego.nombre}" por $${r.data.costo_compra} (política ${politica}).` }
      : { tipo: 'err', texto: mensajeError(r) });
    if (r.ok) cargar();
  };

  return (
    <>
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      <div className="grid grid-main">
        <Card titulo="Catálogo" subtitulo={`${catalogo.length} juegos · GET /juegos (cacheado)`} acciones={<Boton variante="ghost" onClick={cargar}>Recargar</Boton>}>
          <div className="games">
            {catalogo.map((j) => (
              <TarjetaJuego key={j.id_juego} juego={j} poseido={poseidos.has(j.id_juego)} onComprar={comprar} settings={settings} />
            ))}
          </div>
        </Card>
        <div className="stack">
          <Card titulo="Mi biblioteca" subtitulo={sesion.email}>
            <div className="row gap">
              <div className="metric"><div className="metric-label">Juegos</div><div className="metric-value">{biblioteca?.total_juegos ?? '—'}</div></div>
              <div className="metric"><div className="metric-label">Gastado</div><div className="metric-value">${gastado}</div></div>
            </div>
            <ul className="lib">
              {biblioteca?.juegos.map((j) => (
                <li key={j.id_juego}>
                  <span>{j.nombre}</span>
                  <span className="muted mono">${j.costo_compra ?? '—'}</span>
                </li>
              ))}
              {biblioteca?.juegos.length === 0 && <li className="muted">Todavía no compraste juegos.</li>}
            </ul>
          </Card>
          {sesion.roles.includes('admin') && (
            <Card titulo="Alta de juego" subtitulo="Solo rol admin · POST /juegos">
              <NuevoJuego onCreado={cargar} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function Tienda() {
  const settings = useConfiguration();
  return (
    <div className="page">
      <header className="pattern-head">
        <span className="tag tag-gray">Aplicación</span>
        <h1>Tienda de juegos</h1>
        <p className="lead">
          Cliente funcional de la API REST. Cada compra aplica la política de precios (patrón Strategy), se guarda en una transacción
          (Compra + Copia) e invalida la biblioteca en Redis.
        </p>
      </header>
      {settings && <Aviso>{settings.store_notice}</Aviso>}
      <RequiereLogin><Contenido settings={settings} /></RequiereLogin>
    </div>
  );
}
