# Spec Delta

## MODIFIED Requirements

### Requirement: Cierre con motivo y resumen ciudadano
Cerrar MUST exigir resultado ATENDIDO o DESCARTADO, un motivo interno de 10 a 500 caracteres y un resumen ciudadano de 10 a 300 caracteres. El motivo interno MUST NOT mostrarse al ciudadano. Un descarte MUST NOT contarse como atención realizada. El cierre MUST retirar en la misma transacción la publicación vigente del incidente, si la tiene.

#### Scenario: Cierre sin resumen
- **WHEN** el responsable cierra sin resumen ciudadano
- **THEN** recibe 400 con el campo señalado y el estado no cambia

#### Scenario: Resultado distinguible
- **WHEN** se consulta un incidente descartado
- **THEN** su estado es CERRADO y su resultado DESCARTADO, distinto de ATENDIDO

#### Scenario: Cierre de un publicado
- **WHEN** el responsable cierra un incidente con publicación vigente
- **THEN** la publicación queda retirada por cierre en la misma transacción y deja de ser pública

### Requirement: Verificación separada del estado
Cada incidente MUST tener una verificación SIN_VERIFICAR, VERIFICADO o NO_VERIFICADO, inicialmente SIN_VERIFICAR. El responsable de la principal MUST poder registrarla o corregirla con motivo de 10 a 500 caracteres mientras el incidente no esté CERRADO. La verificación MUST NOT cambiar el estado ni crear otro caso, y MUST NOT exigirse para cerrar. VERIFICADO MUST publicar y NO_VERIFICADO MUST retirar en la misma transacción (`operaciones/publicacion`).

#### Scenario: Verificar sin cambiar estado
- **WHEN** el responsable marca VERIFICADO un incidente EN_REVISION
- **THEN** la verificación cambia, el estado sigue EN_REVISION, el cambio queda auditado y el incidente se publica si cumple las condiciones

#### Scenario: Corrección
- **WHEN** el responsable cambia VERIFICADO a NO_VERIFICADO con motivo
- **THEN** ambos cambios constan en el historial con valor anterior y nuevo

#### Scenario: Corrección de un publicado
- **WHEN** el responsable corrige a NO_VERIFICADO un incidente publicado
- **THEN** la publicación queda retirada en la misma transacción
