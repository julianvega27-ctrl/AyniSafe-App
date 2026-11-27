# web/bandeja-incidentes Specification

## Purpose

Mostrar en el panel web la bandeja de incidentes del operador y los enrutamientos pendientes del administrador con datos reales de la API, la composición de la referencia de DESIGN.md y sin adelantar avisos, acciones de atención ni métricas.

## Requirements

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
