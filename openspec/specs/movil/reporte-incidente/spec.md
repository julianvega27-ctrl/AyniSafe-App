# movil/reporte-incidente Specification

## Purpose

Permitir al ciudadano informar un incidente desde la app Android como invitado o con cuenta, con punto obligatorio obtenido con permiso o elegido manualmente, sin perder lo escrito ante fallos y confirmando el éxito solo cuando el servidor lo confirma.

## Requirements

### Requirement: Formulario de reporte
Reportar MUST abrir el formulario en el orden categoría, descripción, cuándo, ubicación, si aplica preguntas de heridos y atención médica, si SAMU interviene la evaluación rápida, fotos opcionales y el teléfono solo para invitado. Categoría MUST iniciar sin selección; solo «Ahora» MUST tener valor inicial. La composición MUST reproducir el formulario del origen con los componentes y tokens de DESIGN.md.

#### Scenario: Apertura con cuenta
- **WHEN** un ciudadano con sesión abre Reportar
- **THEN** ve el formulario sin campo de teléfono, sin categoría preseleccionada, con «Ahora» marcado y la sección de fotos vacía

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

### Requirement: Fotos opcionales en el formulario
La sección «Fotos (opcional)» MUST ofrecer cámara y galería, admitir hasta 3 fotos y mostrar cada una con miniatura y opción para quitarla. MUST comprimir en el dispositivo y convertir a JPEG cuando el formato de origen no sea admitido. Una foto de más de 5 MB tras comprimir MUST rechazarse localmente con texto e icono. Negar el permiso de cámara o de galería MUST NOT impedir enviar.

#### Scenario: Tres fotos elegidas
- **WHEN** el usuario elige tres fotos
- **THEN** ve tres miniaturas y las acciones de cámara y galería dejan de estar disponibles hasta que quite una

#### Scenario: Permiso denegado
- **WHEN** el usuario niega el permiso de cámara
- **THEN** ve una explicación y puede usar la galería o enviar sin fotos

#### Scenario: Foto demasiado grande
- **WHEN** una foto supera 5 MB después de comprimirla
- **THEN** se rechaza junto a la sección con texto e icono, sin perder el resto del formulario

### Requirement: Carga de fotos tras el comprobante
Tras el registro, la app MUST subir cada foto elegida con la sesión o con el permiso de carga del invitado, usando una clave de idempotencia por foto reutilizada en reintentos. MUST mostrar el resultado de cada foto. Una carga fallida MUST ofrecer reintentar o continuar sin esa foto, y MUST NOT presentar el reporte como no registrado.

#### Scenario: Carga correcta
- **WHEN** el registro se confirma y las tres fotos se suben
- **THEN** el comprobante indica que las tres fotos se adjuntaron

#### Scenario: Fallo de una foto
- **WHEN** una foto responde 503 o se pierde la conexión
- **THEN** la app indica que el reporte está registrado, que esa foto no se adjuntó, y ofrece reintentar con la misma clave o continuar sin ella

#### Scenario: Foto rechazada por el servidor
- **WHEN** el servidor responde 413 o 422 a una foto
- **THEN** la app explica el motivo con texto e icono y no la reintenta automáticamente

#### Scenario: Permiso del invitado vencido
- **WHEN** el invitado reintenta una foto después del plazo de carga
- **THEN** la app indica que ya no puede adjuntarse y conserva el comprobante

### Requirement: Permiso de carga en el dispositivo
El permiso de carga del invitado MUST guardarse solo en el almacenamiento seguro, junto al comprobante, y eliminarse al completar o abandonar las cargas o al vencer. MUST NOT mostrarse en pantalla, notificaciones ni registros.

#### Scenario: Cargas terminadas
- **WHEN** todas las fotos del invitado se adjuntaron o se descartaron
- **THEN** el permiso de carga ya no está en el almacenamiento del dispositivo

### Requirement: Accesibilidad de las fotos
Las acciones de cámara, galería, quitar y reintentar MUST tener nombres accesibles y objetivos de al menos 48. Cada miniatura MUST anunciarse como «Foto N de M». El estado de cada carga MUST comunicarse con texto e icono.

#### Scenario: Lector de pantalla
- **WHEN** se recorren las fotos con lector de pantalla
- **THEN** se anuncian su posición, la acción de quitar y el estado de carga de cada una
