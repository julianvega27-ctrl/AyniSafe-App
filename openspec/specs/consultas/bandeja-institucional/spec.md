# consultas/bandeja-institucional Specification

## Purpose

Ofrecer al operador una bandeja de llegada y un resumen de cada incidente en que participa su sede, limitados en el backend a su ámbito vigente, sin exponer datos de otros casos ni el detalle sanitario.

## Requirements

### Requirement: Bandeja FIFO del operador
Un operador activo MUST poder listar los incidentes con una participación de su sede, ordenados del más antiguo al más reciente por instante de registro, con desempate por identificador y cursor opaco de hasta 50 filas. El orden MUST NOT cambiar por la etiqueta de prioridad ni por el papel de su institución.

#### Scenario: Orden de llegada
- **WHEN** el operador consulta su bandeja con tres incidentes registrados en instantes distintos
- **THEN** los recibe del más antiguo al más reciente

#### Scenario: Empate de instante
- **WHEN** dos incidentes tienen el mismo instante de registro
- **THEN** se ordenan por identificador de forma estable entre páginas

#### Scenario: Paginación
- **WHEN** hay más filas que el límite y se pide la página siguiente con el cursor recibido
- **THEN** no se repiten ni se omiten incidentes

#### Scenario: Bandeja vacía
- **WHEN** la sede del operador no participa en ningún incidente
- **THEN** se responde 200 con una lista vacía

### Requirement: Contenido de la fila de bandeja
Cada fila MUST incluir referencia, categoría, distrito, estado, instante de registro, papel de la institución del operador, condición médica por confirmar y la etiqueta de prioridad «Sin evaluar» mientras no exista evaluación. MUST NOT incluir teléfono, coordenadas, código, autor ni otras sedes u operadores.

#### Scenario: Campos permitidos
- **WHEN** se inspecciona una fila de la bandeja
- **THEN** contiene solo los campos enumerados y la prioridad es «Sin evaluar»

#### Scenario: Revisión resuelta y papel actualizado
- **WHEN** una aclaración resuelve la revisión médica y cambia el papel de la institución del operador
- **THEN** la siguiente consulta ya no marca la condición médica por confirmar y muestra el papel vigente

### Requirement: Ámbito vigente en cada consulta
La bandeja y el resumen MUST filtrarse en el backend con el ámbito vigente del operador: sede activa y habilitada, distrito del incidente dentro de su cobertura y categoría dentro de sus competencias. Una participación designada por el administrador MUST seguir visible aunque no cumpla cobertura o competencia. Un operador sin ámbito MUST recibir 403.

#### Scenario: Cobertura retirada
- **WHEN** el administrador retira de la sede el distrito de un incidente enrutado por regla
- **THEN** la siguiente consulta de la bandeja ya no lo incluye y su resumen responde 404

#### Scenario: Participación designada
- **WHEN** el administrador designa la sede para un incidente fuera de su cobertura
- **THEN** el incidente aparece en la bandeja de los operadores de esa sede

#### Scenario: Operador suspendido o de sede deshabilitada
- **WHEN** un operador suspendido, o de una sede suspendida o deshabilitada, consulta la bandeja
- **THEN** recibe 401 o 403 y ningún dato de incidentes

### Requirement: Resumen por identificador
El operador MUST poder leer por identificador el resumen de un incidente de su bandeja: campos de la fila, descripción, ocurrencia, resultado territorial, respuestas originales de heridos y atención médica como informadas por el ciudadano, condición médica vigente (resumen de heridos), si tiene acceso al detalle sanitario y tipos de las demás instituciones participantes. MUST NOT incluir teléfono, coordenadas, código, autor, evidencias ni observaciones de la persona principal.

#### Scenario: Resumen propio
- **WHEN** el operador abre un incidente de su bandeja
- **THEN** recibe el resumen con los campos permitidos y sin datos excluidos

#### Scenario: Condición precisada por un operador
- **WHEN** un operador PNP precisó heridos si en un accidente
- **THEN** el resumen conserva la respuesta original del ciudadano y muestra la condición vigente con origen operador, institución PNP e instante

### Requirement: Aislamiento ante acceso directo
Un identificador ajeno al ámbito del operador, inexistente o malformado MUST responder 404 con el mismo cuerpo, sin revelar si existe. Manipular el cursor o los parámetros MUST NOT ampliar el conjunto visible. Un ciudadano o un administrador MUST recibir 403 en la bandeja y en el resumen.

#### Scenario: URL directa de otra sede
- **WHEN** un operador PNP pide el resumen de un incidente en que solo participa Bomberos
- **THEN** recibe 404 idéntico al de un identificador inexistente

#### Scenario: Cursor manipulado
- **WHEN** se envía un cursor alterado o inválido
- **THEN** se responde 400 o se devuelven solo incidentes del ámbito, nunca otros

#### Scenario: Otro rol
- **WHEN** un administrador o un ciudadano consulta la bandeja del operador
- **THEN** recibe 403

#### Scenario: Pendiente sin participación
- **WHEN** un incidente en ENRUTAMIENTO_PENDIENTE no tiene participación de la sede del operador
- **THEN** no aparece en su bandeja aunque esté en su distrito
