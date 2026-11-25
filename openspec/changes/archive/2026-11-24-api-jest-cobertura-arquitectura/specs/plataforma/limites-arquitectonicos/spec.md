# Spec Delta

## Purpose

Verificar automáticamente las direcciones de dependencia de Clean Architecture y los límites del monolito modular para detectar acoplamientos indebidos antes de incorporar nuevas capacidades.

## ADDED Requirements

### Requirement: Dependencias de capas internas
La verificación MUST rechazar dependencias de Dominio hacia Aplicación, Presentación, Infraestructura, clientes generados o tecnologías de persistencia/HTTP. MUST rechazar dependencias de Aplicación hacia Presentación, Infraestructura o implementaciones de proveedores. MUST analizar dependencias de tipos y valores y no tratar comentarios como imports reales.

#### Scenario: Dependencia válida
- **WHEN** un caso de uso depende de su dominio y de puertos de aplicación sin acoplamiento a infraestructura
- **THEN** la verificación lo admite

#### Scenario: Dominio acoplado a persistencia
- **WHEN** un archivo de dominio importa un cliente generado o un adaptador de persistencia
- **THEN** la verificación falla identificando archivo, dependencia y regla

#### Scenario: Aplicación acoplada a presentación
- **WHEN** aplicación importa un router o una dependencia de infraestructura, incluso mediante import de tipos
- **THEN** la verificación falla y no confunde el import de tipos con una excepción permitida

### Requirement: Encapsulación entre módulos
Un módulo MUST acceder a otro por su interfaz pública, no por rutas a sus repositorios, adaptadores o capas internas. La composición del backend MUST poder conectar implementaciones y puertos en sus puntos de composición explícitos sin convertir esa excepción en acceso libre desde capas internas.

#### Scenario: Acceso público entre módulos
- **WHEN** un módulo consume un contrato público de otro módulo sin eludir las reglas de capas
- **THEN** la verificación admite la dependencia

#### Scenario: Acceso a un repositorio ajeno
- **WHEN** un archivo de un módulo importa directamente infraestructura u otra ruta interna de otro
- **THEN** la verificación falla aunque la ruta exista y TypeScript compile

#### Scenario: Composición explícita
- **WHEN** el arranque o la composición declarada de un módulo conecta adaptadores con puertos
- **THEN** esa conexión no produce un falso positivo ni exime al dominio o aplicación de las restricciones

### Requirement: Verificador comprobable y con salida fallida
El verificador MUST recorrer el código propio del backend, resolver dependencias locales según su configuración y terminar con código no cero ante infracciones. MUST contar con pruebas de control para casos válidos e inválidos sin introducir una infracción permanente en el código de producto. El informe MUST declarar alcance y límites del análisis estático.

#### Scenario: Violación controlada
- **WHEN** se comprueba un ejemplo aislado que viola una regla arquitectónica
- **THEN** se detecta la infracción y se demuestra la salida no cero del comando

#### Scenario: Comentarios y código generado
- **WHEN** el análisis encuentra comentarios con nombres de frameworks o archivos generados fuera de su alcance
- **THEN** no los presenta como imports propios ni los incluye como evidencia de cumplimiento de capas
