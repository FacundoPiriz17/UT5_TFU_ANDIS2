# ANDIS II - UT5: Service-Based Architecture

Tienda React con dos servicios FastAPI independientes: **Catálogo** y **Compras y
Biblioteca (Comercial)**. Conserva MySQL compartido, Redis, Keycloak y Nginx.
La separación es por responsabilidades del negocio. Cada servicio tiene modelos,
entrypoint, Dockerfile, contexto filtrado de build e imagen propios.

## Iniciar

Requiere Docker Desktop con contenedores Linux y Docker Compose.

```powershell
Copy-Item .env.example .env  # solamente si no existe .env
docker compose up -d --build
```

También: `python scripts/manage.py start`, `./scripts/start.ps1` o
`bash scripts/start.sh`. `run.ps1` y `run.sh` utilizan el mismo runner UT5.
Los lanzadores requieren Python 3.10+ en el host. Docker Compose puede usarse
directamente sin instalar dependencias Python en el host.

| Acceso | URL predeterminada |
|---|---|
| Tienda y consola | http://localhost:3255 |
| Gateway / API | http://localhost:8055 |
| Swagger Comercial | http://localhost:8057/docs |
| Swagger Catálogo | http://localhost:8056/docs |
| WSDL publicado | http://localhost:8055/soap/catalogo?wsdl |
| XSD publicado | http://localhost:8055/soap/catalogo-v1.xsd |
| Keycloak | http://localhost:8155 |

El proyecto Compose se llama `ut5_service_based` y utiliza volúmenes separados de UT4.
Los accesos se publican solamente en loopback. Dentro de Docker los servicios
usan `catalogo:8000`, `comercial:8000`, `db:3306`, `redis:6379` y `keycloak:8080`.

| Cuenta de laboratorio | Contraseña | Rol |
|---|---|---|
| demo@adaii.local | Demo123! | user |
| segundo@adaii.local | Demo123! | user |
| admin@adaii.local | AdminDemo123! | admin |

Si se cambian los puertos de frontend o Swagger, registrar los nuevos orígenes y
redirect URIs en Keycloak. El importador no sobrescribe un realm ya existente.
Actualizar sus clientes conservando el volumen. Los puertos predeterminados del
frontend y Swagger ya están incluidos en el JSON de importación.

## Responsabilidades y recorrido de compra

| Servicio | Datos administrados | API |
|---|---|---|
| Catálogo | Juego, Genero, JuegoTieneGenero | REST para catálogo/administración y SOAP para detalle y lote |
| Comercial | Persona, Login histórico, Compra, Copia | REST para perfiles, compras, biblioteca y consola |

1. Iniciar sesión y abrir Tienda.
2. Consultar el catálogo y elegir juego, costo base y política normal/invierno.
3. Comercial autoriza Persona y cierra su transacción implícita de lectura.
4. Invoca **ObtenerJuego** por HTTP/SOAP con el Bearer del usuario y correlación.
5. Calcula el costo y abre una transacción local que confirma **Compra y Copia**.
6. Invalida sus claves después del commit. El frontend actualiza Biblioteca.

La unicidad y las FK de MySQL resuelven carreras de adquisición y eliminación:
una duplicación o cambio concurrente del juego produce 409 con rollback.
Una caída de Catálogo produce 503 sin escribir ninguna de las dos entidades.
Se conservan recálculo, eliminación, resumen de compras y administración de perfiles.

MySQL compartido implica coordinación del esquema, integridad referencial y un
punto compartido de fallo. La evolución independiente requiere cambios compatibles.
El servicio comercial sólo declara el identificador de Juego como metadato de su
FK. No tiene un ORM de Juego ni lo consulta como sustituto del contrato remoto.
Esta implementación mantiene el estilo Service-Based con almacenamiento compartido.

## SOAP y compatibilidad

Contrato versionado: `contracts/catalogo-v1.wsdl` y `catalogo-v1.xsd`.
SOAP 1.1 document/literal, namespace `urn:andis:catalogo:v1`:

- **ObtenerJuego(id_juego)** devuelve identificador, nombre y géneros.
- **ObtenerJuegos(id_juego[])** obtiene metadatos por lotes de hasta 200 IDs.
- Faults con detalle `ErrorCatalogo/codigo`: `JuegoNoEncontrado`,
  `SolicitudInvalida`, `NoAutorizado` y `FalloTecnico`.

