# Spec Delta

## MODIFIED Requirements

### Requirement: Contenido de la fila de bandeja
Cada fila MUST incluir referencia, categoría, distrito, estado, instante de registro, papel de la institución del operador, condición médica por confirmar y la etiqueta de prioridad «Sin evaluar» mientras no exista evaluación. MUST NOT incluir teléfono, coordenadas, código, autor ni otras sedes u operadores.

#### Scenario: Campos permitidos
- **WHEN** se inspecciona una fila de la bandeja
- **THEN** contiene solo los campos enumerados y la prioridad es «Sin evaluar»

#### Scenario: Revisión resuelta y papel actualizado
- **WHEN** una aclaración resuelve la revisión médica y cambia el papel de la institución del operador
- **THEN** la siguiente consulta ya no marca la condición médica por confirmar y muestra el papel vigente

### Requirement: Resumen por identificador
El operador MUST poder leer por identificador el resumen de un incidente de su bandeja: campos de la fila, descripción, ocurrencia, resultado territorial, respuestas originales de heridos y atención médica como informadas por el ciudadano, condición médica vigente (resumen de heridos), si tiene acceso al detalle sanitario y tipos de las demás instituciones participantes. MUST NOT incluir teléfono, coordenadas, código, autor, evidencias ni observaciones de la persona principal.

#### Scenario: Resumen propio
- **WHEN** el operador abre un incidente de su bandeja
- **THEN** recibe el resumen con los campos permitidos y sin datos excluidos

#### Scenario: Condición precisada por un operador
- **WHEN** un operador PNP precisó heridos si en un accidente
- **THEN** el resumen conserva la respuesta original del ciudadano y muestra la condición vigente con origen operador, institución PNP e instante
