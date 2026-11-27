# Spec Delta

## ADDED Requirements

### Requirement: Fotos propias en Mis reportes
El detalle de Mis reportes MUST mostrar las fotos disponibles que informe el servidor, cargadas con la sesión del autor y sin guardarlas fuera de la caché temporal de la app. Una foto que no se pueda obtener MUST mostrarse como no disponible sin ocultar el resto del detalle. La consulta con código MUST NOT mostrar fotos.

#### Scenario: Detalle con fotos
- **WHEN** el autor abre un incidente con dos fotos
- **THEN** ve las dos con su descripción accesible y puede ampliarlas

#### Scenario: Foto no disponible
- **WHEN** la obtención de una foto responde 404 o 503
- **THEN** su lugar indica que no está disponible, con texto e icono

#### Scenario: Consulta con código
- **WHEN** un invitado consulta su incidente con código
- **THEN** no se muestran fotos ni se indica su contenido
