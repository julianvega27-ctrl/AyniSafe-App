# Spec Delta

## MODIFIED Requirements

### Requirement: Respuestas para la intervención de SAMU
El envío MUST admitir «¿Hay heridos?» con si, no o no_se en accidente-transito, agresion, pelea, violencia y emergencia-medica, y «¿Se necesita atención médica?» con los mismos valores solo en accidente-transito. Omitir una respuesta aplicable MUST guardarse como sin respuesta, distinta de no. En otras categorías estos campos MUST rechazarse. El sistema MUST NOT convertir no_se ni sin respuesta en no.

#### Scenario: Accidente con respuestas desconocidas
- **WHEN** se envía accidente-transito con heridos no_se y sin respuesta de atención médica
- **THEN** se registra el incidente conservando no_se y sin respuesta, sin interpretarlas como no

#### Scenario: Pelea con heridos
- **WHEN** se envía pelea con heridos si
- **THEN** se registra la respuesta como dato original del envío

#### Scenario: Emergencia médica con heridos
- **WHEN** se envía emergencia-medica con heridos no
- **THEN** se registra la respuesta y SAMU sigue siendo la principal

#### Scenario: Pregunta no aplicable
- **WHEN** se envía robo con heridos, o agresion o emergencia-medica con atención médica
- **THEN** se responde 400 por campo no admitido para la categoría

#### Scenario: Valor no admitido
- **WHEN** heridos o atención médica tienen un valor distinto de si, no o no_se
- **THEN** se responde 400 indicando el campo

### Requirement: Idempotencia del envío
Cada envío MUST incluir una cabecera Idempotency-Key con formato válido. La clave MUST asociarse al autor con cuenta, o al ámbito invitado, junto con la huella del contenido normalizado. Repetir la misma clave y el mismo contenido MUST devolver el incidente existente sin crear otro. Reutilizar la clave con otro contenido MUST responder 409. Envíos concurrentes con la misma clave MUST crear un único incidente. La evaluación MUST formar parte de la huella solo cuando viene en el cuerpo.

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

#### Scenario: Reintento con otra evaluación
- **WHEN** se repite una clave con el mismo envío pero distinta evaluación
- **THEN** se responde 409 sin crear otra versión ni otro incidente

#### Scenario: Envío anterior sin evaluación
- **WHEN** se repite un envío sin evaluación registrado antes de este cambio
- **THEN** su huella coincide y se devuelve el mismo comprobante

## ADDED Requirements

### Requirement: Evaluación en el envío
El cuerpo del registro MUST admitir un objeto opcional `evaluacion` con la cantidad de heridos y las observaciones de la persona principal, validado según la capacidad de evaluación rápida. Registrar una de las cinco categorías con preguntas médicas MUST crear la versión 1 de la evaluación en la misma transacción que el incidente, aunque todas las respuestas sean desconocidas. El comprobante MUST NOT incluir datos de la evaluación.

#### Scenario: Envío con respuestas desconocidas
- **WHEN** se envía una agresión con heridos si sin evaluación
- **THEN** se registra el incidente con la versión 1, cantidad `no_se` y observaciones sin respuesta

#### Scenario: Fallo al guardar la evaluación
- **WHEN** falla la escritura de la versión 1
- **THEN** no se registra el incidente ni se consume la clave, y se responde 503 reintentable

#### Scenario: Comprobante sin evaluación
- **WHEN** se registra una emergencia médica con observaciones
- **THEN** el comprobante 201 no contiene heridos, cantidad ni observaciones
