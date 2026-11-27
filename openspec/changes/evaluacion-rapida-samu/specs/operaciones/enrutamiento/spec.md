# Spec Delta

## MODIFIED Requirements

### Requirement: Evento de enrutamiento resuelto
Cada resultado de enrutamiento, designación, reevaluación o actualización de la condición médica MUST publicar un evento `EnrutamientoResuelto` en la misma transacción, con el identificador del incidente, el resultado (enrutado o pendiente) y su origen (regla, designación, reevaluación o condicion_medica), sin datos personales, narrativos ni sanitarios. Sin consumidores registrados, el evento MUST conservarse.

#### Scenario: Evento al enrutar
- **WHEN** el consumidor enruta un incidente
- **THEN** existe un evento EnrutamientoResuelto con su resultado, creado en la misma transacción

#### Scenario: Sin avisos de usuario
- **WHEN** se inspecciona la base tras enrutar
- **THEN** no existen avisos por usuario ni estados de lectura, que pertenecen a la capacidad de avisos

#### Scenario: Evento por condición médica
- **WHEN** una aclaración activa a SAMU en un incidente enrutado
- **THEN** existe un evento EnrutamientoResuelto con origen condicion_medica y sin respuestas sanitarias

## ADDED Requirements

### Requirement: Condición médica vigente al enrutar
El enrutamiento inicial MUST aplicar la matriz con heridos y atención médica de la versión vigente de la evaluación, no solo con las respuestas originales. Si una aclaración se confirma antes de procesar la entrega de enrutamiento, MUST usarse la condición aclarada.

#### Scenario: Aclaración antes de enrutar
- **WHEN** el autor informa heridos si en un accidente cuyo enrutamiento aún no se procesó
- **THEN** el enrutamiento resultante tiene SAMU principal y PNP simultánea

### Requirement: Actualización positiva de la condición médica
Cuando una versión nueva hace que la matriz requiera a SAMU, MUST recalcularse en su transacción con la versión de regla guardada. En accidente, SAMU MUST pasar a principal y PNP a simultánea conservando su participación; en agresión, pelea o violencia, SAMU MUST añadirse como condicionada. Las sedes SAMU MUST salir de la selección vigente; sin ellas, MUST quedar `ENRUTAMIENTO_PENDIENTE` con el faltante.

#### Scenario: Accidente pasa a SAMU principal
- **WHEN** un operador PNP precisa heridos si en un accidente con PNP principal y revisión pendiente
- **THEN** SAMU participa como principal, PNP sigue participando como simultánea y la revisión médica deja de estar pendiente

#### Scenario: Agresión con heridos aclarados
- **WHEN** el autor de una agresión con heridos no_se informa heridos si
- **THEN** SAMU se añade como condicionada y PNP sigue siendo principal

#### Scenario: SAMU sin sede elegible
- **WHEN** se activa SAMU en un distrito sin sede SAMU elegible
- **THEN** el enrutamiento queda pendiente con el faltante de SAMU y PNP conserva su participación

#### Scenario: Incidente aún no enrutado
- **WHEN** la aclaración llega antes del enrutamiento inicial
- **THEN** no se crea un segundo enrutamiento y el inicial usa la condición vigente

### Requirement: Sin retiro por condición médica
Una actualización de la condición médica MUST NOT retirar participaciones ni rebajar el papel de SAMU ya participante. Precisar a `no` todas las respuestas desconocidas MUST cerrar la revisión médica pendiente sin añadir SAMU. Un recálculo sin cambios en destinatarios ni revisión MUST NOT publicar eventos.

#### Scenario: Corrección negativa con SAMU participante
- **WHEN** se precisa heridos no y atención médica no en un accidente con SAMU principal
- **THEN** SAMU sigue como principal y PNP como simultánea

#### Scenario: Revisión resuelta sin SAMU
- **WHEN** se precisan heridos no y atención médica no en un accidente con revisión pendiente
- **THEN** PNP sigue como principal, SAMU no participa y la revisión médica deja de estar pendiente

### Requirement: Auditoría de cambios de enrutamiento
Cada recálculo con efecto MUST registrar el incidente, la versión de evaluación que lo causó, el origen y el actor (autor o operador), los destinatarios y la revisión pendiente antes y después, y el instante, sin respuestas sanitarias ni motivos. Los registros MUST NOT modificarse ni borrarse fuera de la conservación.

#### Scenario: Historial del cambio de principal
- **WHEN** un accidente pasa de PNP principal a SAMU principal
- **THEN** existe un registro con PNP principal antes, SAMU principal y PNP simultánea después y la versión que lo causó
