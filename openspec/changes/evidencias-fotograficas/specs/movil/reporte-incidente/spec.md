# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
