# movil/seguimiento-incidentes Specification

## Purpose

Mostrar en la app el seguimiento de los incidentes del ciudadano: el historial privado de la cuenta y la consulta limitada del invitado con referencia y código secreto, sin datos simulados ni información ajena.

## Requirements

### Requirement: Mis reportes con cuenta
Con sesión válida, «Mis reportes» MUST listar los incidentes propios del servidor con referencia, categoría, estado con texto e icono y recepción, y abrir su detalle. MUST mostrar estados de carga, vacío y error con reintento. El detalle MUST mostrar la institución responsable recibida del servidor y, si no la hay, mostrarla como pendiente de asignación. Las actuaciones sin datos MUST mostrarse como pendientes.

#### Scenario: Lista propia
- **WHEN** el ciudadano abre Mis reportes
- **THEN** ve sus incidentes ordenados del más reciente al más antiguo y puede cargar más si hay cursor

#### Scenario: Sin reportes
- **WHEN** el ciudadano no tiene incidentes
- **THEN** ve un estado vacío con acceso a Reportar

#### Scenario: Detalle recién registrado
- **WHEN** abre un incidente en REGISTRADO sin institución responsable informada
- **THEN** ve sus datos y la institución responsable como pendiente de asignación

#### Scenario: Detalle con institución responsable
- **WHEN** el servidor informa una institución responsable
- **THEN** se muestra su nombre con texto e icono, sin presentar el caso como recibido ni atendido

#### Scenario: Sesión vencida
- **WHEN** el servidor confirma que la sesión ya no es válida
- **THEN** se descartan los datos privados según la política de sesión vigente

### Requirement: Consulta con código del invitado
La app MUST ofrecer «Consultar con código» sin sesión, con referencia y código, y mostrar solo estado, institución responsable o pendiente y resumen ciudadano. Los comprobantes guardados en el dispositivo MUST poder abrirse sin reescribir el código. Ante 404 MUST mostrar un único mensaje genérico; ante 429 MUST indicar cuándo reintentar.

#### Scenario: Comprobante guardado
- **WHEN** un invitado abre una consulta guardada en el dispositivo
- **THEN** la app consulta con la referencia y el código guardados y muestra estado, institución responsable o pendiente y resumen

#### Scenario: Código incorrecto
- **WHEN** la consulta responde 404
- **THEN** se muestra «Referencia o código incorrectos» sin distinguir la causa

#### Scenario: Olvidar una consulta guardada
- **WHEN** el usuario elimina una consulta guardada
- **THEN** la referencia y el código desaparecen del almacenamiento seguro

### Requirement: Accesibilidad del seguimiento
Las listas, detalles y la consulta con código MUST cumplir etiquetas persistentes, objetivos de al menos 48, estados con texto e icono y operación al 200 % con lector de pantalla.

#### Scenario: Recorrido accesible
- **WHEN** se recorren Mis reportes y Consultar con código con lector de pantalla y texto al 200 %
- **THEN** todos los elementos son identificables y operables sin recortes

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
