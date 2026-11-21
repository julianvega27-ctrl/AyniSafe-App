# navegacion-ciudadana Specification

## Purpose

Definir la navegación de la app ciudadana tras iniciar sesión, con perfil desde la cabecera, y mostrar con honestidad los destinos que aún no existen.

## Requirements

### Requirement: Navegación principal autenticada
Con sesión verificada, la app MUST mostrar una barra inferior con los destinos Inicio, Mapa, Mis reportes y Alertas, y una cabecera con acceso al perfil. El destino activo MUST ser reconocible por texto, icono y estado, cada destino de al menos 48 de alto y el estado de cada pestaña MUST conservarse al cambiar entre ellas. El retroceso del sistema en una pestaña distinta de Inicio MUST volver a Inicio. Sin sesión verificada, estas pantallas MUST NOT mostrarse.

#### Scenario: Estructura tras iniciar sesión
- **WHEN** un ciudadano inicia sesión o se restaura su sesión
- **THEN** ve Inicio con la barra de cuatro destinos y el acceso al perfil en la cabecera

#### Scenario: Retroceso
- **WHEN** el usuario está en Mapa y usa el retroceso del sistema
- **THEN** vuelve a Inicio y no sale de la app

#### Scenario: Sin sesión
- **WHEN** la sesión no está verificada, vence, se revoca o se cierra
- **THEN** no se muestra el shell autenticado ni su historial de navegación

### Requirement: Inicio orientado a acciones con estado honesto
Inicio MUST presentar «Reportar un incidente» como acción principal en estado deshabilitado con el texto «Disponible próximamente», los últimos reportes propios como no disponibles y los contactos de emergencia publicados. MUST NOT abrir un flujo de reporte, listar reportes ficticios ni mostrar números no aprobados. El saludo MUST usar el nombre del perfil.

#### Scenario: Inicio sin reportes disponibles
- **WHEN** el ciudadano abre Inicio
- **THEN** ve la acción principal deshabilitada con su explicación, el aviso de que los reportes aún no están disponibles y los contactos aprobados o el aviso de que no hay contactos aprobados

#### Scenario: Acción no operable
- **WHEN** el usuario intenta activar «Reportar un incidente»
- **THEN** no ocurre ningún envío ni navegación y el estado «Disponible próximamente» sigue visible y lo anuncian los lectores de pantalla

### Requirement: Destinos no construidos
Mapa, Mis reportes y Alertas MUST mostrar que aún no están disponibles con texto e icono, qué ofrecerán en términos de las decisiones acordadas y MUST NOT mostrar mapas, reportes, avisos ni cifras de ejemplo. MUST NOT solicitar permisos de ubicación ni notificaciones.

#### Scenario: Destino pendiente
- **WHEN** el usuario abre Mapa, Mis reportes o Alertas
- **THEN** ve un estado «aún no disponible» comprensible, sin datos simulados ni solicitudes de permiso

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
Cerrar sesión desde el perfil MUST seguir la política de Spec 01 y volver al acceso público con la pila de navegación vacía. La navegación MUST NOT pedir ubicación, notificaciones ni DNI y la app MUST NOT agregar permisos de Android distintos de los ya declarados, salvo la consulta del marcador.

#### Scenario: Cierre de sesión desde el perfil
- **WHEN** el ciudadano cierra sesión
- **THEN** vuelve al acceso, el retroceso no muestra pantallas privadas y los datos de perfil se descartan de la memoria

#### Scenario: Permisos
- **WHEN** se inspecciona el manifiesto fusionado
- **THEN** solo existe el permiso `INTERNET` y la consulta de intención `tel`
