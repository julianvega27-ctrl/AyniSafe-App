# Design

## Context

- `incidentes` (Operaciones) solo tiene `estado` con CHECK de los cuatro valores, siempre REGISTRADO. `ServicioIncidentes` crea y lee; no hay transiciones.
- `participaciones_incidente` guarda una fila por sede participante con `institucion` y `papel` (`principal`, `simultanea`, `condicionada`). Una institución puede participar con varias sedes. P5.1 ya cambia papeles de forma atómica cuando SAMU pasa a principal (`aplicarCondicionMedica`).
- La bandeja (Consultas) compone ámbito de Identidad, participaciones de Operaciones y originales de Reportes mediante puertos cableados en `composicion.ts`. Devuelve `prioridad: 'SIN_EVALUAR'` fijo. El seguimiento devuelve `actuaciones: []`.
- Las mutaciones del operador con cookie siguen el patrón de `evaluacion-operador.routes.ts`: identificación, `origenWebPermitido` (CSRF), JSON UTF-8 de 4 KiB, 404 uniforme fuera de ámbito y 503 genérico.
- El verificador de arquitectura prohíbe imports entre módulos fuera de fachadas y SQL entre módulos.

## Goals / Non-Goals

**Goals:** asignación por institución con unicidad en BD; transiciones con bloqueo de fila y estado esperado; historial atómico (EQ-05) del que se derivan los hitos ciudadanos; reasignación administrativa sin acceso al caso; extensiones B y C en migraciones propias para no dejar columnas sin uso si no se completan.

**Non-Goals:** reapertura, transferencia solicitada por el operador, actuaciones libres, desvincular, notificaciones de actuaciones (P8), publicación (P7), sugerencias de duplicados.

## Decisions

### 1. Modelo de datos (grupo A, migración `20261130100000_atencion_institucional`)

- `incidentes` añade:
  - `verificacion` (`SIN_VERIFICAR` por defecto, `VERIFICADO`, `NO_VERIFICADO`);
  - `resultado` (`ATENDIDO`, `DESCARTADO`, nulo);
  - `resumen_ciudadano` y `cerrado_en`.
  - CHECK `(estado = 'CERRADO') = (resultado IS NOT NULL)` y lo mismo para el resumen.
- `asignaciones_incidente`: `id`, `incidente_id`, `institucion`, `operador_id`, `sede_id`, `activa`, `asignada_en`, `liberada_en`, `origen` (`asumida`, `reasignada`). Índice único parcial `(incidente_id, institucion) WHERE activa`.
- `historial_incidente` (auditoría interna, nunca se borra): `accion` (`asumir`, `transicion`, `verificacion`, `liberar`, `reasignar`; B añade `vincular`, C añade `prioridad`), `actor_tipo` (`operador`, `administrador`), `actor_usuario_id`, `institucion`, `valor_anterior`, `valor_nuevo`, `motivo` y `creado_en`. CHECK: `transicion` y `verificacion` exigen anterior y nuevo; `verificacion`, `liberar` y `reasignar` exigen motivo.

**Alternativa descartada:** una tabla de hitos ciudadanos separada. Los hitos se derivan de las filas `transicion` del historial con un texto fijo construido en Consultas. El resumen ciudadano vive en `incidentes`. Así una transición no puede quedar sin su hito y el motivo interno no sale del historial.

### 2. Concurrencia

- Toda mutación abre una transacción y bloquea la fila del incidente (`SELECT … FOR UPDATE`). Las asunciones y transiciones del mismo incidente se serializan; las de incidentes distintos no se bloquean entre sí.
- Asumir:
  - lee la asignación activa de la institución;
  - si es del mismo operador, la devuelve (200, `nueva: false`);
  - si es de otro, responde 409 `CASO_ASUMIDO`;
  - si no hay, la inserta.
- El índice único es la defensa final: un 23505 se traduce en el mismo 409.
- Transiciones y verificación comparan `estadoEsperado` con el estado bloqueado: si no coincide, 409 `ESTADO_CAMBIADO`.
- Orden de bloqueo para evitar interbloqueos con P5.1 (evaluación → enrutamiento): las mutaciones de atención bloquean solo el `incidente`. `aplicarCondicionMedica` no lo toca. Los permisos se leen dentro de la transacción después del bloqueo; una carrera con un cambio de principal se resuelve con el papel confirmado en ese momento.

