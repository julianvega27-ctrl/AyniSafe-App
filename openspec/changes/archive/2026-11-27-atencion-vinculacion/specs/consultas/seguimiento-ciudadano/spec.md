## ADDED Requirements

### Requirement: Hitos y cierre en el seguimiento
El detalle del autor y la vista del invitado MUST incluir los hitos ciudadanos del incidente en orden cronológico y, si está cerrado, el resultado ATENDIDO o DESCARTADO con su resumen ciudadano. Sin hitos, las actuaciones MUST seguir informándose como pendientes. MUST NOT incluir operadores, sedes, motivo interno ni verificación.

#### Scenario: Incidente descartado
- **WHEN** el autor consulta un incidente descartado desde revisión
- **THEN** ve CERRADO, resultado descartado, los hitos «En revisión» y «Cerrado: descartado» y el resumen ciudadano

#### Scenario: Invitado con código
- **WHEN** el invitado consulta un incidente en atención
- **THEN** ve los hitos sin descripción, sedes, operadores ni motivo interno

### Requirement: Duplicado coordinado en el seguimiento
Para un incidente vinculado como duplicado, el seguimiento MUST informar el estado y los hitos del principal como estado efectivo e indicar «Coordinado con otro reporte del mismo hecho», sin referencia, descripción, autor, evidencias ni datos del principal.

#### Scenario: Autor del duplicado
- **WHEN** el autor de un duplicado consulta su detalle
- **THEN** ve el estado del principal, la indicación de coordinación y sus propios datos originales
