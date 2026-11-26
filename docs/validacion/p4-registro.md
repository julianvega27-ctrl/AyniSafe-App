# P4.1 — Registro y seguimiento de incidentes

- **Fecha:** 26/11/2026.
- **Cambio:** `registro-incidentes`, en la rama `feat/p4-registro`.
- **Base destino:** `039e9f4b4edd3b5b54303ee111f75613e626e8a2`. Es `main` con el PR #4 fusionado y el CI aprobado.

Este informe se completa por grupo de tareas. Lo que no figura aquí como ejecutado no está validado.

## Procedencia

El donante se leyó sin modificarlo:
- **Ruta:** `../Proyecto_incidencias_400par`.
- **HEAD:** `efc1bce8c29b3c88487e36e10a324c71ae9c2029`.
- **Estado:** `git status --porcelain` vacío el 26/11/2026.

Huellas SHA-256 de los archivos consultados:

| Archivo del donante | SHA-256 |
|---|---|
| `apps/api/src/incidents/report.js` | `b8a1f2578e6b2fddf26c6858a1c59ee29823bf346edda93e26f8754824129dfd` |
| `apps/api/src/incidents/router.js` | `01778238b54018a9a0a2abb288a585648559b6c49b87e980faa602d89e1fe6b0` |
| `apps/api/src/incidents/queries.js` | `26efe246d4c259c0f69fe760771098651c607906d7e2878c8e8fe98c1ec25a43` |
| `apps/mobile/lib/screens/report.dart` | `a16021b97e6292fd4181bea220d3f80a71a4e173bd13b77d624b2acf90ba8c0a` |
| `apps/mobile/lib/screens/mine.dart` | `c5f1a09310e67253fe78939dbcbad6f84058062c8f1d647d1066a68a966f7b2a` |
| `apps/mobile/lib/core/pending.dart` | `b1c8554eaf2b9a9f0ab3617b4fdbd9b621da053dea3e3225668b2eebceb624f6` |

**Se adapta:**
- La validación estricta del envío (`validateReport`, `validateLocation`) y el formato de las fechas con zona horaria.
- La idempotencia con clave del cliente y la huella del contenido (`requestKey`, `priorRequest`). Una clave reutilizada con otro contenido responde 409.
- Que, ante una clave duplicada por concurrencia, se lea el envío previo en lugar de fallar.
- El router de envío con Bearer opcional (`createIncidentsRouter`) y la lista propia ordenada por recepción (`listMine`).
- La composición del formulario móvil (`report.dart`): GPS con permiso y selector manual sobre `flutter_map`.
- La lista «Mis reportes» (`mine.dart`) y la conservación del resultado pendiente con la misma clave (`pending.dart`).

**Se descarta**, por contradecir reglas de AyniSafe:
- El reporte telefónico y el router `phone`: la recepción se limita a la app.
- Las subcategorías y `affectedPeople`: no forman parte del catálogo de 16 categorías.
- Los avisos dentro de la transacción del registro: se sustituyen por un evento y entregas persistidas (ADR-004).
- El alcance de idempotencia del invitado por hash de IP: la IP cambia en redes móviles. Se usa el ámbito `invitado` con la clave UUID.
- El token de evidencias de invitado (corresponde a P5).
- Los booleanos sanitarios `isConscious`, `isBreathing` y `hasBleeding`: pertenecen a la evaluación de P5 y aquí se usan Sí/No/No sé.
- El SQL MySQL dentro de los routers y la consulta `ST_Intersects` de destinatarios: el enrutamiento corresponde a P4.2.
- La cola persistente `pendingReportsV1` en `shared_preferences`: es un non-goal del design.

No se ejecutó la suite del donante ni se copiaron sus migraciones MySQL.

## Alcance y límites

- **Cubre:** RF06, RF07, RF09, RF10, RF51 (teléfono del invitado), RF55 (descripción de «Otra emergencia») y la captura de los datos de RF57 (HU02, HU03 y HU04).
- **No acredita:**
  - el enrutamiento, ni EQ-09, EQ-10, EQ-19 y EQ-21 (P4.2);
  - las fotos ni la evaluación SAMU completa (P5);
  - las transiciones de estado (P6);
  - el proveedor de teselas validado (P7);
  - la carga de 2.000 VU (P9).

## Entorno

Windows 11, Node v24.21.0 y PostgreSQL 18.1, con un clúster local en el puerto 5433 (`scripts/bd-local.sh`). Flutter 3.47.7 stable.

Línea base antes de implementar: `npm run test` en `apps/api` aprobó 37 suites y 540 pruebas.

## Grupo 1 · Base compartida

