# recuperacion-activacion-cuenta Specification

## Purpose

Permitir recuperar el acceso de una cuenta ciudadana por correo y activar cuentas invitadas mediante enlaces de un solo uso con vencimiento, sin contraseñas compartidas ni exigir verificación del correo para el acceso ciudadano. Ofrece una capacidad de invitación reutilizable por otras entregas.

## Requirements

### Requirement: Solicitud de recuperación uniforme
La API MUST aceptar una solicitud de recuperación con un correo válido y responder 202 con el mismo cuerpo y estado exista o no la cuenta, esté suspendida o no sea ciudadana. Solo una cuenta ciudadana activa MUST dar lugar a un correo. La validación del correo MUST ser la de Spec 01.

#### Scenario: Cuenta existente e inexistente
- **WHEN** se solicita recuperación para un correo registrado y para uno desconocido
- **THEN** ambas respuestas son 202 con idéntico cuerpo y sin datos de la cuenta
- **AND** solo la cuenta registrada y activa recibe un correo

#### Scenario: Cuenta suspendida o no ciudadana
- **WHEN** se solicita recuperación para una cuenta suspendida, pendiente de activación u operador/administrador
- **THEN** la respuesta es la misma 202 uniforme y no se envía ningún correo

#### Scenario: Correo inválido
- **WHEN** el correo está ausente, no es texto o su sintaxis es inválida
- **THEN** se responde 400 con error del campo correo y sin crear token ni envío

### Requirement: Token de un solo uso con vencimiento
El sistema MUST emitir tokens opacos generados con fuente criptográfica, persistir únicamente su huella unidireccional y asociarlos a una cuenta y a un propósito (recuperación o activación). El token de recuperación MUST vencer a los 30 minutos y el de activación a las 72 horas desde su emisión. Un token nuevo MUST invalidar los pendientes de la misma cuenta y propósito.

#### Scenario: Persistencia sin secreto
- **WHEN** se emite un token y se inspecciona la base de datos y los registros
- **THEN** no existe el token en claro y solo se conserva su huella, propósito, emisión, vencimiento y uso

#### Scenario: Solicitud repetida
- **WHEN** se emite un segundo token de recuperación para la misma cuenta
- **THEN** el enlace anterior pasa a invalidado y solo el más reciente puede usarse

#### Scenario: Vencimiento
- **WHEN** se usa un token de recuperación 31 minutos después de emitirse con reloj controlado
- **THEN** se rechaza como vencido y no cambia la contraseña

### Requirement: Consulta del estado del enlace
La API MUST permitir consultar con POST, sin consumirlo, si un token es vigente, usado, vencido o inválido, devolviendo su propósito y vencimiento solo cuando es vigente. El token MUST viajar en el cuerpo y nunca en la URL de la API. Un token usado o invalidado MUST responder 410 TOKEN_USED, uno vencido 410 TOKEN_EXPIRED y uno desconocido o alterado 404 TOKEN_INVALID.

#### Scenario: Estados del enlace
- **WHEN** se consulta un token vigente, uno ya consumido, uno vencido y uno alterado
- **THEN** se responde respectivamente 200 con propósito y vencimiento, 410 TOKEN_USED, 410 TOKEN_EXPIRED y 404 TOKEN_INVALID
- **AND** la consulta no modifica el token

### Requirement: Cambio de contraseña por recuperación
La API MUST cambiar la contraseña con un token de recuperación vigente y una contraseña nueva conforme a la política de Spec 01 (15 a 128 puntos de código, sin recorte ni normalización) y responder 204. En la misma operación MUST invalidar los demás tokens de la cuenta y revocar todas sus sesiones. MUST NOT iniciar sesión, devolver token de sesión ni marcar el correo como verificado.

#### Scenario: Cambio correcto
- **WHEN** un ciudadano con dos sesiones activas consume un token vigente con una contraseña válida
- **THEN** se responde 204 y la contraseña anterior deja de autenticar mientras la nueva sí autentica
- **AND** ambas sesiones previas reciben 401 en su siguiente consulta y no se entrega sesión nueva

#### Scenario: Contraseña no admitida
- **WHEN** la contraseña nueva tiene 14 o 129 puntos de código o falta
- **THEN** se responde 400 con error del campo contraseña y el token sigue vigente y sin usar

#### Scenario: Propósito cruzado
- **WHEN** un token de activación se envía al cambio de contraseña por recuperación, o al revés
- **THEN** se responde 404 TOKEN_INVALID y no se modifica ninguna cuenta

#### Scenario: Cuenta suspendida tras la emisión
- **WHEN** la cuenta fue suspendida después de emitir el token y este se consume
- **THEN** no cambia la contraseña, no se concede acceso y la respuesta no distingue la causa de un token inválido

