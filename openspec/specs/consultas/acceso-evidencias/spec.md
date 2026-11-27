# consultas/acceso-evidencias Specification

## Purpose

Entregar las fotografías de un incidente solo a quien tiene derecho a verlas: los operadores de las instituciones participantes dentro de su ámbito y el autor con cuenta. El resto de personas y vistas no recibe imágenes ni referencias de almacenamiento.

## Requirements

### Requirement: Fotos para operadores participantes
Un operador cuya sede participa en el incidente dentro de su ámbito vigente MUST poder listar las evidencias disponibles y obtener el contenido de cada una. La lista MUST incluir identificador, tipo, tamaño e instante, sin autor, nombre de archivo, URL ni identificador del proveedor.

#### Scenario: Operador de una institución de apoyo
- **WHEN** un operador PNP participante como simultánea pide las fotos de un accidente
- **THEN** recibe la lista y puede obtener el contenido de cada foto

#### Scenario: Evidencia no disponible
- **WHEN** una foto está pendiente, falló o fue eliminada
- **THEN** no aparece en la lista y pedir su contenido responde 404

### Requirement: Fotos propias del autor
El ciudadano con cuenta MUST poder listar y obtener el contenido de las fotos disponibles de sus propios incidentes, sin datos de otros informantes.

#### Scenario: Autor
- **WHEN** el autor pide el contenido de una foto de su incidente
- **THEN** recibe la imagen

#### Scenario: Otro ciudadano
- **WHEN** otro ciudadano pide la misma foto
- **THEN** recibe 404 idéntico al de un identificador inexistente

### Requirement: Rechazo uniforme
Un operador de una institución no participante o fuera de ámbito, un identificador inexistente o malformado, o una evidencia de otro incidente MUST recibir el mismo 404. Un administrador MUST recibir 403. El código secreto y el permiso de carga del invitado MUST NOT dar acceso a fotos.

#### Scenario: Institución no participante
- **WHEN** un operador de Bomberos sin participación pide una foto por URL directa
- **THEN** recibe 404 idéntico al de una evidencia inexistente

#### Scenario: Administrador
- **WHEN** un administrador pide las fotos de cualquier incidente
- **THEN** recibe 403 sin contenido

#### Scenario: Invitado
- **WHEN** se intenta obtener una foto con el código secreto o el permiso de carga
- **THEN** no se entrega contenido

### Requirement: Entrega autenticada sin URLs expuestas
El contenido MUST entregarse a través de la API, con su tipo real, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y sin redirigir al proveedor. La URL firmada con que la API obtiene el objeto MUST NOT incluirse en respuestas, cabeceras ni logs.

#### Scenario: Cabeceras de la entrega
- **WHEN** un operador autorizado obtiene una foto
- **THEN** la respuesta tiene el tipo de la imagen, no-store y nosniff, y ninguna cabecera ni cuerpo contiene una URL del proveedor

#### Scenario: Proveedor no disponible
- **WHEN** el proveedor falla al entregar una foto autorizada
- **THEN** se responde 503 reintentable sin registrar la lectura como realizada

### Requirement: Registro de lecturas sin contenido
Cada entrega autorizada de contenido MUST registrarse con el usuario, la evidencia y el instante, sin la imagen ni sus metadatos. Una lectura rechazada MUST NOT registrarse como acceso autorizado.

#### Scenario: Lectura auditada
- **WHEN** un operador obtiene una foto
- **THEN** queda un registro de acceso con su usuario, la evidencia y el instante

### Requirement: Exclusión de vistas no autorizadas
Las fotos y sus referencias de almacenamiento MUST NOT aparecer en la bandeja, la consulta del invitado, las vistas del administrador, las respuestas públicas, los eventos ni los logs. Los endpoints MUST documentarse en OpenAPI con sus estados 200/401/403/404/503.

#### Scenario: Recorrido de vistas
- **WHEN** se recorren la bandeja, la consulta del invitado, los pendientes del administrador y los eventos de un incidente con fotos
- **THEN** ninguna respuesta contiene contenido, identificador del proveedor ni URL de las fotos
