## MODIFIED Requirements

### Requirement: Sección Incidentes del operador
La sección «Incidentes» MUST listar la bandeja recibida de la API en su orden, con referencia, categoría, distrito, estado, papel de la institución, condición médica por confirmar, responsable de su institución y prioridad vigente, mostrando cada etiqueta con texto e icono. MUST ofrecer «Cargar más» cuando haya cursor y «Actualizar» para volver a consultar desde el inicio. MUST NOT reordenar las filas en el cliente.

#### Scenario: Bandeja con incidentes
- **WHEN** un operador abre «Incidentes»
- **THEN** ve las filas en el orden recibido, la más antigua primero, con sus etiquetas textuales

#### Scenario: Actualizar
- **WHEN** el operador pulsa «Actualizar»
- **THEN** se consulta de nuevo la primera página, sin consultas automáticas periódicas

#### Scenario: Bandeja vacía
- **WHEN** la API devuelve una lista vacía
- **THEN** se informa que no hay incidentes asignados a su sede, sin datos de ejemplo

### Requirement: Resumen del incidente en el panel
Al abrir una fila, el panel MUST mostrar el resumen recibido. Las respuestas originales de heridos y atención médica MUST aparecer como informadas por el ciudadano, junto con la condición médica vigente, su origen e instante. MUST ofrecer solo las acciones permitidas que informa la API. Un 404 MUST mostrarse como incidente no disponible, sin distinguir si existe.

#### Scenario: Abrir resumen
- **WHEN** el operador abre una fila
- **THEN** ve el resumen y puede volver a la bandeja conservando su posición

#### Scenario: Incidente fuera de ámbito
- **WHEN** se abre directamente la ruta de un incidente que responde 404
- **THEN** se muestra «Incidente no disponible» sin datos

#### Scenario: Condición precisada
- **WHEN** el resumen trae una condición vigente de origen operador
- **THEN** se ven por separado la respuesta original del ciudadano y la condición vigente con su institución e instante

### Requirement: Bloque de enrutamiento pendiente del administrador
La sección «Inicio» del administrador MUST mostrar los bloques «Enrutamiento pendiente» y «Responsables activos». Desde cada faltante MUST permitir designar una sede de la institución faltante con un motivo obligatorio, y MUST permitir reevaluar el caso. El resto del resumen MUST seguir indicado como no disponible.

#### Scenario: Designar sede
- **WHEN** el administrador elige una sede habilitada, escribe el motivo y confirma
- **THEN** se envía una sola solicitud, se informa el resultado y la lista se actualiza

#### Scenario: Designación rechazada
- **WHEN** la API responde 409
- **THEN** se explica el requisito incumplido con texto e icono, sin presentar la designación como hecha

#### Scenario: Sin pendientes
- **WHEN** no hay enrutamientos pendientes
- **THEN** se informa que no hay casos sin asignar, sin ceros presentados como métricas

## ADDED Requirements

### Requirement: Acciones de atención en el resumen
El resumen MUST mostrar el recorrido de los cuatro estados con el actual marcado con texto, una sola acción principal según el estado y las acciones permitidas («Tomar el caso», «Iniciar atención» o «Cerrar como atendido») con una frase sobre su efecto, y «Descartar» como acción secundaria. Verificación, prioridad y duplicado MUST agruparse en un «Control del caso» plegable.

#### Scenario: Asumir y revisar
- **WHEN** el operador de la principal pulsa «Tomar el caso» en un incidente REGISTRADO
- **THEN** el resumen se actualiza como EN_REVISION con él como responsable

#### Scenario: Una acción principal
- **WHEN** el responsable de la principal abre un incidente EN_REVISION
- **THEN** la única acción principal visible es «Iniciar atención» y el control del caso está plegado

#### Scenario: Conflicto al asumir
- **WHEN** la API responde 409 porque otro operador asumió
- **THEN** se informa que otro operador de su institución es responsable y se recarga el resumen

### Requirement: Responsables activos del administrador
El bloque «Responsables activos» MUST listar las asignaciones recibidas con referencia, estado, institución, sede y responsable, destacar con texto e icono las pendientes de reasignación y permitir liberar o reasignar con motivo obligatorio a un operador elegible.

#### Scenario: Reasignar
- **WHEN** el administrador elige otro operador, escribe el motivo y confirma
- **THEN** se envía una sola solicitud y la lista muestra al nuevo responsable

### Requirement: Filtros de responsable en la bandeja web
La sección «Incidentes» MUST ofrecer los filtros «Sin tomar», «Mis casos» y «Todos» como control segmentado accesible, consultando la API con el filtro elegido y conservando el orden recibido.

#### Scenario: Cambiar a Mis casos
- **WHEN** el operador elige «Mis casos»
- **THEN** se consulta la primera página con `responsable=mios` y la tabla conserva el orden de llegada

### Requirement: Formularios de atención con una sola solicitud
Los formularios de cierre, descarte, verificación, prioridad y vínculo MUST exigir motivo y, al cerrar, resumen ciudadano con su vista previa; MUST enviar una sola solicitud y explicar un 409 sin presentar la acción como hecha.

#### Scenario: Conflicto al cerrar
- **WHEN** la API responde 409 ESTADO_CAMBIADO al cerrar
- **THEN** se explica que el estado cambió y se recarga el resumen sin mostrar el caso como cerrado
