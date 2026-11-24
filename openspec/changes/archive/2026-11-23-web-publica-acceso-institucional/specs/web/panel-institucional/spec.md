## ADDED Requirements

### Requirement: Pantalla de acceso institucional
La web MUST ofrecer `/acceso` con correo, contraseña con control Mostrar/Ocultar, pegado permitido, compatibilidad con gestores de contraseñas y la acción «Ingresar». Los errores de formato MUST mostrarse junto al campo y las credenciales incorrectas con un mensaje general. MUST distinguir 429 (espera), 403 (solicitud no admitida), red caída y servicio no disponible con texto e icono y «Reintentar», sin afirmar un éxito no confirmado y sin permitir envíos simultáneos. La contraseña MUST descartarse de la memoria al abandonar la pantalla y nunca guardarse en almacenamiento del navegador.

#### Scenario: Ingreso correcto
- **WHEN** un administrador activo ingresa credenciales correctas
- **THEN** se establece la sesión y la web lo lleva a su panel

#### Scenario: Credenciales incorrectas o cuenta no admitida
- **WHEN** se envían credenciales incorrectas o de un ciudadano
- **THEN** se muestra el mismo mensaje general sin indicar la causa

#### Scenario: Demasiados intentos
- **WHEN** la API responde 429
- **THEN** se explica la espera con texto e icono y el envío no se repite solo

#### Scenario: Sin conexión
- **WHEN** no hay red o la API no responde
- **THEN** se informa el problema y se ofrece «Reintentar» sin indicar que la sesión se inició

#### Scenario: Sin persistencia de secretos
- **WHEN** se inspeccionan localStorage, sessionStorage e IndexedDB tras un ingreso
- **THEN** no contienen contraseña, token ni identificadores de sesión

### Requirement: Activación de cuenta en la web
La web MUST ofrecer `/activar` para leer el token del fragmento de la URL, quitarlo de la barra de direcciones y del historial, consultar su estado y permitir elegir contraseña de 15 a 128 caracteres con espacios y pegado permitidos. MUST mostrar el resultado de éxito que lleva a `/acceso` sin iniciar sesión, y los estados de enlace usado, vencido o inválido sin pedir contraseña. El token y la contraseña MUST NOT guardarse fuera de la memoria del formulario ni enviarse a terceros.

#### Scenario: Activación correcta
- **WHEN** un administrador invitado abre su enlace y elige una contraseña válida
- **THEN** se informa que la cuenta quedó activa, no se inicia sesión y se le lleva a `/acceso`

#### Scenario: Enlace usado, vencido o inválido
- **WHEN** el token está usado, vencido o es inválido
- **THEN** se explica con texto e icono sin pedir contraseña

#### Scenario: Token fuera de la URL
- **WHEN** la pantalla carga el token
- **THEN** el fragmento se elimina de la dirección visible y del historial y no se envía en registros de acceso ni en la cabecera Referer

### Requirement: Restauración de sesión y estado de la web
Al cargar o refrescar el navegador, la web MUST consultar la sesión al servidor antes de mostrar contenido del panel y MUST mostrar un estado de carga. Una respuesta 401 MUST llevar a `/acceso` con un aviso de sesión no válida o vencida, sin conservar datos del panel. La web MUST NOT decidir permisos solo con datos guardados en el navegador.

#### Scenario: Refrescar con sesión
- **WHEN** se recarga la web con sesión vigente
- **THEN** se restaura el panel del rol correspondiente tras consultar la sesión

#### Scenario: Sesión vencida
- **WHEN** la consulta responde 401
- **THEN** se vuelve a `/acceso` con aviso y no queda contenido privado visible

#### Scenario: Servicio no disponible al restaurar
- **WHEN** la consulta falla por red o servicio
- **THEN** no se asume sesión válida ni inválida y se ofrece «Reintentar»

### Requirement: Shell por rol
El panel MUST mostrar la navegación de su rol según la guía de UI: operador con Reportes, Mapa e Indicadores, y administrador con Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas y Contenido/contactos, con cuenta y cierre de sesión en la cabecera. Cada destino aún no construido MUST declararse «Aún no disponible» con texto e icono, sin datos, cifras ni mapas de ejemplo. Las secciones MUST provenir de la respuesta de la API de ese rol.

#### Scenario: Panel del administrador
- **WHEN** un administrador entra a su panel
- **THEN** ve las secciones de administración marcadas como no disponibles y su nombre y rol en la cabecera

#### Scenario: Panel del operador
- **WHEN** un operador entra a su panel
- **THEN** ve las secciones de operación marcadas como no disponibles

#### Scenario: Rol ajeno
- **WHEN** un operador navega a la ruta del panel del administrador
- **THEN** la web no muestra sus secciones y la API devuelve 403 a sus consultas

#### Scenario: Cierre de sesión
- **WHEN** la persona pulsa «Cerrar sesión»
- **THEN** la sesión se revoca, la web vuelve a la portada o a `/acceso` y el botón Atrás no reabre contenido privado

### Requirement: Rutas protegidas como experiencia, no como control
Los guards de ruta de la web MUST usarse solo para guiar la navegación. La autorización MUST depender exclusivamente de las respuestas de la API, de modo que manipular el estado del navegador no conceda acceso a datos.

#### Scenario: Manipulación del cliente
- **WHEN** se altera el estado del cliente para aparentar otro rol
- **THEN** las consultas del panel siguen respondiendo 401 o 403 y no se obtienen datos

### Requirement: Cabeceras y despliegue seguro de la web
La web servida MUST enviar una política de seguridad de contenido que impida scripts y estilos de terceros, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` y una política de referrer que no filtre fragmentos. Las llamadas a la API MUST usar rutas relativas del mismo origen.

#### Scenario: Cabeceras de la web
- **WHEN** se solicita la portada
- **THEN** la respuesta incluye la política de contenido, la protección contra incrustación y `nosniff`

#### Scenario: Sin orígenes cruzados
- **WHEN** se inspeccionan las llamadas de red de la web
- **THEN** todas usan el origen propio
