# Proposal

## Why

P4 registra y enruta el incidente solo con «¿Hay heridos?» y «¿Se necesita atención médica?». SAMU no recibe la evaluación rápida de RF41–RF44, y una condición desconocida queda en «revisión médica pendiente» sin forma de precisarla. Por eso un accidente que resulta tener heridos nunca llega a SAMU (RF40, RF57). P5.1 (`evaluacion-rapida-samu`, fila P5 del plan de integración) incorpora la evaluación de una persona principal, sus versiones y permisos sanitarios, y la actualización positiva de la condición médica. Las evidencias fotográficas quedan para P5.2.

## What Changes

- **Evaluación rápida en el envío.** El cuerpo de `POST /incidentes` admite un objeto opcional `evaluacion` cuando SAMU es destinatario según las respuestas enviadas: emergencia médica siempre, accidente con heridos o atención médica `si`, y agresión, pelea o violencia con heridos `si`. El objeto contiene:
  - la cantidad total de heridos, conocida (entero ≥ 1) o `no_se`, independiente de las observaciones;
  - las observaciones de una sola persona principal: signos de vida (`observados`/`no_observados`/`no_se`), conciencia y sangrado visible (`si`/`no`/`no_se`).

  Una respuesta omitida queda sin respuesta y nunca se convierte en una condición normal. No hay fichas de otras personas, nombres ni documentos. Una cantidad incoherente con la respuesta de heridos se rechaza con 400, sin corregirla en silencio. La huella de idempotencia incluye la evaluación solo cuando viene en el cuerpo, de modo que los envíos de P4 conservan su huella.
- **Heridos en Emergencia médica** (decisión del responsable, 26/11/2026). «¿Hay heridos?» se admite también en `emergencia-medica`, conforme al documento 09. No cambia su enrutamiento, porque SAMU ya es la principal.
- **Versiones de la evaluación (RF43).** Todo incidente de las cinco categorías con preguntas médicas tiene una evaluación versionada. La versión 1 se crea en la transacción del registro. Cada aclaración crea una versión nueva con la instantánea completa, el origen (ciudadano u operador), la institución del operador, el instante y los campos modificados. Una aclaración sin cambios no crea versión, por lo que reintentarla no duplica nada. Cada versión nueva publica el evento `EvaluacionActualizada`, sin datos sanitarios.
- **Aclaración del ciudadano con cuenta.** El autor puede completar o corregir su evaluación mientras el incidente siga abierto, desde el detalle de «Mis reportes». Si SAMU se incorpora después, el detalle le pide completarla sin que eso bloquee ningún aviso. El invitado no tiene acceso sanitario.
- **Aclaración y precisión del operador.** Cualquier operador cuya sede participe puede precisar heridos, atención médica y cantidad, con un motivo obligatorio. Solo el operador SAMU participante puede, además, registrar observaciones de la persona principal.
- **Actualización positiva de la condición médica (RF40, RF57, EQ-21).** Cuando la condición vigente activa a SAMU, Operaciones recalcula los destinatarios con la misma versión de la matriz, en la misma transacción que la versión de la evaluación:
  - en un accidente, SAMU pasa a principal y PNP queda como simultánea, conservando su participación;
  - en agresión, pelea o violencia, SAMU se añade como condicionada;
  - si SAMU no tiene sede elegible, el caso queda en `ENRUTAMIENTO_PENDIENTE` con su faltante.

  Cada cambio se audita sin datos sanitarios y publica `EnrutamientoResuelto` con origen `condicion_medica`. Una respuesta precisada a `no` puede cerrar la revisión médica pendiente, pero nunca retira participaciones.
- **Permisos sanitarios (RF43, EQ-04).**
  - El detalle completo de la evaluación y su historial solo están disponibles para el operador SAMU con participación dentro de su ámbito vigente.
  - El autor con cuenta ve sus propias respuestas.
  - Las demás instituciones ven solo el resumen de heridos (existencia, cantidad y atención médica).
  - El administrador, el invitado, el mapa, los logs y los eventos no reciben datos sanitarios.
  - Cada lectura autorizada del detalle se registra sin copiar su contenido.
