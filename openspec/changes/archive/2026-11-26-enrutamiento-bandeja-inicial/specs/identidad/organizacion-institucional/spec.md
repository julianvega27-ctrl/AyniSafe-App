# Spec Delta

## ADDED Requirements

### Requirement: Sedes elegibles para enrutamiento
Identidad MUST ofrecer como contrato interno las sedes elegibles para una institución, un distrito y una categoría: sedes activas y habilitadas para atención de una institución activa, con cobertura del distrito, competencia sobre la categoría y al menos un operador activo. El resultado MUST reflejar la configuración vigente sin caché obsoleta y MUST NOT exponerse como ruta pública.

#### Scenario: Sede que cumple
- **WHEN** se consultan las sedes elegibles de PNP para un distrito y una categoría que una sede habilitada cubre, con un operador activo
- **THEN** el resultado incluye esa sede

#### Scenario: Sede sin operador activo
- **WHEN** el único operador de una sede que cumple el resto está suspendido o pendiente de activación
- **THEN** la sede no es elegible

#### Scenario: Cambio de configuración
- **WHEN** el administrador añade una cobertura y se vuelve a consultar
- **THEN** la nueva sede elegible aparece sin reiniciar la API

### Requirement: Validación de sede designable
Identidad MUST ofrecer como contrato interno la comprobación de que una sede puede recibir una designación administrativa para una institución dada: sede activa y habilitada, de esa institución activa y con al menos un operador activo, sin exigir cobertura ni competencia. MUST devolver cada requisito incumplido.

#### Scenario: Sede designable
- **WHEN** se comprueba una sede SAMU habilitada con un operador activo para la institución SAMU
- **THEN** se acepta aunque no cubra el distrito del incidente

#### Scenario: Requisitos incumplidos
- **WHEN** se comprueba una sede deshabilitada de otra institución
- **THEN** se devuelven los requisitos institución y habilitación incumplidos
