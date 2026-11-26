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
El autor MUST poder consultar el detalle de un incidente propio con referencia, categoría, descripción, ocurrencia, recepción, estado, resultado territorial, respuestas para SAMU, institución responsable y resumen de actuaciones. Sin enrutamiento ni actuaciones, esos datos MUST mostrarse como pendientes, sin valores inventados. MUST NOT incluir notas internas, operadores ni datos de otros informantes.

#### Scenario: Detalle propio recién registrado
- **WHEN** el autor consulta un incidente en REGISTRADO
- **THEN** ve sus datos originales y la institución responsable y las actuaciones marcadas como pendientes

#### Scenario: Incidente ajeno o inexistente
- **WHEN** un ciudadano consulta por identificador un incidente de otro autor, de invitado o inexistente
- **THEN** recibe la misma respuesta 404, sin revelar si existe

### Requirement: Vista limitada del invitado
Con referencia y código secreto válidos en el cuerpo de la solicitud, el sistema MUST devolver solo referencia, categoría, estado, recepción, institución responsable o pendiente y resumen ciudadano de actuaciones. MUST NOT devolver descripción, punto, distrito, teléfono, evidencias, respuestas sanitarias ni notas internas.

#### Scenario: Consulta correcta
- **WHEN** un invitado envía su referencia y su código vigente
- **THEN** recibe estado y resumen ciudadano de su incidente

#### Scenario: Datos excluidos
- **WHEN** se inspecciona la respuesta de la vista del invitado
- **THEN** no contiene descripción, coordenadas, teléfono, respuestas sanitarias ni identificadores internos

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
