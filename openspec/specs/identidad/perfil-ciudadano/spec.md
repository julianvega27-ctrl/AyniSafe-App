# perfil-ciudadano Specification

## Purpose

Permitir al ciudadano consultar y editar su propio perfil (nombre, teléfono opcional y autorización para compartirlo) sin exponer datos a terceros y sin tratar un correo editado como identidad verificada.

## Requirements

### Requirement: Perfil propio
La API MUST exponer `GET /perfil` que, con una sesión ciudadana vigente, devuelva únicamente el perfil de su titular: identificador, nombre, correo, teléfono (o nulo) y si autoriza compartirlo. El perfil MUST obtenerse de la sesión y MUST NOT existir ruta, parámetro ni campo que permita elegir otro usuario. La respuesta MUST incluir `Cache-Control: no-store` y MUST excluir hash y datos internos. `GET /auth/sesion` MUST NOT incluir el teléfono.

#### Scenario: Consulta del propio perfil
- **WHEN** un ciudadano con sesión vigente consulta su perfil
- **THEN** recibe 200 con sus datos y el teléfono nulo si no lo registró
- **AND** la respuesta no contiene hash, rol editable ni datos de otras cuentas

#### Scenario: Intento de acceder a un perfil ajeno
- **WHEN** se solicita `/perfil/{id}` de otra cuenta o se envía un identificador en la consulta o en el cuerpo
- **THEN** no se devuelve ni modifica el perfil de otra cuenta (404 para la ruta inexistente y 400 para campos no admitidos)

#### Scenario: Sin sesión válida
- **WHEN** se consulta o edita el perfil con token ausente, inválido, vencido, revocado o de cuenta suspendida
- **THEN** la API responde 401 UNAUTHENTICATED sin datos privados

### Requirement: Edición de nombre y teléfono
La API MUST exponer `PATCH /perfil` que admita solamente `nombre`, `telefono` y `compartirTelefono`, aplique solo los campos enviados y exija al menos uno. La edición MUST persistir de forma atómica y devolver el perfil actualizado.

#### Scenario: Edición persistente
- **WHEN** el ciudadano cambia su nombre y registra un teléfono válido
- **THEN** la API responde 200 con el perfil actualizado y una consulta posterior, incluso tras reabrir la app, devuelve los mismos valores

#### Scenario: Teléfono vacío o borrado
- **WHEN** se envía `telefono` nulo o vacío, o la cuenta nunca tuvo teléfono
- **THEN** el perfil queda sin teléfono y no es un error

#### Scenario: Datos inválidos
- **WHEN** se envía nombre vacío o de 101 puntos de código, teléfono con letras o de 6 o 16 dígitos, o un cuerpo sin campos
- **THEN** la API responde 400 con el campo afectado y no cambia ningún dato

#### Scenario: Campos no admitidos
- **WHEN** el cuerpo incluye `correo`, `rol`, `estado`, `id`, DNI u otro campo no declarado
- **THEN** la API responde 400, no modifica la cuenta y el correo conserva su valor

### Requirement: Validación de nombre y teléfono
El nombre MUST cumplir las reglas de Spec 01 (1 a 100 puntos de código tras recortar). El teléfono MUST ser opcional: se normaliza quitando espacios, guiones, puntos y paréntesis y MUST tener entre 7 y 15 dígitos con un `+` inicial opcional; `null` o texto vacío lo borra. La API MUST rechazar con 400 y errores por campo los valores inválidos y los campos no admitidos.

#### Scenario: Normalización del teléfono
- **WHEN** se envía `+51 987-654-321` o `(064) 123 456`
- **THEN** se guarda el valor normalizado sin separadores y se devuelve así en el perfil

### Requirement: Correo de solo lectura
El sistema MUST mostrar el correo en el perfil sin permitir editarlo y MUST NOT cambiar el correo mediante la API de perfil. El correo MUST seguir siendo la clave de identidad y el destino de recuperación y activación, y MUST NOT presentarse como verificado. Cambiar el correo MUST requerir una entrega independiente que lo verifique.

