# Spec Delta

## Purpose

Permitir al ciudadano informar un incidente desde la app Android como invitado o con cuenta, con punto obligatorio obtenido con permiso o elegido manualmente, sin perder lo escrito ante fallos y confirmando el éxito solo cuando el servidor lo confirma.

## ADDED Requirements

### Requirement: Formulario de reporte
Reportar MUST abrir el formulario en el orden categoría, descripción, cuándo, ubicación y, si aplica, preguntas de heridos y atención médica, más el teléfono solo para invitado. Categoría MUST iniciar sin selección; solo «Ahora» MUST tener valor inicial. La composición MUST reproducir el formulario del origen con los componentes y tokens de DESIGN.md, sin fotos ni evaluación SAMU completa.

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
Las preguntas MUST aparecer solo para las categorías del contrato y MUST usar botones de selección única Sí, No y No sé, sin preselección. Cambiar a una categoría sin preguntas MUST excluirlas del envío. Las respuestas MUST conservarse al cambiar de sección del formulario.

#### Scenario: Accidente de tránsito
- **WHEN** se elige Accidente de tránsito
- **THEN** aparecen «¿Hay heridos?» y «¿Se necesita atención médica?» con Sí, No y No sé, sin opción marcada

#### Scenario: Enviar sin responder
- **WHEN** se envía una pelea sin responder la pregunta de heridos
- **THEN** el envío no se bloquea y la respuesta queda sin respuesta, no como «No»

#### Scenario: Cambio a categoría sin preguntas
- **WHEN** tras responder se cambia a Robo
- **THEN** las preguntas desaparecen y no se envían

### Requirement: Ubicación con permiso
«Usar mi ubicación» MUST solicitar el permiso solo al pulsarlo y obtener la posición solo si se concede. Si se deniega, el servicio está apagado o se agota el tiempo, MUST explicar el motivo y ofrecer «Elegir punto en mapa» sin perder el formulario. La app MUST NOT obtener ubicación en segundo plano ni al abrir pantallas.

#### Scenario: Permiso concedido
- **WHEN** el usuario pulsa «Usar mi ubicación» y concede el permiso
- **THEN** el punto se marca con origen GPS y se indica su precisión

#### Scenario: Permiso denegado
- **WHEN** el usuario deniega el permiso
- **THEN** ve el motivo y la alternativa de elegir el punto en el mapa, y lo escrito se conserva

#### Scenario: Sin solicitud implícita
- **WHEN** se abre la app, Inicio o el formulario sin pulsar «Usar mi ubicación»
- **THEN** no se solicita el permiso de ubicación

### Requirement: Selección manual del punto
«Elegir punto en mapa» MUST permitir marcar y confirmar un punto sin permiso de ubicación. Si el mapa base no carga, MUST mostrar los límites distritales del catálogo para poder elegir igual, o indicar que no es posible y conservar el formulario. Un distrito elegido MUST NOT reemplazar el punto. La atribución del mapa base MUST ser visible.

#### Scenario: Punto manual confirmado
- **WHEN** el usuario marca un punto en el mapa y lo confirma
- **THEN** el formulario muestra el punto con origen manual

#### Scenario: Mapa base no disponible
- **WHEN** las teselas no cargan
- **THEN** se dibujan los límites distritales para elegir el punto, o se informa la imposibilidad sin perder lo escrito

#### Scenario: Sin punto
- **WHEN** se intenta enviar sin punto confirmado
- **THEN** no se envía, se explica el requisito junto a la ubicación y el formulario se conserva

### Requirement: Validación y errores del servidor
La app MUST validar campos obligatorios antes de enviar y mostrar los errores del servidor junto al campo correspondiente con texto e icono. MUST conservar lo escrito ante cualquier error.

#### Scenario: Error de campo del servidor
- **WHEN** el servidor rechaza el teléfono o la descripción
- **THEN** el error aparece junto a ese campo y el resto del formulario se conserva

### Requirement: Reintento con resultado incierto
Cada intento de reporte MUST usar una clave de idempotencia generada al iniciar el envío y reutilizada en reintentos del mismo contenido. Ante pérdida de conexión, tiempo agotado o error 5xx, la app MUST indicar que no sabe si se registró y ofrecer reintentar sin duplicar. Editar el contenido MUST generar una clave nueva. MUST confirmar éxito solo con respuesta 200 o 201 del servidor.

#### Scenario: Conexión perdida al enviar
- **WHEN** se pierde la conexión tras pulsar Enviar
- **THEN** la app indica resultado incierto, conserva el formulario y al reintentar usa la misma clave

#### Scenario: Reintento exitoso
- **WHEN** el reintento recibe 200 con un incidente ya registrado
- **THEN** se muestra el mismo comprobante, sin duplicar el reporte

#### Scenario: Edición tras fallo
- **WHEN** el usuario modifica la descripción después de un fallo
- **THEN** el siguiente envío usa una clave nueva

#### Scenario: Límite de frecuencia
- **WHEN** el servidor responde 429
- **THEN** la app indica cuándo reintentar y conserva el formulario

### Requirement: Comprobante en la app
Tras la confirmación, la app MUST mostrar referencia, estado, recepción y distrito o pendiente. Para el invitado MUST mostrar el código secreto una vez, explicar que es la única forma de consultar el seguimiento y guardarlo junto a la referencia en el almacenamiento seguro del dispositivo. MUST NOT mostrar el código en notificaciones ni registros.

#### Scenario: Comprobante del invitado
- **WHEN** un invitado recibe la confirmación
- **THEN** ve referencia y código con la advertencia de conservarlo, y ambos quedan guardados en el almacenamiento seguro

#### Scenario: Comprobante con cuenta
- **WHEN** un ciudadano con cuenta recibe la confirmación
- **THEN** ve la referencia y el acceso a «Mis reportes», sin código secreto

### Requirement: Accesibilidad del formulario
El formulario, el selector de punto y el comprobante MUST tener etiquetas persistentes, objetivos de al menos 48, errores con texto e icono, operación con lector de pantalla y texto al 200 % sin recortes que impidan completar el envío.

#### Scenario: Recorrido accesible
- **WHEN** se completa un reporte con lector de pantalla y texto al 200 %
- **THEN** todos los campos, opciones y acciones son identificables y operables
