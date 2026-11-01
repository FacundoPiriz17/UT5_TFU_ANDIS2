import { Component, useEffect, useRef, useState } from 'react';
import Layout from './components/Layout';
import { Aviso } from './components/ui';
import { procesarCallback } from './lib/auth';
import Inicio from './pages/Inicio';
import Tienda from './pages/Tienda';
import Health from './pages/Health';
import Throttling from './pages/Throttling';
import CacheAside from './pages/CacheAside';
import Cqrs from './pages/Cqrs';
import FederatedIdentity from './pages/FederatedIdentity';
import GatewayOffloading from './pages/GatewayOffloading';
import Despliegue from './pages/Despliegue';
import Configuracion from './pages/Configuracion';
import Antiguas from './pages/Antiguas';

const PAGINAS = {
  inicio: Inicio,
  tienda: Tienda,
  health: Health,
  throttling: Throttling,
  cache: CacheAside,
  cqrs: Cqrs,
  identity: FederatedIdentity,
  offloading: GatewayOffloading,
  deploy: Despliegue,
  configuration: Configuracion,
  'ut2-tacticas': () => <Antiguas demo="ut2-tacticas" />,
  'ut2-rollback': () => <Antiguas demo="ut2-rollback" />,
  'ut3-componentes': () => <Antiguas demo="ut3-componentes" />,
  'ut3-balanceo': () => <Antiguas demo="ut3-balanceo" />,
  'ut3-stateless': () => <Antiguas demo="ut3-stateless" />,
  'ut3-acid': () => <Antiguas demo="ut3-acid" />,
};

// Un error en una demo no debe dejar en blanco toda la consola.
class LimiteError extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <Aviso tipo="err">Esta página falló al renderizar: {String(this.state.error.message)}</Aviso>;
    }
    return this.props.children;
  }
}

function rutaActual() {
  const r = window.location.hash.replace(/^#\/?/, '');
  return PAGINAS[r] ? r : 'inicio';
}

export default function App() {
  const [ruta, setRuta] = useState(rutaActual);
  const [errorLogin, setErrorLogin] = useState(null);
  const callbackProcesado = useRef(false);

  useEffect(() => {
    const onHash = () => {
      setRuta(rutaActual());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    // StrictMode ejecuta los efectos dos veces en desarrollo; el code OIDC es de un solo uso.
    if (callbackProcesado.current) return;
    callbackProcesado.current = true;
    procesarCallback()
      .then((s) => s && setRuta(rutaActual()))
      .catch((e) => setErrorLogin(e.message));
  }, []);

  const Pagina = PAGINAS[ruta];
  return (
    <Layout ruta={ruta}>
      {errorLogin && (
        <Aviso tipo="err">
          No se pudo completar el login federado: {errorLogin}.{' '}
          <button className="link" onClick={() => setErrorLogin(null)}>Cerrar</button>
        </Aviso>
      )}
      <LimiteError key={ruta}>
        <Pagina />
      </LimiteError>
    </Layout>
  );
}
