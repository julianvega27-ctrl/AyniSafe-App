# Spec Delta

## MODIFIED Requirements

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
