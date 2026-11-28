# Spec Delta

## MODIFIED Requirements

### Requirement: Vinculación auditada a un principal
El responsable activo de la institución principal de un incidente abierto MUST poder vincularlo como duplicado de otro incidente abierto que su sede también ve dentro de su ámbito, con motivo de 10 a 500 caracteres. La vinculación MUST registrarse con actor, instante y motivo y MUST NOT cerrar, descartar ni marcar como falso al duplicado. MUST retirar en la misma transacción la publicación vigente del duplicado, y la vigencia del principal MUST NOT renovarse.

#### Scenario: Vincular
- **WHEN** el responsable vincula un incidente EN_REVISION a otro abierto que ve
- **THEN** queda vinculado, conserva su estado propio guardado, originales, código e historial, y la vinculación consta en el historial

#### Scenario: Principal no visible
- **WHEN** el principal indicado no es visible para la sede del responsable
- **THEN** recibe el mismo 404 que ante un incidente inexistente

#### Scenario: Vincular un publicado
- **WHEN** se vincula como duplicado un incidente con publicación vigente
- **THEN** su publicación queda retirada y la del principal conserva su vencimiento
