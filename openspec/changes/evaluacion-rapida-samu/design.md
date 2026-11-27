# Design

## Context

Motivación y alcance en `proposal.md`. Estado de partida (`main` `24a33f6`):

- **Reportes.** `envios_incidente` guarda los originales: `heridos` y `atencion_medica` con valores `si`/`no`/`no_se` o null. Las preguntas se admiten en `CATEGORIAS_HERIDOS` (accidente, agresión, pelea, violencia) y `CATEGORIAS_ATENCION_MEDICA` (accidente). El registro crea el incidente mediante `IncidentesPort` (Operaciones) dentro de una `UnidadDeTrabajo`. La huella de idempotencia sale de `contenidoCanonico`.
- **Operaciones.** `ServicioEnrutamiento` consume `IncidenteRegistrado` y lee heridos y atención mediante `DatosEnrutamientoPort` (fachada de Reportes). Aplica `resolverDestinatarios` (`matriz-09-v1`) y guarda `enrutamientos_incidente` (con `revision_medica_pendiente` y `faltantes`) y `participaciones_incidente` (`papel`, `origen` ∈ regla/designacion/reevaluacion). `designar` y `reevaluar` bloquean la fila con `FOR UPDATE`.
- **Consultas.** `BandejaInstitucional` compone el ámbito (Identidad), las participaciones (Operaciones) y los originales (Reportes). Las rutas de seguimiento sirven el detalle del autor por referencia.
- **Límites.** Ningún módulo lee tablas de otro. Los puertos se cablean en `composicion.ts` y el verificador de arquitectura prohíbe importaciones cruzadas y ciclos.
- **Origen.** `012_medical_triage.sql`, `report.dart#triageBlock` e `IncidentTriage.jsx` (donante `efc1bce`) solo sirven de referencia de composición. Usan tres booleanos donde «No sé» es null, «Personas afectadas» con un desplegable y un campo de texto, sin versiones ni permisos. No se reutiliza su esquema.

## Goals / Non-Goals

**Goals:**
- Una sola secuencia de versiones por incidente, sin huecos, con instantáneas completas y sin pérdidas ante aclaraciones concurrentes.
- Versión, recálculo del enrutamiento, auditoría y eventos en una única transacción.
- Todo dato sanitario guardado en un solo módulo, para que la conservación de P9 se aplique en un solo lugar.
- El enrutamiento inicial nunca usa una condición obsoleta cuando una aclaración llega antes.

**Non-Goals:**
- Reglas administrables o una nueva versión de la matriz: se sigue con `matriz-09-v1`.
- Retirar participaciones o rebajar a SAMU (P6).
- Consumidores de `EvaluacionActualizada` (P8).
- Purga por plazos (P9).
- Cifrado a nivel de columna: los datos se protegen por permisos de aplicación y por la base, igual que los demás originales.

## Decisions

### 1. Reportes es dueño de toda la evaluación, también de las aclaraciones del operador

El documento 09 dice que «Reportes conserva la evaluación ciudadana; Operaciones conserva aclaraciones del operador SAMU mediante contratos públicos». Se interpreta así:
- Operaciones **decide y autoriza** la aclaración del operador y conserva su efecto operativo (recálculo y auditoría sin datos sanitarios).
- Los **datos** sanitarios de toda versión, incluido el motivo del operador, que puede contener información clínica, se guardan en Reportes mediante su contrato.

Alternativa descartada: una tabla de aclaraciones en Operaciones y otra de versiones ciudadanas en Reportes. Exigiría numerar versiones entre dos módulos, leer tablas ajenas para reconstruir la instantánea vigente y purgar datos sanitarios en dos lugares. La interpretación se registra en la evidencia para que el responsable pueda revisarla.

### 2. Esquema

La migración `20261128100000_evaluacion_rapida` es aditiva.

- **`evaluaciones_incidente`** (Reportes). Clave `incidente_id`. Columnas:
  - `version_vigente`;
  - la instantánea vigente: `heridos`, `atencion_medica`, `cantidad_heridos smallint`, `signos_vida`, `consciente`, `sangrado`;
  - `samu_requerido boolean`, que es monótono;
  - `actualizada_en`.

  Restricciones CHECK:
  - valores cerrados en cada respuesta;
  - `cantidad_heridos` entre 1 y 999 y solo con `heridos = 'si'`;
  - `atencion_medica` solo en la categoría accidente, mediante el envío; se valida en dominio porque la categoría está en `envios_incidente`.

  Con `heridos = 'si'`, una cantidad null significa `no_se`.