- **`src/compartido/transaccion.ts`:** contexto transaccional opaco y puerto `UnidadDeTrabajo`.
- **`src/compartido/prisma-transaccion.ts`:** adaptador sobre `prisma.$transaction`.
- **`cargarSecretoSeguimiento`:** carga `TRACKING_CODE_HMAC_SECRET`, obligatoria para el servidor HTTP y de al menos 32 caracteres. Se carga aparte de `cargarEntorno`, porque las CLI de aprovisionamiento no la necesitan. Está documentada en `.env.example`, el README y `scripts/bd-local.sh init`.
- **Verificación:**
  - `test/unidad/config-seguimiento.test.ts`: 3 pruebas, que cubren valor ausente, valor corto sin imprimir el secreto y valor válido.
  - `npm run typecheck` sin errores.
  - `arquitectura:verificar`: 0 infracciones.

## Grupo 2 · Eventos y entregas

- **Migración `20261126200000_eventos_asincronos`:** tablas `eventos` y `entregas_evento`.
  - CHECK de tipo, versión, carga plana de hasta 2 KB, estado y coherencia bloqueo/estado y procesada/fecha.
  - PK (evento, consumidor).
  - Índice parcial de entregas pendientes.
- **`src/compartido/eventos/`:**
  - Contratos puros: la carga solo admite identificadores, enumeraciones, enteros y booleanos.
  - `PrismaPublicadorEventos`.
  - `ProcesadorEntregas`:
    - materializa las entregas por consumidor;
    - toma lotes con `FOR UPDATE SKIP LOCKED`;
    - aplica bloqueo de 60 s y espera `5 s·2^(n-1)` con tope de 10 min; la entrega queda fallida tras 8 intentos;
    - marca la entrega condicionada al bloqueo tomado;
    - no sondea en reposo.
  - `contarEntregas` y `reintentarFallidas`.
- **CLI:** `npm run eventos:estado` y `npm run eventos:reintentar -- --consumidor <x> [--evento <id>]`.
- **Composición:** `main.ts` arranca y detiene el procesador sin consumidores de negocio.

### Verificación

| Prueba | Resultado |
|---|---|
| `esquema.test.ts`: tablas e índices, carga y estados no válidos (23514), entrega duplicada (23505) y entrega huérfana (23503) | Aprobada |
| `test/unidad/eventos.test.ts`: la carga rechaza texto libre, teléfono con `+`, coordenadas decimales, objetos anidados y claves no válidas | 10 aprobadas |
| `test/integracion/eventos.test.ts` | 12 aprobadas |
| `test/integracion/eventos-cli.test.ts`: estado, reintento por consumidor o evento y 9 combinaciones de argumentos inválidos sin escrituras | 11 aprobadas |

Escenarios de `eventos.test.ts`:
- una transacción revertida no deja evento;
- sin consumidores no se crean entregas;
- dos consumidores son independientes;
- un consumidor tardío recibe los eventos anteriores;
- se ignoran los tipos sin suscripción;
- un fallo transitorio espera y luego se recupera;
- tras 8 fallos la entrega queda fallida, con su log y su recuperación manual;
- dos procesadores concurrentes con 30 eventos: cada evento se procesa una sola vez;
- un bloqueo vigente se respeta y uno vencido se retoma;
- repetir la entrega tras una caída antes de marcarla no duplica el efecto;
- una marca tardía con un bloqueo reemplazado no pisa la entrega retomada;
- **EQ-14:** un procesador detenido antes de procesar y uno nuevo que arranca procesan las 2 entregas pendientes, sin dejar temporizador al terminar.

Suite completa tras el grupo 2: 40 suites y 568 pruebas aprobadas.

### Fallo encontrado y corregido

En el clúster local (`TimeZone = America/Bogota`), el adaptador `@prisma/adapter-pg` leía los `timestamptz` como UTC sin aplicar el desfase −05. Las marcas que genera la BD (`now()`) se leían 5 h antes. Lo detectó la prueba de espera creciente; en CI, con el servidor en UTC, el defecto no se manifestaba.

Corrección: `crearPrismaClient` fija la sesión en UTC (`options: '-c TimeZone=UTC'`). La suite completa de Identidad y territorio siguió aprobada después del cambio.

### Precisión de diseño

El procesador no sondea cada 5 s: sigue el patrón de `GestorEnvios` (design §6, actualizado).

## Grupo 3 · Operaciones: incidente único

- **Módulo `operaciones`:**
  - dominio: los cuatro estados y la referencia `INC-XXXXX-XXXXX`, Crockford con 50 bits aleatorios;
  - `ServicioIncidentes` con `crear(tx)`, `porReferencia` y `estados(ids)`;
  - adaptador Prisma con `INSERT … ON CONFLICT (referencia) DO NOTHING`;
  - fachada `crearModuloOperaciones`.
- **Migración `20261126210000_incidentes`:** CHECK de los cuatro estados y del formato de la referencia, referencia UNIQUE y REGISTRADO por defecto.
- **`src/compartido/crockford.ts`:** codificación compartida por la referencia y el código secreto.

