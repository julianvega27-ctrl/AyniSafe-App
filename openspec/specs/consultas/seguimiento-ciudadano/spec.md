# consultas/seguimiento-ciudadano Specification

## Purpose

Permitir que el autor con cuenta consulte el seguimiento privado de sus propios incidentes y que el invitado consulte solo estado y resumen ciudadano mediante su código secreto, sin exponer información ajena, interna ni restringida.

## Requirements

### Requirement: Historial privado con cuenta
Un ciudadano activo MUST poder listar solo los incidentes que registró con su cuenta, del más reciente al más antiguo, con paginación por cursor y tamaño máximo documentado. Cada elemento MUST incluir referencia, categoría, estado, recepción y resultado territorial. La lista MUST NOT incluir incidentes de invitado ni de otros autores.

#### Scenario: Solo lo propio
- **WHEN** dos ciudadanos con incidentes propios consultan su historial
- **THEN** cada uno recibe únicamente los suyos

#### Scenario: Historial vacío
- **WHEN** un ciudadano sin incidentes consulta su historial
- **THEN** recibe una lista vacía sin error

#### Scenario: Paginación
- **WHEN** el historial supera el tamaño de página
- **THEN** la respuesta incluye un cursor opaco y la página siguiente no repite ni omite incidentes

#### Scenario: Sin sesión válida
- **WHEN** se consulta el historial sin token o con token de otro rol
- **THEN** se responde 401 o 403 sin datos

### Requirement: Detalle privado del autor
El autor MUST poder consultar el detalle de un incidente propio con referencia, categoría, descripción, ocurrencia, recepción, estado, resultado territorial, respuestas para SAMU, institución responsable y resumen de actuaciones. La responsable es la principal con participación; sin ella, y sin actuaciones, esos datos MUST mostrarse como pendientes, sin valores inventados. MUST NOT incluir notas internas, operadores, sedes ni datos de otros informantes.

#### Scenario: Detalle propio recién registrado
- **WHEN** el autor consulta un incidente en REGISTRADO aún no enrutado
- **THEN** ve sus datos originales y la institución responsable y las actuaciones marcadas como pendientes

#### Scenario: Detalle con principal resuelta
- **WHEN** el autor consulta un incidente cuya principal SAMU participa
- **THEN** ve SAMU como institución responsable, sin sede ni operadores, y las actuaciones como pendientes

#### Scenario: Principal faltante
- **WHEN** el enrutamiento está pendiente por falta de una sede principal
- **THEN** la institución responsable aparece como pendiente aunque participen instituciones de apoyo

#### Scenario: Incidente ajeno o inexistente
- **WHEN** un ciudadano consulta por identificador un incidente de otro autor, de invitado o inexistente
- **THEN** recibe la misma respuesta 404, sin revelar si existe

#### Scenario: Principal cambiada por condición médica
- **WHEN** una aclaración hizo de SAMU la principal de un accidente con PNP principal
- **THEN** el autor ve SAMU como institución responsable

### Requirement: Vista limitada del invitado
Con referencia y código secreto válidos en el cuerpo de la solicitud, el sistema MUST devolver solo referencia, categoría, estado, recepción, institución responsable (tipo y nombre) o pendiente y resumen ciudadano de actuaciones. MUST NOT devolver descripción, punto, distrito, teléfono, evidencias, respuestas sanitarias, sedes, operadores ni notas internas.

#### Scenario: Consulta correcta
- **WHEN** un invitado envía su referencia y su código vigente
- **THEN** recibe estado y resumen ciudadano de su incidente, con la institución responsable si existe una principal con participación

#### Scenario: Datos excluidos
- **WHEN** se inspecciona la respuesta de la vista del invitado
- **THEN** no contiene descripción, coordenadas, teléfono, respuestas sanitarias, sedes ni identificadores internos

#### Scenario: Código en la URL
- **WHEN** el código o la referencia se envían como parámetros de URL en lugar del cuerpo
- **THEN** se rechaza la solicitud sin consultar

### Requirement: Respuesta uniforme ante credenciales incorrectas
Una referencia inexistente, un código incorrecto, un código reemplazado o un incidente de cuenta consultado por código MUST producir la misma respuesta 404 y un tiempo de verificación comparable. La comparación del código MUST ser de tiempo constante.

