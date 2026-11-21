# acceso-ciudadano Specification

## Purpose

Permitir al ciudadano crear una cuenta e iniciar y terminar una sesión para acceder a sus funciones privadas, con validaciones comprensibles y protección de sus credenciales. La recuperación de contraseña se define en `identidad/recuperacion-activacion-cuenta`; la verificación del correo pertenece a un cambio posterior.

## Requirements

### Requirement: Registro ciudadano mínimo
El sistema MUST permitir registro con nombre, correo y contraseña, asignando únicamente el rol ciudadano. El sistema MUST NOT exigir DNI, teléfono, ubicación, notificaciones ni verificación de correo para crear la cuenta o iniciar sesión.

#### Scenario: Cuenta creada
- **WHEN** una persona envía nombre y correo válidos, contraseña admitida y un correo disponible
- **THEN** la API responde 201 con identificador, nombre, correo y rol ciudadano, sin contraseña, hash ni sesión
- **AND** la app confirma el alta y ofrece iniciar sesión con el correo precargado y la contraseña vacía

#### Scenario: Intento de alta privilegiada
- **WHEN** una solicitud de registro incluye rol, institución, sede u otros campos no admitidos
- **THEN** la API responde 400, no crea una cuenta y no concede permisos privilegiados

### Requirement: Validación consistente de entradas
La app y la API MUST validar nombre de 1 a 100 puntos de código Unicode tras recortar extremos y correo sintácticamente válido de hasta 254 caracteres tras recortar extremos. El correo MUST compararse sin distinguir mayúsculas, sin eliminar puntos ni sufijos. La API MUST rechazar campos ausentes o tipos inválidos con 400 y errores por campo.

#### Scenario: Campos inválidos
- **WHEN** se envía nombre vacío, correo inválido o un campo obligatorio ausente
- **THEN** se informa el campo afectado y no se crea una cuenta ni sesión
- **AND** una solicitud directa a la API aplica las mismas reglas aunque omita la validación móvil

#### Scenario: Identidad del correo
- **WHEN** se registra ` Vecina@Ejemplo.com ` y luego se intenta acceder con `vecina@ejemplo.com`
- **THEN** ambos valores identifican la misma cuenta
- **AND** correos con puntos o sufijos distintos no se fusionan mediante reglas específicas de proveedores

### Requirement: Política de contraseña acordada
El sistema MUST aceptar contraseñas de 15 a 128 puntos de código Unicode, incluidos espacios, sin reglas de composición ni truncamiento. La app MUST permitir pegar, autocompletar y Mostrar/Ocultar. La contraseña MUST conservarse exactamente, sin recortar extremos ni normalizar Unicode.

#### Scenario: Límites de longitud
- **WHEN** se prueban contraseñas de 14, 15, 128 y 129 puntos de código
- **THEN** las de 15 y 128 son admitidas y las de 14 y 129 se rechazan con error del campo contraseña

#### Scenario: Espacios y Unicode
- **WHEN** una contraseña válida incluye espacios en los extremos, acentos o caracteres fuera del plano básico
- **THEN** el registro y el acceso conservan la misma secuencia de puntos de código
- **AND** cambiar o quitar un espacio produce un valor que no autentica la cuenta creada con la contraseña original

### Requirement: Alta única y atómica
El sistema MUST persistir una única cuenta por correo normalizado y confirmar el alta solo tras su persistencia completa. Un correo ocupado MUST producir 409 con código EMAIL_IN_USE. Los fallos de almacenamiento MUST producir 503 sin confirmar alta ni dejar registros parciales.

#### Scenario: Duplicado y concurrencia
- **WHEN** dos solicitudes intentan registrar simultáneamente el mismo correo con variaciones de mayúsculas o espacios externos
- **THEN** solo una obtiene 201 y la otra obtiene 409, existiendo exactamente una cuenta

#### Scenario: Error antes del commit
- **WHEN** falla la escritura antes de confirmar la transacción
- **THEN** no existe cuenta parcial y la respuesta es 503 sin información interna