| Prueba | Resultado |
|---|---|
| `test/unidad/incidente-referencia.test.ts`: alfabeto, codificación conocida, formato, 1000 referencias distintas y no ordenadas, normalización de la escritura humana | 7 aprobadas |
| `esquema.test.ts`: REGISTRADO por defecto; ASIGNADO, PENDIENTE_ATENCION, RESUELTO y minúsculas rechazados (23514); formato (23514); repetida (23505) | Aprobada |
| `test/integracion/incidentes.test.ts` | 5 aprobadas |

`incidentes.test.ts` comprueba:
- la creación en la transacción del llamador;
- que una colisión forzada se reintenta sin abortar la transacción;
- que 5 colisiones fallan sin dejar filas;
- que el rollback del llamador no deja filas;
- que las lecturas inexistentes no devuelven datos.

`arquitectura:verificar`: 0 infracciones.

## Grupo 4 · Reportes: registro del envío

- **Dominio `reportes/dominio/envio.ts`:**
  - validación estricta;
  - preguntas por categoría;
  - teléfono según la modalidad, con la regla del perfil duplicada;
  - descripción de 5 a 1000 caracteres;
  - ocurrencia con +5 min de tolerancia y 30 días de antigüedad;
  - contenido canónico, clave UUID y código Crockford de 80 bits.
- **`HmacSecretosAdapter`:** HMAC-SHA256 con prefijos separados para contenido y código, y `timingSafeEqual`.
- **Migración `20261126220000_envios_incidente`:**
  - `envios_incidente`, con CHECK de coherencia de modalidad/autor/teléfono/huella, territorio y preguntas por categoría, sin columnas de estado operativo;
  - `solicitudes_envio`, con PK `(ambito, clave)` e `incidente_id` NOT NULL UNIQUE.
- **`RegistrarIncidenteUseCase`, `PrismaEnviosAdapter` y `POST /incidentes`.**
- **Composición:** `src/composicion.ts` conecta las fachadas de Identidad (identificación del solicitante y limitador), Consultas (`resolverParaRegistro`) y Operaciones. Identidad amplía `TipoLimite` y expone `identificarSolicitante` y `limitador` por su fachada.

| Prueba | Resultado |
|---|---|
| `test/unidad/envio-incidente.test.ts` | 58 aprobadas |
| `test/unidad/registrar-incidente.test.ts` (dobles) | 13 aprobadas |
| `test/integracion/esquema-envios.test.ts`: modalidades incoherentes (6), territorios incoherentes (7), preguntas no aplicables, FK y unicidades | Aprobadas |
| `test/integracion/registro-incidentes.test.ts` (PostgreSQL real, vía HTTP) | 19 aprobadas |

`registro-incidentes.test.ts` comprueba:
- **Modalidades:**
  - con cuenta: autor de la sesión, comprobante sin datos restringidos y evento con solo `incidenteId` y `modalidad`;
  - como invitado: el teléfono se guarda normalizado y solo la huella del código; el código no aparece en la fila, el evento, la respuesta ni los logs.
- **Clasificación territorial:**
  - punto interior resuelto con la versión activa;
  - frontera y fuera del área quedan pendientes con su versión;
  - sin cartografía activa → `sin_cartografia`, sin versión y con el punto conservado;
  - sin punto → 400 sin filas.
- **Atomicidad:** un trigger que falla en `envios_incidente` o en `eventos` → 503 y 0 filas en las cinco tablas; al retirarlo, el mismo envío se registra.
- **Idempotencia:**
  - una repetición responde 200 con la misma referencia y un código nuevo; la huella anterior ya no coincide;
  - una clave con otro contenido responde 409 sin cambios;
  - 10 envíos simultáneos con la misma clave dan un 201 y nueve 200, con 1 incidente;
  - la misma clave en dos cuentas crea dos incidentes;
  - sin clave o con clave inválida → 400.
- **Autenticación:** un Bearer desconocido, malformado o `Basic` → 401 sin degradar a invitado; una cuenta con teléfono → 400; un invitado sin teléfono → 400; una cookie de operador o administrador → 403.
- **Límite de envíos:** el envío 11 en la ventana → 429 con Retry-After y 10 incidentes; una repetición con el límite agotado → 200.
- **Contrato:** 405 con `Allow: POST`, 415 y 400 por JSON roto.

Suite completa tras el grupo 4: 47 suites y 710 pruebas aprobadas, con la regresión de Identidad incluida. `arquitectura:verificar`: 0 infracciones.

### Precisiones de diseño tomadas al implementar

