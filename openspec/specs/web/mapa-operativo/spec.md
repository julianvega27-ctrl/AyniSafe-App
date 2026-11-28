# web/mapa-operativo Specification

## Purpose

Sección Mapa del panel del operador: ubicación de los incidentes de su ámbito con filtros, reproduciendo la composición del mapa del origen (grupo B de P7).

## Requirements

### Requirement: Sección Mapa del operador
La sección Mapa MUST mostrar los incidentes del mapa operativo como marcadores sobre teselas configurables con atribución, límites distritales, filtros por distrito, categoría y período, un resumen de visibles y una leyenda por categoría. Cada marcador MUST abrir un resumen breve con enlace al detalle del incidente.

#### Scenario: Abrir la sección
- **WHEN** un operador abre Mapa
- **THEN** ve sus incidentes como marcadores, los filtros y la leyenda

#### Scenario: Ir al detalle
- **WHEN** el operador abre un marcador y pulsa «Ver detalle»
- **THEN** llega al resumen del incidente en la sección Incidentes

### Requirement: Fallo del mapa sin bloquear la consulta
Si fallan las teselas o el componente de mapa, la sección MUST mantener filtros, resumen y una lista equivalente de incidentes con enlace al detalle. Un error de la API MUST mostrarse con reintento.

#### Scenario: Componente de mapa falla
- **WHEN** el mapa no puede renderizarse
- **THEN** se ve un aviso y la lista de incidentes con sus enlaces

#### Scenario: Teclado
- **WHEN** el operador navega con teclado
- **THEN** puede operar filtros, leyenda y lista sin depender del mapa