### 3. Autorización

- La institución y el papel del operador salen de `participacionDe(ámbito, id)`, ya existente, que también da el 404 uniforme.
- «Responsable de la principal» significa que el papel vigente de su institución es `principal` y que la asignación activa de esa institución es suya.
- Las acciones permitidas se calculan en una función de dominio pura `accionesPermitidas(estado, papel, esResponsable, institucionTieneResponsable, vinculado)`. La usan la API para autorizar y el resumen para informar al cliente: una sola regla.

### 4. Reasignación administrativa

- Identidad gana un caso de uso `OperadoresAtencion` en su fachada, con dos operaciones:
  - `describir(ids)`: nombre, sede, institución, cuenta activa, sede activa y habilitada;
  - `deSedes(sedeIds)`: operadores activos.
- Operaciones lo recibe como puerto (`OperadoresPort`) desde la composición.
- Para reasignar, el destino debe cumplir cuatro condiciones: misma institución, cuenta activa, sede activa y habilitada, y sede con participación en el incidente. Si falla alguna, 409 `DESTINO_NO_VALIDO`.
- Liberar desactiva la asignación (`activa=false`, `liberada_en`). Ninguna de las dos acciones cambia el estado del incidente.
- La lista `GET /admin/asignaciones` marca `requiereReasignacion` cuando la cuenta o la sede ya no están activas o habilitadas. Se calcula en cada lectura, sin guardar copias.

### 5. Rutas (Operaciones, `atencion.routes.ts`)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /operador/incidentes/{id}/asumir` | vacío | 201 nueva, o 200 la existente |
| `POST /operador/incidentes/{id}/transiciones` | `{ accion: 'iniciar_atencion' \| 'cerrar', estadoEsperado, resultado?, motivo?, resumenCiudadano? }` | 200 |
| `POST /operador/incidentes/{id}/verificacion` | `{ valor, motivo, estadoEsperado }` | 200 |
| `GET /admin/asignaciones` | — | lista |
| `GET /admin/asignaciones/{id}/candidatos` | — | operadores elegibles |
| `POST /admin/asignaciones/{id}/liberar` | `{ motivo }` | 200 |
| `POST /admin/asignaciones/{id}/reasignar` | `{ operadorId, motivo }` | 200 |

B añade `POST /operador/incidentes/{id}/vinculo` con `{ referenciaPrincipal, motivo }`. C añade `POST /operador/incidentes/{id}/prioridad` con `{ valor, motivo }`.

Todas las rutas usan el mismo envoltorio de errores, CSRF y `no-store` que P5.1.

### 6. Lecturas

- `ServicioAtencion.vistaOperador(ámbito, id, operadorId)` devuelve responsable, acciones permitidas e historial. El nombre del responsable solo se incluye si es de la misma institución que el lector. El historial no lleva motivos de verificación ajenos a la institución.
- Consultas lo añade al resumen mediante un puerto nuevo.
- La consulta `bandeja` de Operaciones añade en el mismo SQL `verificacion`, `resultado`, si la institución tiene responsable y si es el lector. No hay N+1 consultas.
- El seguimiento amplía `estados(ids)` con `resultado`, `resumenCiudadano` y `hitos` (`tipo`, `institucion`, `instante`), derivados del historial. Consultas los traduce a texto ciudadano fijo.

### 7. Grupo B — duplicados (migración `…_duplicados`)

- `incidentes.principal_id UUID NULL REFERENCES incidentes(id)` con CHECK `principal_id <> id`.
- Al vincular se bloquean ambos incidentes por orden de id. Luego se comprueba: el principal no es duplicado, el duplicado no tiene duplicados y ninguno está cerrado.
- El bloqueo ordenado evita los ciclos simultáneos A↔B: el segundo ve el vínculo del primero y responde 409.
- El estado efectivo para lecturas es `COALESCE(principal.estado, estado)`, y los hitos son los del principal.

### 8. Grupo C — prioridad (migración `…_prioridad`)

