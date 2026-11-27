# Spec Delta

## Purpose

Conservar la evaluación rápida informada sobre una persona principal y la cantidad total de heridos cuando SAMU interviene, con versiones trazables de cada aclaración del autor o de un operador, sin convertir lo desconocido en normal ni exponer datos sanitarios fuera de su ámbito.

## ADDED Requirements

### Requirement: Campos de la evaluación
La evaluación MUST contener la respuesta de heridos, la de atención médica (solo en accidente), la cantidad total de heridos (entero de 1 a 999 o `no_se`) y, de una única persona principal, signos de vida (`observados`, `no_observados`, `no_se`), conciencia y sangrado visible (`si`, `no`, `no_se`). Un campo omitido MUST quedar sin respuesta. MUST NOT admitir nombres, documentos, fichas de otras personas ni valores clínicos medidos.

#### Scenario: Observaciones parciales
- **WHEN** se informa una persona principal solo con conciencia `si`
- **THEN** signos de vida y sangrado quedan sin respuesta, no como valores normales

#### Scenario: Ficha adicional
- **WHEN** el cuerpo incluye una segunda persona o un campo de nombre
- **THEN** se responde 400 por campo no admitido

### Requirement: Coherencia entre heridos y cantidad
Con heridos `si`, la cantidad MUST ser un entero de 1 a 999 o `no_se`; si se omite, MUST quedar como `no_se`. Con heridos `no`, `no_se` o sin respuesta, MUST NOT enviarse cantidad. Una combinación incoherente MUST rechazarse con 400 indicando el campo, sin corregirla en silencio y sin persistir una evaluación inconsistente.

#### Scenario: Varios heridos con cantidad desconocida
- **WHEN** se informa heridos `si` sin cantidad
- **THEN** la cantidad queda `no_se` y nunca cero

#### Scenario: Cantidad sin heridos
- **WHEN** se informa heridos `no` con cantidad 2
- **THEN** se responde 400 en el campo cantidad y no se crea versión

#### Scenario: Aclaración que cambia heridos a no
- **WHEN** una aclaración cambia heridos de `si` con cantidad 3 a `no`
- **THEN** la nueva versión no tiene cantidad y la cantidad figura entre los campos modificados

### Requirement: Aplicación de las observaciones a SAMU
Las observaciones de la persona principal y la cantidad MUST admitirse solo cuando SAMU es destinatario según la condición resultante: emergencia médica siempre; accidente con heridos o atención médica `si`; agresión, pelea o violencia con heridos `si`. En otro caso MUST responderse 400 por campo no aplicable. La cantidad total MUST NOT copiarse a las observaciones ni las observaciones extrapolarse a otros heridos.

#### Scenario: Emergencia médica sin heridos
- **WHEN** se envía una emergencia médica con heridos `no` y observaciones del paciente
- **THEN** se conservan las observaciones como persona principal

#### Scenario: Accidente sin condición médica
- **WHEN** se envía un accidente con heridos `no`, atención médica `no` y observaciones
- **THEN** se responde 400 por campo no aplicable

### Requirement: Versiones de la evaluación
Cada incidente de accidente, agresión, pelea, violencia o emergencia médica MUST tener una evaluación con versión 1 creada al registrarse. Cada aclaración con cambios MUST crear la versión siguiente con la instantánea completa, el origen (`ciudadano` u `operador`), la institución del operador, el instante y los campos modificados. Las versiones MUST NOT modificarse ni borrarse fuera de la conservación.

#### Scenario: Historial tras dos aclaraciones
- **WHEN** el autor y luego un operador SAMU aclaran la evaluación
- **THEN** existen las versiones 1, 2 y 3 con su origen, instante y campos modificados, y la vigente es la 3

#### Scenario: Categoría sin preguntas médicas
- **WHEN** se registra un robo
- **THEN** el incidente no tiene evaluación

### Requirement: Aclaración sin cambios
Una aclaración cuyo resultado coincide con la versión vigente MUST NOT crear versión ni publicar eventos y MUST devolver la vigente. Aclaraciones concurrentes sobre el mismo incidente MUST serializarse y numerarse sin huecos ni duplicados.

#### Scenario: Reintento de una aclaración
- **WHEN** se repite una aclaración ya aplicada tras perder la respuesta
- **THEN** sigue existiendo una sola versión con esos cambios

#### Scenario: Aclaraciones simultáneas
- **WHEN** el autor y un operador aclaran campos distintos a la vez
- **THEN** se crean dos versiones consecutivas y la vigente conserva ambos cambios

### Requirement: Aclaración del autor con cuenta
El autor con cuenta MUST poder aclarar su evaluación con `POST /ciudadano/incidentes/{referencia}/evaluacion` mientras el incidente no esté cerrado, enviando solo los campos que cambia. Un incidente ajeno, de invitado o inexistente MUST responder 404 uniforme. El invitado MUST NOT poder aclarar la evaluación.

#### Scenario: Autor completa la evaluación
- **WHEN** el autor de un accidente con heridos `no_se` informa heridos `si` y cantidad 2
- **THEN** se crea una versión de origen ciudadano y se responde con sus propias respuestas vigentes

#### Scenario: Incidente ajeno
- **WHEN** un ciudadano aclara la evaluación de un incidente de otro autor
- **THEN** recibe 404 idéntico al de una referencia inexistente

#### Scenario: Incidente cerrado
- **WHEN** el autor aclara la evaluación de un incidente cerrado
- **THEN** recibe 409 sin crear versión

### Requirement: Aclaración del operador
Un operador cuya sede participa en el incidente no cerrado, dentro de su ámbito vigente, MUST poder precisar heridos, atención médica y cantidad con `POST /operador/incidentes/{id}/evaluacion` y un motivo de 10 a 500 caracteres. Solo el operador SAMU participante MUST poder enviar observaciones de la persona principal. Un operador sin participación MUST recibir 404 uniforme; un administrador o ciudadano, 403.

#### Scenario: Operador PNP precisa heridos
- **WHEN** un operador PNP participante informa heridos `si` con motivo en un accidente
- **THEN** se crea una versión de origen operador e institución PNP

#### Scenario: Operador no SAMU envía observaciones
- **WHEN** un operador PNP envía conciencia de la persona principal
- **THEN** se responde 400 por campo no admitido para su institución sin crear versión

### Requirement: Evento de evaluación actualizada
Cada versión nueva MUST publicar en su transacción un evento `EvaluacionActualizada` con incidente, versión y origen, sin respuestas, motivo ni datos personales. Sin consumidores registrados, el evento MUST conservarse.

#### Scenario: Evento sin datos sanitarios
- **WHEN** se inspecciona el evento de una aclaración
- **THEN** su carga contiene solo incidente, versión y origen

### Requirement: Propiedad de los datos sanitarios
Solo Reportes MUST escribir evaluaciones y versiones, incluidas las de origen operador, mediante su contrato transaccional. Respuestas sanitarias y motivos MUST NOT copiarse a tablas de otros módulos, logs, eventos ni descripciones. Las rutas MUST usar no-store y documentarse en OpenAPI.

#### Scenario: Logs de una aclaración
- **WHEN** se registra una aclaración con motivo
- **THEN** los logs contienen identificadores y resultado, sin respuestas ni motivo