- **`versiones_evaluacion`** (Reportes). Clave (`incidente_id`, `version`). Contiene la misma instantánea, más:
  - `origen` ∈ ciudadano/operador;
  - `actor_usuario_id` (null para la versión 1 de un invitado);
  - `institucion` (obligatoria solo si el origen es operador);
  - `campos_modificados text[]`;
  - `motivo` (obligatorio solo si el origen es operador, de 10 a 500 caracteres);
  - `creada_en`.

  Sin UPDATE ni DELETE desde la aplicación.
- **`accesos_evaluacion`** (Reportes). Contiene `id`, `incidente_id`, `usuario_id`, `version` y `accedido_en`, sin contenido. Reportes lo escribe porque es quien entrega el detalle (decisión 6).
- **`cambios_enrutamiento`** (Operaciones). Contiene:
  - `id`, `incidente_id`, `version_evaluacion`, `origen` ('condicion_medica');
  - `actor_tipo` ∈ ciudadano/operador y `actor_usuario_id`;
  - `antes jsonb` y `despues jsonb`, con `{destinatarios:[{institucion,papel}], revisionMedicaPendiente, resultado}`;
  - `creado_en`.
- **`participaciones_incidente`.** El CHECK de `origen` admite `condicion_medica`, y se añade `actualizado_en`. `papel` pasa a ser actualizable solo desde el recálculo (decisión 4). Las filas siguen sin borrarse.
- **Carga inicial.** Para cada `envios_incidente` de las cinco categorías se crea la cabecera y la versión 1 (`origen = ciudadano`, actor = autor, `creada_en = recibido_en`). `samu_requerido` se calcula con la regla de la decisión 3. Una emergencia médica anterior queda con heridos null.

### 3. Dominio de la evaluación

`modules/reportes/dominio/evaluacion.ts` es puro y contiene:
- tipos y valores cerrados;
- `samuRequerido(categoria, heridos, atencion)`: emergencia médica siempre; accidente con `si` en cualquiera de las dos preguntas; agresión, pelea o violencia con heridos `si`. Coincide con la matriz y una prueba de tabla compara ambas para las 16 categorías × respuestas;
- `validarEvaluacionEnvio`;
- `aplicarCambios(vigente, cambios, origen, institucion)`.

Semántica de las aclaraciones:
- **Parcial.** Solo cambian los campos presentes. No se admite null: una respuesta no se puede «desresponder».
- **Cantidad.** Si el resultado deja heridos distinto de `si`, la cantidad anterior se elimina y figura en `campos_modificados`. Es una consecuencia registrada, no una corrección silenciosa. Si la petición trae una cantidad con heridos distinto de `si`, se responde 400.
- **Observaciones.** La persona principal se admite si `samuRequerido(resultado)` o si `samu_requerido` ya era verdadero. Así, una corrección negativa no impide a SAMU seguir informando.
- **Campos por institución.** Para un operador que no es SAMU, solo `heridos`, `atencionMedica` y `cantidadHeridos`.
- **Sin cambios.** Si la instantánea resultante es igual a la vigente, el resultado es «sin cambios».

`contenidoCanonico` añade la evaluación solo cuando viene en el cuerpo, como un elemento final del arreglo. Los envíos sin evaluación conservan la huella exacta de P4.

### 4. Recálculo en Operaciones: `aplicarCondicionMedica(tx, ...)`

Operaciones lo expone como puerto `CondicionMedicaPort`, que Reportes recibe por composición.
1. Bloquea `enrutamientos_incidente` (`FOR UPDATE`). Si no existe, termina sin hacer nada (decisión 5).
2. Resuelve los destinatarios con `version_regla` guardada. Una versión desconocida produce un error y revierte la aclaración (503).
3. Compara el objetivo con las participaciones y faltantes actuales:
   - **Institución nueva, sin participación ni faltante:** busca sedes elegibles vigentes (`SedesEnrutamientoPort.elegibles`) e inserta participaciones con `origen = condicion_medica`. Sin sedes, añade un faltante `sin_sede_elegible`; sin distrito, `sin_distrito`.
   - **Institución presente con otro papel en el objetivo:** adopta el papel objetivo en sus participaciones y faltantes, salvo SAMU, que nunca baja de rango. El único descenso posible es PNP de principal a simultánea en un accidente.
   - **Institución presente que no está en el objetivo:** conserva su papel.
