# Spec Delta

## Purpose

Recibir desde la app el envío ciudadano de un incidente como invitado o con cuenta, validar y conservar sus datos originales una sola vez y confirmar su registro con un comprobante, sin depender de avisos, enrutamiento ni evidencias.

## ADDED Requirements

### Requirement: Modalidades de envío
El sistema MUST aceptar envíos sin sesión (modalidad invitado) o con sesión de ciudadano activo (modalidad cuenta). Con cuenta, el autor MUST obtenerse de la sesión y no del cuerpo. Una cabecera Authorization presente pero inválida, vencida o revocada MUST responder 401 sin registrar como invitado. Sesiones de operador o administrador MUST NOT registrar incidentes.

#### Scenario: Envío con cuenta
- **WHEN** un ciudadano activo envía un incidente válido con su token Bearer
- **THEN** se crea el incidente con modalidad cuenta y autor igual al usuario de la sesión, aunque el cuerpo intente indicar otro autor

#### Scenario: Envío como invitado
- **WHEN** se envía un incidente válido sin cabecera Authorization
- **THEN** se crea el incidente con modalidad invitado, sin usuario asociado ni identidad fabricada

#### Scenario: Token inválido
- **WHEN** se envía con un token Bearer vencido, revocado o malformado
- **THEN** se responde 401 y no se crea ningún incidente

#### Scenario: Rol institucional
- **WHEN** una cuenta de operador o administrador intenta registrar un incidente
- **THEN** se rechaza sin crear incidente

### Requirement: Autoría coherente sin vinculación posterior
Los originales MUST registrar la modalidad del envío. Con cuenta MUST referenciar al usuario autor; como invitado MUST NOT referenciar ningún usuario y MUST guardar el teléfono de contacto. La BD MUST rechazar combinaciones incoherentes. Un envío de invitado MUST NOT incorporarse a una cuenta por coincidencia de correo, teléfono o dispositivo.

#### Scenario: Coherencia de modalidad
- **WHEN** se intenta guardar un envío de invitado con autor o sin teléfono, o uno de cuenta sin autor o con teléfono
- **THEN** la restricción de la BD lo rechaza

#### Scenario: Sin vinculación posterior
- **WHEN** un invitado crea luego una cuenta con el mismo teléfono
- **THEN** sus incidentes de invitado no aparecen en el historial de la cuenta

### Requirement: Datos originales obligatorios
El envío MUST incluir una categoría activa del catálogo, una descripción y un momento de ocurrencia, y MUST rechazar campos desconocidos. MUST NOT aceptar institución, sede, prioridad, estado, distrito, autor ni referencia enviados por el cliente. La ocurrencia MUST distinguirse del instante de registro del servidor y MUST NOT estar en el futuro más allá de la tolerancia documentada.

#### Scenario: Categoría inexistente o inactiva
- **WHEN** se envía una categoría que no existe o está inactiva
- **THEN** se responde 400 con error de validación del campo y no se crea incidente

#### Scenario: Descripción vacía o excesiva
- **WHEN** la descripción está vacía, solo contiene espacios o supera la longitud máxima documentada
- **THEN** se responde 400 indicando el campo

#### Scenario: Ocurrencia futura o anterior al límite
- **WHEN** el momento de ocurrencia está después del instante del servidor más la tolerancia, o antes del límite de antigüedad documentado
- **THEN** se responde 400 sin crear incidente

#### Scenario: Campos reservados al servidor
- **WHEN** el cuerpo incluye prioridad, estado, institución, sede, distrito, autor, referencia o cualquier campo no documentado
- **THEN** se responde 400 y no se crea incidente

### Requirement: Descripción concreta en Otra emergencia
Para la categoría otra-emergencia, la descripción MUST ser obligatoria con la misma política de longitud y MUST NOT existir otro campo narrativo. El sistema MUST NOT clasificar semánticamente ni bloquear por palabras desconocidas.

#### Scenario: Otra emergencia descrita
- **WHEN** se envía otra-emergencia con una descripción que cumple la longitud
- **THEN** se registra el incidente con esa descripción como dato original

#### Scenario: Otra emergencia sin descripción
- **WHEN** se envía otra-emergencia con descripción vacía
- **THEN** se responde 400 indicando el campo descripción

### Requirement: Teléfono de contacto según modalidad
Como invitado, el teléfono de contacto MUST ser obligatorio y válido. Con cuenta, el envío MUST NOT aceptar un teléfono y MUST NOT copiar el teléfono del perfil al incidente. El teléfono MUST NOT aparecer en el comprobante, el seguimiento, los logs ni el evento.

