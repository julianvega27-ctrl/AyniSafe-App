# Proposal

## Why

P3 dejó listos el catálogo territorial, las 16 categorías y la organización institucional (PR #2–#4, CI aprobado en `main` `039e9f4`). Aun así, ningún ciudadano puede informar un hecho: en la app, «Reportar» y «Mis reportes» siguen como destinos pendientes. P4 es la primera capacidad del núcleo del producto (RF06/07/09/10, HU02–HU04). Antes de diseñar el esquema hay que fijar a qué módulo pertenece cada dato y cómo se crea en una transacción el incidente único.

P4 se divide en dos cambios, por decisión del 26/11/2026:
- **P4.1 (este cambio):** registro y seguimiento ciudadano.
- **P4.2 `enrutamiento-bandeja-inicial`:** enrutamiento por matriz y sedes, y bandeja inicial del panel.

P4.1 deja persistidos el evento y sus entregas para que P4.2 las consuma sin tocar el registro.

## What Changes

- **Envío como invitado o con cuenta** desde la app (`POST /incidentes`):
  - Datos del envío: categoría activa, descripción, momento de ocurrencia («Ahora» o «Antes») y punto obligatorio (GPS autorizado o selección manual).
  - Con cuenta, el autor sale de la sesión y no se pide teléfono.
  - Como invitado, el teléfono de contacto es obligatorio y no se inventa una identidad.
  - «Otra emergencia» exige una descripción concreta.
- **Respuestas que deciden si interviene SAMU (RF57):** «¿Hay heridos?» (accidente de tránsito, agresión, pelea y violencia) y «¿Se necesita atención médica?» (accidente de tránsito), con Sí/No/No sé. Se guardan como datos originales. La evaluación rápida completa (cantidad de heridos, persona principal y permisos SAMU) corresponde a P5.
- **Incidente único:** cada envío confirmado crea un incidente en estado REGISTRADO, con identificador interno, referencia pública no secuencial y modalidad. Los originales se guardan una sola vez y no hay entidad Reporte con ciclo propio. Operaciones es dueña del incidente y su estado; Reportes es dueña de los originales.
- **Clasificación territorial en el backend:** con el resolvedor de Consultas, en la misma transacción. Se guardan la versión evaluada y el distrito, o el distrito pendiente con su motivo. Si no hay cartografía activa, el incidente se registra igual con el distrito pendiente; el punto nunca se descarta.
- **Idempotencia:** la cabecera `Idempotency-Key` es obligatoria. Repetir el envío con el mismo contenido devuelve el mismo incidente sin duplicarlo; reutilizar la clave con otro contenido responde 409. Dos envíos simultáneos con la misma clave crean un solo incidente.
- **Comprobante:** contiene referencia, estado, recepción, modalidad y distrito o motivo pendiente.
- **Código secreto (solo invitado):**
  - Distinto de la referencia pública y mostrado una única vez.
  - El servidor guarda solo su huella.
  - Repetir el envío emite un código nuevo que reemplaza al anterior.
- **Evento `IncidenteRegistrado` y sus entregas (ADR-004):** el evento se guarda en la misma transacción que el incidente, y cada consumidor tiene una entrega persistida con reintentos y espera creciente. La entrega se reanuda al reiniciar la API (EQ-14) y no se duplica si ya terminó. En P4.1 no hay consumidores de negocio registrados: el mecanismo se prueba con un consumidor de prueba y P4.2 registra el enrutamiento.
- **Seguimiento ciudadano:**
  - Con cuenta, el ciudadano lista y consulta solo sus incidentes.
  - Como invitado, consulta estado y resumen ciudadano enviando referencia y código en el cuerpo de la petición. Hay límites de intentos y la respuesta es la misma para «no existe» y «código incorrecto».
  - La institución responsable y las actuaciones aparecen como pendientes mientras P4.2/P6 no existan; no se inventan.
- **Flutter:**
  - Se reproduce el formulario `report.dart` del origen sin fotos ni evaluación SAMU completa.
  - Ubicación con `geolocator` solo tras conceder el permiso.
  - Selector manual con `flutter_map`; la URL de teselas es configurable y, si las teselas fallan, se dibujan los límites distritales.
  - Si la conexión falla, se reintenta con la misma clave y el formulario se conserva.
  - Se muestra el comprobante y el código se guarda en el almacenamiento seguro del dispositivo.
  - Se añaden «Mis reportes» (con cuenta) y «Consultar con código» (invitado).
  - Inicio habilita «Reportar un incidente».
- **ADR-009:** se registra que Flutter usa `flutter_map` del origen en lugar de MapLibre (decisión del 26/11/2026). La validación del proveedor de teselas sigue pendiente para P7.
- **Procedencia del origen** (`efc1bce8`): se adaptan `incidents/report.js`, `incidents/router.js` (`createIncidentsRouter`), `incidents/queries.js` (`listMine`), `mobile/lib/screens/report.dart`, `mobile/lib/screens/mine.dart` y `mobile/lib/core/pending.dart`. **No** se adaptan:
  - el reporte telefónico ni el router `phone`;
  - las subcategorías;
  - los avisos dentro de la transacción;
  - el alcance de idempotencia por hash de IP;
  - el token de evidencias de invitado;
  - las columnas booleanas sanitarias.

**Fuera de alcance:** enrutamiento, principal, sedes y `ENRUTAMIENTO_PENDIENTE` (P4.2); bandeja del panel (P4.2); fotos y evaluación SAMU completa (P5); transiciones EN_REVISION, EN_ATENCION y CERRADO, «Asumir caso» y prioridad (P6); mapa público (P7); avisos y push (P8); conservación y borrado por plazos (P9). Tampoco hay cola persistente de envíos entre reinicios de la app.

## Capabilities

### New Capabilities

- `reportes/registro-incidentes`: envío invitado/cuenta, validación de originales, respuestas para SAMU, punto con clasificación territorial, idempotencia, comprobante y emisión del código secreto.
- `operaciones/incidentes`: el incidente único, su referencia pública y el estado inicial REGISTRADO, creado mediante el contrato transaccional que coordina Reportes.
- `plataforma/eventos-asincronos`: evento persistido en la transacción del hecho, entregas por consumidor, reintentos, recuperación tras reinicio y ausencia de efectos duplicados.
- `consultas/seguimiento-ciudadano`: historial privado del autor con cuenta y vista limitada del invitado mediante código secreto, con límites de intentos.
- `movil/reporte-incidente`: formulario de reporte en Flutter, ubicación con permiso, selector manual, reintento con resultado incierto y comprobante.
- `movil/seguimiento-incidentes`: «Mis reportes» con cuenta y consulta con código del invitado en la app.

### Modified Capabilities

- `movil/navegacion-ciudadana`:
  - Inicio habilita «Reportar un incidente».
  - Reportar y Mis reportes dejan de ser destinos pendientes.
  - Se admite el permiso de ubicación solicitado desde el formulario.
  - El envío y el seguimiento del invitado pasan a estar disponibles. Mapa y Alertas siguen pendientes.

## Impact

- **API:**
  - Reportes amplía su dominio, aplicación, presentación e infraestructura.
  - Se crea el módulo Operaciones con solo el incidente y su estado inicial.
  - Consultas suma el seguimiento, que lee mediante puertos inyectados.
  - Se añade un componente compartido de eventos en `src/compartido`.
  - Se actualizan la composición en `main.ts`, una migración aditiva (tablas de incidentes, originales, idempotencia, eventos y entregas), OpenAPI, Jest con PostgreSQL y `verificar-arquitectura` sin infracciones.
- **Flutter:** nuevas dependencias `geolocator`, `flutter_map`, `latlong2` y `uuid`; permiso de ubicación en Android; pantallas, repositorios y pruebas `flutter_test`.
- **Web y DESIGN.md:** sin cambios.
- **Documentación:** ADR-009 se actualiza en `docs/01-analisis-del-sistema/07-desiciones-aquitectonicas.md`.
- **Trazabilidad:** RF06/07/09/10/51 (teléfono del invitado) y RF55 (descripción de «Otra emergencia»), y la captura de los datos de RF57 → HU02/HU03/HU04 → EQ-02 (sin esperar avisos), EQ-04 (seguimiento ajeno rechazado), EQ-07/EQ-14 (entregas recuperables), EQ-08 (permiso y reconexión) y EQ-11 (punto manual, frontera y sin punto).
- **Pendiente para P4.2/P6:** EQ-09 sobre incidentes; EQ-10, EQ-19 y EQ-21 requieren el enrutamiento.
- **Estado:** propuesta, cero tareas implementadas. No implica commit, despliegue ni archivado automático.
