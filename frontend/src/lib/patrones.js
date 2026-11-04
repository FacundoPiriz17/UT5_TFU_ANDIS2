// Catálogo de patrones de UT5 implementados en el proyecto.
export const GRUPOS = {
  disponibilidad: { nombre: 'Disponibilidad', color: 'green' },
  rendimiento: { nombre: 'Rendimiento', color: 'blue' },
  seguridad: { nombre: 'Seguridad', color: 'violet' },
  despliegue: { nombre: 'Facilidad de despliegue', color: 'amber' },
  modificabilidad: { nombre: 'Facilidad de modificación', color: 'blue' },
};

export const PATRONES = [
  { id: 'resilience', nombre: 'Circuit Breaker y Retry', grupo: 'disponibilidad', resumen: 'La consulta SOAP tiene tiempos máximos, reintentos acotados y un circuito persistente por proceso.', archivos: ['services/comercial/catalog_client.py', 'services/comercial/resilience.py', 'contracts/catalogo-v1.wsdl'] },
  {
    id: 'health',
    nombre: 'Health Endpoint Monitoring',
    grupo: 'disponibilidad',
    resumen: 'Endpoints /health, /health/live y /health/ready exponen el estado de cada servicio y sus dependencias.',
    archivos: ['app/service_health.py', 'docker-compose.yaml (healthcheck)'],
  },
  {
    id: 'throttling',
    nombre: 'Throttling',
    grupo: 'disponibilidad',
    resumen: 'El gateway limita a 10 req/s por IP (burst 20) y rechaza el exceso con 429 para proteger a las APIs.',
    archivos: ['nginx/default.conf'],
  },
  {
    id: 'cache',
    nombre: 'Cache-Aside',
    grupo: 'rendimiento',
    resumen: 'Las lecturas consultan Redis primero; ante un MISS cargan de MySQL y guardan con TTL. Las escrituras invalidan.',
    archivos: ['app/cache.py', 'services/catalogo/routers.py', 'services/comercial/biblioteca.py'],
  },
  {
    id: 'cqrs',
    nombre: 'CQRS',
    grupo: 'rendimiento',
    resumen: 'Compras separa comandos (transacción + Strategy + invalidación) de consultas (proyecciones SQL a DTO).',
    archivos: ['services/comercial/compras_commands.py', 'services/comercial/compras_queries.py'],
  },
  {
    id: 'identity',
    nombre: 'Federated Identity',
    grupo: 'seguridad',
    resumen: 'Keycloak autentica (OIDC + PKCE). La API solo valida tokens RS256 vía JWKS y autoriza por roles.',
    archivos: ['security/oidc.py', 'security/dependencies.py', 'security/keycloak/realm-ut4.json'],
  },
  {
    id: 'offloading',
    nombre: 'Gateway Offloading',
    grupo: 'seguridad',
    resumen: 'Nginx asume compresión, estáticos, límite de tasa y enrutamiento por servicio, quitando esas tareas transversales a FastAPI.',
    archivos: ['nginx/default.conf', 'nginx/static/'],
  },
  {
    id: 'deploy',
    nombre: 'Despliegue independiente',
    grupo: 'despliegue',
    resumen: 'Catálogo y Comercial tienen imágenes y despliegues propios. Un cambio compatible de Catálogo conserva la unidad comercial.',
    archivos: ['docker-compose.yaml', 'services/catalogo/Dockerfile', 'services/comercial/Dockerfile'],
  },
  {
    id: 'configuration',
    nombre: 'External Configuration Store',
    grupo: 'modificabilidad',
    resumen: 'Un JSON compartido cambia descuentos, compras y TTL en ambos servicios sin recompilar ni reiniciar.',
    archivos: ['config/settings.json', 'app/configuration.py', 'app/routers/configuration.py'],
  },
];

export const patron = (id) => PATRONES.find((p) => p.id === id);

// Health, Cache-Aside y CQRS se reutilizan para observar las fronteras de UT5.
const IDS_UT5 = new Set(['resilience', 'deploy', 'health', 'cache', 'cqrs']);
export const PATRONES_UT5 = PATRONES.filter((p) => IDS_UT5.has(p.id));
export const DEMOS_ANTIGUAS = [
  { unidad: 'TFU4 · Patrones', items: [
    ...PATRONES.filter((p) => !IDS_UT5.has(p.id)).map((p) => [p.id, p.nombre]),
    ['ut4-blue-green', 'Blue/Green del monolito'],
  ] },
  { unidad: 'TFU3 · Soluciones', items: [
    ['ut3-componentes', 'Componentes y contenedores'],
    ['ut3-balanceo', 'Escalabilidad horizontal'],
    ['ut3-stateless', 'Servicios sin estado'],
    ['ut3-acid', 'Transacciones ACID'],
  ] },
  { unidad: 'TFU2 · Tácticas', items: [
    ['ut2-tacticas', 'Strategy y auditoría'],
    ['ut2-rollback', 'Rollback'],
  ] },
];