#### Scenario: Invitado sin teléfono
- **WHEN** un invitado envía sin teléfono o con un teléfono inválido
- **THEN** se responde 400 indicando el campo y no se crea incidente

#### Scenario: Cuenta con teléfono en el cuerpo
- **WHEN** un ciudadano con cuenta incluye un teléfono en el envío
- **THEN** se responde 400 por campo no admitido en esa modalidad

#### Scenario: Teléfono protegido
- **WHEN** se inspeccionan el comprobante, el evento persistido y los logs de un envío de invitado
- **THEN** ninguno contiene el teléfono

### Requirement: Punto del incidente obligatorio
El envío MUST incluir un punto con latitud y longitud finitas en rango y su origen (gps o manual), con precisión opcional. Sin punto válido MUST rechazarse sin crear incidente. MUST NOT existir una opción de envío sin punto ni sustituir el punto por un distrito declarado.

#### Scenario: Sin punto
- **WHEN** el envío omite el punto o lo envía nulo
- **THEN** se responde 400 y no se crea incidente

#### Scenario: Coordenadas inválidas
- **WHEN** una coordenada no es numérica, no es finita o está fuera de rango, o el origen no es gps ni manual
- **THEN** se responde 400 sin calcular ni guardar un punto sustituto

#### Scenario: Punto manual
- **WHEN** se envía un punto válido con origen manual
- **THEN** se registra con ese origen y sin exigir precisión

### Requirement: Clasificación territorial al registrar
El backend MUST resolver el distrito desde el punto del incidente con el catálogo territorial vigente dentro de la misma operación de registro y conservar la versión evaluada. Frontera, solapamiento o punto fuera del área MUST registrar el incidente con distrito pendiente y su motivo. Si no hay cartografía activa MUST registrarse con distrito pendiente por indisponibilidad territorial, sin rechazar el envío.

#### Scenario: Punto interior
- **WHEN** el punto cae en el interior inequívoco de un distrito de la versión activa
- **THEN** el incidente guarda ese distrito y la versión evaluada

#### Scenario: Punto en frontera o fuera del área
- **WHEN** el punto toca un borde, cae en dos distritos o queda fuera de los cinco distritos
- **THEN** el incidente se registra con distrito nulo, estado pendiente, el motivo correspondiente y la versión evaluada

#### Scenario: Sin cartografía activa
- **WHEN** se registra un punto válido sin versión territorial activa
- **THEN** el incidente se registra con distrito pendiente, motivo sin cartografía y sin versión, conservando el punto

### Requirement: Respuestas para la intervención de SAMU
El envío MUST admitir «¿Hay heridos?» con si, no o no_se en accidente-transito, agresion, pelea y violencia, y «¿Se necesita atención médica?» con los mismos valores solo en accidente-transito. Omitir una respuesta aplicable MUST guardarse como sin respuesta, distinta de no. En otras categorías estos campos MUST rechazarse. El sistema MUST NOT convertir no_se ni sin respuesta en no.

#### Scenario: Accidente con respuestas desconocidas
- **WHEN** se envía accidente-transito con heridos no_se y sin respuesta de atención médica
- **THEN** se registra el incidente conservando no_se y sin respuesta, sin interpretarlas como no

#### Scenario: Pelea con heridos
- **WHEN** se envía pelea con heridos si
- **THEN** se registra la respuesta como dato original del envío

#### Scenario: Pregunta no aplicable
- **WHEN** se envía robo con heridos, o agresion con atención médica
- **THEN** se responde 400 por campo no admitido para la categoría

#### Scenario: Valor no admitido
- **WHEN** heridos o atención médica tienen un valor distinto de si, no o no_se
- **THEN** se responde 400 indicando el campo

### Requirement: Idempotencia del envío
Cada envío MUST incluir una cabecera Idempotency-Key con formato válido. La clave MUST asociarse al autor con cuenta, o al ámbito invitado, junto con la huella del contenido normalizado. Repetir la misma clave y el mismo contenido MUST devolver el incidente existente sin crear otro. Reutilizar la clave con otro contenido MUST responder 409. Envíos concurrentes con la misma clave MUST crear un único incidente.

#### Scenario: Sin clave
- **WHEN** se envía sin Idempotency-Key o con una clave de formato inválido
- **THEN** se responde 400 sin crear incidente

