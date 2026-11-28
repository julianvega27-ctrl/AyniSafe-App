# Spec Delta

## Purpose

Lectura pública, sin sesión, de los incidentes publicados y vigentes con su ubicación exacta y filtros, sin exponer datos restringidos (documento 11 §5, RF20, RF49).

## ADDED Requirements

### Requirement: Publicaciones vigentes sin sesión
La API MUST ofrecer sin sesión las publicaciones vigentes no reservadas, cada una con identificador público opaco, categoría, distrito, ubicación exacta, estado publicable y antigüedad desde la ocurrencia. MUST NOT incluir referencia del incidente, descripción, fotos, identidad, teléfono, código, institución, operadores ni datos sanitarios.

#### Scenario: Lectura pública
- **WHEN** una persona sin sesión consulta el mapa público
- **THEN** recibe las publicaciones vigentes con solo los campos permitidos

#### Scenario: Campos cerrados
- **WHEN** se compara la respuesta con la lista de campos permitidos
- **THEN** no contiene ningún otro campo, ni la referencia ni el identificador interno del incidente

#### Scenario: Retirada o vencida
- **WHEN** una publicación se retira o vence
- **THEN** no aparece en la siguiente lectura pública

### Requirement: Filtros por distrito, categoría y período
La lectura pública MUST admitir filtros combinables por distrito del catálogo, categoría y período de 24 horas, 3 días o 7 días contados desde la ocurrencia; sin período MUST usar 7 días. Un filtro desconocido o mal formado MUST responder 422 sin datos.

#### Scenario: Filtros combinados
- **WHEN** se filtra por un distrito, una categoría y 24 horas
- **THEN** solo se reciben publicaciones vigentes que cumplen las tres condiciones

#### Scenario: Filtro inválido
- **WHEN** se envía un distrito inexistente o un período no admitido
- **THEN** la API responde 422 `VALIDATION_ERROR`

### Requirement: Conteos agregados de casos reservados
La lectura pública MUST informar, por distrito y mes de ocurrencia, el conteo de publicaciones de casos reservados que no fueron retiradas por decisión, solo cuando el grupo tiene al menos cinco. Un grupo con menos de cinco MUST suprimirse. El conteo MUST NOT revelar categoría, punto ni instante individual.

#### Scenario: Grupo suficiente
- **WHEN** un distrito tiene seis publicaciones reservadas en el mes
- **THEN** la lectura informa «6 casos reservados» para ese distrito y mes

#### Scenario: Grupo pequeño
- **WHEN** un distrito tiene cuatro en el mes
- **THEN** ese grupo no aparece

### Requirement: Respuesta pública sin caché compartida de datos retirados
La lectura pública MUST responder con una vigencia de caché no mayor de 60 segundos y MUST NOT servir desde caché propia una publicación ya retirada. Un error de la BD MUST responder 503 sin datos parciales.

#### Scenario: Retiro reciente
- **WHEN** se retira una publicación y se consulta de nuevo la API
- **THEN** la respuesta de la API ya no la incluye

#### Scenario: Fallo de la BD
- **WHEN** la BD no responde
- **THEN** la API responde 503 `MAPA_NO_DISPONIBLE`