- **Orden en la transacción:** incidente → clave → originales → evento. Así `solicitudes_envio.incidente_id` es NOT NULL (design §3, actualizado).
- **Consultas:** añade `resolverParaRegistro`, que devuelve `null` sin cartografía activa y propaga los fallos de lectura. El `resolver` público convertía ambos casos en `TERRITORY_UNAVAILABLE`.
- **Sesión institucional:** se detecta por la cookie institucional vigente y responde 403. Un Bearer de rol institucional no existe: las sesiones Bearer solo se buscan entre ciudadanos y dan 401.

## Grupo 5 · REST, contrato y medición del registro

- **OpenAPI 0.7.0:**
  - `POST /incidentes` con el parámetro `Idempotency-Key`;
  - esquemas `EnvioIncidente`, `ComprobanteIncidente` y `TerritorioIncidente`;
  - códigos `IDEMPOTENCY_KEY_REQUIRED` e `IDEMPOTENCY_CONFLICT`;
  - estados 200, 201, 400, 401, 403, 409, 413, 415, 429 y 503.
- **`npm run contrato:validar`:** contrato válido.
- **`contrato.test.ts`, «registro de incidentes»:**
  - cada estado se comprueba contra el OpenAPI desreferenciado;
  - el comprobante de invitado no lleva teléfono y el de cuenta no lleva código;
  - el 503 se provoca con un trigger y no expone el texto del error SQL;
  - no hay rutas PATCH, PUT ni DELETE de incidentes, y GET responde 405 con `Allow: POST`;
  - la comprobación global de estados documentados frente a los ejercitados sigue aprobada.

  Resultado: 10/10 pruebas aprobadas.

### Medición local (evidencia parcial de EQ-02)

`npm run registro:medir -- ../../docs/validacion/p4/medicion-registro.json` sobre la base `_test`. Archivo: [p4/medicion-registro.json](p4/medicion-registro.json).

**Escenario:**
- 100 registros con cuenta y 100 como invitado, en serie, por HTTP en proceso (supertest);
- un consumidor de prueba bloqueado 30 s en su primera entrega;
- sin cartografía activa.

| Modalidad | p50 | p95 | Máximo |
|---|---|---|---|
| Cuenta | 6,3 ms | 8,9 ms | 46,5 ms |
| Invitado | 6,0 ms | 7,6 ms | 9,0 ms |

- Los 200 registros se confirmaron en 1,37 s con el consumidor tomado a los 54 ms y bloqueado. La confirmación no esperó al consumidor.
- Al terminar había 200 incidentes, 200 originales y 200 eventos, con 0 entregas procesadas y 1 en proceso. Las 199 entregas restantes se materializan en la siguiente pasada del procesador.
- El historial del autor (`ORDER BY recibido_en DESC, incidente_id DESC LIMIT 21`, con 100 filas del autor) usa `Index Scan` sobre `envios_incidente_autor_idx` y tarda 0,028 ms en ejecución.
- **Límites:** sin red real, TLS ni arranque en frío; sin geometrías reales. No reproduce la carga de 50 por minuto durante 10 min de EQ-02 ni el perfil de 2.000 VU (P9). No se presenta como aceptación de EQ-02.

## Grupo 6 · Consultas: seguimiento ciudadano

- **Consultas:**
  - `dominio/seguimiento.ts`: vistas de lista cerrada, cursor opaco y validación de la consulta del invitado;
  - `SeguimientoCiudadano`, con puertos hacia Reportes, Operaciones, el catálogo y el limitador;
  - rutas `GET /ciudadano/incidentes`, `GET /ciudadano/incidentes/{referencia}` y `POST /publico/seguimiento`.
- **Reportes:** `LecturaEnvios` (historial y detalle del autor, verificación del código con una lectura y un HMAC fijos aunque la referencia no exista) se expone por la fachada.
- **Composición:** `opcionesSeguimiento` resuelve Reportes de forma diferida, porque se compone después de Consultas.
- **OpenAPI:**
  - tres operaciones nuevas;
  - esquemas `HistorialIncidentes`, `DetalleIncidenteAutor`, `VistaSeguimientoInvitado` y `ConsultaSeguimiento`;
  - respuesta `SeguimientoNoEncontrado` y código `TRACKING_NOT_FOUND`.

| Prueba | Resultado |
|---|---|
| `test/unidad/seguimiento.test.ts` | 15 aprobadas |
| `test/integracion/seguimiento.test.ts` | 11 aprobadas |
| `contrato.test.ts`, «seguimiento ciudadano» | Aprobada |

`seguimiento.test.ts` (unidad) comprueba:
- las claves exactas de cada vista: la del invitado no tiene descripción, punto, distrito, teléfono, respuestas ni ids internos;
- que se consumen los dos límites antes de verificar;
- que con el límite agotado no se verifica;
- que una referencia inexistente y un código incorrecto dan el mismo error y ambos verifican;
- los cuerpos inválidos;
- el cursor manipulado;
- que un fallo de almacenamiento responde 503.