#### Scenario: Reintento tras respuesta perdida
- **WHEN** se repite el envío con la misma clave y el mismo contenido
- **THEN** se responde 200 con el comprobante del mismo incidente y sigue existiendo un único incidente

#### Scenario: Clave reutilizada con otro contenido
- **WHEN** se usa una clave ya registrada con un contenido distinto
- **THEN** se responde 409 sin modificar el incidente existente ni crear otro

#### Scenario: Envíos simultáneos
- **WHEN** dos solicitudes con la misma clave y contenido llegan a la vez
- **THEN** existe un único incidente y ambas respuestas identifican la misma referencia

#### Scenario: Misma clave en otro autor
- **WHEN** dos ciudadanos con cuenta distinta usan la misma clave
- **THEN** cada uno obtiene su propio incidente, sin revelar el del otro

### Requirement: Comprobante de registro
La respuesta de un registro nuevo MUST ser 201 con referencia pública, estado REGISTRADO, instante de recepción del servidor, modalidad y resultado territorial (distrito o motivo pendiente). MUST NOT incluir teléfono, coordenadas exactas, autor, identificadores internos de otras entidades ni datos de enrutamiento.

#### Scenario: Comprobante de cuenta
- **WHEN** un ciudadano con cuenta registra un incidente
- **THEN** recibe 201 con referencia, estado REGISTRADO, recepción, modalidad cuenta y distrito o pendiente, sin código secreto

#### Scenario: Comprobante sin datos restringidos
- **WHEN** se inspecciona cualquier comprobante
- **THEN** no contiene teléfono, coordenadas, institución, sede, prioridad ni datos de otros envíos

### Requirement: Código secreto del invitado
Un registro de invitado MUST devolver una única vez un código secreto de alta entropía, distinto de la referencia y no derivable de ella. El servidor MUST guardar solo una huella no reversible. Un reintento idempotente MUST emitir un código nuevo que invalida el anterior. El código MUST NOT aparecer en logs, eventos, referencias ni URLs.

#### Scenario: Emisión del código
- **WHEN** un invitado registra un incidente
- **THEN** el comprobante incluye el código secreto y la BD contiene solo su huella

#### Scenario: Reintento del invitado
- **WHEN** el invitado repite el envío con la misma clave y contenido
- **THEN** recibe el mismo incidente con un código nuevo, y el código anterior deja de permitir la consulta

#### Scenario: Código ausente en registros técnicos
- **WHEN** se inspeccionan los logs, el evento persistido y las tablas del registro
- **THEN** no aparece el código en claro

### Requirement: Límite de envíos de invitado
Los envíos sin sesión MUST estar sujetos a un límite de frecuencia documentado por origen de red, sin persistir la dirección en claro. Al excederlo MUST responderse 429 con Retry-After, sin crear incidente. Un reintento idempotente de un incidente ya creado MUST NOT bloquearse por ese límite.

#### Scenario: Exceso de envíos
- **WHEN** un mismo origen supera el límite de envíos de invitado en la ventana documentada
- **THEN** se responde 429 con Retry-After y no se crea incidente

#### Scenario: Reintento dentro del límite agotado
- **WHEN** el límite está agotado y llega un reintento idempotente de un incidente ya registrado
- **THEN** se devuelve su comprobante sin crear otro

### Requirement: Registro sin esperar procesamiento posterior
La confirmación MUST producirse cuando el incidente, sus originales, la clave de idempotencia y el evento de registro están confirmados en la base de datos. MUST NOT esperar consumidores, enrutamiento, avisos ni proveedores externos. Si falla cualquier escritura de la operación, MUST NOT quedar incidente, originales ni evento parciales.

#### Scenario: Consumidor lento o caído
- **WHEN** un consumidor del evento de registro está detenido o falla
- **THEN** el envío se confirma igual y el evento y su entrega quedan pendientes

#### Scenario: Fallo durante el registro
- **WHEN** falla una escritura antes de confirmar la operación
- **THEN** no queda incidente, original, clave ni evento, y el cliente recibe un error reintentable

### Requirement: Contrato documentado del registro
El endpoint de registro MUST documentarse en OpenAPI con cabeceras, cuerpo, comprobantes, códigos 200/201/400/401/403/409/429/503 y sus errores. Las respuestas MUST usar no-store.

#### Scenario: Contrato validado
- **WHEN** se ejecuta la validación de contrato y las pruebas de contrato
- **THEN** cada estado documentado del registro se comprueba contra el OpenAPI desreferenciado
