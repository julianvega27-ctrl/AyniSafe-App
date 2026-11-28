# Spec Delta

## Purpose

Pantalla Mapa de la app ciudadana: incidentes publicados con zona aproximada, límites distritales, filtros y lista, que sigue siendo útil si el mapa base falla.

## ADDED Requirements

### Requirement: Mapa público de la app
La pantalla Mapa MUST estar disponible con y sin sesión y mostrar las publicaciones vigentes como zonas aproximadas sobre teselas configurables con atribución visible, los límites distritales del catálogo y un aviso de que las ubicaciones son aproximadas. MUST NOT solicitar ubicación ni notificaciones.

#### Scenario: Abrir el mapa
- **WHEN** el ciudadano abre Mapa
- **THEN** ve las zonas aproximadas, el aviso de aproximación y la atribución, sin solicitud de permisos

#### Scenario: Sin publicaciones
- **WHEN** no hay publicaciones vigentes para los filtros
- **THEN** ve un estado vacío explicativo, sin datos de ejemplo

### Requirement: Filtros y lista accesible
La pantalla MUST ofrecer filtros por distrito, categoría y período (24 horas, 3 días, 7 días) y una lista de las publicaciones visibles con categoría, distrito, estado y antigüedad, operable con lector de pantalla y texto ampliado. Si hay conteos de casos reservados, MUST mostrarlos como texto por distrito y mes.

#### Scenario: Filtrar por distrito
- **WHEN** el ciudadano elige un distrito
- **THEN** el mapa y la lista muestran solo sus publicaciones

#### Scenario: Lector de pantalla
- **WHEN** se recorre la pantalla con TalkBack
- **THEN** cada elemento de la lista se anuncia con categoría, distrito, estado y antigüedad

### Requirement: Fallos que no impiden consultar
Si fallan las teselas, el mapa MUST seguir mostrando límites y zonas con un aviso. Si falla la lectura de límites, MUST seguir la lista. Si falla la API del mapa, MUST mostrar un error con reintento sin bloquear la navegación ni los filtros.

#### Scenario: Teselas caídas
- **WHEN** el proveedor de teselas no responde
- **THEN** se ven los límites, las zonas, la lista y un aviso de mapa base no disponible

#### Scenario: API caída
- **WHEN** la API del mapa responde 503
- **THEN** se ve un error con «Reintentar» y la navegación sigue operativa
