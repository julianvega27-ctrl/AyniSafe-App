# Tasks

Estado: planificación creada el 26/11/2026 sobre `039e9f4` (`main`), rama `feat/p4-registro`. Implementación y validación local del 26/11/2026: 27 de 27 tareas. PR #5 fusionado en `7129ef3`; CI aprobado sobre `a790120` (run 45903117097) y sobre `main` tras la fusión (run 45903499282). La 9.3 (GPS con permiso concedido) la verificó el responsable manualmente.

- `proposal.md` y las specs definen el alcance; `design.md` documenta las decisiones técnicas.
- La evidencia va en `docs/validacion/p4-registro.md`. Se crea en 1.1 y se completa en cada grupo.
- Una casilla se marca solo cuando existen el código y la evidencia ejecutada.

## 1. Procedencia y base compartida

- [x] 1.1 Crear `docs/validacion/p4-registro.md` con:
  - la base destino;
  - el HEAD del donante `efc1bce8` con árbol limpio;
  - los archivos candidatos: `incidents/report.js`, `router.js`, `queries.js`, `screens/report.dart`, `mine.dart` y `core/pending.dart`;
  - qué se adapta y qué se descarta: reporte telefónico, subcategorías, avisos en la transacción, idempotencia por IP, token de evidencias y booleanos sanitarios.

  Verificar que el donante no se modificó (`git status` del donante).
- [x] 1.2 Añadir:
  - `src/compartido/transaccion.ts` (contexto opaco);
  - el puerto `UnidadDeTrabajo` y su adaptador Prisma;
  - la variable `TRACKING_CODE_HMAC_SECRET` en `config/entorno.ts` (mínimo 32 caracteres, generada en pruebas).

  Verificar con Jest unitario de configuración (ausente o corta → error sin imprimir el valor) y `arquitectura:verificar` sin infracciones.

## 2. Eventos y entregas (plataforma)

- [x] 2.1 Migración aditiva de `eventos` y `entregas_evento` con los CHECK, la PK y los índices del design. Verificar en `esquema.test.ts` las tablas, el rechazo de un estado inválido y la unicidad (evento, consumidor).
- [x] 2.2 Implementar en `src/compartido/eventos/`:
  - el `PublicadorEventos` transaccional;
  - el `ProcesadorEntregas` (materialización, toma con `SKIP LOCKED`, bloqueo, espera creciente y estado fallido).

  Verificar en PostgreSQL con un consumidor de prueba:
  - sin consumidores, el evento queda sin entregas;
  - dos consumidores procesan de forma independiente;
  - un consumidor nuevo procesa eventos anteriores;
  - un fallo transitorio se reintenta y termina procesado;
  - tras 8 fallos la entrega queda fallida;
  - dos procesadores no toman la misma entrega;
  - una entrega con bloqueo vencido se reprocesa;
  - la repetición tras una caída antes de marcar no duplica la escritura del consumidor.
- [x] 2.3 Añadir los scripts `eventos:estado` y `eventos:reintentar`, los logs estructurados sin datos sensibles y el arranque y parada del procesador en `main.ts`. Verificar con integración: los conteos por estado tras fallos inyectados y el paso de fallida a pendiente; y una prueba de reinicio (crear el evento, detener el procesador antes de procesarlo, arrancar uno nuevo y comprobar que la entrega se procesa) como evidencia de EQ-14. Registrar el resultado en el informe.

## 3. Operaciones: incidente único

- [x] 3.1 Crear el módulo `operaciones`, con:
  - dominio: estados y generación de la referencia Crockford base32;
  - aplicación: puerto `IncidentesRepositorio`;
  - infraestructura Prisma;
  - fachada con `crear(tx)`, `porReferencia` y `estados(ids)`;
  - la tabla `incidentes` con CHECK de estado y referencia UNIQUE.

  Verificar:
  - Jest unitario: formato y alfabeto de la referencia, y la ausencia de secuencia;
  - `esquema.test.ts`: el estado ASIGNADO se rechaza y el valor por defecto es REGISTRADO;
  - integración: una colisión de referencia forzada se reintenta sin abortar la transacción;
  - `arquitectura:verificar`.

## 4. Reportes: registro del envío

- [x] 4.1 Dominio del envío:
  - validación estricta del cuerpo y campos reservados;
  - categorías y preguntas aplicables (heridos y atención médica);
  - teléfono según modalidad;
  - descripción de 5 a 1000 caracteres;
  - ocurrencia con +5 min de tolerancia y 30 días de antigüedad;
  - punto y origen;
  - `Idempotency-Key` UUID;
  - huella HMAC del contenido canónico;
  - código secreto Crockford, con normalización y huella.

  Verificar con Jest unitario cada escenario de validación del spec `reportes/registro-incidentes`: el no_se se conserva y nunca pasa a no; robo con heridos y agresión con atención médica → 400; la huella es estable ante el orden de las claves.
