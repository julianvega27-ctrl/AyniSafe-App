# Spec Delta

## MODIFIED Requirements

### Requirement: Formulario de reporte
Reportar MUST abrir el formulario en el orden categoría, descripción, cuándo, ubicación, si aplica preguntas de heridos y atención médica, si SAMU interviene la evaluación rápida, y el teléfono solo para invitado. Categoría MUST iniciar sin selección; solo «Ahora» MUST tener valor inicial. La composición MUST reproducir el formulario del origen con los componentes y tokens de DESIGN.md, sin fotos.

#### Scenario: Apertura con cuenta
- **WHEN** un ciudadano con sesión abre Reportar
- **THEN** ve el formulario sin campo de teléfono, sin categoría preseleccionada y con «Ahora» marcado

#### Scenario: Apertura como invitado
- **WHEN** una persona sin sesión abre Reportar
- **THEN** ve el formulario con el teléfono obligatorio y la explicación de su uso restringido al personal competente del caso

#### Scenario: Otra emergencia
- **WHEN** se elige Otra emergencia
- **THEN** el campo de descripción se rotula «¿Qué otra emergencia está ocurriendo?» y sigue siendo obligatorio

### Requirement: Preguntas de heridos y atención médica
Las preguntas MUST aparecer solo para las categorías del contrato, incluida Emergencia médica para «¿Hay heridos?», y MUST usar botones de selección única Sí, No y No sé, sin preselección. Cambiar a una categoría sin preguntas MUST excluirlas del envío. Las respuestas MUST conservarse al cambiar de sección del formulario.

#### Scenario: Accidente de tránsito
- **WHEN** se elige Accidente de tránsito
- **THEN** aparecen «¿Hay heridos?» y «¿Se necesita atención médica?» con Sí, No y No sé, sin opción marcada

#### Scenario: Emergencia médica
- **WHEN** se elige Emergencia médica
- **THEN** aparece «¿Hay heridos?» sin opción marcada y no aparece «¿Se necesita atención médica?»

#### Scenario: Enviar sin responder
- **WHEN** se envía una pelea sin responder la pregunta de heridos
- **THEN** el envío no se bloquea y la respuesta queda sin respuesta, no como «No»

#### Scenario: Cambio a categoría sin preguntas
- **WHEN** tras responder se cambia a Robo
- **THEN** las preguntas desaparecen y no se envían

## ADDED Requirements

### Requirement: Bloque de evaluación rápida para SAMU
El bloque «Evaluación rápida para SAMU» MUST aparecer cuando las respuestas hacen intervenir a SAMU según el contrato, y ocultarse cuando dejan de hacerlo, conservando lo marcado sin enviarlo. MUST indicar que describe a una sola persona principal y que puede enviarse con información pendiente. Signos de vida, conciencia y sangrado MUST usar botones de selección única con «No sé» visible y distinto de «No», sin preselección.

#### Scenario: Pelea con heridos
- **WHEN** en una pelea se marca heridos Sí
- **THEN** aparece el bloque con la cantidad y las tres observaciones sin opción marcada

#### Scenario: Ocultar y recuperar
- **WHEN** se cambia heridos a No y luego otra vez a Sí
- **THEN** el bloque se oculta sin enviar sus datos y reaparece con lo marcado antes

#### Scenario: Enviar con información pendiente
- **WHEN** se envía una emergencia médica sin responder el bloque
- **THEN** el envío no se bloquea y las respuestas quedan sin respuesta

### Requirement: Cantidad de heridos sin teclado
Con heridos Sí, la cantidad MUST ofrecerse con botones 1, 2, 3, 4, 5, «Otra cantidad» y «No sé», sin preselección. «Otra cantidad» MUST mostrar controles − y + desde 6 hasta 999 sin abrir el teclado. Sin respuesta, la cantidad MUST enviarse como desconocida, nunca como cero.

#### Scenario: Cantidad exacta mayor que cinco
- **WHEN** se elige «Otra cantidad» y se pulsa + dos veces
- **THEN** la cantidad es 8 y no se abrió el teclado

#### Scenario: Límite inferior de otra cantidad
- **WHEN** la otra cantidad es 6 y se pulsa −
- **THEN** sigue siendo 6 y el control − está deshabilitado
