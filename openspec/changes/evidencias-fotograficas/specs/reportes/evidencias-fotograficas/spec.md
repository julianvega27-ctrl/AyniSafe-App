# Spec Delta

## Purpose

Permitir que el autor de un incidente adjunte hasta tres fotografías opcionales después del registro. Las fotos se guardan como copias normalizadas sin metadatos en un almacenamiento privado aislado, y se eliminan solo por referencias registradas, sin que su falta o su fallo afecten al reporte confirmado.

## ADDED Requirements

### Requirement: Carga posterior al registro
La carga de una foto MUST hacerse sobre un incidente ya registrado, una foto por solicitud. MUST autorizarse con la sesión del ciudadano autor o con el permiso de carga del invitado de ese incidente, y solo dentro de las 24 h siguientes a la recepción y mientras el incidente no esté cerrado. Un incidente ajeno, inexistente o fuera de plazo MUST responder 404 uniforme.

#### Scenario: Autor con cuenta
- **WHEN** el ciudadano autor sube una foto válida a su incidente dentro del plazo
- **THEN** se responde 201 con el identificador de la evidencia, su tipo, tamaño e instante, sin URL ni referencia del proveedor

#### Scenario: Invitado con permiso
- **WHEN** se sube una foto válida a un incidente de invitado con su permiso de carga vigente
- **THEN** se responde 201 y la evidencia queda asociada a ese incidente

#### Scenario: Incidente ajeno o fuera de plazo
- **WHEN** otro ciudadano, un permiso de otro incidente o un permiso vencido intentan subir una foto
- **THEN** se responde 404 idéntico al de un incidente inexistente y no se almacena nada

#### Scenario: Rol institucional
- **WHEN** un operador o administrador intenta subir una foto
- **THEN** se responde 403 sin almacenar nada

### Requirement: Límites y formato real
Cada incidente MUST admitir como máximo 3 fotos no eliminadas, de hasta 5 MB cada una, en JPEG, PNG o WebP. El formato MUST determinarse por el contenido decodificado, no por la extensión ni por el tipo declarado. Videos, documentos, imágenes corruptas o con dimensiones fuera de los límites documentados MUST rechazarse.

#### Scenario: Tres fotos válidas
- **WHEN** se suben tres fotos válidas a un incidente
- **THEN** las tres quedan registradas

#### Scenario: Cuarta foto
- **WHEN** se intenta subir una cuarta foto, incluso de forma concurrente con la tercera
- **THEN** se responde 409 y el incidente conserva exactamente tres fotos

#### Scenario: Archivo mayor de 5 MB
- **WHEN** el archivo supera 5 MB
- **THEN** se responde 413 sin almacenar nada en el proveedor

#### Scenario: Documento renombrado
- **WHEN** se envía un PDF con extensión .jpg y tipo image/jpeg
- **THEN** se responde 422 sin almacenar nada en el proveedor

### Requirement: Copia normalizada sin metadatos
La copia almacenada MUST re-codificarse en su mismo formato, con la orientación aplicada y sin EXIF, GPS ni otros metadatos. MUST NOT presentarse como original forense. Si la copia supera 5 MB, MUST rechazarse.

#### Scenario: Foto con GPS
- **WHEN** se sube una foto JPEG con EXIF que incluye coordenadas GPS
- **THEN** la copia almacenada y la entregada no contienen EXIF ni GPS

### Requirement: Idempotencia de la carga
Cada carga MUST incluir una cabecera Idempotency-Key válida. Repetir la clave con el mismo archivo en el mismo incidente MUST devolver la evidencia existente sin crear otra. Reutilizarla con otro archivo MUST responder 409.

#### Scenario: Reintento tras respuesta perdida
- **WHEN** la app repite la carga con la misma clave y el mismo archivo
- **THEN** se responde 200 con la misma evidencia y el incidente no suma otra foto

#### Scenario: Clave con otro archivo
- **WHEN** se usa la misma clave con un archivo distinto
- **THEN** se responde 409 sin almacenar el nuevo archivo

### Requirement: Almacenamiento privado aislado
Cada objeto MUST almacenarse en el proveedor como recurso de entrega autenticada, con un identificador generado por el servidor bajo el prefijo `aynisafe/`, en la carpeta `aynisafe` y con la etiqueta `aynisafe`. MUST NOT existir carga directa desde el cliente, presets sin firma ni URLs del proveedor en las respuestas.

#### Scenario: Objeto almacenado
- **WHEN** se confirma una carga
- **THEN** el objeto en el proveedor es de tipo autenticado, su identificador empieza por `aynisafe/` y lleva la etiqueta `aynisafe`

#### Scenario: Acceso sin firma
- **WHEN** se solicita el objeto o un derivado al proveedor sin firma
- **THEN** el proveedor no lo entrega

### Requirement: Referencia registrada antes de subir
El identificador del objeto MUST registrarse en la base de datos antes de enviarlo al proveedor. La evidencia MUST quedar disponible solo cuando el proveedor confirma el mismo identificador y el tipo autenticado. Si la subida falla o su resultado es incierto, la evidencia MUST bloquearse y pasar a eliminación.