`seguimiento.test.ts` (integración) comprueba:
- **Historial:** solo lo propio con dos cuentas y sin envíos de invitado; historial vacío; paginación de 45 incidentes en 3 páginas sin repetir ni omitir; cursor o parámetro extra → 400.
- **Detalle propio:** institución pendiente, sin coordenadas ni teléfono.
- **Invitado:**
  - con código válido, solo las 6 claves de la vista;
  - inexistente, código incorrecto y código rotado → el mismo 404 con el mismo mensaje;
  - el intento 11 sobre una referencia → 429 aunque el código sea correcto;
  - el límite por origen corta la prueba de referencias distintas;
  - las ventanas guardan solo el HMAC.

`contrato.test.ts` («seguimiento ciudadano»): cada estado de las tres operaciones (200, 400, 401, 403, 404, 413, 415, 429 y 503), comprobado contra el OpenAPI. El 503 se provoca con puertos caídos y no expone texto interno.

### EQ-04: accesos no autorizados (conjunto ejecutado)

| Intento | Esperado | Resultado |
|---|---|---|
| Historial sin token | 401 | Rechazado |
| Historial con token desconocido | 401 | Rechazado |
| Historial con cookie de operador | 403 | Rechazado |
| Detalle ajeno por URL directa | 404 | Rechazado |
| Detalle de un envío de invitado desde una cuenta | 404 | Rechazado |
| Detalle inexistente | 404 | Rechazado |
| Detalle sin token | 401 | Rechazado |
| Detalle con cookie de operador | 403 | Rechazado |
| Código de invitado sobre un incidente de cuenta | 404 | Rechazado |
| Referencia sin código | 400 | Rechazado |
| Código en la URL | 400 | Rechazado |

Se rechazaron 11 de 11 intentos (100 %). Ninguna respuesta contiene descripción, teléfono ni coordenadas. El conjunto cubre el seguimiento de P4.1; EQ-04 sobre evidencias, mapa y alertas queda para P5, P7 y P8.

Suite completa tras el grupo 6: 49 suites y 738 pruebas aprobadas. `arquitectura:verificar`: 0 infracciones. `npm run build` aprobado.

## Grupo 7 · Flutter: reporte

- **Dependencias:** `geolocator` 14.1.2, `flutter_map` 8.3.2, `latlong2` 0.10.1 y `uuid` 4.6.0.
- **Configuración:** `TILE_URL` y `TILE_ATTRIBUTION` en `config/entorno.dart`. Por defecto se usa la plantilla OSM del origen; el proveedor sigue pendiente de validar en P7.
- **Manifiesto principal:** `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION`.
- **Datos:**
  - `IncidentesRepositorio`: Idempotency-Key, resultado incierto ante falta de red, tiempo agotado o 5xx, y errores 400, 409 y 429;
  - `UbicacionGeolocator`: pide el permiso solo al llamarse;
  - `ConsultasGuardadasSeguras`: almacén seguro.
- **Controlador y pantallas:** `ReporteControlador`, `ReportePantalla` (composición de `report.dart`), `SelectorPunto` (mapa incrustado como en el origen, confirmación explícita, respaldo de límites distritales y atribución visible) y `ComprobanteVista`.

### Manifiesto fusionado

Comando: `./gradlew :app:processDebugMainManifest`. Archivo: `build/app/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml`.

