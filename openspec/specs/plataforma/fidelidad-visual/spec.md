# fidelidad-visual Specification

## Purpose

Mantener fidelidad verificable de las interfaces web y móvil a la referencia elegida, conservando las reglas y disponibilidad reales de AyniSafe durante la integración incremental.

## Requirements

### Requirement: Referencia visual única
Las superficies entregadas MUST reproducir su equivalente del origen fijado en DESIGN.md, incluyendo composición, tipografía, color, densidad, formas y estados de interacción. Web y móvil MUST conservar sus variantes propias. MUST NOT adoptar otra exploración visual ni sustituir familias tipográficas por preferencia del implementador.

#### Scenario: Superficie con equivalente
- **WHEN** se revisan portada, acceso o marco principal de una superficie entregada
- **THEN** su apariencia corresponde a la referencia fijada y no a la interfaz anterior ni a una maqueta exploratoria

#### Scenario: Flujo propio de AyniSafe
- **WHEN** una pantalla necesaria de cuenta no tiene equivalente directo en el origen
- **THEN** utiliza los mismos componentes y composición de su superficie, conservando su contrato funcional y documentando la adaptación

### Requirement: Identidad y recursos propios
La UI MUST conservar el nombre AyniSafe y su lema. Los recursos visuales y tipográficos web MUST poder cargarse desde el origen propio sin dependencias de estilos o fuentes remotas. La incorporación MUST registrar la procedencia de imágenes, iconos y fuentes, sin presentar la marca del proyecto donante como identidad oficial de AyniSafe.

#### Scenario: Fuente y seguridad
- **WHEN** se carga la web compilada con su política de seguridad vigente
- **THEN** las familias elegidas se cargan desde recursos propios sin solicitudes a proveedores externos de fuentes ni relajación de la política para copiarlas

#### Scenario: Recurso sin adaptar
- **WHEN** un recurso contiene el nombre o una marca exclusiva del donante
- **THEN** no se publica como marca oficial de AyniSafe y se registra la adaptación necesaria antes de declarar completa la reproducción

### Requirement: Disponibilidad y permisos reales
La reproducción MUST conservar las reglas de producto y la disponibilidad de cada capacidad. MUST NOT mostrar datos DEMO, métricas, mapas, avisos o acciones operativas simuladas como reales. Los destinos futuros MUST tener texto e icono de no disponibilidad y no originar solicitudes de capacidades aún no implementadas.

#### Scenario: Destino futuro
- **WHEN** se abre una sección de incidentes, mapa, alertas o gestión todavía no implementada
- **THEN** se muestra su estado pendiente con el estilo de referencia, sin datos de ejemplo ni simulación de una respuesta operativa

#### Scenario: Contenido y permisos del destino
- **WHEN** el origen contiene roles, contactos o textos incompatibles con AyniSafe
- **THEN** la réplica utiliza los roles, contenido publicado y permisos del destino, registrando la diferencia funcional sin importar esas reglas ajenas

### Requirement: Evidencia renderizada de fidelidad
Cada superficie entregada MUST contar con comparación renderizada origen/destino bajo viewport, escala y estado equivalentes, identificando revisión y recursos cargados. El informe MUST separar diferencias de contenido autorizado, desviaciones visuales y controles de accesibilidad. Una prueba funcional o captura aislada MUST NOT declararse demostración de igualdad de toda la UI.

#### Scenario: Comparación reproducible
- **WHEN** se presenta una pantalla como reproducida
- **THEN** existen capturas comparables y una ficha con superficie, estado, dimensiones, escala, referencia, revisión destino y diferencias revisadas

#### Scenario: Conflicto con accesibilidad
- **WHEN** una medida observada del origen impide cumplir un requisito de accesibilidad de AyniSafe
- **THEN** se registra el conflicto concreto y su resolución antes de aceptar la pantalla, sin rediseño silencioso ni declaración de equivalencia por contraste solamente

#### Scenario: Superficie no validada
- **WHEN** una pantalla o plataforma aún no tiene comparación ejecutada
- **THEN** el informe la identifica como pendiente y no extiende a ella la validación de otra pantalla o plataforma
