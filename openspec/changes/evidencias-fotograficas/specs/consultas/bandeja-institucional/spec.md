# Spec Delta

## MODIFIED Requirements

### Requirement: Resumen por identificador
El operador MUST poder leer por identificador el resumen de un incidente de su bandeja: campos de la fila, descripción, ocurrencia, resultado territorial, respuestas originales de heridos y atención médica como informadas por el ciudadano, condición médica vigente (resumen de heridos), si tiene acceso al detalle sanitario y tipos de las demás instituciones participantes. MUST NOT incluir teléfono, coordenadas, código, autor, contenido de fotos ni observaciones de la persona principal.

#### Scenario: Resumen propio
- **WHEN** el operador abre un incidente de su bandeja
- **THEN** recibe el resumen con los campos permitidos y sin datos excluidos

#### Scenario: Condición precisada por un operador
- **WHEN** un operador PNP precisó heridos si en un accidente
- **THEN** el resumen conserva la respuesta original del ciudadano y muestra la condición vigente con origen operador, institución PNP e instante

## ADDED Requirements

### Requirement: Metadatos de fotos en el resumen
El resumen del operador MUST incluir la lista de fotos disponibles del incidente, con identificador, tipo, tamaño e instante. MUST NOT incluir fotos pendientes, fallidas o eliminadas, ni URLs, identificadores del proveedor, autor o nombre de archivo.

#### Scenario: Incidente con fotos
- **WHEN** el operador abre un incidente con dos fotos disponibles y una eliminada
- **THEN** el resumen lista solo las dos disponibles con sus metadatos, sin URLs ni identificadores del proveedor

#### Scenario: Incidente sin fotos
- **WHEN** el incidente no tiene fotos disponibles
- **THEN** el resumen trae la lista vacía
