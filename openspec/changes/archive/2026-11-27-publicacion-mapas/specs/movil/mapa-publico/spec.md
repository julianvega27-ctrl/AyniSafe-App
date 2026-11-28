# Spec Delta

## Purpose

Pantalla Mapa de la app ciudadana: incidentes publicados con su ubicación, límites distritales, filtros, lista y distancia desde la posición actual, que sigue siendo útil si el mapa base falla.

## ADDED Requirements

### Requirement: Mapa público de la app
La pantalla Mapa MUST estar disponible con y sin sesión y mostrar las publicaciones vigentes como marcadores en su ubicación sobre teselas configurables con atribución visible y los límites distritales del catálogo. Al abrirla MUST NOT solicitar ubicación ni notificaciones.

#### Scenario: Abrir el mapa
- **WHEN** el ciudadano abre Mapa
- **THEN** ve los marcadores y la atribución, sin solicitud de permisos

#### Scenario: Sin publicaciones
- **WHEN** no hay publicaciones vigentes para los filtros
- **THEN** ve un estado vacío explicativo, sin datos de ejemplo

### Requirement: Marcadores por categoría y detalle breve
Cada marcador MUST mostrar el icono de su categoría, como el mapa del origen. Los incidentes en el mismo punto MUST agruparse en un marcador con su número. Tocar un marcador o un elemento de la lista MUST abrir un detalle breve con categoría, estado, distrito, fecha y antigüedad de la ocurrencia, y la distancia si se usó «Mi ubicación». MUST NOT mostrar descripción, fotos ni datos de quien reportó.

#### Scenario: Tocar un marcador
- **WHEN** el ciudadano toca el marcador de un incendio
- **THEN** ve una hoja con «Incendio», su estado, distrito y fecha, sin la descripción del reporte

#### Scenario: Varios en el mismo punto
- **WHEN** dos incidentes publicados comparten el punto
- **THEN** el marcador muestra «2» y al tocarlo se elige cuál ver

### Requirement: Mi ubicación y distancia
La pantalla MUST ofrecer «Mi ubicación». Solo al pulsarlo MUST pedir el permiso de ubicación; con él MUST mostrar la posición actual, centrar el mapa e indicar la distancia a cada incidente, ordenando la lista de la más cercana a la más lejana. La ubicación MUST usarse solo en el teléfono: MUST NOT enviarse al servidor ni guardarse. Si se niega el permiso o no hay señal, el mapa MUST seguir funcionando sin distancias y con un aviso.

#### Scenario: Ver distancias
- **WHEN** el ciudadano pulsa «Mi ubicación» y concede el permiso
- **THEN** ve su posición, la lista indica «a 350 m» o «a 1,2 km» y empieza por el incidente más cercano

#### Scenario: Permiso negado
- **WHEN** el ciudadano niega el permiso
- **THEN** ve un aviso y el mapa y la lista siguen sin distancias

#### Scenario: Ubicación no enviada
- **WHEN** se usa «Mi ubicación»
- **THEN** ninguna solicitud a la API contiene la posición del ciudadano

### Requirement: Filtros y lista accesible
La pantalla MUST ofrecer filtros por distrito, categoría y período (24 horas, 3 días, 7 días) y una lista de las publicaciones visibles con categoría, distrito, estado y antigüedad, operable con lector de pantalla y texto ampliado. Si hay conteos de casos reservados, MUST mostrarlos como texto por distrito y mes.

#### Scenario: Filtrar por distrito
- **WHEN** el ciudadano elige un distrito
- **THEN** el mapa y la lista muestran solo sus publicaciones

#### Scenario: Lector de pantalla
- **WHEN** se recorre la pantalla con TalkBack
- **THEN** cada elemento de la lista se anuncia con categoría, distrito, estado y antigüedad

### Requirement: Fallos que no impiden consultar
Si fallan las teselas, el mapa MUST seguir mostrando límites y marcadores con un aviso. Si falla la lectura de límites, MUST seguir la lista. Si falla la API del mapa, MUST mostrar un error con reintento sin bloquear la navegación ni los filtros.

#### Scenario: Teselas caídas
- **WHEN** el proveedor de teselas no responde
- **THEN** se ven los límites, los marcadores, la lista y un aviso de mapa base no disponible

#### Scenario: API caída
- **WHEN** la API del mapa responde 503
- **THEN** se ve un error con «Reintentar» y la navegación sigue operativa