#### Scenario: Respuesta del proveedor perdida
- **WHEN** el proveedor no responde a tiempo durante la subida
- **THEN** se responde 503 reintentable, la evidencia no se ofrece a nadie y su identificador queda pendiente de eliminación

#### Scenario: Fallo de la base de datos tras subir
- **WHEN** falla la confirmación en la base de datos después de subir el objeto
- **THEN** el objeto sigue teniendo un registro y la limpieza lo elimina por ese identificador

### Requirement: Eliminación solo por referencias registradas
El sistema MUST eliminar objetos del proveedor solo por identificadores registrados en la base de datos con el prefijo `aynisafe/`, invalidando el original y sus derivados. MUST NOT borrar por prefijo, carpeta, etiqueta ni listado del proveedor. Un identificador fuera del prefijo MUST rechazarse sin llamar al proveedor.

#### Scenario: Identificador ajeno
- **WHEN** se solicita eliminar un identificador que no empieza por `aynisafe/` o que no está registrado
- **THEN** la operación se rechaza y no se llama al proveedor

#### Scenario: Objeto ya ausente
- **WHEN** el proveedor informa que un identificador registrado no existe
- **THEN** la evidencia se marca eliminada sin reintentar

### Requirement: Limpieza persistente de huérfanas
Las evidencias no confirmadas dentro del plazo documentado y las marcadas para eliminación MUST eliminarse mediante tareas persistentes. Las tareas MUST ejecutarse al arrancar y periódicamente, con reintentos espaciados. El registro MUST conservarse como marca sin contenido de que existió una evidencia eliminada. Un fallo del proveedor MUST NOT afectar al incidente.

#### Scenario: Reinicio con eliminaciones pendientes
- **WHEN** la API se reinicia con evidencias pendientes de eliminación
- **THEN** al arrancar las procesa y las marca eliminadas cuando el proveedor confirma el borrado

#### Scenario: Proveedor caído durante la limpieza
- **WHEN** el proveedor falla al eliminar
- **THEN** la tarea conserva el intento, programa un reintento y la evidencia sigue sin ofrecerse

### Requirement: Cuota local y proveedor no disponible
El sistema MUST aplicar un límite local configurable de bytes y de objetos almacenados en el proveedor. Al alcanzarlo, o si el proveedor está deshabilitado, no disponible o sin cuota, la carga MUST responder 503 con un código específico, sin afectar al incidente ni a sus fotos ya registradas.

#### Scenario: Límite local alcanzado
- **WHEN** la suma registrada alcanza el límite local
- **THEN** la carga responde 503 sin llamar al proveedor y el reporte sigue registrado

#### Scenario: Proveedor deshabilitado
- **WHEN** la configuración deshabilita el proveedor de evidencias
- **THEN** toda carga responde 503 con el mismo código y el registro de incidentes funciona igual

### Requirement: Límite de cargas de invitado
Las cargas con permiso de invitado MUST estar sujetas a un límite de frecuencia documentado por origen de red, sin guardar la dirección en claro. Al excederlo MUST responder 429 con Retry-After.

#### Scenario: Exceso de cargas
- **WHEN** un mismo origen supera el límite de cargas de invitado
- **THEN** se responde 429 con Retry-After sin almacenar nada

### Requirement: Privacidad de cargas y registros técnicos
Las respuestas de carga MUST usar no-store. Los logs, eventos y errores MUST NOT contener el permiso de carga, el contenido, el nombre original del archivo, los metadatos EXIF, las URLs firmadas ni las credenciales del proveedor. El contrato MUST documentar los estados 200/201/400/401/403/404/409/413/415/422/429/503.

#### Scenario: Revisión de logs
- **WHEN** se inspeccionan los logs de una carga exitosa, una fallida y una limpieza
- **THEN** no aparecen permiso, credenciales, URL firmada, nombre de archivo ni EXIF

### Requirement: Validación del proveedor real
La integración con el proveedor MUST declararse validada solo con un spike ejecutado sobre la cuenta real, con datos sintéticos, que compruebe los puntos de los escenarios y documente cada resultado. Mientras falte o falle alguno, el proveedor MUST figurar como pendiente. Las pruebas con dobles MUST NOT presentarse como validación externa.

#### Scenario: Privacidad verificada
- **WHEN** el spike sube un objeto sintético y solicita su original y un derivado sin firma, con firma alterada y con firma válida
- **THEN** solo la firma válida obtiene la imagen, y la imagen obtenida no contiene EXIF

#### Scenario: Borrado de original y derivados
- **WHEN** el spike genera un derivado firmado y luego elimina el objeto por su identificador con invalidación
- **THEN** el proveedor deja de listar el recurso y de servir el original y el derivado, y se registra el tiempo observado

#### Scenario: Aislamiento y cuota
- **WHEN** el spike termina
- **THEN** solo eliminó los identificadores que él mismo registró y quedaron documentados el modo de carpetas, el rechazo de `/usage` y el consumo propio medido

#### Scenario: Spike incompleto
- **WHEN** algún punto del spike falla o no se ejecutó
- **THEN** la evidencia lo indica y el proveedor sigue como pendiente, sin declarar la integración validada
