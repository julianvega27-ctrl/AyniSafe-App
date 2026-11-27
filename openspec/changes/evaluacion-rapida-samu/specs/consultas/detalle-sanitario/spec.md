# Spec Delta

## Purpose

Entregar la evaluación rápida solo a quien tiene derecho a verla: el operador SAMU que participa en el caso y el autor sobre sus propias respuestas. Las demás instituciones reciben el resumen de heridos necesario para coordinar, y el resto de las personas y vistas no recibe datos sanitarios.

## ADDED Requirements

### Requirement: Detalle sanitario del operador SAMU
`GET /operador/incidentes/{id}/evaluacion` MUST devolver la evaluación vigente y el historial de versiones (número, origen, institución, instante, campos modificados y motivo) solo a un operador cuya sede SAMU participa en el incidente dentro de su ámbito vigente. MUST NOT incluir nombres de operadores, teléfono, coordenadas ni datos de otros informantes.

#### Scenario: Operador SAMU participante
- **WHEN** un operador de una sede SAMU participante consulta la evaluación
- **THEN** recibe la versión vigente con el instante en que se informó y el historial completo

#### Scenario: Evaluación pendiente
- **WHEN** SAMU participa y nadie ha informado observaciones de la persona principal
- **THEN** la respuesta marca la evaluación como pendiente, con las observaciones sin respuesta

### Requirement: Acceso sanitario rechazado de forma uniforme
Un operador de otra institución, una sede SAMU sin participación o fuera de ámbito, un identificador inexistente o malformado, o un incidente sin evaluación MUST recibir el mismo 404. Un administrador o un ciudadano MUST recibir 403. El código de invitado MUST NOT dar acceso a la evaluación.

#### Scenario: Otra institución participante
- **WHEN** un operador PNP que participa en el incidente pide la evaluación
- **THEN** recibe 404 idéntico al de un identificador inexistente

#### Scenario: Administrador
- **WHEN** un administrador pide la evaluación de cualquier incidente
- **THEN** recibe 403 sin datos sanitarios

### Requirement: Resumen de heridos para la coordinación
Las instituciones participantes que no son SAMU MUST recibir en el resumen del incidente solo la condición médica vigente: heridos, atención médica, cantidad, si queda revisión médica pendiente, el origen e instante de la última versión, y si SAMU dispone de observaciones. MUST NOT recibir las observaciones de la persona principal ni los motivos.

#### Scenario: Resumen PNP de un accidente con SAMU
- **WHEN** un operador PNP abre un accidente con observaciones informadas
- **THEN** ve heridos, cantidad y atención médica, sin signos de vida, conciencia, sangrado ni motivos

### Requirement: Registro de accesos sin contenido
Cada lectura autorizada del detalle sanitario MUST registrarse con el usuario, el incidente, la versión leída y el instante, sin respuestas ni motivos. Una lectura rechazada MUST NOT registrarse como acceso autorizado.

#### Scenario: Lectura auditada
- **WHEN** un operador SAMU consulta la evaluación
- **THEN** queda un registro de acceso con su usuario, el incidente y la versión, sin contenido sanitario

### Requirement: Exclusiones de datos sanitarios
Las respuestas individuales de la evaluación MUST NOT aparecer en la bandeja, la consulta del invitado, las vistas del administrador, los eventos, los logs ni las respuestas públicas. Las respuestas MUST usar no-store y el contrato MUST documentar los estados 200/401/403/404.

#### Scenario: Revisión de respuestas no autorizadas
- **WHEN** se recorren la bandeja, la consulta del invitado, los pendientes del administrador y los eventos de un incidente con evaluación
- **THEN** ninguna contiene signos de vida, conciencia, sangrado ni motivos
