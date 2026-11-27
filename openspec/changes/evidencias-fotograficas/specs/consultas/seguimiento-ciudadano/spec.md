# Spec Delta

## ADDED Requirements

### Requirement: Fotos propias en el detalle del autor
El detalle privado del autor MUST incluir la lista de sus fotos disponibles, con identificador, tipo, tamaño e instante. MUST NOT incluir fotos pendientes, fallidas o eliminadas, URLs ni identificadores del proveedor. La vista limitada del invitado MUST seguir sin fotos.

#### Scenario: Detalle con fotos
- **WHEN** el autor consulta un incidente con fotos disponibles y alguna fallida o eliminada
- **THEN** ve solo los metadatos de las disponibles, sin URLs ni identificadores del proveedor

#### Scenario: Vista del invitado
- **WHEN** un invitado consulta con su código un incidente con fotos
- **THEN** la respuesta no contiene fotos ni metadatos de fotos