- [x] 4.2 Migración de `envios_incidente` (CHECK de coherencia de modalidad, autor, teléfono, huella y territorio) y `solicitudes_envio`. Verificar en `esquema.test.ts` el rechazo de un invitado con autor, de una cuenta con teléfono, y de un estado resuelto sin distrito.
- [x] 4.3 Implementar `RegistrarIncidente` según el design §3, con los puertos `ResolverTerritorioPort`, `LimitadorPort` y `PublicadorEventos`, la fachada de Operaciones y la rotación del código en la repetición. Verificar con Jest y dobles:
  - el orden de los pasos;
  - una repetición no consume el límite;
  - `TERRITORY_UNAVAILABLE` se convierte en pendiente con `sin_cartografia`;
  - otro fallo territorial → 503 sin registrar;
  - no se despierta el procesador si la transacción se revierte.
- [x] 4.4 Adaptadores Prisma del envío y de la solicitud. Verificar en PostgreSQL aislado:
  - registro de cuenta y de invitado, con incidente, original, solicitud y evento;
  - punto interior resuelto con versión, frontera y fuera del área pendientes, y sin cartografía activa → `sin_cartografia`;
  - un trigger temporal que falla en `envios_incidente` y otro en `eventos` no dejan filas residuales en las cinco tablas;
  - una repetición devuelve el mismo incidente con un código nuevo y el anterior ya no verifica;
  - una clave reutilizada con otro contenido → 409;
  - 10 envíos concurrentes con la misma clave crean un único incidente;
  - la misma clave en dos cuentas crea dos incidentes;
  - el teléfono y el código no aparecen en el evento.
- [x] 4.5 Ampliar `TipoLimite` de Identidad con `incidente_invitado_ip`, `seguimiento_ref` y `seguimiento_ip`, y exponer el limitador por la fachada. Verificar con la regresión de Identidad (limitador, login y registro) y con integración: el envío 11 de invitado en una hora → 429 con Retry-After sin crear incidente, y una repetición con el límite agotado → 200.

## 5. REST, contrato y medición del registro

- [x] 5.1 Añadir la ruta `POST /incidentes`:
  - Bearer opcional: un Authorization inválido responde 401, y un rol no ciudadano responde 403;
  - `exigirJson`, `no-store` y 405 con Allow;
  - componerla en `main.ts`.

  Documentarla en OpenAPI en el mismo incremento. Verificar en `contrato.test.ts` cada estado (200, 201, 400, 401, 403, 409, 429 y 503) contra el OpenAPI desreferenciado, y que el comprobante no contiene teléfono, coordenadas ni datos de enrutamiento.
- [x] 5.2 Medir con PostgreSQL local la latencia en serie p50/p95 de 200 registros (cuenta e invitado) mientras un consumidor de prueba bloquea durante 30 s, como evidencia parcial de EQ-02: la confirmación no espera al consumidor. Registrar en `docs/validacion/p4/` el entorno, los comandos y `EXPLAIN (ANALYZE, BUFFERS)` del historial por autor. No atribuirlo a la carga de 50/min ni a 2.000 VU.

## 6. Consultas: seguimiento ciudadano

- [x] 6.1 Implementar `SeguimientoCiudadano`:
  - puertos hacia las fachadas de Reportes (`listarDeAutor`, `originalesDe`, `verificarCodigo`) y de Operaciones;
  - DTO separados para el autor y el invitado;
  - cursor opaco;
  - institución y actuaciones como pendientes.

  Verificar con Jest unitario las claves exactas de cada DTO (sin descripción, punto, distrito, teléfono ni respuestas sanitarias en la vista del invitado) y el código y el cursor.
- [x] 6.2 Añadir las rutas `GET /ciudadano/incidentes`, `GET /ciudadano/incidentes/{referencia}` y `POST /publico/seguimiento` según el design §7, con los límites `seguimiento_ref` y `seguimiento_ip`, y documentarlas en OpenAPI. Verificar con integración y contrato:
  - solo lo propio, con dos cuentas;
  - un incidente ajeno, de invitado o inexistente → el mismo 404;
  - la paginación no repite ni omite;
  - una referencia inexistente, un código incorrecto y el código rotado → el mismo 404;
  - un incidente de cuenta consultado por código → 404;
  - el intento 11 sobre una referencia → 429 aunque el código sea correcto;
  - el código en la query → 400;
  - `no-store` en todas las respuestas;
  - EQ-04: tabla de accesos no autorizados con el 100 % rechazado.

## 7. Flutter: reporte