### Requirement: Inicio de sesión ciudadano
El sistema MUST autenticar una cuenta ciudadana activa con correo y contraseña y emitir una sesión solo tras validarlos y persistirla. El registro MUST permitir un primer acceso sin confirmar el correo. La API MUST obtener la identidad y el rol del servidor, no de campos del cliente.

#### Scenario: Primer acceso correcto
- **WHEN** un ciudadano recién registrado envía sus credenciales correctas
- **THEN** recibe 200 con token de sesión, vencimiento e identidad básica
- **AND** la app habilita el destino autenticado mínimo sin afirmar que existen funcionalidades posteriores

#### Scenario: Acceso inválido uniforme
- **WHEN** se envía correo desconocido, contraseña incorrecta o credenciales de una cuenta suspendida o no ciudadana a este acceso
- **THEN** se responde 401 INVALID_CREDENTIALS con el mismo mensaje «Correo o contraseña incorrectos» y sin sesión

#### Scenario: Fallo al persistir sesión
- **WHEN** las credenciales son correctas pero falla el almacenamiento de la sesión
- **THEN** se responde 503, sin entregar un token utilizable ni declarar acceso correcto

### Requirement: Protección de credenciales y sesión
El sistema MUST transportar credenciales por HTTPS y almacenar contraseñas mediante hash resistente y sal individual, nunca texto plano o cifrado reversible. Contraseñas y tokens completos MUST excluirse de logs, telemetría, URL y respuestas ajenas al acceso. El dispositivo MUST guardar el token solo en almacenamiento seguro, nunca la contraseña.

#### Scenario: Inspección de persistencia y registros
- **WHEN** se registra una cuenta y se inicia sesión usando credenciales de prueba identificables
- **THEN** no se encuentra la contraseña en persistencia, logs ni telemetría, ni el token completo en logs o URL
- **AND** las respuestas de cuenta excluyen hash y datos internos de seguridad

#### Scenario: Fallo del almacenamiento seguro
- **WHEN** la API concede sesión pero el dispositivo no puede guardar el token de forma segura
- **THEN** la app no habilita el destino autenticado, descarta el token local e informa que debe reintentar
- **AND** intenta revocar la sesión sin ocultar que la revocación requiere conectividad

### Requirement: Restauración y vigencia de sesión
La sesión MUST vencer a las 24 horas de su creación, sin renovación automática en este cambio. Al abrir la app con token guardado, MUST verificarse con el servidor antes de habilitar el acceso privado. Consultar identidad con token ausente, inválido, vencido, revocado o de cuenta suspendida MUST recibir 401 sin datos privados.

#### Scenario: Reapertura y reinicio de API
- **WHEN** se reabre la app con sesión vigente después de reiniciar la API
- **THEN** el servidor conserva la sesión y devuelve únicamente la identidad de su propietario

#### Scenario: Sesión vencida o revocada
- **WHEN** una petición usa una sesión al alcanzar su vencimiento o después de revocarse
- **THEN** la API devuelve 401 y la app elimina su token y solicita iniciar sesión, sin mostrar datos privados

#### Scenario: Restauración sin conexión
- **WHEN** no es posible validar la sesión por falta de red o un error 503
- **THEN** la app muestra estado de conexión y reintento sin habilitar acceso privado
- **AND** no interpreta el error transitorio como credenciales inválidas ni elimina por ese motivo el token guardado

### Requirement: Cierre de sesión
La app MUST ofrecer cierre de sesión que elimine el token y los datos privados locales y vuelva al acceso público. Con conexión, la API MUST revocar la sesión actual y responder 204 de forma idempotente. Sin conexión, la app MUST distinguir salida local de revocación remota no confirmada.

#### Scenario: Salida con conexión
- **WHEN** el ciudadano cierra sesión y el servidor confirma la revocación
- **THEN** el token no permite nuevas consultas privadas y repetir la salida no produce error

