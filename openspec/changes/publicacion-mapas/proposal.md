# Proposal

## Why

Desde P6 un incidente puede quedar VERIFICADO, pero no existe forma de publicarlo: el Mapa de la app y el del panel siguen como destinos «Aún no disponible». RF49 y RF20 (documento 11 §5) exigen publicación expresa solo de hechos verificados y autorizados, con zona aproximada, datos mínimos, reserva sensible y retiro al cierre o por decisión, y un mapa con filtros por distrito, categoría y período. Es la fila P7 del plan de integración y la base de las alertas preventivas de P8, que solo pueden avisar de incidentes publicados.

## What Changes

Ordenado por prioridad de entrega. El grupo A es el núcleo obligatorio; B y C se implementan si alcanza el tiempo y, si no, quedan como pendientes explícitos en la evidencia.

Decisiones del responsable (27/11/2026), registradas en el documento 11 §5 antes de implementar: teselas OSM estándar configurables; documento 11 tal cual (celda fija de 300 m, cuatro categorías sensibles sin puntos, conteos con mínimo de cinco); publica el responsable de la principal y retira cualquier operador activo de la principal; mapa público en la app y mapa operativo con puntos exactos en el panel del operador.

**Grupo A — publicación controlada (núcleo).**
- **Publicar (RF49).** El responsable asignado de la institución principal publica con autorización expresa un incidente VERIFICADO, abierto (EN_REVISION o EN_ATENCION), no vinculado como duplicado, con distrito resuelto y ocurrido hace menos de 7 días. Al publicar se guarda una instantánea pública mínima: categoría, distrito real, centro de la celda de 300 m, estado publicable, instante de ocurrencia y vencimiento. Nunca descripción, fotos, identidad, teléfono, código, coordenadas exactas ni datos sanitarios.
- **Retirar.** Cualquier operador activo de la principal retira con motivo, de inmediato. El sistema retira en la misma transacción al cerrar, al corregir a NO_VERIFICADO o al vincular como duplicado; la vigencia vence a los 7 días desde la ocurrencia sin tarea programada. Cada publicación y retiro queda en el historial. Republicar tras un retiro exige otra autorización y conserva el vencimiento original.
- **Categorías sensibles (fallo seguro).** Acoso, Violencia, Agresión y Emergencia médica nunca aparecen como punto ni en la lista pública.
- **API pública** `GET /publico/mapa` sin sesión: publicaciones vigentes con filtros por distrito, categoría y período (24 h, 3 días o 7 días) y su antigüedad.
- **Panel:** bloque «Publicación» en el control del caso, con estado, vista previa de lo que se publica, «Publicar» y «Retirar».
- **App:** pantalla Mapa con `flutter_map`, celdas aproximadas, límites distritales, filtros y lista. Si fallan las teselas, se ven los límites y la lista; si falla el mapa, los filtros y la lista siguen disponibles.

**Grupo B — mapa operativo web (RF20).** Sección «Mapa» del panel del operador con Leaflet: puntos exactos solo de incidentes en que participa su sede dentro de su ámbito vigente, filtros por distrito, categoría y período, y enlace al resumen. Si fallan el mapa o las teselas, siguen la lista y los filtros.

**Grupo C — reserva y conteos.** El responsable marca reservado un caso adicional al publicarlo o después. Las categorías sensibles y los casos reservados publicados se informan solo como conteo por distrito y mes cuando el grupo tiene al menos cinco; si no, se suprime.

**Fuera de alcance:** alertas preventivas (P8), mapa público en la portada web, edición de la cuadrícula o de las categorías sensibles desde el panel, publicación por el administrador y validación de cuotas de un proveedor alternativo de teselas.

## Capabilities

### New Capabilities
- `operaciones/publicacion`: autorización, instantánea generalizada, retiro manual y automático, vigencia y reserva de casos.
- `consultas/mapa-publico`: lectura pública de publicaciones vigentes con filtros y conteos agregados, sin datos restringidos.
- `consultas/mapa-operativo`: consulta autorizada del operador con puntos exactos limitada a su ámbito (grupo B).
- `movil/mapa-publico`: pantalla Mapa de la app con teselas configurables, filtros, lista y degradación ante fallos.
- `web/mapa-operativo`: sección Mapa del panel del operador con Leaflet (grupo B).

### Modified Capabilities
- `operaciones/atencion-institucional`: el cierre y la corrección a NO_VERIFICADO retiran la publicación vigente.
- `operaciones/duplicados`: vincular como duplicado retira la publicación del duplicado y un duplicado no se publica.
- `web/bandeja-incidentes`: el control del caso añade el bloque «Publicación».
- `web/panel-institucional`: la sección Mapa del operador pasa a operativa (grupo B).
- `movil/navegacion-ciudadana`: Mapa deja de ser un destino pendiente; Alertas sigue pendiente.

## Impact

- Documentación: documento 11 §5, RF49, ADR-009 (proveedor de teselas) y guía UI antes de implementar.
- API: migración aditiva `publicaciones_incidente`, caso de uso en Operaciones con puerto hacia Reportes para la instantánea, lectura pública y operativa en Consultas, rutas nuevas, OpenAPI y pruebas Jest unitarias, de integración y de contrato (EQ-04/09 privacidad del mapa).
- Web: `Atencion.tsx` y nueva página de mapa; dependencias `leaflet` y `react-leaflet` (grupo B).
- Móvil: nueva pantalla de mapa, repositorio público y navegación; `flutter_map` ya instalado.
