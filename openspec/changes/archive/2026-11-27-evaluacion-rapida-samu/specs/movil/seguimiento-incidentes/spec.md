# Spec Delta

## ADDED Requirements

### Requirement: Evaluación propia en Mis reportes
El detalle de Mis reportes MUST mostrar, si el servidor la informa, la evaluación propia con el instante en que se informó y sin presentarla como estado clínico actual. Si el servidor solicita completarla, MUST mostrar un aviso con texto e icono y la acción «Completar evaluación». La consulta con código MUST NOT mostrar datos de la evaluación.

#### Scenario: Solicitud de completar
- **WHEN** el detalle indica que SAMU interviene sin observaciones de la persona principal
- **THEN** se ve el aviso y la acción «Completar evaluación»

#### Scenario: Evaluación informada
- **WHEN** el detalle incluye respuestas propias
- **THEN** se muestran con «Informado el» y la fecha y hora, y las omitidas como «Sin respuesta»

### Requirement: Aclarar la evaluación desde la app
Si el servidor indica que puede aclararse, la app MUST ofrecer «Aclarar evaluación» con los mismos controles del formulario, precargados con las respuestas propias, y enviar solo los campos cambiados. Tras una respuesta correcta MUST actualizar el detalle. Ante error de red MUST conservar lo marcado y permitir reintentar; ante 404 o sesión vencida MUST aplicar el mensaje y la política vigentes.

#### Scenario: Aclaración enviada
- **WHEN** el autor cambia heridos de No sé a Sí, elige 2 y confirma
- **THEN** se envía una sola solicitud con esos campos y el detalle muestra la evaluación actualizada

#### Scenario: Sin conexión
- **WHEN** la aclaración falla por red
- **THEN** se informa el error y lo marcado se conserva para reintentar

#### Scenario: Incidente cerrado
- **WHEN** el servidor indica que la evaluación ya no puede aclararse
- **THEN** no se ofrece «Aclarar evaluación»
