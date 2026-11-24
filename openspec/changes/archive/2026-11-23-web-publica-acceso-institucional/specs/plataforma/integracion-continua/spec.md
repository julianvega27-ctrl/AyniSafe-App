## ADDED Requirements

### Requirement: Verificación automática de la API
El repositorio MUST ejecutar automáticamente, en cada empuje a la rama principal y en cada solicitud de cambios, la comprobación de tipos, la compilación, la validación del contrato OpenAPI y las pruebas de unidad e integración de la API contra una base PostgreSQL efímera aislada cuyo nombre termine en `_test`. Un fallo de cualquiera MUST hacer fallar la verificación.

#### Scenario: Cambio correcto
- **WHEN** se envía un cambio que compila y cuyas pruebas pasan
- **THEN** la verificación de la API termina con éxito

#### Scenario: Prueba o contrato rotos
- **WHEN** una prueba falla o el contrato es inválido
- **THEN** la verificación falla y lo indica

#### Scenario: Base aislada
- **WHEN** se ejecutan las pruebas de integración
- **THEN** usan solo la base efímera del trabajo y nunca una base persistente

### Requirement: Verificación automática de Flutter
La integración continua MUST ejecutar el análisis estático y las pruebas de unidad y de widgets de la app. Las pruebas de integración que requieren un dispositivo MUST excluirse y su exclusión MUST documentarse.

#### Scenario: Análisis y pruebas
- **WHEN** se envía un cambio en la app
- **THEN** se ejecutan el análisis estático y las pruebas de unidad y widgets, y su fallo falla la verificación

#### Scenario: Pruebas con dispositivo
- **WHEN** se ejecuta la verificación
- **THEN** no se intentan ejecutar las pruebas de integración con dispositivo y la documentación explica cómo correrlas

### Requirement: Verificación automática de la web
La integración continua MUST ejecutar el lint, la comprobación de tipos, la compilación y las pruebas de la web.

#### Scenario: Lint o tipos incorrectos
- **WHEN** el código de la web incumple el lint o no tipa
- **THEN** la verificación de la web falla

#### Scenario: Compilación y pruebas
- **WHEN** se envía un cambio de la web que compila y pasa las pruebas
- **THEN** la verificación de la web termina con éxito

### Requirement: Sin secretos en la integración continua
Los flujos MUST funcionar sin ningún secreto del repositorio, con permisos del token limitados a lectura de contenidos, sin eventos que ejecuten código de ramas externas con secretos, y con las acciones de terceros fijadas a una revisión inmutable. Los valores sensibles generados durante la ejecución MUST enmascararse y los pasos MUST NOT volcar el entorno ni activar trazas de comandos con valores sensibles.

#### Scenario: Permisos mínimos
- **WHEN** se inspeccionan los flujos
- **THEN** declaran permisos de solo lectura, no usan `pull_request_target` y fijan cada acción por revisión inmutable

#### Scenario: Sin secretos requeridos
- **WHEN** se ejecuta la verificación en una solicitud de una copia del repositorio sin acceso a secretos
- **THEN** todas las comprobaciones se ejecutan igualmente

#### Scenario: Registros limpios
- **WHEN** se revisan los registros de una ejecución
- **THEN** no contienen credenciales, cookies, tokens ni cadenas de conexión

### Requirement: Detección de secretos en el repositorio
La integración continua MUST incluir una comprobación que falle si los archivos versionados contienen credenciales, claves o cadenas de conexión reales, y las pruebas de la API MUST verificar que los registros no incluyan valores sensibles de ejemplo.

#### Scenario: Credencial versionada
- **WHEN** se versiona un archivo con una credencial reconocible
- **THEN** la comprobación falla y no imprime el valor

#### Scenario: Valores de ejemplo
- **WHEN** las pruebas ejercitan acceso institucional y aprovisionamiento con valores identificables
- **THEN** ninguno aparece en la salida de registros
