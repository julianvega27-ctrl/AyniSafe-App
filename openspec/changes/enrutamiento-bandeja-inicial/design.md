# Design

## Context

La motivación y el alcance están en `proposal.md`; el comportamiento, en las specs del cambio. La base destino es `e0f6694` (`main`, con P4.1 fusionada en el PR #5 y archivada en el PR #6).

Estado observado:
- **Eventos:**
  - `src/compartido/eventos` tiene `PublicadorEventos.publicar(tx, evento)` y `ConsumidorEventos { nombre, tipos, manejar(evento) }`. `manejar` debe ser idempotente por `evento.id`.
  - `ProcesadorEntregas` materializa de forma perezosa las entregas de cada consumidor, incluidas las de eventos anteriores. Reintenta con espera creciente y recupera los bloqueos al arrancar.
  - En `main.ts` se construye con `[]` consumidores.
- **`IncidenteRegistrado` v1:** su carga solo lleva `{ incidenteId, modalidad }`. El enrutamiento no puede deducir de ella la categoría, el distrito ni las respuestas médicas.
- **Operaciones:** solo tiene `incidentes` (id, referencia, estado y `registrado_en`), con el servicio `crear`, `porReferencia` y `estados`. No tiene router.
- **Reportes:** `envios_incidente` guarda `categoria_id`, `distrito_id` (null si el territorio está pendiente), `estado_territorial`, `motivo_territorial`, `heridos` y `atencion_medica` (`si`/`no`/`no_se`/null), además de la descripción y la ocurrencia. `LecturaEnvios` solo ofrece lecturas del autor y del invitado.
- **Identidad:**
  - `consultarAmbitoOperador(usuarioId)` devuelve la institución, la sede, los distritos, las categorías y `habilitadaAtencion`, o null si el operador o la sede no están activos.
  - El esquema P3 tiene `sedes(activa, habilitada_atencion)`, `coberturas_sede`, `competencias_sede` y `pertenencias_operador`.
  - Los middlewares son `autenticarInstitucional` y `exigirRol`.
  - Las secciones del panel están en `dominio/paneles.ts`.
- **Consultas:**
  - El seguimiento compone Reportes y Operaciones por puertos (`opcionesSeguimiento` en `composicion.ts`).
  - `INSTITUCION_PENDIENTE` es una constante.
  - Ya existe el cursor opaco base64url `[instante, id]`.
- **Web:** `Panel.tsx` y `MarcoInstitucional.tsx` tienen las secciones del rol. La administración de organización (P3.2) es la única sección operativa.
- **Origen `efc1bce`:**
  - `incidents/report.js#newReportRecipients` calcula los destinatarios con SQL MySQL (`ST_Intersects` y `routing_rules`) y crea los avisos dentro de la transacción del reporte.
  - `admin/src/pages/Incidents.jsx` es la bandeja (tabla de reportes con «Actualizar» y filtros). Se reproducen su composición visual y su tabla, sin el formulario telefónico ni los filtros de estado.

## Goals / Non-Goals

**Goals:**
- Que la matriz sea una función pura y versionada, probada con las 16 categorías y las combinaciones de respuestas médicas.
- Que solo Operaciones escriba enrutamiento y participaciones, y que la bandeja pueda filtrarse por ámbito con SQL de su propio módulo, sin consultas cruzadas.
- Probar con PostgreSQL real la idempotencia del consumidor, la concurrencia de designaciones y el aislamiento EQ-09.

**Non-Goals:**
- No se crean tablas de avisos ni de lectura, ni se registran consumidores de `EnrutamientoResuelto` (P8).
- No hay polling en la web: P8 lo introduce con la campana.
- No se registran cambios del estado del incidente ni historial de la principal más allá de las filas de participación, que nunca se borran (P6).
- No se migran reglas desde las tablas `routing_rules` del origen.

## Decisions

### 1. Consumidor en Operaciones con datos por puerto

`operaciones.enrutamiento` vive en `modules/operaciones/aplicacion`. Recibe dos puertos:
- `DatosEnrutamientoPort.de(incidenteId)`: devuelve `{ categoriaId, distritoId|null, motivoTerritorial|null, heridos, atencionMedica }` o null. Lo implementa la fachada de Reportes con un método nuevo, `LecturaEnvios.datosEnrutamiento`.
- `SedesPort`: ofrece `elegibles(institucion, distritoId, categoriaId)` y `designable(sedeId, institucion)`, que implementa la fachada de Identidad.

`composicion.ts` cablea ambos puertos, igual que en el seguimiento. Así no hay importaciones entre módulos y se evita el ciclo Reportes→Operaciones→Reportes.

Alternativa descartada: ampliar la carga de `IncidenteRegistrado` con la categoría, el distrito y las respuestas. Habría que cambiar el evento ya archivado, la carga dejaría de ser mínima (las respuestas médicas son datos sanitarios) y los eventos anteriores seguirían sin esos datos.

Si `datosEnrutamiento` devuelve null (el incidente no existe), se registra un error y la entrega se reintenta hasta quedar fallida. No se inventa un enrutamiento.

### 2. Matriz como dominio puro versionado

`dominio/matriz.ts` exporta `MATRIZ_V1` (id `matriz-09-v1`) y `resolverDestinatarios(categoriaId, heridos, atencionMedica)`. Devuelve `{ version, destinatarios: [{ institucion, papel }], revisionMedicaPendiente }`, con papeles `principal`, `simultanea` y `condicionada`. La deduplicación conserva el papel de mayor rango (principal > simultánea > condicionada). Las reglas condicionales de RF57 se codifican como funciones de las tres respuestas, no como datos libres.

Una prueba de tabla recorre las 16 categorías por `CATEGORIAS_PILOTO` y falla si aparece una categoría sin regla. Si una categoría nueva no tiene regla, el enrutamiento falla y se reintenta: no aplica una regla por defecto silenciosa.

Alternativa descartada: una tabla de reglas en la BD. Necesitaría la sección «Reglas» del administrador, que no está en el alcance, y una versión guardada en código y referida en cada enrutamiento cumple «reglas versionadas» del documento 09 §5.2 para esta fase. Cuando exista la administración de reglas, una migración podrá materializar `matriz-09-v1` como su primera versión.

### 3. Esquema de Operaciones

Una migración nueva crea dos tablas:

- **`enrutamientos_incidente`:**
  - `incidente_id uuid PK FK incidentes` y `evento_id uuid UNIQUE`.
  - `version_regla text`, `categoria_id text` y `distrito_id text NULL`.
  - `resultado text CHECK IN ('ENRUTADO','ENRUTAMIENTO_PENDIENTE')` y `revision_medica_pendiente boolean`.
  - `faltantes jsonb`: lista de `{institucion, papel, motivo: 'sin_distrito'|'sin_sede_elegible'}`, validada en el dominio.
  - `registrado_en timestamptz` (copia del instante del incidente, para ordenar) y `creado_en`/`actualizado_en`.
  - Índice parcial `(registrado_en, incidente_id) WHERE resultado = 'ENRUTAMIENTO_PENDIENTE'`.
- **`participaciones_incidente`:**
  - `id uuid PK`, `incidente_id FK` y `sede_id uuid FK sedes`.
  - `institucion text CHECK IN ('pnp','bomberos','samu','serenazgo')`.
  - `papel text CHECK IN ('principal','simultanea','condicionada')` y `origen text CHECK IN ('regla','designacion','reevaluacion')`.
  - `designado_por uuid NULL FK usuarios`, `motivo text NULL` y `creado_en`.
  - `UNIQUE (incidente_id, sede_id)`, más un índice `(sede_id, incidente_id)` para la bandeja.
  - `CHECK (origen <> 'designacion' OR (designado_por IS NOT NULL AND motivo IS NOT NULL))`.

Guardar `categoria_id`, `distrito_id` y `registrado_en` en el enrutamiento es registrar las condiciones de la regla («guardar la regla, sus condiciones y los destinatarios», documento 09 §5.2). No es una segunda fuente del estado operativo, y permite filtrar y ordenar la bandeja en una sola consulta del módulo. P6 recalculará estos datos al reclasificar (RF40).

Las FK a `sedes` y `usuarios` siguen el precedente de P3.2/P4.1: hay integridad en la BD, y el código cruza módulos solo por fachadas.

### 4. Idempotencia y transacción del consumidor

`manejar(evento)` hace lo siguiente:
1. Lee los datos de Reportes y las sedes elegibles fuera de la transacción, porque son lecturas.
2. En una transacción ejecuta `INSERT enrutamientos_incidente ... ON CONFLICT (incidente_id) DO NOTHING`. Si no inserta, termina: ya está enrutado, y la entrega repetida no tiene efectos.
3. Si inserta, crea las participaciones con `ON CONFLICT DO NOTHING` y publica `EnrutamientoResuelto { incidenteId, resultado, origen: 'regla' }` con `PublicadorEventos` en la misma transacción.

Así una entrega repetida no duplica el evento resuelto. Una configuración que cambie entre la lectura y la escritura se acepta: es la foto del instante de enrutar, y la reevaluación cubre los faltantes.

### 5. Designación y reevaluación con bloqueo por incidente

Las dos operaciones son casos de uso de Operaciones con rutas del administrador:
- `POST /admin/enrutamientos-pendientes/{incidenteId}/designaciones` con `{ institucion, sedeId, motivo }`.
- `POST /admin/enrutamientos-pendientes/{incidenteId}/reevaluar`.

Ambas siguen los mismos pasos:
1. En una transacción, `SELECT ... FOR UPDATE` del enrutamiento.
2. Validar que el faltante existe. Si no, 409 `FALTANTE_INEXISTENTE`.
3. En la designación, validar la sede con `SedesPort.designable` (409 `SEDE_NO_DESIGNABLE` con los requisitos incumplidos). En la reevaluación, consultar las elegibles.
4. Insertar las participaciones, recalcular `faltantes` y `resultado` y publicar `EnrutamientoResuelto`.

El bloqueo de fila serializa a dos administradores: el segundo ya no encuentra el faltante y recibe 409. Un faltante `sin_distrito` no se reevalúa por sede: solo se resuelve por designación, porque P4.2 no corrige el territorio. Sin distrito, cada institución de la matriz es un faltante `sin_distrito`, y cada designación resuelve solo el suyo.

Las rutas de Operaciones se montan con `autenticarInstitucional` y `exigirRol('administrador')`, inyectados desde Identidad como `RequestHandler`, como ya hacen Reportes y Consultas. El motivo se valida con 10 a 500 caracteres y nunca se copia a los logs.

### 6. Bandeja y resumen en Consultas

Consultas compone tres fuentes:
- Identidad: `consultarAmbitoOperador`.
- Operaciones: un método nuevo de la fachada, `bandeja(ambito, cursor, limite)`, y `participacionDe(ambito, incidenteId)`.
- Reportes: `LecturaEnvios.resumenOperativo(ids)`, que devuelve la descripción, la ocurrencia, el territorio y las respuestas, sin teléfono, coordenadas ni huellas.

Operaciones aplica el ámbito en SQL:

```sql
FROM participaciones_incidente p
JOIN enrutamientos_incidente e USING (incidente_id)
JOIN incidentes i ON i.id = p.incidente_id
WHERE p.sede_id = $sede
  AND (p.origen = 'designacion'
       OR (e.distrito_id = ANY($distritos) AND e.categoria_id = ANY($categorias)))
  AND (e.registrado_en, e.incidente_id) > ($cursor)
ORDER BY e.registrado_en, e.incidente_id
LIMIT $limite + 1
```

Si el ámbito es null o `habilitadaAtencion` es falso, se responde 403. La consulta del ámbito ya excluye operadores y sedes suspendidos.

Rutas:
- `GET /operador/incidentes?cursor=` devuelve 50 filas por página.
- `GET /operador/incidentes/{id}` devuelve 404 uniforme. Un identificador malformado también da 404, no 400, para no distinguir.

Las vistas se construyen con listas cerradas de campos, y las pruebas enumeran sus claves, como en el seguimiento de P4.1. La etiqueta de prioridad es la constante `SIN_EVALUAR` mientras no exista P6.

Alternativa descartada: poner la bandeja en Operaciones. El documento 09 §6 asigna a Consultas «bandejas por ámbito», y Consultas ya compone vistas desde varios módulos. Operaciones solo expone la consulta filtrada de sus propias tablas.

### 7. Lista de pendientes

`GET /admin/enrutamientos-pendientes?cursor=` pertenece a Operaciones y usa el índice parcial. Se enriquece en el router con el nombre de la categoría y el distrito de la fila. El motivo territorial se toma del puerto de Reportes y no incluye la descripción. La web obtiene las sedes candidatas de la lista existente de sedes de P3.2, filtradas por institución y habilitación. La API vuelve a validar la sede al designar.

### 8. Seguimiento ciudadano

`opcionesSeguimiento` recibe un puerto nuevo, `responsables(ids) → Map<id, {institucion, nombre}>`. Lo implementa Operaciones como la principal con participación y toma el nombre de la institución de Identidad. Si no hay principal, se mantiene `INSTITUCION_PENDIENTE`. La forma del DTO pasa de `{estado:'pendiente'}` a `{estado:'pendiente'} | {estado:'asignada', institucion:{id, nombre}}`. Es un cambio aditivo en OpenAPI, y Flutter trata los estados desconocidos como pendientes. Nunca se incluyen la sede ni los operadores.

### 9. Panel web

`paneles.ts` marca como disponibles `incidentes` (operador) e `inicio` (administrador). Las rutas nuevas son:
- `/panel/incidentes` y `/panel/incidentes/:id` (operador).
- El bloque «Enrutamiento pendiente» dentro de `/panel` del administrador.

Se reproduce la tabla y el `page-intro` de `Incidents.jsx` del origen con los componentes y tokens existentes (`Estructura`, `Mensaje`, `Boton` y `Campo`), sin el formulario telefónico ni los filtros. La designación usa un diálogo con un selector de sede y un motivo. El envío se bloquea mientras está en curso. «Actualizar» vuelve a pedir la primera página; no hay intervalos.

## Risks / Trade-offs

- [La matriz en código no es editable por el administrador] → Se declara así en la evidencia, y la sección «Reglas» sigue como no disponible. La versión queda guardada por enrutamiento para migrarla después.
- [Foto de la configuración al enrutar: una sede habilitada después no recibe casos ya enrutados] → El administrador reevalúa los pendientes. Los casos ya enrutados con todas sus instituciones no se recalculan hasta P6/RF40.
- [Copia de la categoría y el distrito en Operaciones] → Son las condiciones de la regla con su versión, no una edición de originales. P6 las actualiza con auditoría al reclasificar, y una prueba compara el enrutamiento con los originales recién creados.
- [Revisión médica pendiente sin flujo de resolución] → Se muestra como «Condición médica por confirmar» en la bandeja y el resumen. Su resolución llega con la evaluación SAMU (P5) y la atención (P6). EQ-21 queda parcial.
- [Sin avisos, un operador solo ve los casos nuevos si abre o actualiza la bandeja] → Es una limitación declarada hasta P8. EQ-10 se reporta como parcial y no se presenta como avisos en tiempo real.
- [Las FK a `sedes` desde Operaciones acoplan el esquema] → Es el mismo criterio que en P3.2/P4.1, y el verificador de arquitectura cubre el código.

## Migration Plan

1. Aplicar la migración aditiva de las dos tablas e índices. No toca tablas existentes.
2. Desplegar la API con el consumidor registrado. Al arrancar, el `ProcesadorEntregas` crea las entregas de `operaciones.enrutamiento` para todos los `IncidenteRegistrado` existentes y los enruta.
3. Desplegar la web y la app.

Para revertir, se retira el consumidor de `main.ts` y se oculta la sección: las entregas quedan pendientes, sin efectos. Las tablas pueden conservarse, porque nadie más las lee.

## Open Questions

- El nombre visible de la institución en el seguimiento sale de `instituciones.nombre`. Si el equipo prefiere siglas, es un cambio de presentación que no afecta a las specs.