#### Scenario: Indistinguibles
- **WHEN** se consulta con referencia inexistente, con código incorrecto y con el código anterior tras un reintento
- **THEN** las tres respuestas tienen el mismo estado y cuerpo de error

#### Scenario: Incidente de cuenta
- **WHEN** se intenta consultar un incidente de cuenta con cualquier código
- **THEN** se responde igual que con código incorrecto

### Requirement: Límite de intentos de código
La consulta por código MUST limitar los intentos, correctos o no, por referencia y por origen de red en ventanas documentadas, contando cada intento antes de verificar el código y sin guardar la referencia ni la dirección en claro. Al excederlos MUST responderse 429 con Retry-After, incluso si el código fuera correcto.

#### Scenario: Fuerza bruta sobre una referencia
- **WHEN** se superan los intentos permitidos para una referencia
- **THEN** las consultas siguientes de esa referencia responden 429 hasta que termine la ventana

#### Scenario: Muchos intentos desde un origen
- **WHEN** un mismo origen supera su límite probando referencias distintas
- **THEN** se responde 429 sin verificar más códigos

### Requirement: Privacidad de las respuestas de seguimiento
Las respuestas de seguimiento MUST usar no-store y MUST NOT registrar en logs el código, el teléfono, la descripción ni las coordenadas. Los endpoints MUST documentarse en OpenAPI con sus estados 200/400/401/403/404/429/503.

#### Scenario: Cabeceras y contrato
- **WHEN** se ejecutan las pruebas de contrato del seguimiento
- **THEN** cada estado documentado se comprueba y todas las respuestas llevan Cache-Control no-store

### Requirement: Evaluación propia del autor
El detalle del autor MUST incluir, si el incidente tiene evaluación, sus propias respuestas vigentes con su instante, si puede aclararlas y si se solicita completarlas porque SAMU interviene sin observaciones de la persona principal. MUST NOT incluir cambios ni motivos de operadores. La vista del invitado MUST NOT incluir datos de la evaluación.

#### Scenario: SAMU incorporado después
- **WHEN** un operador activó a SAMU en un accidente del autor sin observaciones
- **THEN** el detalle indica que se solicita completar la evaluación, sin mostrar la precisión del operador

#### Scenario: Invitado con código
- **WHEN** un invitado consulta un incidente con evaluación
- **THEN** la respuesta no contiene heridos, cantidad ni observaciones

### Requirement: Fotos propias en el detalle del autor
El detalle privado del autor MUST incluir la lista de sus fotos disponibles, con identificador, tipo, tamaño e instante. MUST NOT incluir fotos pendientes, fallidas o eliminadas, URLs ni identificadores del proveedor. La vista limitada del invitado MUST seguir sin fotos.

#### Scenario: Detalle con fotos
- **WHEN** el autor consulta un incidente con fotos disponibles y alguna fallida o eliminada
- **THEN** ve solo los metadatos de las disponibles, sin URLs ni identificadores del proveedor

#### Scenario: Vista del invitado
- **WHEN** un invitado consulta con su código un incidente con fotos
- **THEN** la respuesta no contiene fotos ni metadatos de fotos

### Requirement: Hitos y cierre en el seguimiento
El detalle del autor y la vista del invitado MUST incluir los hitos ciudadanos del incidente en orden cronológico y, si está cerrado, el resultado ATENDIDO o DESCARTADO con su resumen ciudadano. Sin hitos, las actuaciones MUST seguir informándose como pendientes. MUST NOT incluir operadores, sedes, motivo interno ni verificación.

#### Scenario: Incidente descartado
- **WHEN** el autor consulta un incidente descartado desde revisión
- **THEN** ve CERRADO, resultado descartado, los hitos «En revisión» y «Cerrado: descartado» y el resumen ciudadano

#### Scenario: Invitado con código
- **WHEN** el invitado consulta un incidente en atención
- **THEN** ve los hitos sin descripción, sedes, operadores ni motivo interno

### Requirement: Duplicado coordinado en el seguimiento
Para un incidente vinculado como duplicado, el seguimiento MUST informar el estado y los hitos del principal como estado efectivo e indicar «Coordinado con otro reporte del mismo hecho», sin referencia, descripción, autor, evidencias ni datos del principal.

#### Scenario: Autor del duplicado
- **WHEN** el autor de un duplicado consulta su detalle
- **THEN** ve el estado del principal, la indicación de coordinación y sus propios datos originales