#### Scenario: Salida sin conexión
- **WHEN** el ciudadano cierra sesión sin poder contactar al servidor
- **THEN** se borran los datos locales y se informa que la sesión remota no pudo revocarse y vencerá según su plazo

### Requirement: Limitación de intentos
La API MUST limitar registro y acceso, devolver 429 con Retry-After al superar el umbral y no emitir cuentas o sesiones para solicitudes bloqueadas. La app MUST explicar la espera sin reintentar automáticamente. Los límites MUST evitar bloqueos permanentes por correo y mantenerse ante reinicios del MVP.

#### Scenario: Exceso de solicitudes
- **WHEN** se excede el límite configurado de registro o acceso
- **THEN** se responde 429 con espera en segundos y la app muestra cuándo reintentar
- **AND** reiniciar la API durante la ventana no elimina la limitación vigente

### Requirement: Formulario y accesibilidad
La app MUST usar un registro en una pantalla y un acceso con correo y contraseña según la guía de UI cívica cercana. MUST incluir etiquetas persistentes, texto base de 16, botones de altura mínima 48, foco y lectura accesibles, texto ampliable y errores con texto e icono. MUST evitar envíos repetidos mientras espera respuesta.

#### Scenario: Interacción accesible
- **WHEN** se recorren los formularios con lector de pantalla, teclado y texto al 200 % en Android
- **THEN** se pueden identificar y activar campos, acciones y errores sin recortes que impidan completar el flujo
- **AND** Mostrar/Ocultar no borra el contenido y un error no depende únicamente del color

#### Scenario: Envío en curso
- **WHEN** se pulsa varias veces la acción durante una solicitud pendiente
- **THEN** la app emite una única solicitud en curso y muestra estado de carga

### Requirement: Fallos de conexión y resultado incierto
La app MUST informar desconexión, timeout o indisponibilidad sin afirmar éxito ni reenviar automáticamente el registro. MUST conservar nombre y correo durante el flujo y la contraseña solo en memoria mientras permanezca el formulario. Si se pierde la respuesta de alta, MUST explicar que la cuenta podría haberse creado y ofrecer iniciar sesión o reintentar.

#### Scenario: Respuesta perdida después del commit
- **WHEN** el servidor crea la cuenta pero la respuesta no llega a la app
- **THEN** la app informa resultado incierto y no confirma ni descarta la creación
- **AND** un reintento no crea otra cuenta y unas credenciales correctas permiten iniciar sesión

#### Scenario: Salida del formulario
- **WHEN** el usuario abandona o se destruye el formulario
- **THEN** se descarta la contraseña en memoria y nunca se guarda como borrador persistente

### Requirement: Límite de acceso y recuperación habilitada
El sistema MUST mantener información y contactos públicos sin sesión y restringir la identidad privada al propietario. El acceso MUST mostrar el enlace activo «Olvidé mi contraseña», que conduce a la recuperación por correo definida en `identidad/recuperacion-activacion-cuenta`, sin exigir verificar el correo para iniciar sesión. MUST excluir altas privilegiadas y no solicitar permisos del dispositivo en autenticación.

#### Scenario: Acceso público y privacidad
- **WHEN** una persona sin sesión abre información o contactos públicos y luego intenta consultar identidad privada
- **THEN** el acceso público permanece disponible y la consulta privada devuelve 401
- **AND** una sesión ciudadana solo obtiene su propia identidad, sin elegir un usuario por parámetro

#### Scenario: Recuperación disponible
- **WHEN** se abre el inicio de sesión
- **THEN** existe un enlace interactivo «Olvidé mi contraseña» de al menos 48 de alto que abre la solicitud de recuperación
- **AND** ya no aparece el texto «Recuperación de contraseña: próximamente»

#### Scenario: Sin verificación ni permisos
- **WHEN** se registra una cuenta, se inicia sesión o se recupera la contraseña
- **THEN** no se exige verificar el correo para acceder y no aparecen campos de DNI, teléfono o rol ni solicitudes de ubicación o notificaciones