4. Actualiza `revision_medica_pendiente` y el resultado (`resultadoDe(faltantes)`).
5. Si cambió algo, inserta `cambios_enrutamiento` y publica `EnrutamientoResuelto{origen: condicion_medica}`. Si no, no escribe nada.

La invariante «una sola principal por incidente» se comprueba en una prueba de integración tras cada recálculo.

### 5. Transacción y orden de bloqueos

Un único servicio de aplicación en Reportes, `AclararEvaluacion.ejecutar({incidenteId, origen, actor, institucion, cambios, motivo})`, abre la transacción y sigue este orden:
1. bloquea `evaluaciones_incidente`;
2. aplica los cambios y, si no hay cambios, devuelve la vigente;
3. inserta la versión y actualiza la cabecera;
4. publica `EvaluacionActualizada{incidenteId, version, origen}`;
5. llama a `CondicionMedicaPort.aplicar(tx, …)`, que bloquea el enrutamiento.

El orden de bloqueos es siempre **evaluación → enrutamiento**.

Para el enrutamiento inicial, el consumidor obtiene dentro de su transacción la condición con `DatosEnrutamientoPort.condicionBloqueada(tx, id)`, que bloquea la cabecera de evaluación. Después resuelve el plan e inserta. Las sedes elegibles se leen antes; si la condición leída bajo bloqueo difiere de la usada para planificar, se replanifica dentro de la misma transacción. Una aclaración concurrente espera al consumidor y su recálculo ve el enrutamiento ya insertado, o el consumidor ve la versión ya confirmada. Ninguna de las dos se pierde. Los incidentes sin evaluación no se bloquean.

`designar` y `reevaluar` solo bloquean el enrutamiento, así que no invierten el orden.

### 6. Rutas y autorización

- **`POST /incidentes`.** Admite `evaluacion: {cantidadHeridos?: 1..999 | 'no_se', personaPrincipal?: {signosVida?, consciente?, sangrado?}}`. La versión 1 se escribe en la transacción del registro mediante el repositorio de evaluación de Reportes.
- **`POST /ciudadano/incidentes/{referencia}/evaluacion`** (Reportes, sesión de cuenta). Resuelve la referencia del autor y devuelve 404 uniforme si no es suya. Comprueba el estado con la fachada de Operaciones (cerrado → 409 `EVALUACION_CERRADA`). Llama a `AclararEvaluacion` con origen ciudadano y responde 200 con la vista del autor. Para un incidente sin evaluación, 404.
- **`POST /operador/incidentes/{id}/evaluacion`** (Operaciones, cookie institucional con verificación de origen como en P4.2). Pasos:
  1. obtiene el ámbito con Identidad;
  2. comprueba con `participacionDe` del repositorio, que ahora devuelve también la `institucion` de la sede (sin ella, 404);
  3. valida el motivo;
  4. llama a la fachada de Reportes `aclararEvaluacion` con origen operador y la institución.

  Responde 200 con `{version, condicionMedica, samuIncorporado}`, donde `samuIncorporado` es verdadero si el recálculo añadió a SAMU. La comprobación de participación queda fuera de la transacción: las participaciones no se borran y un cambio de ámbito en ese intervalo es despreciable. Se documenta como riesgo.
- **`GET /operador/incidentes/{id}/evaluacion`** (Consultas). Comprueba ámbito y participación con institución `samu` (si no, 404). Después llama a Reportes `detalleSanitario(id, usuarioId)`, que lee la cabecera y las versiones e inserta en `accesos_evaluacion` en una misma transacción.
- **`GET /operador/incidentes/{id}`.** Añade `condicionMedica {heridos, atencionMedica, cantidadHeridos, revisionPendiente, origen, institucion, informadaEn, version, observacionesInformadas}` y `accesoSanitario`.
- **`GET /ciudadano/incidentes/{referencia}`.** Añade `evaluacion {respuestas propias de la última versión de origen ciudadano, informadaEn, puedeAclarar, solicitudCompletar}`. `solicitudCompletar` vale `samu_requerido` y las tres observaciones vigentes sin respuesta.

Todas las respuestas usan `Cache-Control: no-store`. Los logs incluyen ruta, estado, incidente y versión, nunca el cuerpo.

### 7. Flutter