### Requirement: Consumo atómico y concurrente
El consumo de un token MUST ser atómico: de varias solicitudes simultáneas con el mismo token solo una MUST tener éxito y las demás MUST recibir 410 TOKEN_USED. Un fallo de almacenamiento antes de confirmar MUST responder 503, dejar el token sin consumir y no cambiar contraseña ni sesiones.

#### Scenario: Dos consumos simultáneos
- **WHEN** dos solicitudes consumen a la vez el mismo token con contraseñas distintas
- **THEN** exactamente una obtiene 204 y la otra 410 TOKEN_USED, y solo la contraseña de la ganadora autentica

#### Scenario: Fallo antes del commit
- **WHEN** falla la escritura durante el consumo
- **THEN** la respuesta es 503 sin detalles internos y el mismo token puede usarse después, con la contraseña y las sesiones sin cambios

### Requirement: Invitación y activación de cuentas
El sistema MUST ofrecer una capacidad interna para invitar una cuenta en estado `pendiente_activacion` que se ejecute dentro de la transacción del llamador, y un endpoint público de activación que, con un token vigente y una contraseña válida, deje la cuenta activa y responda 204 sin crear sesión. Esta entrega MUST NOT exponer ninguna ruta que cree operadores, administradores ni sedes.

#### Scenario: Activación correcta
- **WHEN** una cuenta pendiente recibe su invitación y su titular envía el token con una contraseña válida
- **THEN** se responde 204, la cuenta pasa a activa con esa contraseña y no se emite sesión

#### Scenario: Atomicidad con el llamador
- **WHEN** la transacción que crea la cuenta e invita falla y se revierte
- **THEN** no existen cuenta, token ni envío pendientes

#### Scenario: Sin creación pública de privilegiados
- **WHEN** se inspeccionan las rutas de esta entrega y el registro público
- **THEN** ninguna permite crear cuentas operador o administrador y el registro ciudadano sigue rechazando rol y campos extra

### Requirement: Cuenta pendiente sin acceso
Una cuenta pendiente de activación MUST NOT autenticar, tener sesión ni recibir correo de recuperación. Su contraseña MUST permanecer ausente hasta activarse, de modo que ningún valor conocido pueda iniciar sesión.

#### Scenario: Intento de acceso previo a la activación
- **WHEN** se intenta iniciar sesión o recuperar la contraseña con el correo de una cuenta pendiente
- **THEN** el acceso devuelve el 401 INVALID_CREDENTIALS uniforme y la recuperación el 202 uniforme sin correo

### Requirement: Entrega de correo asíncrona y recuperable
El sistema MUST persistir cada envío pendiente en la misma transacción que lo origina, enviarlo después del commit y reintentarlo con espera creciente ante fallos, sin que el estado del proveedor altere la respuesta de la solicitud. Un envío pendiente MUST sobrevivir a un reinicio de la API. Al fallar y al reintentar MUST NOT exponerse el token, el enlace ni el cuerpo del correo en logs, errores o respuestas.

#### Scenario: Proveedor caído
- **WHEN** el proveedor rechaza o no responde durante un envío de recuperación
- **THEN** la solicitud ya respondió 202, el envío queda pendiente con su intento registrado y se reintenta
- **AND** ningún log contiene el enlace, el token ni el cuerpo del correo

#### Scenario: Reinicio con envío pendiente
- **WHEN** la API se reinicia con un envío pendiente aún vigente
- **THEN** el envío se retoma al arrancar sin duplicar uno ya confirmado como enviado

#### Scenario: Envío caducado
- **WHEN** un envío de recuperación agota su plazo de reintentos sin éxito
- **THEN** queda marcado como fallido con un código genérico y no se envía un enlace ya vencido

### Requirement: Límites de abuso y cuota del proveedor
La API MUST limitar solicitudes de recuperación por IP, por correo normalizado combinado con IP y por correo en una ventana corta, respondiendo 429 con Retry-After sin bloquear permanentemente un correo. MUST limitar los intentos de consulta y consumo de tokens por IP. MUST aplicar un tope diario global de envíos inferior a la cuota del proveedor y responder 503 con Retry-After a las solicitudes de recuperación cuando se agote, con independencia de la cuenta.

#### Scenario: Exceso por IP o correo
- **WHEN** se supera el umbral configurado de solicitudes de recuperación
- **THEN** se responde 429 con espera en segundos, sin crear token ni envío, y el límite persiste tras reiniciar la API

#### Scenario: Cuota diaria agotada
- **WHEN** el contador global alcanza el tope diario
- **THEN** toda solicitud de recuperación válida recibe el mismo 503 con Retry-After, exista o no la cuenta

### Requirement: Cierre de sesiones tras el cambio
Tras un cambio de contraseña por recuperación, una petición con cualquier sesión previa de la cuenta MUST recibir 401 UNAUTHENTICATED y la app MUST borrar el token local y pedir iniciar sesión. El cierre de sesión voluntario MUST seguir revocando solo la sesión actual.

