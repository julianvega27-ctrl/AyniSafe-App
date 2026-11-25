# navegacion-ciudadana Specification

## Purpose

Definir la navegación de la app ciudadana tras iniciar sesión, con perfil desde la cabecera, y mostrar con honestidad los destinos que aún no existen.

## Requirements

### Requirement: Navegación principal autenticada
Con sesión verificada, la app MUST mostrar Inicio, Reportar, Mapa y Contactos en barra inferior, perfil en cabecera y Drawer con Alertas, información y Mis reportes. MUST conservar estado al cambiar destinos, selección con texto e icono y objetivos de al menos 48. El retroceso desde otro destino MUST volver a Inicio. Sin sesión verificada MUST NOT mostrar datos privados ni la pila autenticada; la navegación pública usa su variante separada.

#### Scenario: Estructura tras iniciar sesión
- **WHEN** un ciudadano inicia sesión o se restaura su sesión
- **THEN** ve Inicio con la barra de cuatro destinos y el acceso al perfil en la cabecera

#### Scenario: Retroceso
- **WHEN** el usuario está en Mapa y usa el retroceso del sistema
- **THEN** vuelve a Inicio y no sale de la app

#### Scenario: Sin sesión
- **WHEN** la sesión no está verificada, vence, se revoca o se cierra
- **THEN** no se muestra el shell autenticado ni su historial de navegación

#### Scenario: Destinos trasladados al Drawer
- **WHEN** el ciudadano abre el menú de navegación con sesión válida
- **THEN** encuentra Mis reportes y Alertas, además de los destinos públicos y la información, sin duplicar estados de selección ni perder acceso al perfil

### Requirement: Inicio orientado a acciones con estado honesto
Inicio MUST presentar «Reportar un incidente» como acción principal en estado deshabilitado con el texto «Disponible próximamente», los últimos reportes propios como no disponibles y los contactos de emergencia publicados. MUST NOT abrir un flujo de reporte, listar reportes ficticios ni mostrar números no aprobados. El saludo MUST usar el nombre del perfil.

#### Scenario: Inicio sin reportes disponibles
- **WHEN** el ciudadano abre Inicio
- **THEN** ve la acción principal deshabilitada con su explicación, el aviso de que los reportes aún no están disponibles y los contactos aprobados o el aviso de que no hay contactos aprobados

#### Scenario: Acción no operable
- **WHEN** el usuario intenta activar «Reportar un incidente»
- **THEN** no ocurre ningún envío ni navegación y el estado «Disponible próximamente» sigue visible y lo anuncian los lectores de pantalla

### Requirement: Destinos no construidos
Reportar, Mapa, Mis reportes y Alertas MUST indicar que aún no están disponibles con texto e icono y explicación acorde al producto. MUST NOT mostrar mapas, formularios de envío operativos, reportes, avisos ni cifras de ejemplo, ni solicitar ubicación o notificaciones. La ubicación del destino en barra o Drawer MUST NOT interpretarse como capacidad implementada.

#### Scenario: Destino pendiente
- **WHEN** el usuario abre Mapa, Mis reportes o Alertas
- **THEN** ve un estado «aún no disponible» comprensible, sin datos simulados ni solicitudes de permiso

#### Scenario: Reportar desde la barra
- **WHEN** el usuario abre Reportar desde la navegación inferior durante P2
- **THEN** ve su explicación pendiente y no se envían datos ni se abre un formulario operativo o selector de ubicación

### Requirement: Perfil y páginas informativas
Desde la cabecera, la app MUST abrir el perfil con datos personales (nombre editable, correo de solo lectura, teléfono y autorización de compartirlo), preferencias (marcadas como aún no disponibles), privacidad, «Acerca de AyniSafe», desarrolladores y «Cerrar sesión». Las páginas informativas MUST usar el contenido público y reflejar la aprobación de cada sección.

#### Scenario: Contenido del perfil
- **WHEN** el ciudadano abre el perfil
- **THEN** ve sus datos, el correo sin control de edición, las preferencias como no disponibles y los accesos a las páginas informativas y al cierre de sesión

#### Scenario: Desarrolladores y acerca de
- **WHEN** abre «Desarrolladores» o «Acerca de AyniSafe»
- **THEN** ve el contenido publicado o el aviso de que no está disponible, sin textos inventados

#### Scenario: Edición con errores
- **WHEN** el servidor rechaza el nombre o el teléfono, o no hay conexión
- **THEN** el error aparece junto al campo o en un mensaje con texto e icono, el formulario conserva lo escrito y no se afirma que se guardó

### Requirement: Accesibilidad de la navegación y el perfil
La navegación, el perfil y las páginas informativas MUST cumplir la guía: etiquetas persistentes, texto base de 16, botones de al menos 48, errores con texto e icono y operación al 200 %.

#### Scenario: Accesibilidad
- **WHEN** se recorre la navegación y el perfil con lector de pantalla, teclado y texto al 200 % en Android
- **THEN** todos los destinos, campos y acciones son identificables y operables sin recortes que impidan completar el flujo

### Requirement: Salida y límites de permisos
Cerrar sesión desde el perfil MUST seguir la política de Spec 01 y volver a Inicio público con la pila privada vacía. La navegación MUST NOT pedir ubicación, notificaciones ni DNI ni agregar permisos Android distintos de los declarados, salvo la consulta del marcador. Cambiar la apariencia o abrir la navegación sin cuenta MUST NOT reutilizar datos de una sesión anterior.

#### Scenario: Cierre de sesión desde el perfil
- **WHEN** el ciudadano cierra sesión
- **THEN** vuelve a Inicio público, el retroceso no muestra pantallas privadas y los datos de perfil se descartan de la memoria

#### Scenario: Permisos
- **WHEN** se inspecciona el manifiesto fusionado
- **THEN** solo existe el permiso `INTERNET` y la consulta de intención `tel`

#### Scenario: Revocación o sesión vencida
- **WHEN** una respuesta confirma que la sesión ya no es válida
- **THEN** se descartan datos y navegación privados y se muestra el aviso correspondiente sin interpretar un fallo de red como cierre confirmado

### Requirement: Navegación pública sin cuenta
Sin cuenta, la app MUST ofrecer Inicio público, barra Inicio/Reportar/Mapa/Contactos y Drawer con destinos públicos e ingreso a cuenta. Perfil e historial propio MUST requerir sesión válida. El arranque MUST resolver la restauración antes de mostrar datos privados y distinguir error de servicio de ausencia de sesión. El envío y seguimiento de invitado permanecen pendientes hasta sus fases funcionales.

#### Scenario: Primera apertura sin sesión guardada
- **WHEN** se abre la app sin sesión
- **THEN** muestra Inicio público con acceso a cuenta, contenido público aprobado y destinos futuros identificados como pendientes

#### Scenario: Acceso a cuenta desde la navegación pública
- **WHEN** una persona sin cuenta abre el control de cuenta o solicita un destino privado
- **THEN** puede ir al acceso y registro vigentes, sin consultas de perfil ni historial privado y sin crear una sesión ficticia de invitado

#### Scenario: Contactos sin sesión
- **WHEN** se abre Contactos sin cuenta
- **THEN** se consulta el contenido público, se muestran solo contactos aprobados o su ausencia y no se solicita autenticación para leerlos

#### Scenario: Error durante restauración
- **WHEN** la comprobación de una sesión guardada falla por red o servicio
- **THEN** se ofrece reintentar sin dar por válida la sesión ni exponer datos privados, conservando accesos públicos que no dependen de ella
