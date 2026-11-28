## ADDED Requirements

### Requirement: Atención en el seguimiento de la app
El detalle de Mis reportes y la consulta con código MUST mostrar los hitos recibidos en orden con su fecha, el resultado de cierre con texto e icono («Atendido» o «Descartado») y su resumen ciudadano, y la indicación de coordinación de un duplicado. Sin hitos MUST seguir mostrando las actuaciones como pendientes. MUST NOT inferir estados ni resultados en el cliente.

#### Scenario: Caso atendido
- **WHEN** el servidor informa CERRADO con resultado ATENDIDO
- **THEN** la app muestra «Atendido» con icono y el resumen ciudadano, además de los hitos

#### Scenario: Caso descartado
- **WHEN** el servidor informa resultado DESCARTADO
- **THEN** la app muestra «Descartado» con su resumen, sin presentarlo como atendido
