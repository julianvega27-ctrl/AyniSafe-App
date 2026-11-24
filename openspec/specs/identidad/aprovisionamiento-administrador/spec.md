# aprovisionamiento-administrador Specification

## Purpose

Crear y recuperar la cuenta del administrador inicial mediante procedimientos controlados de línea de comandos, sin contraseñas compartidas, sin rutas públicas y sin secretos en repositorio ni registros.

## Requirements

### Requirement: Alta controlada del administrador inicial
El sistema MUST ofrecer un procedimiento de línea de comandos, ejecutable solo por quien dispone del acceso a la base de datos del entorno, que cree una cuenta de rol administrador en estado pendiente de activación sin contraseña y encole su invitación de activación. El procedimiento MUST recibir el correo y el nombre por argumento o entorno, MUST NOT recibir ni generar una contraseña, y MUST crear la cuenta y la invitación en una sola transacción. No MUST existir ninguna ruta HTTP que cree administradores.

#### Scenario: Primer administrador
- **WHEN** se ejecuta el procedimiento con un correo nuevo
- **THEN** existe una cuenta administrador pendiente de activación sin contraseña y una invitación de activación encolada

#### Scenario: Activación por la persona titular
- **WHEN** el titular abre el enlace de su invitación y elige una contraseña válida
- **THEN** la cuenta pasa a activa, no se emite sesión y el titular puede iniciar sesión institucional

#### Scenario: Fallo parcial
- **WHEN** falla la creación de la invitación durante el procedimiento
- **THEN** no queda ni la cuenta ni envío alguno

#### Scenario: Sin ruta pública
- **WHEN** se inspecciona el contrato y las rutas montadas
- **THEN** ninguna crea ni reinicia administradores

### Requirement: Idempotencia y no reutilización de cuentas ajenas
El procedimiento de alta MUST ser idempotente por correo: repetirlo para una cuenta administrador aún pendiente MUST reencolar la invitación sin duplicar la cuenta, y para un administrador ya activo MUST informar que no hay nada que hacer sin modificar la cuenta. Si el correo pertenece a una cuenta que no es administrador, MUST rechazar sin modificar nada.

#### Scenario: Repetición con cuenta pendiente
- **WHEN** se ejecuta dos veces para el mismo correo antes de la activación
- **THEN** existe una sola cuenta y a lo sumo una invitación activa

#### Scenario: Administrador ya activo
- **WHEN** se ejecuta para un administrador activo
- **THEN** informa que ya está activo y no cambia contraseña, estado ni sesiones

#### Scenario: Correo de otro rol
- **WHEN** el correo pertenece a un ciudadano u operador
- **THEN** el procedimiento termina con error y la cuenta no cambia

### Requirement: Enlace emitido solo en terminal local
El procedimiento MAY ofrecer una opción para emitir el enlace de activación en la terminal local cuando no pueda enviarse el correo. Esa opción MUST imprimir el enlace una sola vez, MUST NOT escribirlo en archivos ni logs estructurados y MUST negarse a ejecutarse si el entorno indica integración continua (`CI=true`).

#### Scenario: Enlace local
- **WHEN** se ejecuta con la opción de enlace local fuera de integración continua
- **THEN** el enlace se muestra una vez en la terminal y el token no se guarda en claro

#### Scenario: Integración continua
- **WHEN** se ejecuta con `CI=true` y la opción de enlace local
- **THEN** el procedimiento se niega, no emite token y no crea ni modifica cuentas

### Requirement: Reinicio de emergencia del administrador
El sistema MUST ofrecer un procedimiento de línea de comandos para reiniciar el acceso de un administrador existente: dejar la cuenta en estado pendiente de activación sin contraseña, revocar todas sus sesiones, invalidar sus tokens previos y reencolar una invitación. MUST aplicarse solo a cuentas administrador y MUST NOT crear una ruta pública de recuperación.

#### Scenario: Contraseña perdida
- **WHEN** se reinicia un administrador activo
- **THEN** su contraseña anterior deja de autenticar, sus sesiones quedan revocadas y recibe una invitación nueva

#### Scenario: Cuenta suspendida
- **WHEN** se reinicia un administrador suspendido
- **THEN** la cuenta vuelve a pendiente de activación y solo recupera acceso tras activarse

#### Scenario: Cuenta que no es administrador
- **WHEN** el correo no pertenece a un administrador
- **THEN** el procedimiento termina con error y no modifica la cuenta

#### Scenario: Recuperación ciudadana intacta
- **WHEN** se ejecutan las pruebas de recuperación ciudadana tras añadir el procedimiento
- **THEN** sus resultados no cambian

### Requirement: Sin secretos en repositorio ni registros
El procedimiento MUST NOT requerir ni almacenar contraseñas compartidas en el repositorio. Sus mensajes y registros MUST limitarse a eventos genéricos (creada, reencolada, ya activa, reiniciada, rechazada) y MUST excluir contraseñas, tokens, enlaces y la cadena de conexión. La documentación de ejecución MUST usar valores de ejemplo no válidos.

#### Scenario: Inspección de salida
- **WHEN** se ejecutan los procedimientos con valores de prueba identificables
- **THEN** ni la salida ni los logs contienen contraseña, token, enlace ni cadena de conexión

#### Scenario: Revisión del repositorio
- **WHEN** se buscan credenciales o contraseñas de administrador en los archivos versionados
- **THEN** no existe ninguna, y los ejemplos usan marcadores no válidos
