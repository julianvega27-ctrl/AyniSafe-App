# pruebas-api Specification

## Purpose

Proporcionar una ejecución reproducible de las pruebas de la API y evidencia de cobertura para validar los incrementos del backend sin modificar las reglas de negocio para satisfacer la herramienta.

## Requirements

### Requirement: Ejecución de pruebas de API con Jest
La API MUST ofrecer comandos documentados para pruebas completas, unitarias y de integración ejecutados con Jest. Una prueba fallida, un error de preparación o una selección sin pruebas MUST producir un código de salida no cero. Las pruebas web y Flutter MUST conservar su ejecución independiente.

#### Scenario: Ejecución completa correcta
- **WHEN** se ejecuta el comando completo con dependencias y BD de pruebas disponibles
- **THEN** Jest ejecuta las pruebas de API y devuelve éxito solo si todas pasan

#### Scenario: Fallo o selección vacía
- **WHEN** falla una aserción, la preparación o no se encuentra ninguna prueba seleccionada
- **THEN** el comando termina con código no cero sin presentarse como una validación correcta

### Requirement: Conservación de la regresión existente
La migración MUST conservar los escenarios y aserciones funcionales de la línea base P0, incluyendo autorización, sesiones, correo, privacidad y contrato. MUST NOT eliminar, omitir o debilitar escenarios para adaptar el runner. El informe MUST comparar la colección y resultados anteriores con los nuevos y justificar diferencias de conteo por herramienta.

#### Scenario: Comparación con P0
- **WHEN** se revisa la migración contra los 28 archivos y 429 pruebas de API registrados en P0
- **THEN** cada escenario previo tiene correspondencia ejecutada en Jest y los casos adicionales quedan identificados separadamente

#### Scenario: Adaptación de spies o preparación
- **WHEN** se adapta una utilidad propia del runner o un fixture necesario
- **THEN** se conserva el comportamiento probado y se documenta la adaptación sin cambiar la regla del producto

### Requirement: Aislamiento de integración y ausencia de dependencia de BD en unidad
La integración MUST requerir una configuración explícita de BD de pruebas con nombre terminado en `_test`, preparar esa base antes de las pruebas y ejecutar secuencialmente los casos que comparten datos. MUST NOT usar DATABASE_URL como respaldo ni omitir la integración al faltar su configuración. Las unitarias MUST poder ejecutarse sin conectar o modificar una BD.

#### Scenario: Configuración ausente o insegura
- **WHEN** se solicita integración o cobertura completa sin URL de pruebas o con nombre que no termina en `_test`
- **THEN** falla antes de ejecutar operaciones destructivas y no imprime credenciales ni la URL

#### Scenario: Unidad sin base
- **WHEN** se ejecuta el comando unitario sin BD disponible
- **THEN** ejecuta las unitarias sin preparar esquema ni intentar conexión

### Requirement: Reportes de cobertura de código propio
El comando de cobertura MUST ejecutar la suite completa y producir HTML navegable, LCOV y resumen JSON de líneas, sentencias, funciones y ramas del código propio de API, incluyendo archivos no ejercitados. MUST excluir código generado, dependencias y pruebas, documentar exclusiones y no imponer un umbral porcentual sin acuerdo explícito.

#### Scenario: Generación completa
- **WHEN** finaliza la ejecución de cobertura con éxito
- **THEN** existen los tres formatos y el informe presenta los porcentajes reales sin afirmar cobertura total por el número de pruebas

#### Scenario: Archivo propio no ejercitado
- **WHEN** un archivo propio pertenece al alcance pero ninguna prueba lo ejecuta
- **THEN** permanece visible como no cubierto en lugar de desaparecer del denominador

### Requirement: Evidencia y datos sensibles
Los reportes MUST identificar alcance, comando y revisión del código, sin incluir configuración privada, tokens o datos de producción. El informe MUST distinguir validación local de ejecución remota y conservar la evidencia histórica P0 sin sobrescribirla como si fuera una ejecución Jest.

#### Scenario: Comparación de herramientas
- **WHEN** se publica el informe de P1
- **THEN** identifica los resultados nuevos de Jest, separa los históricos de Vitest y declara límites de ejecución observados
