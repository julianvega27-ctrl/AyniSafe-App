# Spec Delta

## MODIFIED Requirements

### Requirement: Resumen del incidente en el panel
Al abrir una fila, el panel MUST mostrar el resumen recibido. Las respuestas originales de heridos y atención médica MUST aparecer como informadas por el ciudadano, junto con la condición médica vigente, su origen e instante. MUST NOT ofrecer «Asumir caso», cambios de estado, prioridad ni otras acciones que la API no tenga. Un 404 MUST mostrarse como incidente no disponible, sin distinguir si existe.

#### Scenario: Abrir resumen
- **WHEN** el operador abre una fila
- **THEN** ve el resumen y puede volver a la bandeja conservando su posición

#### Scenario: Incidente fuera de ámbito
- **WHEN** se abre directamente la ruta de un incidente que responde 404
- **THEN** se muestra «Incidente no disponible» sin datos

#### Scenario: Condición precisada
- **WHEN** el resumen trae una condición vigente de origen operador
- **THEN** se ven por separado la respuesta original del ciudadano y la condición vigente con su institución e instante

## ADDED Requirements

### Requirement: Precisar condición médica
En el resumen de un incidente con evaluación y no cerrado, el operador MUST poder abrir «Precisar condición médica» con heridos y atención médica (si aplica) en botones Sí, No y No sé, la cantidad con accesos rápidos y +/−, y un motivo obligatorio de 10 a 500 caracteres. MUST enviar una sola solicitud con los campos cambiados, informar el resultado y recargar el resumen. Si la precisión activa a SAMU, MUST indicarlo.

#### Scenario: PNP activa SAMU
- **WHEN** un operador PNP precisa heridos Sí con motivo en un accidente con revisión pendiente
- **THEN** se informa que SAMU fue incorporado y el resumen muestra la condición vigente y las instituciones actualizadas

#### Scenario: Motivo insuficiente
- **WHEN** el motivo tiene menos de 10 caracteres
- **THEN** el formulario muestra el error junto al campo y no envía la solicitud

### Requirement: Evaluación para el operador SAMU
Cuando el resumen indica acceso al detalle sanitario, el panel MUST mostrar la sección «Evaluación rápida» con la versión vigente, su instante, las respuestas sin respuesta como tales y el historial con origen, institución, instante, campos modificados y motivo. MUST ofrecer «Registrar aclaración» con todos los campos de la evaluación y motivo. A otras instituciones MUST NOT mostrarse esta sección ni la acción.

#### Scenario: Operador SAMU
- **WHEN** un operador SAMU abre un incidente en que participa
- **THEN** ve la evaluación vigente, su historial y «Registrar aclaración»

#### Scenario: Operador PNP
- **WHEN** un operador PNP abre el mismo incidente
- **THEN** no ve observaciones de la persona principal, motivos ni «Registrar aclaración»

#### Scenario: Evaluación no disponible
- **WHEN** la consulta de la evaluación falla o responde 404
- **THEN** la sección indica que no está disponible, sin ocultar el resto del resumen

### Requirement: Accesibilidad de la evaluación en el panel
Los grupos de respuestas MUST ser grupos de opciones con nombre, operables con teclado y con la opción marcada anunciada; el historial MUST leerse como lista ordenada; los errores MUST asociarse a su campo con texto. MUST reutilizar componentes y tokens de DESIGN.md sin estilos locales nuevos.

#### Scenario: Recorrido con teclado
- **WHEN** se precisa la condición médica solo con teclado
- **THEN** cada grupo, el motivo y el envío son alcanzables y su estado se anuncia
