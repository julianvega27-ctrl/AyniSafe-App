# Spec Delta

## Purpose

Mostrar en el panel web la bandeja de incidentes del operador y los enrutamientos pendientes del administrador con datos reales de la API, la composición de la referencia de DESIGN.md y sin adelantar avisos, acciones de atención ni métricas.

## ADDED Requirements

### Requirement: Sección Incidentes del operador
La sección «Incidentes» MUST listar la bandeja recibida de la API en su orden, con referencia, categoría, distrito, estado, papel de la institución, condición médica por confirmar y prioridad «Sin evaluar», mostrando cada etiqueta con texto e icono. MUST ofrecer «Cargar más» cuando haya cursor y «Actualizar» para volver a consultar desde el inicio. MUST NOT reordenar las filas en el cliente.

#### Scenario: Bandeja con incidentes
- **WHEN** un operador abre «Incidentes»
- **THEN** ve las filas en el orden recibido, la más antigua primero, con sus etiquetas textuales

#### Scenario: Actualizar
- **WHEN** el operador pulsa «Actualizar»
- **THEN** se consulta de nuevo la primera página, sin consultas automáticas periódicas

#### Scenario: Bandeja vacía
- **WHEN** la API devuelve una lista vacía
- **THEN** se informa que no hay incidentes asignados a su sede, sin datos de ejemplo

### Requirement: Resumen del incidente en el panel
Al abrir una fila, el panel MUST mostrar el resumen recibido. Las respuestas de heridos y atención médica MUST aparecer como informadas por el ciudadano. MUST NOT ofrecer «Asumir caso», cambios de estado, prioridad ni otras acciones que la API no tenga. Un 404 MUST mostrarse como incidente no disponible, sin distinguir si existe.

#### Scenario: Abrir resumen
- **WHEN** el operador abre una fila
- **THEN** ve el resumen y puede volver a la bandeja conservando su posición

#### Scenario: Incidente fuera de ámbito
- **WHEN** se abre directamente la ruta de un incidente que responde 404
- **THEN** se muestra «Incidente no disponible» sin datos

### Requirement: Bloque de enrutamiento pendiente del administrador
La sección «Inicio» del administrador MUST mostrar únicamente el bloque «Enrutamiento pendiente», con los pendientes en el orden recibido y sus faltantes. Desde cada faltante MUST permitir designar una sede de la institución faltante con un motivo obligatorio, y MUST permitir reevaluar el caso. El resto del resumen MUST seguir indicado como no disponible.

#### Scenario: Designar sede
- **WHEN** el administrador elige una sede habilitada, escribe el motivo y confirma
- **THEN** se envía una sola solicitud, se informa el resultado y la lista se actualiza

#### Scenario: Designación rechazada
- **WHEN** la API responde 409
- **THEN** se explica el requisito incumplido con texto e icono, sin presentar la designación como hecha

#### Scenario: Sin pendientes
- **WHEN** no hay enrutamientos pendientes
- **THEN** se informa que no hay casos sin asignar, sin ceros presentados como métricas

### Requirement: Estados de carga, error y sesión
La bandeja, el resumen y el bloque de pendientes MUST mostrar estados de carga, error de red o servicio con «Reintentar» y, ante una respuesta 401, la salida a `/acceso` sin conservar datos. Ante una respuesta 403 MUST indicar que no hay permiso, sin datos.

#### Scenario: Servicio no disponible
- **WHEN** la consulta de la bandeja falla por red
- **THEN** se informa el problema con «Reintentar» y no se muestran filas anteriores como actuales

#### Scenario: Sesión vencida
- **WHEN** la API responde 401
- **THEN** se vuelve a `/acceso` con aviso y no queda contenido privado visible

### Requirement: Fidelidad y accesibilidad de la bandeja
La bandeja y el bloque de pendientes MUST reutilizar los componentes y tokens del panel según la referencia de DESIGN.md, sin colores, radios ni tipografías locales. MUST ser operables con teclado, con foco visible y nombres accesibles, y legibles en pantallas estrechas sin desplazamiento horizontal de la página.

#### Scenario: Teclado y pantalla estrecha
- **WHEN** se recorre la bandeja con teclado en un viewport estrecho
- **THEN** todas las filas y acciones son alcanzables con foco visible y la página no se desplaza horizontalmente
