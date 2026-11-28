# web/bandeja-incidentes Specification

## Purpose

Mostrar en el panel web la bandeja de incidentes del operador y los enrutamientos pendientes del administrador con datos reales de la API, la composición de la referencia de DESIGN.md y sin adelantar avisos, acciones de atención ni métricas.

## Requirements

### Requirement: Sección Incidentes del operador
La sección «Incidentes» MUST listar la bandeja recibida de la API en su orden, con referencia, categoría, distrito, estado, papel de la institución, condición médica por confirmar, responsable de su institución y prioridad vigente, mostrando cada etiqueta con texto e icono. MUST ofrecer «Cargar más» cuando haya cursor y «Actualizar» para volver a consultar desde el inicio. MUST NOT reordenar las filas en el cliente.

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
Al abrir una fila, el panel MUST mostrar el resumen recibido. Las respuestas originales de heridos y atención médica MUST aparecer como informadas por el ciudadano, junto con la condición médica vigente, su origen e instante. MUST ofrecer solo las acciones permitidas que informa la API. Un 404 MUST mostrarse como incidente no disponible, sin distinguir si existe.

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
La sección «Inicio» del administrador MUST mostrar los bloques «Enrutamiento pendiente» y «Responsables activos». Desde cada faltante MUST permitir designar una sede de la institución faltante con un motivo obligatorio, y MUST permitir reevaluar el caso. El resto del resumen MUST seguir indicado como no disponible.

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

### Requirement: Fotografías en el resumen del incidente
Cuando el resumen informa fotos disponibles, el panel MUST mostrar la sección «Fotografías» con cada imagen obtenida mediante la sesión institucional y su instante. MUST permitir ampliarlas. MUST NOT guardar las imágenes en almacenamiento del navegador ni exponer URLs del proveedor. Sin fotos, la sección MUST indicar que el ciudadano no adjuntó fotografías.

#### Scenario: Incidente con fotos
- **WHEN** un operador participante abre un incidente con dos fotos
- **THEN** ve la sección «Fotografías» con las dos imágenes y su instante

#### Scenario: Sin fotos
- **WHEN** el incidente no tiene fotos disponibles
- **THEN** la sección indica que no se adjuntaron fotografías

#### Scenario: Foto no disponible
- **WHEN** la obtención de una foto responde 404 o 503
- **THEN** su lugar indica que no está disponible, sin ocultar el resto del resumen

### Requirement: Accesibilidad de las fotografías en el panel
Cada imagen MUST tener un texto alternativo «Fotografía N enviada por el ciudadano», ampliarse y cerrarse con teclado, con el foco devuelto al origen, y MUST reutilizar los componentes y tokens de DESIGN.md sin estilos locales nuevos.

#### Scenario: Ampliar con teclado
- **WHEN** el operador amplía una foto con Enter y la cierra con Escape
- **THEN** la vista ampliada se anuncia con su nombre y el foco vuelve a la miniatura

### Requirement: Acciones de atención en el resumen
El resumen MUST mostrar el recorrido de los cuatro estados con el actual marcado con texto, una sola acción principal según el estado y las acciones permitidas («Tomar el caso», «Iniciar atención» o «Cerrar como atendido») con una frase sobre su efecto, y «Descartar» como acción secundaria. Verificación, prioridad y duplicado MUST agruparse en un «Control del caso» plegable.

#### Scenario: Asumir y revisar
- **WHEN** el operador de la principal pulsa «Tomar el caso» en un incidente REGISTRADO
- **THEN** el resumen se actualiza como EN_REVISION con él como responsable

#### Scenario: Una acción principal
- **WHEN** el responsable de la principal abre un incidente EN_REVISION
- **THEN** la única acción principal visible es «Iniciar atención» y el control del caso está plegado

#### Scenario: Conflicto al asumir
- **WHEN** la API responde 409 porque otro operador asumió
- **THEN** se informa que otro operador de su institución es responsable y se recarga el resumen

### Requirement: Responsables activos del administrador
El bloque «Responsables activos» MUST listar las asignaciones recibidas con referencia, estado, institución, sede y responsable, destacar con texto e icono las pendientes de reasignación y permitir liberar o reasignar con motivo obligatorio a un operador elegible.

#### Scenario: Reasignar
- **WHEN** el administrador elige otro operador, escribe el motivo y confirma
- **THEN** se envía una sola solicitud y la lista muestra al nuevo responsable

### Requirement: Filtros de responsable en la bandeja web
La sección «Incidentes» MUST ofrecer los filtros «Sin tomar», «Mis casos» y «Todos» como control segmentado accesible, consultando la API con el filtro elegido y conservando el orden recibido.

#### Scenario: Cambiar a Mis casos
- **WHEN** el operador elige «Mis casos»
- **THEN** se consulta la primera página con `responsable=mios` y la tabla conserva el orden de llegada

### Requirement: Formularios de atención con una sola solicitud
Los formularios de cierre, descarte, verificación, prioridad y vínculo MUST exigir motivo y, al cerrar, resumen ciudadano con su vista previa; MUST enviar una sola solicitud y explicar un 409 sin presentar la acción como hecha.

#### Scenario: Conflicto al cerrar
- **WHEN** la API responde 409 ESTADO_CAMBIADO al cerrar
- **THEN** se explica que el estado cambió y se recarga el resumen sin mostrar el caso como cerrado
