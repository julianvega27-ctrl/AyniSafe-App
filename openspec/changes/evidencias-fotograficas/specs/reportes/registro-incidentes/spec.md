# Spec Delta

## ADDED Requirements

### Requirement: Permiso de carga del invitado
Un registro de invitado MUST devolver una única vez, junto al código secreto, un permiso de carga de fotos de alta entropía, distinto del código y de la referencia. El permiso MUST servir solo para subir fotos a ese incidente y vencer 24 h después de la recepción. El servidor MUST guardar solo su huella. Un reintento idempotente MUST emitir uno nuevo e invalidar el anterior. El permiso MUST NOT aparecer en logs, eventos ni URLs.

#### Scenario: Emisión del permiso
- **WHEN** un invitado registra un incidente
- **THEN** el comprobante incluye el permiso de carga con su vencimiento, y la BD contiene solo su huella

#### Scenario: Reintento del invitado
- **WHEN** el invitado repite el envío con la misma clave y contenido
- **THEN** recibe un permiso nuevo, y el anterior deja de autorizar cargas

#### Scenario: Comprobante con cuenta
- **WHEN** un ciudadano con cuenta registra un incidente
- **THEN** el comprobante no incluye permiso de carga, porque sube con su sesión

#### Scenario: Permiso sin acceso de lectura
- **WHEN** se usa el permiso de carga para consultar el seguimiento o ver fotos
- **THEN** no se concede acceso

### Requirement: Registro independiente de las fotos
El registro MUST confirmarse sin recibir, esperar ni validar fotos. Un fallo o rechazo posterior de una carga MUST NOT modificar, bloquear ni eliminar el incidente confirmado.

#### Scenario: Fotos rechazadas tras el registro
- **WHEN** todas las cargas de un incidente recién registrado fallan o se rechazan
- **THEN** el incidente sigue registrado con su comprobante, sin fotos
