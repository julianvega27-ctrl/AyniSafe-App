# Design

## Context

La motivación y el alcance están en `proposal.md`; el comportamiento, en las specs del cambio. Base destino: `039e9f4` (`main`, PR #4 fusionado, CI aprobado). Rama `feat/p4-registro`.

Estado observado:
- **Reportes:** solo tiene el catálogo `categorias` (16 filas, IDs estables) y la fachada `crearModuloReportes`.
- **Operaciones:** el módulo no existe.
- **Consultas:** exporta `ConsultarTerritorio.resolver(punto)`. Devuelve `resuelto` o `pendiente` (frontera/solapamiento/fuera_area) con la versión, o lanza `TERRITORY_UNAVAILABLE` si no hay cartografía activa. Es una función pura sobre un snapshot leído de la BD.
- **Identidad:**
  - Ofrece `autenticarCiudadano` (Bearer) y el limitador persistente `ventanas_intentos`. Ese limitador solo consume intentos, con HMAC del identificador y una unión cerrada `TipoLimite`.
  - El contexto transaccional es opaco (`ContextoTransaccional = unknown`), con el patrón de P3.2.
  - `entorno.secretoLimitador` existe.
- **Verificador de arquitectura:** los módulos solo se importan por su `index.ts`. Dominio y aplicación no pueden alcanzar Express, Prisma, `pg` ni `node:fs`/`http`, ni siquiera de forma transitiva.
- **Flutter:** capas `datos/aplicacion/presentacion` con controladores propios, `cliente_http.dart` con Bearer y `flutter_secure_storage`. No tiene ubicación ni mapas. Reportar y Mis reportes usan `DestinoPendiente`.
- **Origen `efc1bce8`:**
  - API: `incidents/report.js` (validación, hash de contenido, tabla `client_requests`, transacción MySQL con avisos dentro) y `router.js`. El router fija el alcance de idempotencia del invitado por el hash de la IP.
  - Móvil: `screens/report.dart`, con `geolocator`, `flutter_map` y teselas `OSM_TILE_URL`.

## Goals / Non-Goals

**Goals:**
- Fijar a qué módulo pertenece cada dato del incidente único y cómo se crea en una transacción, sin escrituras en tablas ajenas.
- Que el evento y sus entregas sean el único punto de extensión que P4.2 necesita para enrutar.
- Probar con PostgreSQL real la atomicidad, la idempotencia concurrente y la recuperación tras reinicio.

**Non-Goals:**
- Cola persistente de reportes entre reinicios de la app. EQ-08 exige conservar los datos durante el flujo, no entre reinicios.
- Caché de seguimiento.
- Ningún consumidor de negocio, envío push ni aviso de panel.
- Prueba de carga de 2.000 VU (P9). Aquí solo se toman latencias en serie.

## Decisions

### 1. Propiedad de datos

| Dato | Dueño | Tabla |
|---|---|---|
| Identidad del incidente, referencia pública, estado, instante de registro | Operaciones (módulo nuevo) | `incidentes` |
| Originales: modalidad, autor o teléfono del invitado, categoría, descripción, ocurrencia, punto, resultado territorial, respuestas para SAMU, huella del código | Reportes | `envios_incidente` (PK = FK `incidente_id`) |
| Claves de idempotencia | Reportes | `solicitudes_envio` |
| Eventos y entregas | Plataforma (`src/compartido/eventos`) | `eventos`, `entregas_evento` |
| Ventanas de límite | Identidad (existente) | `ventanas_intentos` (tres tipos nuevos) |
| Seguimiento ciudadano | Consultas | Sin tablas: compone vía fachadas |

Operaciones no guarda ni la modalidad ni el autor: son originales del envío, según el documento 09 §6. Reportes no guarda el estado. La referencia pública es de Operaciones, porque identifica el caso y no el envío. Así P4.2 y P6 cambian el estado sin tocar Reportes, y la vinculación de duplicados conserva cada envío.

Alternativas descartadas:
- Una tabla única en Reportes con el estado: duplicaría el dueño del ciclo operativo, en contra del documento 09 §9.
- Que Operaciones guarde todo: rompe la asignación de originales a Reportes.

Las FK entre módulos (`envios_incidente.incidente_id`, `categoria_id`, `distrito_id`, `autor_usuario_id`) siguen el precedente de P3.2: hay integridad en la BD, y el código cruza módulos solo por fachadas.

### 2. Esquema y restricciones

- **`incidentes`:**
  - `id uuid`, `referencia text UNIQUE` y `registrado_en timestamptz` (por defecto, la hora del servidor).
  - `estado text CHECK IN ('REGISTRADO','EN_REVISION','EN_ATENCION','CERRADO')`, por defecto `REGISTRADO`.
  - En P4.1 no hay columnas de resultado de cierre: P6 las añade en una migración aditiva.
- **`envios_incidente`:**
  - `modalidad CHECK IN ('invitado','cuenta')`.
  - CHECK de coherencia: con cuenta, autor obligatorio y teléfono nulo; como invitado, autor nulo, teléfono obligatorio y huella obligatoria.
  - `categoria_id` FK; `descripcion text` (CHECK de longitud 5–1000 tras recortar espacios).
  - `ocurrencia_modo CHECK IN ('ahora','antes')` y `ocurrido_en`.
  - Punto: `latitud` y `longitud double precision` con CHECK de rango, `origen_punto CHECK IN ('gps','manual')` y `precision_m` nullable con CHECK ≥ 0.
  - Territorio: `distrito_id` FK nullable, `estado_territorial CHECK IN ('resuelto','pendiente')`, `motivo_territorial CHECK IN ('frontera','solapamiento','fuera_area','sin_cartografia')`, `version_territorial text` nullable y un CHECK de coherencia (resuelto ⇔ distrito presente y motivo nulo).
  - SAMU: `heridos` y `atencion_medica`, ambas `CHECK IN ('si','no','no_se')` y nullable (nulo = sin respuesta).
  - Código: `codigo_huella` y `codigo_emitido_en`.
  - Índice `(autor_usuario_id, recibido_en DESC, incidente_id DESC)` para el historial.
- **`solicitudes_envio`:**
  - PK `(ambito, clave)`, con `huella_contenido char(64)`, `incidente_id` FK UNIQUE y `creado_en`.
  - `ambito` vale `cuenta:<uuid>` o `invitado`.
- **`eventos`:**
  - `id uuid`, `tipo`, `version smallint`, `agregado_id uuid`, `carga jsonb` y `ocurrido_en`.
  - Índice `(tipo, ocurrido_en)`.
- **`entregas_evento`:**
  - PK `(evento_id, consumidor)`.
  - `estado CHECK IN ('pendiente','en_proceso','procesada','fallida')`, `intentos`, `proximo_intento_en`, `bloqueado_hasta`, `ultimo_error` (código resumido de hasta 200 caracteres, sin datos) y `procesada_en`.
  - Índice parcial `(proximo_intento_en) WHERE estado IN ('pendiente','en_proceso')`.

La migración es aditiva. Ninguna FK tiene cascada.

### 3. Transacción del registro

Caso de uso `RegistrarIncidente` (Reportes, capa de aplicación), en este orden:

1. **Validar** el cuerpo con el dominio de Reportes (validación estricta y campos por categoría y modalidad) y la cabecera `Idempotency-Key` (UUID). Calcular `huella_contenido = HMAC-SHA256(secreto, JSON canónico de {modalidad, entrada normalizada})`. Se usa HMAC para que la huella de un contenido que incluye el teléfono no pueda probarse por fuerza bruta.
2. **Buscar un envío previo** por `(ambito, clave)`:
   - Si existe con la misma huella, se trata como repetición (paso 6).
   - Si existe con otra huella, responder 409 `IDEMPOTENCY_CONFLICT`.
   Esta búsqueda va antes del límite de invitado, para que una repetición no quede bloqueada.
3. **Límite de invitado:** se consume el tipo `incidente_invitado_ip` con un máximo de 10 por hora.
4. **Resolver el territorio** con el puerto `ResolverTerritorioPort`, implementado en `main.ts` con la fachada de Consultas:
   - `TERRITORY_UNAVAILABLE` se traduce a pendiente con motivo `sin_cartografia` y sin versión.
   - Cualquier otro fallo de lectura responde 503 sin registrar.
   La resolución va fuera de la transacción para no alargarla. El resultado y la versión quedan fijos en la fila.
5. **Ejecutar `unidadDeTrabajo.enTransaccion(tx => …)`:**
   1. `operaciones.incidentes.crear(tx)` devuelve `{id, referencia, registradoEn}`. La referencia se genera con `INSERT … ON CONFLICT (referencia) DO NOTHING RETURNING` hasta 5 veces, sin abortar la transacción.
   2. `INSERT solicitudes_envio` con `incidente_id` (NOT NULL). Si la clave está duplicada (P2002), la transacción se revierte entera, incidente incluido, y se vuelve al paso 2: la solicitud concurrente ya ganó. La PK `(ambito, clave)` hace esperar a la segunda transacción hasta que la primera confirme.
   3. `INSERT envios_incidente`, incluida la huella del código si el envío es de invitado.
   4. `eventos.publicar(tx, {tipo:'IncidenteRegistrado', version:1, agregadoId, carga:{incidenteId, modalidad}})`.

   Precisión del 26/11/2026, tomada al implementar: el orden pasa a incidente → clave → originales → evento. Así `solicitudes_envio.incidente_id` puede ser NOT NULL y desaparece el UPDATE posterior.
6. **Después del commit:** `procesadorEntregas.despertar()`. Se responde 201, o 200 en una repetición. En una repetición de invitado, un UPDATE rota la huella del código. Dos repeticiones simultáneas dejan vigente el último código escrito.

El contexto transaccional es un tipo opaco nuevo en `src/compartido/transaccion.ts`. Identidad conserva el suyo, porque no se refactoriza. Los adaptadores Prisma lo convierten a `Prisma.TransactionClient`. Aislamiento READ COMMITTED: las invariantes viven en restricciones UNIQUE y CHECK.

Prueba de atomicidad: un trigger temporal en la BD aislada falla en `envios_incidente` o en `eventos`. Se comprueba que no quedan filas en ninguna de las cinco tablas, con el mismo patrón que EQ-12.

### 4. Código secreto, referencia y huellas

- **Código:** 16 símbolos Crockford base32 de `crypto.randomBytes` (80 bits), en formato `XXXX-XXXX-XXXX-XXXX`. La entrada se normaliza: mayúsculas, sin guiones ni espacios, `O→0` e `I/L→1`.
- **Huella:** `HMAC-SHA256(SECRETO_SEGUIMIENTO, incidenteId ‖ código)` y comparación con `timingSafeEqual`. Con 80 bits de entropía no hace falta un KDF lento. El HMAC con un secreto del servidor impide verificar códigos a quien obtenga una copia de la BD sin el secreto.
- **Referencia inexistente:** se calcula igualmente un HMAC ficticio, para igualar el tiempo de respuesta.
- **Referencia pública:** `INC-` seguido de 10 símbolos Crockford base32 en dos grupos (50 bits), por ejemplo `INC-7K3M9-Q2TXA`.
- **Secreto:** variable `TRACKING_CODE_HMAC_SECRET` de al menos 32 caracteres, obligatoria en todos los entornos salvo las pruebas, que la generan. También se usa para la huella de contenido.
- **Vigencia del código:** mientras el incidente exista y sea consultable. El bloqueo por conservación se implementa en P9.

Alternativa descartada: guardar el código cifrado para devolverlo en una repetición. El servidor podría recuperarlo, y el documento 11 prohíbe esa recuperación. Por eso se rota el código.

### 5. Límites de frecuencia

Identidad amplía `TipoLimite` con `incidente_invitado_ip`, `seguimiento_ref` y `seguimiento_ip`, y expone su `LimitadorPort` por la fachada (`identidad.limitador`). `main.ts` lo inyecta en Reportes y Consultas como puerto propio de cada uno. La tabla sigue siendo de Identidad.

| Tipo | Identificador | Máximo / ventana |
|---|---|---|
| `incidente_invitado_ip` | IP (`req.ip` con `trust proxy` vigente) | 10 / 1 h |
| `seguimiento_ref` | referencia normalizada | 10 / 15 min |
| `seguimiento_ip` | IP | 30 / 1 h |

Las tres ventanas guardan solo el HMAC del identificador. En el seguimiento se consumen ambos límites antes de verificar el código.

### 6. Eventos y entregas

En `src/compartido/eventos/`:
- `PublicadorEventos` (puerto puro).
- `PrismaEventos` (adaptador).
- `ProcesadorEntregas`, en infraestructura, con la lista de consumidores registrada en la composición. Cada consumidor tiene `{nombre, tipos[], manejar(evento)}`.

Ciclo del procesador. Se ejecuta al arrancar y después de `despertar()`. Como `GestorEnvios`, no sondea en reposo: programa un temporizador solo mientras haya entregas pendientes (hasta su `proximo_intento_en`) o en proceso (hasta que venza su bloqueo). Precisión del 26/11/2026, tomada al implementar: sustituye al «cada 5 s» planificado, para no mantener activos Render y Neon sin trabajo.
1. **Materializar** las entregas que falten: `INSERT … SELECT e.id, c FROM eventos e … WHERE e.tipo = ANY(tipos) ON CONFLICT DO NOTHING`. Así un consumidor nuevo recibe los eventos anteriores. En P4.1 no hay consumidores registrados en producción.
2. **Tomar un lote** con `UPDATE … SET estado='en_proceso', bloqueado_hasta=now()+60s WHERE (estado='pendiente' AND proximo_intento_en<=now()) OR (estado='en_proceso' AND bloqueado_hasta<now()) … FOR UPDATE SKIP LOCKED RETURNING`.
3. **Ejecutar** `manejar`.
   - Si termina bien, la entrega pasa a `procesada`.
   - Si falla, se incrementa `intentos`, con espera `min(5 s·2^n, 10 min)`. Tras 8 intentos queda `fallida`.
   - Cada fallo genera un log con `{evento, consumidor, intentos, codigo}`.

Script `npm run eventos:reintentar -- --consumidor <x> [--evento <id>]` devuelve a pendiente las entregas fallidas. `npm run eventos:estado` cuenta las entregas por consumidor y estado.

Las pruebas usan un consumidor de prueba que escribe en una tabla temporal con UNIQUE(evento_id). Así se comprueba la idempotencia: la repetición tras una caída antes de marcar la entrega no duplica la escritura. También se prueban el bloqueo vencido y `SKIP LOCKED` con dos procesadores.

Alternativa descartada: crear las entregas dentro de la transacción del registro. Obliga a conocer los consumidores al registrar, y un consumidor nuevo (P4.2) no recibiría los eventos anteriores. Con la materialización perezosa, el evento persistido garantiza su entrega en el siguiente ciclo.

### 7. HTTP y contrato

| Ruta | Módulo | Auth | Respuestas |
|---|---|---|---|
| `POST /incidentes` | Reportes | Bearer de ciudadano opcional | 201, 200 repetición, 400, 401, 403, 409, 429, 503 |
| `GET /ciudadano/incidentes?cursor=` | Consultas | Bearer de ciudadano | 200, 400, 401, 403, 503 |
| `GET /ciudadano/incidentes/{referencia}` | Consultas | Bearer de ciudadano | 200, 401, 403, 404, 503 |
| `POST /publico/seguimiento` | Consultas | ninguna | 200, 400, 404, 429, 503 |

- Todas las respuestas llevan `no-store`, y `exigirJson` aplica en los POST.
- Los métodos no declarados responden 405 con `Allow`.
- Página de 20 elementos. El cursor es un base64url opaco de `(recibido_en, incidente_id)`.
- Códigos de error nuevos: `IDEMPOTENCY_KEY_REQUIRED` (400), `IDEMPOTENCY_CONFLICT` (409), `TRACKING_NOT_FOUND` (404 uniforme) y `RATE_LIMITED` (el código existente).
- OpenAPI y `contrato.test.ts` se actualizan en el mismo incremento.

Cuerpo del registro:
```json
{ "categoriaId": "pelea", "descripcion": "…",
  "ocurrencia": { "modo": "ahora", "instante": "2026-11-26T10:00:00-05:00" },
  "punto": { "latitud": -13.16, "longitud": -74.22, "origen": "gps", "precisionM": 12 },
  "heridos": "no_se", "telefonoContacto": "+51987654321" }
```

- **Ocurrencia:** tolerancia de +5 min sobre la hora del servidor y una antigüedad máxima de 30 días. Es un valor técnico configurable del piloto, registrado como supuesto: los documentos no fijan ese límite.
- **Teléfono:** se valida con la misma regla que el perfil (`^\+?[0-9]{7,15}$` tras normalizar). La regla se duplica en el dominio de Reportes, porque el dominio no puede importar la fachada de Identidad.

### 8. Seguimiento en Consultas

`SeguimientoCiudadano` compone sus datos a través de puertos inyectados en `main.ts`:
- `envios.listarDeAutor(usuarioId, cursor)` y `envios.originalesDe(id)` de Reportes;
- `envios.verificarCodigo(id, código)` de Reportes;
- `incidentes.porReferencia(ref)` y `incidentes.estados(ids)` de Operaciones.

Hay dos consultas por página, sin SQL cruzado. Mientras no exista P4.2, la institución responsable y las actuaciones se devuelven como `{estado:'pendiente'}` y `[]`. Las vistas del autor y del invitado son DTO separados, y una prueba enumera sus claves para impedir filtraciones.

### 9. Flutter

- **Dependencias:** `geolocator`, `flutter_map` y `latlong2` (las del origen), y `uuid` para la clave de idempotencia.
- **Teselas:** `--dart-define=TILE_URL`, por defecto `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, como en el origen, con `userAgentPackageName` y atribución visible.
  - **Aclaración sobre la opción elegida:** OpenFreeMap sirve teselas vectoriales, y `flutter_map` necesita teselas ráster sin un plugin adicional. Por eso el valor por defecto es el del origen. El cumplimiento de la política de uso de OSM y la elección del proveedor se validan en P7. Este cambio no declara validado el proveedor.
  - Si las teselas fallan (`errorTileCallback` o sin red), el selector dibuja con `PolygonLayer` los límites de `/publico/territorio/limites`.
- **Capas:**
  - Datos: `UbicacionPuerto`, que envuelve `geolocator` para poder probarlo con dobles; `IncidentesRepositorio` y `ConsultasGuardadas` (almacenamiento seguro).
  - Aplicación: `ReporteControlador`, cuyo estado es el borrador, la clave de intento y el resultado (`exito | incierto | errorCampo | limite`), y `SeguimientoControlador`.
  - Presentación: `ReportePantalla` (reproduce `report.dart`), `SelectorPuntoPantalla`, `ComprobantePantalla`, `MisReportesPantalla` y `ConsultarCodigoPantalla`.
- **Clave de intento:** se crea al pulsar Enviar si no existe y se descarta al editar cualquier campo.
- **Android:** el manifiesto declara `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION`, sin ubicación en segundo plano.

### 10. Documentación de ADR-009

En `07-desiciones-aquitectonicas.md`, la fila ADR-009 pasa a decir que Flutter usa `flutter_map`, por la réplica del origen (decisión del 26/11/2026), y que el proveedor de teselas queda pendiente de validar en P7. La decisión web (Leaflet) no cambia.

## Risks / Trade-offs

- [Rotar el código en cada repetición invalida el código que el cliente quizá ya mostró] → La app guarda siempre el último comprobante recibido y solo repite el envío mientras el resultado es incierto, de modo que el código mostrado es el vigente.
- [Teselas OSM con uso no validado] → Uso bajo e interactivo, con atribución y User-Agent; es configurable y tiene el respaldo de los polígonos. Se registra como pendiente de P7, no como validado.
- [Materialización perezosa: un evento queda sin entrega hasta el siguiente ciclo] → `despertar()` tras cada commit y ciclo cada 5 s. La prueba de EQ-14 cubre el reinicio.
- [El consumidor de prueba no demuestra el enrutamiento real] → La evidencia de P4.1 se limita al mecanismo. EQ-10 y EQ-21 quedan para P4.2.
- [FK entre módulos] → El precedente es P3.2, y el verificador comprueba que el código cruza módulos solo por fachadas.
- [La antigüedad máxima de 30 días es un supuesto] → Es configurable y está documentado. Si el responsable fija otro valor, cambia la configuración, no el contrato.
- [Sin cola entre reinicios de la app] → Al cerrar la app con un resultado incierto, el reporte puede haberse registrado sin que se muestre el comprobante. Con cuenta se ve en Mis reportes. El invitado perdería el código; se documenta como limitación conocida.

## Migration Plan

1. `prisma migrate deploy` crea las cinco tablas sin tocar los datos existentes.
2. Configurar `TRACKING_CODE_HMAC_SECRET` en Render antes de desplegar: la API no arranca sin ella.
3. Desplegar la API. La web no cambia.
4. Publicar el APK de prueba.
5. **Rollback:** volver a la API anterior. Las tablas quedan sin uso y no se ejecuta ningún `down` que borre incidentes.

## Open Questions

- Texto definitivo de la explicación del teléfono del invitado: se puede sustituir sin cambiar los contratos.
- ¿Conviene mostrar en el comprobante la precisión del GPS? Es cosmético y no afecta a la API.
