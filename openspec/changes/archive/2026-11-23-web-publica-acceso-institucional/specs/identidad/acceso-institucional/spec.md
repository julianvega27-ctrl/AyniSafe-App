## ADDED Requirements

### Requirement: Inicio de sesión institucional
La API MUST permitir iniciar sesión solo a cuentas de rol administrador u operador en estado activo mediante `POST /auth/institucional/sesiones` con correo y contraseña. Una respuesta satisfactoria MUST ser 200 con la identidad (id, nombre, correo, rol) y la fecha de vencimiento, y MUST establecer la sesión en una cookie sin devolver el token en el cuerpo. Un ciudadano, una cuenta suspendida, una cuenta pendiente de activación, un correo inexistente o una contraseña incorrecta MUST recibir el mismo 401 `INVALID_CREDENTIALS` y el costo de verificación MUST ser comparable en todos los casos. Los errores de formato MUST responder 400 por campo.

#### Scenario: Administrador u operador activo
- **WHEN** una cuenta activa de administrador u operador envía sus credenciales correctas
- **THEN** recibe 200 con su identidad y rol, la respuesta incluye una cookie de sesión y el cuerpo no contiene ningún token

#### Scenario: Ciudadano rechazado sin revelar la causa
- **WHEN** un ciudadano con credenciales correctas intenta iniciar sesión institucional
- **THEN** recibe 401 `INVALID_CREDENTIALS` idéntico al de una contraseña incorrecta, no se crea sesión y no se establece cookie

#### Scenario: Cuenta suspendida, pendiente o inexistente
- **WHEN** se intenta el acceso con una cuenta suspendida, pendiente de activación o inexistente
- **THEN** la respuesta es el mismo 401 uniforme y no se crea sesión

#### Scenario: Contraseña institucional en el acceso ciudadano
- **WHEN** un administrador u operador intenta iniciar sesión por el acceso ciudadano
- **THEN** recibe el 401 uniforme existente y no se crea sesión

### Requirement: Cookie de sesión institucional
La cookie de sesión MUST ser `HttpOnly`, `Secure`, `SameSite=Strict`, con `Path=/`, sin atributo `Domain`, con el prefijo `__Host-` fuera del entorno de desarrollo local, y con una duración que no exceda el vencimiento absoluto de 24 horas de la sesión. La sesión MUST ser el token opaco existente, persistido solo como huella, y MUST NOT renovarse. Las respuestas de este acceso MUST incluir `Cache-Control: no-store`.

#### Scenario: Atributos de la cookie
- **WHEN** el inicio de sesión institucional tiene éxito
- **THEN** la cookie declara HttpOnly, Secure, SameSite=Strict, Path=/ y sin Domain, y su vigencia no supera las 24 horas desde la creación

#### Scenario: Sin renovación
- **WHEN** se usa la sesión repetidamente durante su vigencia
- **THEN** su fecha de vencimiento no cambia y pasadas 24 horas la sesión deja de ser válida

#### Scenario: Token fuera del alcance de JavaScript
- **WHEN** se inspeccionan el cuerpo de las respuestas y los atributos de la cookie
- **THEN** el token no aparece en el cuerpo ni es legible por scripts de la página

### Requirement: Consulta y cierre de la sesión institucional
`GET /auth/institucional/sesion` MUST devolver la identidad y el vencimiento de la sesión de la cookie, o 401 si no existe, venció, fue revocada o la cuenta ya no es un administrador u operador activo. `DELETE /auth/institucional/sesion` MUST revocar la sesión presentada, borrar la cookie y responder 204, de forma idempotente. Cada petición con cookie MUST comprobar el estado actual de la cuenta.

#### Scenario: Refrescar el navegador
- **WHEN** una persona con sesión vigente recarga la web y se consulta la sesión
- **THEN** la respuesta es 200 con su identidad sin pedir credenciales

#### Scenario: Cierre de sesión
- **WHEN** la persona cierra sesión y luego repite una consulta con la cookie anterior
- **THEN** el cierre responde 204 y la consulta posterior responde 401

#### Scenario: Cierre repetido
- **WHEN** se cierra una sesión ya cerrada o inexistente
- **THEN** la respuesta sigue siendo 204 y la cookie queda borrada

#### Scenario: Cuenta suspendida durante la sesión
- **WHEN** un administrador u operador con sesión vigente es suspendido
- **THEN** su siguiente petición con la cookie responde 401 aunque la sesión no haya vencido

#### Scenario: Sesión vencida
- **WHEN** pasan 24 horas desde la creación
- **THEN** la consulta responde 401 `UNAUTHENTICATED` sin datos privados

### Requirement: Limitación de intentos institucionales
El acceso institucional MUST limitar los intentos por IP y por correo e IP con contadores propios, independientes de los del acceso ciudadano, y MUST responder 429 con `Retry-After` al exceder el límite. Los identificadores MUST derivarse con la clave secreta del limitador y no almacenarse en claro.

#### Scenario: Exceso de intentos
- **WHEN** se superan los intentos permitidos para un mismo correo e IP
- **THEN** se responde 429 `RATE_LIMITED` con `Retry-After` y no se verifican más contraseñas en esa ventana

#### Scenario: Contadores independientes
- **WHEN** se agotan los intentos del acceso ciudadano
- **THEN** el acceso institucional del mismo origen no queda bloqueado por ello

