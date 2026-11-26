# Proposal

## Why

P2 dejó las interfaces de referencia y P1 la base Jest/arquitectura. Para continuar con sedes y registro de incidentes hace falta una fuente territorial común: hoy Consultas solo sirve contenido público y Prisma no contiene distritos ni versiones geométricas.

## What Changes

- P3.1 incorpora los cinco distritos del piloto, su procedencia y geometrías versionadas en PostgreSQL, con carga validada, simulación y activación atómica.
- Expone catálogo y límites públicos, y una resolución de punto en backend reutilizable por futuros módulos. Frontera, solapamiento y punto fuera del área conservan distrito pendiente.
- Adapta los candidatos del donante `efc1bce8c29b3c88487e36e10a324c71ae9c2029`: GeoJSON, extractor, cargador y escenarios territoriales; no copia SQL MySQL ni sus routers al núcleo.
- Verifica procedencia, condiciones de uso y correspondencia UBIGEO/geometría antes de activar datos reales. Las geometrías sintéticas quedan restringidas a pruebas identificadas.
- Completa OpenAPI y evidencia Jest/PostgreSQL de esta capacidad. No declara cumplido todo RF07/RF31 ni EQ-11 por probar solo el backend.

Fuera de alcance: P3.2 (instituciones, sedes, competencias y operadores), formularios/mapas web o Flutter, permisos GPS, registro/enrutamiento de incidentes, notificaciones y carga académica. Se conserva la dirección visual P2 para esos incrementos.

## Capabilities

### New Capabilities

- `consultas/territorio`: catálogo distrital, versiones geométricas, lectura pública y clasificación determinista de puntos del incidente.

### Modified Capabilities

Ninguna. Contenido público, identidad y destinos pendientes conservan sus contratos.

## Impact

API: capas de Consultas, composición en `main.ts`, Prisma/migraciones, cargador territorial, OpenAPI y pruebas Jest. PostgreSQL sigue siendo el motor; sin PostGIS ni geocodificación de pago. Los contratos exportados por la fachada de Consultas preparan P3.2/P4 sin dependencias a internos de otro módulo.

Trazabilidad: RF31 y componente territorial de RF54 → HU03/HU05/HU15 → EQ-11 (backend); RF07 solo aporta validación del punto, sin afirmar formulario ni registro implementados. La integración se rige por `docs/comparacion-proyecto-incidencias.md` y la matriz Sprint 2. Estado: propuesta, cero tareas implementadas; no implica commit, despliegue ni archivo automático.
