# consultas/mapa-operativo Specification

## Purpose

Consulta autorizada del operador: ubicación exacta de los incidentes en que participa su sede dentro de su ámbito vigente, con filtros, para coordinar la atención (RF20, grupo B de P7).

## Requirements

### Requirement: Puntos exactos dentro del ámbito
Un operador con ámbito vigente habilitado MUST poder consultar los incidentes abiertos o cerrados en el período en que participa su sede dentro de su ámbito, con referencia, categoría, distrito, estado, prioridad, publicación vigente y punto exacto. MUST NOT incluir incidentes ajenos, descripción, teléfono, autor, código, fotos ni datos sanitarios. Un administrador o un ciudadano MUST recibir 403.

#### Scenario: Operador con ámbito
- **WHEN** un operador consulta el mapa operativo
- **THEN** recibe solo los incidentes en que participa su sede, con su punto exacto

#### Scenario: Incidente ajeno
- **WHEN** existe un incidente de otra sede o fuera de su ámbito
- **THEN** no aparece en su respuesta

#### Scenario: Otro rol
- **WHEN** un administrador consulta el mapa operativo
- **THEN** la API responde 403

### Requirement: Filtros del mapa operativo
El mapa operativo MUST admitir filtros combinables por distrito, categoría y período (24 horas, 7 días o 30 días desde el registro; por defecto 7 días), con un máximo de 500 elementos e indicación de truncado. Un filtro inválido MUST responder 422.

#### Scenario: Truncado
- **WHEN** hay más de 500 incidentes que cumplen los filtros
- **THEN** la respuesta trae los 500 más recientes e indica que está truncada

#### Scenario: Período inválido
- **WHEN** se envía un período no admitido
- **THEN** la API responde 422
