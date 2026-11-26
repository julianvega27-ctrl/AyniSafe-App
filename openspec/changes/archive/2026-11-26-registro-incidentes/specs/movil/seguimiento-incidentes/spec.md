# Spec Delta

## Purpose

Mostrar en la app el seguimiento de los incidentes del ciudadano: el historial privado de la cuenta y la consulta limitada del invitado con referencia y código secreto, sin datos simulados ni información ajena.

## ADDED Requirements

### Requirement: Mis reportes con cuenta
Con sesión válida, «Mis reportes» MUST listar los incidentes propios del servidor con referencia, categoría, estado con texto e icono y recepción, y abrir su detalle. MUST mostrar estados de carga, vacío y error con reintento. Institución responsable y actuaciones sin datos MUST mostrarse como pendientes.

#### Scenario: Lista propia
- **WHEN** el ciudadano abre Mis reportes
- **THEN** ve sus incidentes ordenados del más reciente al más antiguo y puede cargar más si hay cursor

#### Scenario: Sin reportes
- **WHEN** el ciudadano no tiene incidentes
- **THEN** ve un estado vacío con acceso a Reportar

#### Scenario: Detalle recién registrado
- **WHEN** abre un incidente en REGISTRADO
- **THEN** ve sus datos y la institución responsable como pendiente de asignación

#### Scenario: Sesión vencida
- **WHEN** el servidor confirma que la sesión ya no es válida
- **THEN** se descartan los datos privados según la política de sesión vigente

### Requirement: Consulta con código del invitado
La app MUST ofrecer «Consultar con código» sin sesión, con referencia y código, y mostrar solo estado y resumen ciudadano. Los comprobantes guardados en el dispositivo MUST poder abrirse sin reescribir el código. Ante 404 MUST mostrar un único mensaje genérico; ante 429 MUST indicar cuándo reintentar.

#### Scenario: Comprobante guardado
- **WHEN** un invitado abre una consulta guardada en el dispositivo
- **THEN** la app consulta con la referencia y el código guardados y muestra estado y resumen

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
