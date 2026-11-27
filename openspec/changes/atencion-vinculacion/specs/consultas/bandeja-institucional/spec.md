## MODIFIED Requirements

### Requirement: Contenido de la fila de bandeja
Cada fila MUST incluir referencia, categoría, distrito, estado efectivo, resultado si está cerrado, verificación, instante de registro, papel de la institución del operador, condición médica por confirmar, si su institución tiene responsable y si es él, indicación de duplicado vinculado y la prioridad vigente con su origen («Sin evaluar» sin propuesta válida). MUST NOT incluir teléfono, coordenadas, código, autor ni otras sedes u operadores.

#### Scenario: Campos permitidos
- **WHEN** se inspecciona una fila de la bandeja
- **THEN** contiene solo los campos enumerados, sin nombres de operadores

#### Scenario: Revisión resuelta y papel actualizado
- **WHEN** una aclaración resuelve la revisión médica y cambia el papel de la institución del operador
- **THEN** la siguiente consulta ya no marca la condición médica por confirmar y muestra el papel vigente

#### Scenario: Responsable propio
- **WHEN** el operador asumió el incidente
- **THEN** su fila indica que él es el responsable de su institución

### Requirement: Resumen por identificador
El operador MUST poder leer por identificador el resumen de un incidente de su bandeja: campos de la fila, descripción, ocurrencia, resultado territorial, respuestas originales de heridos y atención médica como informadas por el ciudadano, condición médica vigente (resumen de heridos), si tiene acceso al detalle sanitario, tipos de las demás instituciones participantes. MUST NOT incluir teléfono, coordenadas, código, autor, contenido de fotos ni observaciones de la persona principal.

#### Scenario: Resumen propio
- **WHEN** el operador abre un incidente de su bandeja
- **THEN** recibe el resumen con los campos permitidos y sin datos excluidos

#### Scenario: Condición precisada por un operador
- **WHEN** un operador PNP precisó heridos si en un accidente
- **THEN** el resumen conserva la respuesta original del ciudadano y muestra la condición vigente con origen operador, institución PNP e instante

## ADDED Requirements

### Requirement: Atención en el resumen del operador
El resumen MUST incluir el responsable de la institución del operador (nombre solo para operadores de esa institución), las acciones permitidas para él según estado, papel y asignación, y el historial operativo del incidente sin motivos sanitarios.

#### Scenario: Acciones permitidas
- **WHEN** el responsable de la principal abre un incidente EN_REVISION
- **THEN** las acciones permitidas incluyen iniciar atención, descartar y registrar verificación, y no incluyen cerrar como atendido