#### Scenario: Correo inmutable por perfil
- **WHEN** una sesión envía un nuevo correo en `PATCH /perfil`
- **THEN** la API responde 400, el correo y el acceso por correo no cambian y la recuperación sigue usando el correo registrado

#### Scenario: Presentación en la app
- **WHEN** el ciudadano abre su perfil
- **THEN** el correo aparece como dato de solo lectura, sin control de edición y sin afirmar que esté verificado

### Requirement: Autorización revocable para compartir el teléfono
La cuenta MUST registrar si el ciudadano autoriza compartir su teléfono, con la fecha de la autorización. La autorización MUST ser falsa por defecto, MUST requerir un teléfono registrado, MUST poder revocarse sin borrar el número, MUST revocarse al borrar el teléfono y MUST revocarse al cambiar el número salvo que la misma solicitud la otorgue de nuevo. Esta entrega MUST NOT compartir el teléfono con instituciones, publicarlo ni incluirlo en notificaciones; solo conserva la preferencia.

#### Scenario: Otorgar y revocar
- **WHEN** el ciudadano con teléfono registrado activa y luego desactiva la autorización
- **THEN** el perfil refleja cada estado y, tras revocar, el teléfono permanece registrado

#### Scenario: Autorización sin teléfono
- **WHEN** se solicita `compartirTelefono` verdadero sin teléfono registrado ni enviado
- **THEN** la API responde 400 y no registra la autorización

#### Scenario: Borrar o cambiar el teléfono
- **WHEN** el ciudadano borra su teléfono, o lo cambia por otro número sin otorgar la autorización en la misma solicitud
- **THEN** la autorización queda revocada

#### Scenario: Aviso honesto
- **WHEN** la app muestra la autorización
- **THEN** informa que aún no se comparte con nadie y que solo se usará, con su consentimiento, para instituciones del caso que reporte

### Requirement: Protección del dato personal y concurrencia
El teléfono MUST excluirse de logs, telemetría, respuestas ajenas al perfil y mensajes de error. Ediciones simultáneas del mismo perfil MUST producir un estado consistente (última escritura) sin violar las reglas de autorización. Un fallo de almacenamiento MUST responder 503 sin cambios parciales. La app MUST emitir una única solicitud de edición en curso y conservar lo escrito en el formulario ante errores de conexión.

#### Scenario: Inspección de registros
- **WHEN** se edita un perfil con un teléfono y un nombre identificables
- **THEN** ningún registro del servidor contiene el teléfono ni el cuerpo de la solicitud

#### Scenario: Ediciones simultáneas
- **WHEN** dos solicitudes editan a la vez el teléfono y la autorización
- **THEN** el resultado equivale a una aplicación ordenada de ambas y nunca queda autorización sin teléfono

#### Scenario: Fallo antes de confirmar
- **WHEN** falla la escritura al guardar
- **THEN** la API responde 503 y el perfil anterior permanece intacto
- **AND** la app informa el fallo sin afirmar que se guardó y conserva el formulario

#### Scenario: Envío único
- **WHEN** se pulsa «Guardar» varias veces durante una solicitud pendiente
- **THEN** se emite una sola solicitud y se muestra estado de carga

### Requirement: Identidad de sesión actualizada
Tras guardar el nombre, la app MUST reflejar el nuevo nombre en la cabecera y saludos sin volver a iniciar sesión. Al cerrar sesión, expirar la sesión o fallar la verificación con 401, la app MUST descartar los datos de perfil de la memoria y MUST NOT guardarlos en almacenamiento persistente.

#### Scenario: Nombre actualizado
- **WHEN** el ciudadano guarda un nombre nuevo
- **THEN** la app lo muestra de inmediato en el perfil y en el saludo de Inicio

#### Scenario: Salida
- **WHEN** el ciudadano cierra sesión y luego usa el retroceso del sistema
- **THEN** no aparece ninguna pantalla con datos del perfil