- [x] 7.1 Añadir `geolocator`, `flutter_map`, `latlong2` y `uuid`, `TILE_URL` en `config/entorno.dart` y los permisos de ubicación en el manifiesto de Android. Verificar con `flutter pub get`, `flutter analyze` y la inspección del manifiesto fusionado: solo `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, la consulta `tel` y nada de ubicación en segundo plano.
- [x] 7.2 Implementar en datos `UbicacionPuerto`, `IncidentesRepositorio` (Idempotency-Key, traducción de 400, 409 y 429, y resultado incierto) y `ConsultasGuardadas`. Verificar con `flutter_test` y dobles HTTP:
  - un timeout o un 5xx → incierto;
  - un 400 se asigna a errores de campo;
  - un 429 incluye su Retry-After;
  - las consultas guardadas se escriben y borran en el almacenamiento seguro.
- [x] 7.3 Implementar `ReporteControlador` y `ReportePantalla`, reproduciendo `report.dart` con los componentes y tokens de DESIGN.md:
  - categoría sin preselección y «Ahora» marcado por defecto;
  - el rótulo de Otra emergencia;
  - las preguntas por categoría con Sí, No y No sé;
  - el teléfono solo para el invitado, con su explicación;
  - la clave de intento estable entre reintentos y nueva al editar.

  Verificar con `flutter_test` cada escenario del spec `movil/reporte-incidente`, también enviar sin responder las preguntas y cambiar a Robo.
- [x] 7.4 Implementar `SelectorPuntoPantalla`: GPS solo al pulsar, el motivo al denegar y la alternativa manual, el punto manual confirmado, la atribución visible y el respaldo de polígonos de `/publico/territorio/limites` si fallan las teselas. Verificar con `flutter_test` y dobles: permiso denegado o servicio apagado, que no se pide permiso al abrir, que no se envía sin punto y que las teselas fallidas dejan ver los polígonos.
- [x] 7.5 Implementar `ComprobantePantalla`: código visible una vez con su advertencia y guardado seguro para el invitado, y acceso a Mis reportes con cuenta. Verificar con `flutter_test`. Ejecutar además las capturas del driver de P2 a 360 dp y al 200 % del formulario, el selector y el comprobante frente a `report.dart` del origen. Registrar en el informe las diferencias observadas, sin declarar una fidelidad no comprobada.

## 8. Flutter: seguimiento y navegación

- [x] 8.1 Implementar `MisReportesPantalla` (lista con cursor, detalle, estados vacío y error, institución pendiente) y `ConsultarCodigoPantalla` (consultas guardadas, 404 genérico, 429 con espera, olvidar una consulta). Verificar con `flutter_test` los escenarios del spec `movil/seguimiento-incidentes`.
- [x] 8.2 Actualizar la navegación:
  - Inicio, con la acción habilitada, los últimos tres reportes con cuenta y «Consultar con código» sin cuenta;
  - Reportar y Mis reportes operativos, con Mapa y Alertas aún pendientes;
  - «Consultar con código» en el Drawer público;
  - las consultas guardadas se conservan al cerrar sesión.

  Verificar actualizando `navegacion_perfil_test.dart` y las pruebas de Inicio con los escenarios MODIFIED, ADDED y REMOVED del spec `movil/navegacion-ciudadana`.

## 9. Documentación y aceptación integrada

- [x] 9.1 Actualizar ADR-009 en `docs/01-analisis-del-sistema/07-desiciones-aquitectonicas.md`: Flutter usa `flutter_map` por decisión del 26/11/2026 y el proveedor de teselas queda pendiente de validar en P7. Verificar con `git diff` que la decisión web no cambia.
- [x] 9.2 Ejecutar en la API typecheck, `test:tipos`, build, `arquitectura:verificar`, `contrato:validar` y `test:cobertura` sobre una BD `_test` aislada. Ejecutar en Flutter `flutter analyze` y `flutter test`. Guardar el resumen de cobertura en `docs/validacion/p4/` y registrar los comandos, las versiones, los resultados y los fallos encontrados.
- [x] 9.3 Recorrer manualmente en un emulador o dispositivo Android contra la API local con cartografía activa:
  - reporte con cuenta por GPS;
  - reporte de invitado con GPS denegado y punto manual;
  - corte de red al enviar y reintento sin duplicar;
  - comprobante y consulta con código;
  - Mis reportes.

  Registrar el resultado y los dispositivos como evidencia de EQ-08 y EQ-11. Este recorrido no sustituye las sesiones de usabilidad con 10 participantes, que siguen pendientes.
- [x] 9.4 Completar en el informe la matriz spec/escenario → RF06/07/09/10/51/55 → HU02/03/04 → EQ-02 parcial/04/07/08/11/14 → prueba → resultado. Indicar lo que queda pendiente: EQ-09 sobre incidentes, EQ-10, EQ-19 y EQ-21 (P4.2), la validación del proveedor de teselas (P7) y la cola entre reinicios de la app.
- [x] 9.5 Ejecutar `openspec validate registro-incidentes --strict`, `git diff --check` y el escaneo de secretos. Si el responsable publica la revisión, enlazar el CI en el informe; si no, dejarlo como pendiente.

## Workflow follow-up

- Antes de aplicar, registrar esta especificación en un commit propio (`docs(openspec): especificar registro-incidentes`), separado de la implementación.
- Tras aceptar esta capacidad, sincronizar y archivar solo por solicitud explícita.
- Después sigue P4.2 `enrutamiento-bandeja-inicial`: registrar el consumidor de enrutamiento sobre `IncidenteRegistrado`, aplicar la matriz con las respuestas de heridos y atención médica, seleccionar sedes por cobertura y competencia, gestionar `ENRUTAMIENTO_PENDIENTE` y la bandeja inicial del operador, y validar EQ-09 sobre incidentes.