`JuegoNoEncontrado` viaja como SOAP Fault HTTP 500 y se traduce a REST 404.
Ese resultado no genera Retry ni incrementa los fallos del Circuit Breaker.
El receptor rechaza DTD, entidades externas, XML inválido y mensajes de más de
64 KiB. Zeep también prohíbe DTD, entidades y referencias externas en respuestas.

Catálogo ya no implementa `GET /juegos/{id}` por REST. El gateway conserva esa
ruta mediante una **adaptación en Comercial que invoca SOAP**. El listado y las
mutaciones de juegos siguen en Catálogo. No hay una segunda implementación del detalle.
El WSDL publicado coincide con el local, salvo la dirección configurable del endpoint.

Comercial carga WSDL/XSD locales una sola vez al iniciar y mantiene un cliente
Zeep por proceso. Puede iniciar aunque Catálogo esté detenido. La URL interna se
configura con `CATALOGO_SOAP_URL`. La URL publicada se configura con
`CATALOGO_PUBLIC_SOAP_URL` en Compose.

## Circuit Breaker, Retry y tiempos máximos

Valores predeterminados de `.env.example`:

| Política | Valor |
|---|---|
| Conexión / lectura | 0.35 s / 0.7 s |
| Presupuesto total por interacción SOAP | 3 s |
| Intentos máximos, incluyendo el inicial | 3 |
| Espera progresiva | 0.1 s, 0.2 s |
| Umbral de fallos técnicos consecutivos | 3 intentos físicos |
| Recuperación / sondas simultáneas | 5 s / 1 |

El presupuesto incluye esperas, conexión y lectura completa. El circuito corta
los intentos restantes al abrirse. La sonda semiabierta ejecuta la operación real
y reutiliza su resultado. Errores de negocio/permisos no se reintentan.
Ni el frontend ni Nginx reintentan automáticamente `POST /compras`.

El estado y los contadores pertenecen a **cada proceso**. Compose usa un worker
por servicio. Con más workers o réplicas hay circuitos independientes.
Los locks sólo protegen el estado. Nunca abarcan una llamada de red.

Desde la consola, abrir Circuit Breaker y Retry como admin:

```powershell
docker compose stop catalogo
# Consultar un juego hasta alcanzar el umbral. Repetir y observar el contador.
docker compose start catalogo
# Esperar el período de recuperación y consultar nuevamente.
```

`GET /resilience` requiere admin y expone política, contadores y transiciones.
Las consultas de compras registradas siguen disponibles sin Catálogo. Comprar y
componer bibliotecas con adquisiciones requieren sus metadatos remotos.

## Caché, salud y observabilidad

Cache-Aside con namespaces `catalogo:v1:*` y `comercial:v1:*`.
Catálogo invalida solamente sus claves. Comercial cachea compras y adquisiciones.
Biblioteca compone estas últimas con metadatos actuales por lote. Su respuesta
usa `Cache-Control: no-store`. Redis caído degrada las lecturas hacia MySQL.
No se utiliza `FLUSHALL` como invalidación. Redis tiene un timeout de 0.1 s y
no agrega reintentos propios que consuman el presupuesto SOAP.
La resolución DNS se actualiza en segundo plano con un único trabajo pendiente.
Su espera inicial se limita a 0.05 s. Las escrituras de caché permanecen síncronas.

`/health/live` verifica el proceso. `/health/ready` verifica MySQL e informa
degradación de caché/circuito sin detener Comercial por Catálogo caído.
`/system/status` consulta el estado de los dos servicios. No se confunden estos
servicios diferentes con réplicas del backend completo.
Los logs JSON incluyen servicio, operación, correlación, duración, intento y
transición del circuito. No incluyen tokens ni credenciales.

Se conservan CQRS local, Strategy de costos, auditoría, configuración externa
validada y funciones del gateway (gzip, estáticos, throttling y enrutamiento).

## Demostraciones UT5

El menú principal reúne Circuit Breaker y Retry, Despliegue independiente,
Health, Cache-Aside y CQRS. Las tres últimas se reutilizan para observar las
fronteras de la arquitectura distribuida.

| Demo | Qué permite observar | Compromiso |
|---|---|---|
| Despliegue independiente | Reemplazar Catálogo conservando Comercial | Contratos y esquema compartido deben ser compatibles |
| Circuit Breaker y Retry | Compras registradas responde mientras falla el detalle SOAP | Comprar y componer Biblioteca requieren Catálogo |
| Dependencia lenta | Tiempo de espera, intentos físicos y apertura del circuito | La red y el procesamiento XML agregan costo y posibles fallos |
| Health | Estado separado de los procesos y dependencias | MySQL sigue siendo una dependencia común |
| Cache-Aside y CQRS | Cachés por responsabilidad y consultas comerciales locales | Componer metadatos requiere comunicación entre servicios |

