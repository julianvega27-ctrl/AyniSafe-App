# Spec Delta

## ADDED Requirements

### Requirement: Publicación en el control del caso
El control del caso MUST incluir un bloque «Publicación» con el estado (no publicado, publicado hasta una fecha, retirado y su causa), la vista previa de lo que se verá en el mapa público (categoría, distrito, zona aproximada, estado y antigüedad, o «solo en conteos» si es sensible o reservado) y las acciones que la API permite: «Publicar en el mapa», «Retirar» con motivo y «Reservar» o «Quitar reserva» con motivo. Cada acción MUST enviar una sola solicitud y recargar el resumen.

#### Scenario: Publicar
- **WHEN** el responsable de un incidente verificado pulsa «Publicar en el mapa» y confirma
- **THEN** el bloque muestra «Publicado hasta» con la fecha de vencimiento

#### Scenario: No publicable
- **WHEN** el incidente no está verificado
- **THEN** el bloque explica que se publicará al verificarlo y no ofrece «Publicar»

#### Scenario: Aviso al verificar
- **WHEN** el responsable abre el diálogo de verificación
- **THEN** se le explica que marcarlo verificado lo publica en el mapa ciudadano como zona aproximada

#### Scenario: Retirar
- **WHEN** un operador de la principal retira con motivo
- **THEN** el bloque muestra «Retirado» con la causa y la acción de republicar solo si la API la permite

#### Scenario: Error de publicación
- **WHEN** la API responde 409 con un código de publicación
- **THEN** se muestra su explicación en texto y se recarga el resumen
