## MODIFIED Requirements

### Requirement: Estado inicial REGISTRADO
Todo incidente nuevo MUST iniciar en REGISTRADO, el primero de los cuatro estados REGISTRADO, EN_REVISION, EN_ATENCION y CERRADO, con verificación SIN_VERIFICAR y sin resultado. La BD MUST rechazar cualquier otro valor. REGISTRADO MUST NOT implicar verificación, recepción institucional ni atención. Las transiciones MUST realizarse solo mediante la capacidad `operaciones/atencion-institucional`.

#### Scenario: Estado al crear
- **WHEN** se crea un incidente desde un envío
- **THEN** su estado es REGISTRADO, su verificación SIN_VERIFICAR, sin resultado, y su instante de registro es el del servidor

#### Scenario: Estado no admitido
- **WHEN** se intenta guardar un estado fuera de los cuatro definidos, como ASIGNADO o PENDIENTE_ATENCION
- **THEN** la restricción de la BD lo rechaza

#### Scenario: Sin transiciones expuestas
- **WHEN** se revisa el contrato publicado
- **THEN** no hay rutas que cambien el estado fuera de las de asumir, iniciar atención y cerrar del operador

## ADDED Requirements

### Requirement: Resultado coherente con el estado
Un incidente CERRADO MUST tener resultado ATENDIDO o DESCARTADO, y uno no cerrado MUST NOT tener resultado; la BD MUST rechazar cualquier otra combinación.

#### Scenario: Cerrado sin resultado
- **WHEN** se intenta guardar un incidente CERRADO sin resultado
- **THEN** la restricción de la BD lo rechaza