- **Clientes.**
  - Flutter muestra el bloque «Evaluación rápida para SAMU» con botones de un toque y la cantidad con accesos rápidos y +/−, sin teclado. Las respuestas se conservan al ocultar el bloque.
  - Mis reportes muestra la evaluación propia y permite aclararla.
  - El panel web muestra la condición médica vigente y la acción «Precisar condición médica». El operador SAMU ve además la evaluación con su historial y puede registrar aclaraciones.

**Fuera de alcance:**
- **P5.2:** fotografías y evidencias.
- **P6:** retirar SAMU o rebajar su papel; incorporar SAMU por decisión del operador en otras categorías (reclasificación); «Asumir caso», permisos de cierre, estados, prioridad y sustitución de PNP por Serenazgo.
- **P8:** avisos por usuario y consumidores de `EvaluacionActualizada`.
- **P9:** eliminación a los 30 días del cierre.
- **Validación externa:** la validación clínica de las preguntas con profesionales SAMU.

## Capabilities

### New Capabilities
- `reportes/evaluacion-rapida`: evaluación de una persona principal y cantidad total de heridos, con coherencia, versiones completas, aclaraciones del autor y del operador, evento `EvaluacionActualizada` y propiedad de los datos sanitarios.
- `consultas/detalle-sanitario`: lectura autorizada de la evaluación vigente y su historial (operador SAMU participante y autor), resumen de heridos para las demás instituciones, respuesta uniforme a accesos no autorizados y registro de accesos sin contenido.

### Modified Capabilities
- `reportes/registro-incidentes`: «¿Hay heridos?» en emergencia médica, objeto `evaluacion` opcional en el envío, versión 1 en la transacción del registro y huella de idempotencia compatible.
- `operaciones/enrutamiento`: el enrutamiento usa la condición médica vigente; se añaden el recálculo positivo con cambio de principal, la auditoría y el origen `condicion_medica` del evento.
- `consultas/bandeja-institucional`: la fila refleja la revisión médica actualizada; el resumen incluye la condición médica vigente con su origen e instante.
- `consultas/seguimiento-ciudadano`: el detalle del autor incluye sus propias respuestas y la solicitud de completarlas cuando SAMU interviene.
- `movil/reporte-incidente`: bloque de evaluación rápida y heridos en emergencia médica.
- `movil/seguimiento-incidentes`: evaluación propia en el detalle y aclaración desde Mis reportes.
- `web/bandeja-incidentes`: condición médica vigente, precisión con motivo y evaluación con historial y aclaraciones para el operador SAMU.

## Impact

- **API:**
  - Reportes: dominio y versiones de la evaluación, contrato transaccional hacia Operaciones y ruta del autor.
  - Operaciones: recálculo del enrutamiento, auditoría de cambios y ruta del operador.
  - Consultas: detalle sanitario y resumen de la bandeja.
  - Identidad: ámbito del operador, ya existente.
  - Se cablea en `composicion.ts` sin ciclos.
- **Esquema:** migración aditiva con `evaluaciones_incidente` y `versiones_evaluacion` (Reportes) y `cambios_enrutamiento` (Operaciones). La columna `papel` de las participaciones pasa a ser actualizable, con auditoría. Se cargan las versiones 1 de los incidentes existentes de las cinco categorías.
- **Contrato:** `openapi.yaml` amplía `POST /incidentes`, `GET /ciudadano/incidentes/{referencia}` y `GET /operador/incidentes/{id}`, y añade `POST /ciudadano/incidentes/{referencia}/evaluacion`, `GET /operador/incidentes/{id}/evaluacion` y `POST /operador/incidentes/{id}/evaluacion`.
- **Clientes:** Flutter (formulario y Mis reportes) y la web (resumen del operador).
- **Calidad:** EQ-13 completo. EQ-04 en su parte sanitaria; las evidencias quedan para P5.2 y el mapa y las alertas para P7 y P8. EQ-21 en el cambio de principal; los permisos de cierre quedan para P6. La evidencia irá en `docs/validacion/p5-evaluacion.md`.
- **Documentación:** la guía UI registra el bloque de evaluación, la precisión y la vista SAMU. El documento 09 anota la decisión sobre heridos en emergencia médica.