### Recorrido de compra

1. Iniciar sesión como usuario demo y comprar un juego no adquirido.
2. Comprobar que aparece en Biblioteca con el costo de la política elegida.
3. Abrir CQRS para consultar las compras y probar el rechazo 409 de una adquisición duplicada.

### Fallo parcial y recuperación

Iniciar sesión como administrador y abrir Circuit Breaker y Retry. En el panel
de comparación, iniciar el monitoreo de las dos lecturas y ejecutar:

~~~powershell
docker compose stop catalogo
~~~

La consulta de compras debe continuar con 200. El detalle remoto devuelve 503,
consume intentos acotados y abre el circuito. Mientras esté abierto, las
solicitudes se rechazan sin nuevas llamadas físicas. Después ejecutar:

~~~powershell
docker compose start catalogo
~~~

Cuando Catálogo esté disponible y haya transcurrido el período de recuperación,
una consulta real cierra el circuito. El monitor sólo realiza lecturas.
Para observar el caso de compra durante la caída, usar Tienda o CQRS con un juego
no adquirido: el rechazo 503 no registra Compra ni Copia.

Los tiempos del panel incluyen gateway, identidad, caché y procesamiento.
Son operaciones distintas y sirven para observar este escenario. Una comparación
de rendimiento entre UT4 y UT5 requiere condiciones equivalentes y repeticiones.

### Dependencia lenta

El archivo docker-compose.demo.yaml es un override opcional. En el arranque
normal la inyección de fallos está deshabilitada. Para demostrar la falacia
de que la latencia es cero:

~~~powershell
docker compose -f docker-compose.yaml -f docker-compose.demo.yaml up -d --no-deps catalogo
Set-Content -Path config/demo-faults.json -Value '{"delay_seconds":2}'
~~~

Tomar muestras desde Circuit Breaker y Retry. La demora supera el tiempo de
lectura y permite observar los reintentos, el presupuesto total y la apertura.
El archivo sólo afecta al endpoint SOAP del entorno de demostración.
Al finalizar, restablecer el arranque normal:

~~~powershell
Set-Content -Path config/demo-faults.json -Value '{}'
docker compose up -d --no-deps catalogo
~~~

### Despliegue independiente

Con el monitor de la pantalla Despliegue independiente activo:

~~~powershell
docker compose ps -q comercial
python scripts/manage.py deploy v2 --service catalogo
docker compose ps -q comercial
~~~

Comercial debe conservar su contenedor y su imagen. La consola muestra la
nueva versión de Catálogo. El comando asigna una versión a la imagen construida.
Para evaluar una modificación funcional, introducir primero un cambio compatible
en Catálogo y desplegarlo con este procedimiento.

La ventaja demostrada es reducir el alcance de la publicación. UT4 ya utilizaba
Blue/Green. La separación por sí sola no garantiza despliegues más rápidos ni
mayor disponibilidad de las operaciones que atraviesan ambos servicios.

### Estado y logs

~~~powershell
docker compose config --quiet
docker compose ps
docker compose logs --tail 50 catalogo comercial
~~~

También se puede consultar el estado agregado con python scripts/manage.py status.

## Demos antiguas

La sección Demos antiguas conserva los ejemplos de TFU2, TFU3 y TFU4.
Los patrones transversales que siguen disponibles utilizan la API actual.
Las demos de réplicas, rollback, ACID del backend original y Blue/Green se abren
en la versión UT4, porque dependen de su topología y sus controles.

El commit de referencia está registrado en scripts/ut4-baseline.json. Para
preparar una copia separada, ejecutar desde la raíz de este repositorio:

~~~powershell
git worktree add --detach ../UT4_demos c51213f46f6a4eb2e0eab08c686297eebaf84531
cd ../UT4_demos
Copy-Item .env.example .env
docker compose -p ut4_demos up -d --build
~~~

El entorno original usa frontend 3200, API 8000 y Keycloak 8081, con volúmenes
del proyecto ut4_demos. Si esos puertos ya tienen UT4 ejecutándose, se puede
abrir directamente ese entorno. Ejecutar los scripts históricos desde la copia
UT4. El runner UT5 informa qué entorno requieren.
