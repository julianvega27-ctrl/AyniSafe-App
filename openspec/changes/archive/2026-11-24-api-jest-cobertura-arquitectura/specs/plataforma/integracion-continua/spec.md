# Spec Delta

## MODIFIED Requirements

### Requirement: Verificación automática de la API
El repositorio MUST ejecutar automáticamente, en cada empuje a la rama principal y en cada solicitud de cambios, tipos, compilación, contrato OpenAPI, comprobación de límites arquitectónicos y pruebas unitarias/de integración de API con Jest y cobertura contra PostgreSQL efímero aislado con nombre terminado en `_test`. Un fallo de cualquiera MUST hacer fallar la verificación.

#### Scenario: Cambio correcto
- **WHEN** se envía un cambio que compila y cuyas pruebas pasan
- **THEN** la verificación de la API termina con éxito

#### Scenario: Prueba o contrato rotos
- **WHEN** una prueba falla o el contrato es inválido
- **THEN** la verificación falla y lo indica

#### Scenario: Base aislada
- **WHEN** se ejecutan las pruebas de integración
- **THEN** usan solo la base efímera del trabajo y nunca una base persistente

#### Scenario: Infracción arquitectónica
- **WHEN** un cambio introduce una dependencia prohibida por la capacidad de límites arquitectónicos
- **THEN** la comprobación falla y la verificación de API no se presenta como correcta

#### Scenario: Runner y cobertura requeridos
- **WHEN** se ejecuta el trabajo de API
- **THEN** usa Jest para las pruebas y produce los formatos de cobertura exigidos por la capacidad de pruebas de API, sin sustituirlos por resultados de Vitest

## ADDED Requirements

### Requirement: Artefactos de cobertura de API
CI MUST conservar los reportes de cobertura de API como artefactos descargables de la ejecución, asociados a su revisión. MUST intentar publicar los reportes disponibles aunque las pruebas fallen, sin convertir ese fallo en éxito. MUST limitar la selección a reportes y no incluir secretos, configuración privada, BD o dependencias.

#### Scenario: Reportes disponibles
- **WHEN** el comando produce cobertura HTML, LCOV y resumen JSON
- **THEN** esos formatos quedan incluidos en el artefacto de esa ejecución

#### Scenario: Ejecución fallida con cobertura disponible
- **WHEN** una prueba falla pero existen reportes de cobertura
- **THEN** se intenta conservarlos y la verificación sigue fallando

#### Scenario: No se produjo cobertura
- **WHEN** la ejecución termina antes de generar reportes
- **THEN** se declara su ausencia sin publicar un reporte vacío como validación aprobada