- **Permisos:** `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` y `pe.edu.unsch.ayni_safe.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
- La última es una permission de nivel `signature` que declara AndroidX para sus receptores internos. No se pide al usuario y no se verificó si ya existía antes de P4.1.
- No se declara ubicación en segundo plano.
- Se mantiene la consulta `tel` (DIAL).

### Verificación

| Prueba | Resultado |
|---|---|
| `test/incidentes_datos_test.dart` | 7 aprobadas |
| `test/reporte_pantalla_test.dart` | 20 aprobadas |

`incidentes_datos_test.dart` comprueba:
- que el Bearer solo se envía con cuenta;
- que 201 y 200 se traducen como registro nuevo y repetición;
- que sin red, con tiempo agotado y con 500, 502 o 503 el resultado es incierto;
- que un 400 con campos llega al formulario;
- que un 429 incluye su Retry-After;
- 401 y 409;
- que la consulta de invitado lleva referencia y código en el cuerpo y nada en la URL;
- el cursor del historial;
- guardar, listar y olvidar en el almacén seguro.

`reporte_pantalla_test.dart` comprueba:
- **Apertura:** con cuenta, sin teléfono, sin categoría preseleccionada y con «Ahora» marcado; como invitado, con el teléfono y su explicación.
- **Otra emergencia:** cambia el rótulo y la descripción sigue siendo obligatoria.
- **Preguntas para SAMU:** en accidente aparecen las dos preguntas sin selección y, si no se responden, no se envían; en pelea, «No sé» se envía como no_se; al cambiar a Robo se retiran.
- **Permisos y ubicación:**
  - no se pide la ubicación al abrir;
  - si se deniega, se explica y se conserva lo escrito;
  - el servicio apagado y el permiso bloqueado tienen mensaje propio;
  - con GPS se muestra la precisión;
  - el punto manual se confirma en el mapa;
  - sin punto no se envía.
- **Mapa base:**
  - sin mapa base, dibuja los límites y permite marcar;
  - con mapa base, la atribución es visible y no se cargan los límites.
- **Errores y reintentos:**
  - un error de campo del servidor aparece junto al teléfono;
  - con resultado incierto se reintenta con la misma clave y el mismo cuerpo, y se obtiene el mismo comprobante;
  - editar genera una clave nueva;
  - un 429 indica cuándo reintentar.
- **Comprobante:** el invitado ve el código y queda guardado de forma segura; con cuenta no hay código.
- El instante se envía en UTC con milisegundos.

### Capturas en Android

**Entorno:**
- Emulador `Medium_Phone_API_37.0` (`sdk_gphone64_x86_64`, Android 17, API 37), emulador 37.2.12.0.
- API local con la cartografía INEI activa en la base de desarrollo (versión `5cb61fbe…`).
- `adb reverse tcp:3000`.

**Comando:**

```
flutter drive --driver=test_driver/capturas_p4.dart --target=integration_test/recorrido_p4_test.dart -d emulator-5554 --use-application-binary <apk> --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ESCENARIO=invitado|cuenta
```

**Capturas:** 17 en [p4/capturas](p4/capturas/).
- Invitado: `inicio-publico`, `reporte-invitado-vacio`, `reporte-invitado-preguntas`, `ubicacion-denegada`, `punto-candidato`, `reporte-invitado-completo`, `comprobante-invitado`, `consulta-codigo` y `reporte-invitado-200`.
- Cuenta: `inicio-cuenta-vacio`, `reporte-cuenta-gps-sin-lectura`, `reporte-cuenta-punto`, `envio-incierto`, `comprobante-cuenta`, `mis-reportes`, `detalle-cuenta` e `inicio-cuenta-con-reporte`.

**Revisión visual:**
- El mapa real (teselas OSM) muestra Ayacucho, el marcador y la atribución.
- Las preguntas aparecen sin selección.
- El código se muestra con su advertencia.
- Al 200 %, el formulario no se recorta.
- El aviso de resultado incierto aparece junto a «Reintentar envío».

**Comparación con el origen:** no hay captura de referencia de `report.dart`. Como ya se registró en P2, el origen pide ubicación y teselas y necesita su backend. La comparación es estructural, por código:
- se conservan el título «Nuevo reporte», el texto de apoyo, el selector de categoría, la descripción, «Usar mi ubicación», el mapa incrustado con marcador, la tarjeta del punto, la atribución y el botón «Enviar reporte»;
- **diferencias por reglas de AyniSafe:**
  - sin foto (P5);
  - preguntas Sí/No/No sé en lugar de los desplegables del triaje;
  - confirmación explícita del punto;
  - «¿Cuándo ocurrió?»;
  - teléfono obligatorio solo para invitado;
  - comprobante en pantalla propia con el código.

No se declara fidelidad píxel a píxel.

Las capturas de invitado se generaron con un binario anterior a dos ajustes que no cambian esas pantallas: el aviso movido junto al botón y la recarga de Inicio con cuenta. Las de cuenta usan el binario final.

## Grupo 8 · Flutter: seguimiento y navegación

- **`MisReportesPantalla`:** composición de `mine.dart`. Lista propia con «Cargar más» por cursor, estados vacío y de error, sesión vencida y detalle con institución y actuaciones pendientes.
- **`ConsultarCodigoPantalla`:** consultas guardadas con «Ver seguimiento» y «Olvidar», 404 genérico y 429 con espera.
- **Navegación:**
  - Reportar operativo con o sin cuenta;
  - Mis reportes operativo con cuenta;
  - «Consultar con código» en el Drawer y en Inicio sin cuenta;
  - Inicio con hasta tres reportes propios, que se releen al volver a Inicio;
  - Mapa y Alertas siguen pendientes.

### Verificación

| Prueba | Resultado |
|---|---|
| `test/seguimiento_pantallas_test.dart` | 8 aprobadas |
| `navegacion_perfil_test.dart`, `sesion_test.dart`, `acceso_pantalla_test.dart` y `enlaces_cuenta_test.dart` | Actualizadas a los escenarios MODIFIED, ADDED y REMOVED del delta |
| Suite Flutter completa | 289 aprobadas |
| `flutter analyze` | Sin incidencias |

`seguimiento_pantallas_test.dart` comprueba:
- paginación y detalle;
- estado vacío y error;
- sesión vencida;
- consulta guardada sin reescribir el código;
- 404 y 429;
- olvidar una consulta;
- relectura de Inicio;
- que las consultas guardadas sobreviven al cierre de sesión y no aparecen en Mis reportes.

Pruebas actualizadas:
- «Reportar» abre el formulario sin pedir permisos ni enviar nada;
- Inicio con cuenta muestra hasta tres reportes del servidor y su estado vacío;
- sin cuenta se ofrecen «Consultar con código» y el reporte como invitado;
- Mapa y Alertas siguen pendientes;
- el manifiesto declara solo la ubicación en primer plano;
- el texto al 200 % y la semántica cubren las secciones nuevas.

## Grupo 9 · Documentación y aceptación integrada

- **ADR-009 actualizado:** Flutter usa `flutter_map` por la decisión del 26/11/2026 y el proveedor de teselas sigue pendiente para P7. La decisión web (Leaflet) no cambia.
- **API:**
  - `typecheck`, `test:tipos`, `build` y `contrato:validar`: aprobados;
  - `arquitectura:verificar`: 109 archivos y 0 infracciones;
  - `test:cobertura`: 49 suites y 739 pruebas aprobadas.
- **Cobertura global:** 85,95 % de líneas, 93,69 % de funciones y 91,08 % de ramas. Resumen en [p4/cobertura-summary.json](p4/cobertura-summary.json).
  - Módulos nuevos: Operaciones al 100 % de líneas; Reportes entre 96 % y 100 %; seguimiento de Consultas entre 92 % y 100 %; eventos entre 95 % y 100 %.
  - La rama más baja es la del `ProcesadorEntregas`, con 77 % (caminos de error y temporizador).
- **Flutter:** `flutter analyze` sin incidencias y `flutter test` con 289 aprobadas.
- **Calidad:** `openspec validate registro-incidentes --strict` es válido, `git diff --check` no reporta problemas y `node scripts/escanear-secretos.mjs` es correcto. El escáner recorre solo los archivos versionados, así que los archivos nuevos aún sin commit no quedan cubiertos hasta registrarlos.

### Recorrido en Android (EQ-08 y EQ-11)

Recorrido **automatizado** con `integration_test` en el emulador, contra la API y PostgreSQL reales. No es una sesión manual con personas.

**Invitado (aprobado):**
- El permiso de ubicación se deja denegado en el sistema (`pm set-permission-flags … user-fixed`).
- La app explica el motivo y conserva lo escrito.
- Se marca y confirma el punto en el mapa real.
- El teléfono es obligatorio.
- El servidor confirma y clasifica el punto en DIS-01 Ayacucho.
- El código queda guardado y la consulta con código muestra estado y resumen.

**Cuenta (aprobado):**
- El permiso de ubicación está concedido (`pm grant`).
- Se pierde la respuesta del primer envío: el cliente deja llegar el POST y descarta la respuesta.
- La app indica que el resultado es incierto.
- «Reintentar envío» usa la misma clave. El log de la API registra `201` y luego `200` para el mismo envío.
- Mis reportes muestra un único incidente, con su detalle.
- Inicio muestra el reporte al volver.

**Limitación:** en este emulador el proveedor *fused* de Google Play no entregó las ubicaciones de prueba (`adb emu geo fix` ni `cmd location providers set-test-provider-location`). `getCurrentPosition` agotó su tiempo (`TimeoutException`) y la app mostró «No pudimos obtener tu ubicación», con la alternativa del mapa. Por eso el envío con cuenta se completó con un punto manual.

El camino «permiso concedido → punto GPS» no pudo verificarse en el emulador. **Verificación manual (26/11/2026):** el responsable recorrió la tarea 9.3 a mano y la dio por verificada; los detalles de dispositivo y resultado no constan en este informe. Siguen pendientes:
- las sesiones de usabilidad de EQ-08 con 10 participantes;
- la revisión con TalkBack.

### Fallos encontrados por el recorrido y corregidos

1. **Instante con microsegundos.** `DateTime.toIso8601String()` de Dart emite microsegundos (6 decimales) y la API solo admitía 3, así que todo envío real de la app recibía 400 en `ocurrencia`. Las pruebas de widgets no lo detectaron porque su reloj fijo no tenía microsegundos.
   - La API admite hasta 9 decimales (ISO 8601) y tiene una prueba nueva.
   - La app envía milisegundos (`instanteIso`) y tiene una prueba nueva.
2. **Inicio no releía los últimos reportes** al volver, y no mostraba el recién enviado. Ahora el bloque se relee en cada regreso, sin rehacer Inicio: se conserva el estado de las pestañas que exige el spec. Tiene una prueba nueva.
3. **Aviso del resultado del envío fuera de la vista.** El aviso (incierto, límite, error) se mostraba arriba del formulario, lejos del botón. Se movió junto a «Enviar/Reintentar envío», como se ve en la captura `envio-incierto`.

## Matriz de trazabilidad

| Spec / escenarios | RF | HU | EQ | Prueba | Resultado |
|---|---|---|---|---|---|
| `reportes/registro-incidentes` | RF06, RF07, RF09, RF51, RF55, captura de RF57 | HU02, HU03 | EQ-02 parcial, EQ-11 | `envio-incidente`, `registrar-incidente`, `esquema-envios`, `registro-incidentes`, `contrato` | Aprobado |
| `operaciones/incidentes` | RF09, RF45 (estado inicial) | HU02 | — | `incidente-referencia`, `incidentes`, `esquema`, `contrato`, `arquitectura:verificar` | Aprobado |
| `plataforma/eventos-asincronos` | — (ADR-004) | — | EQ-07 (mecanismo), EQ-14 | `eventos`, `eventos-cli` | Aprobado |
| `consultas/seguimiento-ciudadano` | RF10, RF47 (parcial) | HU04 | EQ-04 (seguimiento) | `seguimiento` (unidad e integración), `contrato` | Aprobado |
| `movil/reporte-incidente` | RF06, RF07, RF51, RF52 (sin fotos, P5) | HU02, HU03 | EQ-08, EQ-11 | `reporte_pantalla_test`, `incidentes_datos_test`, recorrido en Android | Aprobado (GPS con permiso: verificación manual del responsable) |
| `movil/seguimiento-incidentes` | RF10 | HU04 | — | `seguimiento_pantallas_test`, recorrido en Android | Aprobado |
| `movil/navegacion-ciudadana` (delta) | RF37 | HU18 | — | `navegacion_perfil_test`, `sesion_test`, `acceso_pantalla_test`, `enlaces_cuenta_test`, manifiesto fusionado | Aprobado |

**Pendiente fuera de P4.1:**
- EQ-09 sobre incidentes, EQ-10, EQ-19 y EQ-21 (enrutamiento, P4.2);
- fotos y evaluación SAMU completa (P5);
- validación del proveedor de teselas (P7);
- EQ-02 con 50 por minuto y la carga de 2.000 VU (P9);
- cola de envíos entre reinicios de la app;
- sesiones de usabilidad de EQ-08 y TalkBack;

## CI remoto

- **PR:** [#5](https://github.com/julianvega27-ctrl/AyniSafe-App/pull/5), rama `feat/p4-registro`, revisión `a790120c2fbdcbe76838c29ecba230a3288e82f2`.
- **Relación entre commits:**
  - especificación: `12d6dcc`;
  - corrección UTC: `b4d2340`;
  - API: `99f4bc1`;
  - móvil: `3e1e226`;
  - evidencia: `a790120`.

**GitHub Actions, ejecución [45903117097](https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/45903117097)** (`pull_request`, 26/11/2026): aprobada.

| Job | Resultado | Duración |
|---|---|---|
| API (tipos, arquitectura, contrato y Jest con cobertura) | Aprobado | 2 min 5 s |
| Flutter (análisis y pruebas) | Aprobado | 1 min 26 s |
| Web (lint, tipos, compilación y pruebas) | Aprobado | 30 s |
| Escaneo de secretos del repositorio | Aprobado | 8 s |

Con los archivos ya versionados, el escaneo de secretos cubre también los archivos nuevos de P4.1. Esto cierra la limitación anotada en el grupo 9.

**Fusión:** el PR #5 se fusionó en `main` el 26/11/2026 como `7129ef38e7b3d7cbcc2c2be1389110fffd5f34cd`. La ejecución [45903499282](https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/45903499282) (`push` a `main`) también fue aprobada.

**Pendiente:**
- configurar `TRACKING_CODE_HMAC_SECRET` en Render antes de desplegar;

**Cierre OpenSpec (rama `docs/p4-cierre`):**
- Specs sincronizadas: 6 capacidades nuevas (`reportes/registro-incidentes`, `operaciones/incidentes`, `plataforma/eventos-asincronos`, `consultas/seguimiento-ciudadano`, `movil/reporte-incidente` y `movil/seguimiento-incidentes`) y el delta de `movil/navegacion-ciudadana` (+2, ~3, -1).
- Cambio archivado en `openspec/changes/archive/2026-11-26-registro-incidentes`.
- `openspec validate --specs`: 23/23. En modo estricto fallan 4 specs de identidad y web por avisos de longitud que ya existían; no los introdujo este cierre.
- Las migraciones conservan en sus comentarios la ruta del cambio sin archivar: no se editan porque Prisma valida su checksum.