### Requirement: Mismo origen y sin CORS
La API MUST NOT emitir cabeceras `Access-Control-*` en ninguna ruta. La web MUST consumir la API bajo su propio origen, de modo que la cookie no sea de terceros.

#### Scenario: Ausencia de CORS
- **WHEN** se envía una petición con `Origin` de otro sitio, con o sin preflight
- **THEN** ninguna respuesta incluye `Access-Control-Allow-Origin` ni otra cabecera `Access-Control-*`

### Requirement: Protección contra solicitudes entre sitios
Toda ruta que cambie estado o inicie sesión mediante cookie (inicio y cierre de sesión institucional) MUST rechazar la petición si falta `Origin`, si `Origin` no coincide exactamente con el origen web configurado o si `Sec-Fetch-Site` es `cross-site`, y MUST aceptar únicamente `application/json` en UTF-8. El rechazo MUST responder 403 sin establecer ni borrar cookies.

#### Scenario: Origen ajeno
- **WHEN** llega un inicio o cierre de sesión con `Origin` distinto del configurado
- **THEN** se responde 403, no se crea ni revoca sesión y no se modifica la cookie

#### Scenario: Origen ausente
- **WHEN** llega un inicio de sesión institucional sin `Origin`
- **THEN** se responde 403 y no se evalúan credenciales

#### Scenario: Petición de otro sitio
- **WHEN** la petición declara `Sec-Fetch-Site: cross-site`
- **THEN** se responde 403 aunque el `Origin` coincida

#### Scenario: Origen correcto
- **WHEN** el `Origin` coincide con el configurado y el contenido es JSON válido
- **THEN** la petición se procesa normalmente

### Requirement: Aislamiento entre sesión de panel y sesión ciudadana
Las rutas del panel MUST aceptar únicamente la cookie de sesión institucional y MUST ignorar cualquier cabecera `Authorization`. Las rutas ciudadanas MUST seguir aceptando únicamente `Authorization: Bearer` y MUST ignorar la cookie. Un token ciudadano MUST NOT dar acceso a una ruta de panel ni una sesión institucional a una ruta ciudadana.

#### Scenario: Token ciudadano en el panel
- **WHEN** se presenta un Bearer de un ciudadano válido a una ruta de panel
- **THEN** se responde 401 y no se devuelve ningún dato

#### Scenario: Cookie institucional en una ruta ciudadana
- **WHEN** se presenta la cookie de un administrador a una ruta ciudadana
- **THEN** se responde 401 y no se devuelve ningún dato

#### Scenario: Acceso ciudadano sin cambios
- **WHEN** se ejecutan las pruebas de registro, login Bearer, sesión, perfil y recuperación ciudadanos
- **THEN** su contrato y resultados permanecen sin cambios

### Requirement: Paneles mínimos y permisos por rol
`GET /administrador/panel` MUST responder solo a un administrador activo y `GET /operador/panel` solo a un operador activo. Cada uno MUST devolver la identidad del titular y la lista de secciones de su panel según la guía de UI, marcadas como no disponibles mientras no existan, sin datos operativos ni cifras de ejemplo. Una sesión de otro rol institucional MUST recibir 403 y la falta de sesión 401.

#### Scenario: Administrador en su panel
- **WHEN** un administrador activo consulta `GET /administrador/panel`
- **THEN** recibe 200 con su identidad y las secciones de administración marcadas como no disponibles

#### Scenario: Operador en el panel del administrador
- **WHEN** un operador activo consulta `GET /administrador/panel`
- **THEN** recibe 403 sin datos del panel

#### Scenario: Administrador en el panel del operador
- **WHEN** un administrador activo consulta `GET /operador/panel`
- **THEN** recibe 403 sin datos del panel

#### Scenario: Sin sesión
- **WHEN** se consulta cualquiera de los dos paneles sin cookie válida
- **THEN** se responde 401

#### Scenario: Operador de prueba
- **WHEN** una prueba usa un operador creado directamente en la base de pruebas
- **THEN** su acceso se verifica sin que exista ninguna ruta de alta de operadores

### Requirement: Sin recuperación pública ni altas privilegiadas
Esta capacidad MUST NOT exponer rutas que creen cuentas administrador u operador, ni extender la solicitud pública de recuperación de contraseña a cuentas privilegiadas. La solicitud de recuperación MUST seguir respondiendo el 202 uniforme sin enviar correo a administradores u operadores.

#### Scenario: Recuperación solicitada para un administrador
- **WHEN** se solicita recuperación con el correo de un administrador activo
- **THEN** se responde el mismo 202 uniforme y no se encola ningún correo

#### Scenario: Inspección de rutas
- **WHEN** se inspecciona el contrato publicado
- **THEN** ninguna ruta crea administradores ni operadores y el registro ciudadano sigue rechazando rol y campos extra

### Requirement: Secretos de sesión fuera de registros
La cookie de sesión, el token, las contraseñas y los valores de `Set-Cookie` MUST excluirse de logs, errores y trazas, y de cualquier respuesta distinta del establecimiento de la cookie.

#### Scenario: Inspección de registros
- **WHEN** se ejecutan inicio, consulta, cierre y rechazos con valores de prueba identificables
- **THEN** ninguna salida de logs contiene el token, la contraseña ni el valor de la cookie