- **Componente compartido.** `presentacion/componentes/bloque_evaluacion.dart`:
  - la tarjeta con el título «Evaluación rápida para SAMU», la nota de persona principal y la de «información pendiente»;
  - las tres preguntas con el `SegmentedButton` de `_Pregunta`, extraído a un componente;
  - el selector de cantidad: botones 1–5, «Otra cantidad» con − y + (de 6 a 999) y «No sé», sin `TextField`.
- **Composición.** Toma la tarjeta y el subtítulo de `triageBlock` del origen. Los desplegables y el campo numérico se sustituyen por botones porque RF44 lo exige.
- **Controlador del formulario.** `ReporteControlador` guarda el estado de la evaluación aunque el bloque se oculte, y solo lo serializa si `samuInterviene` (réplica en Dart de la regla, con la misma tabla de pruebas que la API). Emergencia médica entra en las categorías con heridos.
- **Mis reportes.** El detalle muestra la evaluación propia y la acción. La pantalla `AclararEvaluacionPantalla` reutiliza el bloque precargado y calcula el diff para enviar solo los cambios.

### 8. Web

`ResumenIncidenteVista` (Bandeja.tsx) gana:
- **Bloque «Condición médica».** Muestra la respuesta original del ciudadano y la condición vigente, con su origen, institución e instante.
- **Diálogo «Precisar condición médica».** Reutiliza el patrón de diálogo del bloque de designación de P4.2.
- **Sección «Evaluación rápida».** Solo si `accesoSanitario`. Toma la composición `kv` de `IncidentTriage.jsx` del origen y añade el historial como `<ol>`.

Los grupos Sí/No/No sé son `fieldset` con radios estilizados mediante las clases de DESIGN.md. Si no existe un componente compartido de grupo de opciones, se crea uno en los componentes compartidos con los tokens existentes, sin estilos locales.

## Risks / Trade-offs

- **[Bloqueo cruzado entre módulos]** → Orden fijo evaluación → enrutamiento, documentado. Una prueba de concurrencia lanza a la vez aclaraciones y la entrega de enrutamiento. Las transacciones de `designar` y `reevaluar` no tocan la evaluación.
- **[Regla de SAMU duplicada en Dart y TypeScript]** → Misma tabla de casos en ambas suites. El servidor sigue siendo la autoridad y responde 400 por campo no aplicable si la app se desvía.
- **[`papel` mutable contradice la idea de que las participaciones son inmutables de P4.2]** → Las filas no se borran. El cambio queda en `cambios_enrutamiento` con antes y después, y la prueba verifica la invariante de una sola principal.
- **[Autorización del operador fuera de la transacción]** → Las participaciones nunca se eliminan. La ventana solo cubre un cambio simultáneo de ámbito o suspensión, y la escritura queda auditada con el actor.
- **[Motivo con datos clínicos]** → Se guarda solo con la versión en Reportes y solo lo ve SAMU. No va a logs, eventos ni a `cambios_enrutamiento`.
- **[Interpretación de la propiedad (decisión 1)]** → Queda registrada en la evidencia para su revisión. Revertirla supondría mover la tabla de versiones de origen operador, sin cambiar los contratos HTTP.
- **[La carga inicial puede marcar `samu_requerido` en datos de prueba antiguos]** → Es coherente con la matriz y no crea participaciones: el enrutamiento existente no se recalcula en la migración.

## Migration Plan

1. Migración aditiva: tablas nuevas, CHECK ampliado, columna `actualizado_en` y carga inicial idempotente con `ON CONFLICT DO NOTHING`. Se prueba en la base de integración y con `prisma migrate deploy` desde cero y desde la base de P4.
2. Despliegue de la API. Los clientes anteriores siguen funcionando: `evaluacion` es opcional, los heridos de emergencia médica son opcionales y los campos nuevos de las respuestas son aditivos.
3. Web y app después. Una app anterior simplemente no envía la evaluación.
4. **Reversión.** Se revierte el código: las tablas nuevas quedan sin uso y el CHECK ampliado es compatible. No hay migración hacia atrás automática. Si hiciera falta, una migración nueva elimina las tablas tras exportarlas, si el responsable lo pide.

## Open Questions

- Validación clínica de las preguntas y sus textos con profesionales SAMU antes del piloto (documento 09). No cambia el contrato.
- Límite superior de 999 heridos: supuesto técnico configurable, revisable sin cambiar el diseño.