#### Scenario: Sesión previa en otro dispositivo
- **WHEN** se restablece la contraseña y el otro dispositivo reabre la app con su token guardado
- **THEN** la verificación devuelve 401, la app elimina el token y solicita iniciar sesión sin mostrar datos privados

#### Scenario: Cierre voluntario sin efecto sobre otras sesiones
- **WHEN** un ciudadano con dos sesiones cierra una voluntariamente
- **THEN** solo esa sesión queda revocada y la otra continúa vigente

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

### Requirement: Pantallas de recuperación y accesibilidad
La app MUST mostrar el enlace «Olvidé mi contraseña» en el acceso y ofrecer pantallas de solicitud, confirmación neutral, nueva contraseña con Mostrar/Ocultar, enlace usado o vencido con «Solicitar otro enlace», estado de conexión, espera por 429 y éxito que vuelve al acceso con aviso de sesiones cerradas. MUST cumplir la guía: etiquetas persistentes, texto base 16, botones de al menos 48, errores con texto e icono, texto al 200 % y un único envío en curso.

#### Scenario: Confirmación neutral
- **WHEN** se envía una solicitud de recuperación aceptada
- **THEN** la app muestra que, si el correo corresponde a una cuenta, llegarán instrucciones y sugiere revisar spam, sin afirmar que la cuenta existe

#### Scenario: Enlace usado o vencido
- **WHEN** se abre un enlace cuyo token está usado o vencido
- **THEN** la app lo explica con texto e icono y ofrece solicitar otro enlace sin pedir antes una contraseña

#### Scenario: Interacción accesible y envío único
- **WHEN** se recorren las pantallas con lector de pantalla, teclado y texto al 200 %, y se pulsa varias veces el envío
- **THEN** todo es operable sin recortes que impidan completar el flujo y solo se emite una solicitud en curso

#### Scenario: Éxito
- **WHEN** el cambio de contraseña termina con 204
- **THEN** la app vuelve al acceso con la contraseña vacía y un aviso de que las demás sesiones se cerraron

### Requirement: Proveedor de correo verificado en envío real
La entrega MUST demostrar con un envío real controlado, con el adaptador de producción y desde el remitente elegido hacia buzones propios del equipo, que el correo se entrega y no se clasifica como spam. Un servidor o adaptador de pruebas MUST NOT contar como validación del proveedor. En producción el sistema MUST rechazar iniciar con un adaptador de pruebas o de archivo. Mientras no se verifique el envío desde el entorno desplegado, la recuperación MUST NOT declararse completa en producción.

#### Scenario: Envío real controlado
- **WHEN** se solicita una recuperación para un buzón del equipo con el adaptador de producción configurado
- **THEN** el correo llega con el remitente acordado y su código permite completar el cambio, y el resultado queda documentado

#### Scenario: Adaptador de pruebas o de archivo en producción
- **WHEN** la API arranca con entorno de producción y adaptador de pruebas o de archivo
- **THEN** el arranque falla con un mensaje de configuración sin valores sensibles

#### Scenario: Credenciales del proveedor inválidas o revocadas
- **WHEN** el proveedor rechaza las credenciales configuradas durante un envío
- **THEN** la solicitud ya respondió 202, el envío se clasifica con un código de autenticación y se reintenta hasta quedar fallido
- **AND** ningún registro ni respuesta contiene credenciales, tokens, el destinatario ni el cuerpo del correo

### Requirement: Protección de secretos del flujo
Contraseñas, tokens, enlaces y credenciales del proveedor MUST excluirse de logs, telemetría, respuestas ajenas al flujo y control de versiones. Las respuestas de este flujo MUST incluir `Cache-Control: no-store`. El dispositivo MUST NOT guardar la contraseña nueva ni el token fuera de la memoria del formulario.

#### Scenario: Inspección de registros
- **WHEN** se ejecutan solicitud, envío fallido, consulta y cambio con valores de prueba identificables
- **THEN** ni logs, errores ni persistencia contienen la contraseña, el token ni el enlace en claro

#### Scenario: Abandono de la pantalla
- **WHEN** se abandona la pantalla de nueva contraseña
- **THEN** se descartan contraseña y token de la memoria y no quedan borradores persistentes

### Requirement: Origen web de enlaces configurado
El sistema MUST requerir en producción un origen público de la web con esquema https, sin ruta, credenciales ni parámetros, y MUST rechazar el arranque con un mensaje sin valores si falta o es inválido. En desarrollo MAY usar un valor local.

#### Scenario: Configuración válida
- **WHEN** la API arranca con un origen web https válido
- **THEN** los enlaces de activación institucional usan ese origen

#### Scenario: Configuración inválida en producción
- **WHEN** en producción falta el origen web o no usa https
- **THEN** el arranque falla con un mensaje de configuración sin valores sensibles