- La configuración vive en código: `dominio/prioridad.ts` con `VERSION_PRIORIDAD = 'prioridad-categoria-v1'` y la tabla del documento 11. `validarConfiguracion` exige las 16 categorías con valores admitidos.
- `incidentes` añade `prioridad` (`SIN_EVALUAR` por defecto), `prioridad_origen` (`propuesta`, `revisada`, nulo) y `prioridad_version`.
- El consumidor de enrutamiento fija la propuesta en su transacción. Lo hace solo si sigue SIN_EVALUAR con origen nulo, para no sobrescribir una revisión.
- La bandeja ya ordena por `(registrado_en, id)`; la prioridad no interviene en el ORDER BY.

### 9. Clientes

- **Web.** `Bandeja.tsx` añade el bloque «Atención» en el resumen: responsable, botones según `accionesPermitidas` y diálogos con `Dialogo`/`Campo`/`Boton` existentes. `Pendientes.tsx` añade «Responsables activos». Las etiquetas nuevas van en `etiquetas.ts`; no se crean colores ni tipografías locales.
- **Flutter.** `seguimiento_pantallas.dart` sustituye «Actuaciones pendientes» por la lista de hitos cuando existan y añade el resultado de cierre; los modelos se amplían en `incidentes_repositorio.dart`.

## Risks / Trade-offs

- [Cambio de principal entre la lectura del cliente y la acción] → la autorización se recalcula dentro de la transacción y el cliente recibe 403 `NO_PRINCIPAL` y recarga.
- [Hitos derivados del historial: un error de texto afecta a todos] → los textos están en una función pura de Consultas con prueba unitaria.
- [Bloqueo de fila del incidente bajo carga] → el bloqueo dura una transacción corta por incidente; no afecta al registro, que no bloquea filas existentes.
- [B y C podrían no completarse] → migraciones separadas; si no se implementan, no se crean y la evidencia los lista como pendientes.
- [Nombres de operadores en la lista del administrador] → solo los ve el administrador y no se incluyen en vistas ciudadanas ni de otras instituciones.

## Migration Plan

Migraciones aditivas con valores por defecto: los incidentes existentes quedan REGISTRADO, SIN_VERIFICAR y sin resultado. Para revertir, se retira el despliegue; las columnas nuevas son ignoradas por la versión anterior. No se migran datos.

### 10. Asignación automática al operador único (decisión del responsable, 27/11/2026)

- `ServicioAtencion.autoAsignarPrincipal(tx, incidenteId)` corre dentro de la transacción del enrutamiento: al enrutar, designar, reevaluar o aplicar la condición médica. `ServicioEnrutamiento` lo recibe como dependencia opcional (`alCambiarPrincipal`), cableada en la composición. Ambos servicios son de Operaciones; Identidad solo responde por su fachada (`operadoresAtencion.deSedes`).
- Asigna solo si se cumplen todas estas condiciones: el incidente está abierto y no vinculado, la institución principal participa con una única sede, esa sede tiene exactamente un operador con cuenta activa y sede operativa, y la institución aún no tiene asignación activa.
- Migración `…_asignacion_automatica`: `origen` admite `automatica`, `actor_tipo` admite `sistema` y `actor_usuario_id` es nulo solo para el sistema (CHECK).
- Orden de bloqueo: evaluación, después enrutamiento, después incidente. Las mutaciones de atención solo bloquean el incidente, así que no hay ciclo.
- Alternativa descartada: asignar al primer operador que abre el caso, porque abrir no equivale a aceptar.

### 11. Bandeja con filtro de responsable y bloque de atención guiado

- `GET /operador/incidentes?responsable=sin_tomar|mios` se resuelve con una condición sobre la asignación activa en el mismo SQL FIFO. El cursor sigue siendo `(registrado_en, id)`.
- **Web:**
  - El bloque «Atención» muestra un recorrido de estados (lista `.estados` con la pill del estado actual marcada con `aria-current="step"`) y una acción principal según el estado.
  - Un «Control del caso» plegable (`aria-expanded`), como el «Abrir control» del origen `Incidents.jsx`.
  - El historial se pliega y muestra su último movimiento.
  - Los filtros reutilizan el `.segmented` del origen.
  - La variante de pill del estado actual usa el par de tokens `--color-accion` y blanco, cuyo contraste ya se verifica.
