# Proposal

## Why

P4.1 deja cada envío confirmado como un incidente REGISTRADO y guarda un evento `IncidenteRegistrado` con entregas por consumidor, pero todavía no hay consumidores. Ninguna institución recibe el caso, el administrador no ve los envíos que no se pueden asignar y el seguimiento ciudadano muestra la institución responsable como pendiente. P4.2 (`enrutamiento-bandeja-inicial`, fila P4 del plan de integración) aplica la matriz del documento 09 §4–§5 sobre ese evento y abre la primera lectura operativa del panel.

## What Changes

- **Consumidor de enrutamiento (`operaciones.enrutamiento`)** registrado en el `ProcesadorEntregas` sobre `IncidenteRegistrado`. Es idempotente por incidente, procesa también los eventos anteriores a su registro y no retrasa el registro.
- **Matriz versionada del documento 09 §4** para las 16 categorías, con principal, simultáneas y condicionadas. En accidentes, heridos o necesidad médica `si` hacen principal a SAMU con PNP de apoyo. Con ambas respuestas `no`, PNP es principal sin SAMU. Si alguna respuesta es desconocida (`no_se` o null), PNP es principal y el caso queda marcado con revisión médica pendiente (RF57). En agresión, pelea y violencia, heridos `si` añade SAMU. Cada institución participa una sola vez. El apoyo local de Serenazgo «si está habilitado» queda **desactivado** en la versión 1, porque no existe su configuración.
- **Selección de sedes** por institución destinataria: sedes activas y habilitadas para atención, con cobertura del distrito, competencia sobre la categoría y al menos un operador activo, según un contrato nuevo de Identidad. Todas las sedes que cumplen participan, sin duplicar el caso. La designación de una sede coordinadora pertenece a P6.
- **`ENRUTAMIENTO_PENDIENTE`:** sin distrito resuelto, o sin una sede elegible para una institución destinataria, se conserva el incidente con su motivo. Las sedes encontradas participan igualmente. El administrador ve la lista de pendientes en orden FIFO. Puede **designar** una sede habilitada de la institución faltante con un motivo auditado, como excepción limitada al caso y sin acceso sanitario adicional (RF35). También puede **reevaluar** el caso después de corregir la configuración.
- **Evento `EnrutamientoResuelto`** en la misma transacción que cada resultado. Se publica sin consumidores, para que P8 genere los avisos por usuario.
- **Bandeja inicial del operador.** El operador ve una lista FIFO con cursor de los incidentes en que participa su sede dentro de su ámbito vigente (`consultarAmbitoOperador`), ordenada por registro y desempatada por id (RF48). Cada fila incluye referencia, categoría, distrito, estado, rol de su institución, condición médica por confirmar y la etiqueta «Sin evaluar». También hay un **resumen por identificador** limitado, que devuelve 404 fuera del ámbito y no incluye teléfono, coordenadas ni detalle sanitario.
- **Panel web.** La sección «Incidentes» del operador pasa a estar disponible, con la bandeja, el resumen y la acción «Actualizar». La sección «Inicio» del administrador pasa a estar disponible solo con el bloque «Enrutamiento pendiente», que permite designar y reevaluar. El resto del resumen sigue pendiente para P8.
- **Seguimiento ciudadano.** Cuando existe una principal resuelta, el autor y el invitado ven la institución responsable (tipo y nombre, sin sede ni operadores). La recepción y las actuaciones siguen pendientes hasta P6. Se actualizan la API, OpenAPI y Flutter.
- **Evidencia:** EQ-09 sobre incidentes (bandeja, resumen por URL directa, cursor manipulado y cambio de cobertura) y EQ-19 completos; EQ-21 y EQ-10 parciales, según «Impact».

**Fuera de alcance:** avisos persistentes por usuario, lectura, contador, campana, polling y recuperación de no leídos, incluidos los avisos al administrador por fallos de asignación (P8, documento 09 §5 pasos 4, 6 y 7). Tampoco entran «Asumir caso», sede coordinadora, transiciones de estado, prioridad, reclasificación, sustitución de PNP por Serenazgo (RF57, declarada por PNP) ni reasignación general (P6). Quedan fuera la evaluación SAMU completa y su actualización posterior (P5), la configuración administrable de reglas y apoyo local (sección «Reglas», todavía no disponible) y los mapas (P7).

## Capabilities

### New Capabilities
- `operaciones/enrutamiento`: resolución versionada de destinatarios y sedes por incidente, participaciones, `ENRUTAMIENTO_PENDIENTE`, designación y reevaluación administrativas, y evento `EnrutamientoResuelto`.
- `consultas/bandeja-institucional`: bandeja FIFO del operador y resumen por identificador, limitados al ámbito vigente de su sede.
- `web/bandeja-incidentes`: sección «Incidentes» del operador y bloque «Enrutamiento pendiente» del administrador en el panel.

### Modified Capabilities
- `identidad/organizacion-institucional`: añade el contrato interno de sedes elegibles por institución, distrito y categoría, y la validación de una sede designable.
- `consultas/seguimiento-ciudadano`: la institución responsable se informa cuando existe una principal resuelta.
- `movil/seguimiento-incidentes`: Mis reportes y la vista del invitado muestran la institución responsable recibida.
- `web/panel-institucional`: el shell marca disponibles «Incidentes» del operador e «Inicio» del administrador, este último limitado al bloque de pendientes.

## Impact

- **API:** módulo Operaciones (dominio de la matriz, aplicación del consumidor, designación y reevaluación, adaptador Prisma). Fachada de Reportes (datos de enrutamiento por incidente), Identidad (sedes elegibles y designables) y Consultas (bandeja, resumen y seguimiento). Se registra el consumidor en `main.ts` y se cablean los puertos en `composicion.ts` sin ciclos entre módulos.
- **Esquema:** migración PostgreSQL con `enrutamientos_incidente` y `participaciones_incidente` (propiedad de Operaciones), con índices para el orden FIFO por sede.
- **Contrato:** `openapi.yaml` añade `GET /operador/incidentes`, `GET /operador/incidentes/{id}`, `GET /admin/enrutamientos-pendientes`, `POST /admin/enrutamientos-pendientes/{incidenteId}/designaciones` y `POST .../reevaluar`, y amplía el seguimiento.
- **Clientes:** la web (paneles del operador y del administrador) y Flutter (seguimiento).
- **Calidad:** EQ-09 y EQ-19 completos. EQ-21 parcial: la actualización positiva de la condición médica depende de P5/P6. EQ-10 parcial: el enrutamiento SAMU principal con PNP de apoyo y su persistencia tras un reinicio sí entran; el aviso por usuario, su lectura y el polling dependen de P8. La evidencia irá en `docs/validacion/p4-enrutamiento.md`.
- **Documentación:** la guía UI registra la bandeja del operador y el bloque de pendientes del administrador.
