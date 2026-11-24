## MODIFIED Requirements

### Requirement: Llegada del enlace a la app
El correo MUST contener un enlace HTTPS con el token en el fragmento, nunca en ruta ni parámetros de consulta. Para un ciudadano el enlace MUST ser del dominio de la API: en Android la app MUST abrir el enlace verificado y mostrar la pantalla correspondiente y, si la app no está instalada, la API MUST servir una página informativa sin guardar ni registrar el token, que lo muestre para copiarlo. Para un administrador u operador el enlace de activación MUST ser del origen público de la web y MUST NOT apuntar a la página de respaldo de la app. La app MUST ofrecer pegar el código manualmente.

#### Scenario: Enlace abierto con la app instalada
- **WHEN** el ciudadano toca el enlace del correo en un dispositivo con la app
- **THEN** la app abre la pantalla de nueva contraseña con el token ya cargado sin mostrarlo en pantalla

#### Scenario: Sin la app
- **WHEN** se abre el enlace en un navegador sin la app
- **THEN** la página explica cómo continuar y permite copiar el código, y el servidor no recibe el token en su registro de accesos

#### Scenario: Código pegado manualmente
- **WHEN** el ciudadano pega el código en la pantalla «Tengo un código»
- **THEN** la app consulta su estado y continúa como con el enlace, incluidas las pantallas de usado o vencido

#### Scenario: Invitación de un administrador
- **WHEN** se redacta el correo de activación de una cuenta de rol administrador u operador
- **THEN** el enlace pertenece al origen público de la web con el token solo en el fragmento y el texto no menciona la app móvil

#### Scenario: Invitación de un ciudadano
- **WHEN** se redacta el correo de activación o recuperación de un ciudadano
- **THEN** el enlace sigue siendo el de la API, sin cambios

## ADDED Requirements

### Requirement: Origen web de enlaces configurado
El sistema MUST requerir en producción un origen público de la web con esquema https, sin ruta, credenciales ni parámetros, y MUST rechazar el arranque con un mensaje sin valores si falta o es inválido. En desarrollo MAY usar un valor local.

#### Scenario: Configuración válida
- **WHEN** la API arranca con un origen web https válido
- **THEN** los enlaces de activación institucional usan ese origen

#### Scenario: Configuración inválida en producción
- **WHEN** en producción falta el origen web o no usa https
- **THEN** el arranque falla con un mensaje de configuración sin valores sensibles
