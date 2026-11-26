# Spec Delta

## MODIFIED Requirements

### Requirement: Paneles mínimos y permisos por rol
`GET /administrador/panel` MUST responder solo a un administrador activo y `GET /operador/panel` solo a un operador activo. Cada uno MUST devolver la identidad del titular y la lista de secciones de su panel según la guía de UI. Una sección MUST marcarse disponible solo si su capacidad está implementada; las demás MUST marcarse no disponibles, sin datos operativos ni cifras de ejemplo. Una sesión de otro rol institucional MUST recibir 403 y la falta de sesión 401.

#### Scenario: Administrador en su panel
- **WHEN** un administrador activo consulta `GET /administrador/panel`
- **THEN** recibe 200 con su identidad, «Instituciones y sedes», «Operadores» y «Coberturas» marcadas como disponibles y el resto de secciones de administración como no disponibles

#### Scenario: Operador en el panel del administrador
- **WHEN** un operador activo consulta `GET /administrador/panel`
- **THEN** recibe 403 sin datos del panel

#### Scenario: Administrador en el panel del operador
- **WHEN** un administrador activo consulta `GET /operador/panel`
- **THEN** recibe 403 sin datos del panel

#### Scenario: Sin sesión
- **WHEN** se consulta cualquiera de los dos paneles sin cookie válida
- **THEN** se responde 401

#### Scenario: Operador de prueba
- **WHEN** una prueba usa un operador creado directamente en la base de pruebas
- **THEN** su acceso se verifica igual que el de un operador creado mediante el alta de sede

### Requirement: Sin recuperación pública ni altas privilegiadas
Esta capacidad MUST NOT exponer rutas públicas que creen cuentas administrador u operador, ni ninguna ruta que cree administradores. Los operadores MUST crearse solo por un administrador autenticado mediante la organización institucional. La solicitud pública de recuperación MUST seguir respondiendo el 202 uniforme sin enviar correo a administradores u operadores.

#### Scenario: Recuperación solicitada para un administrador
- **WHEN** se solicita recuperación con el correo de un administrador activo
- **THEN** se responde el mismo 202 uniforme y no se encola ningún correo

#### Scenario: Inspección de rutas
- **WHEN** se inspecciona el contrato publicado
- **THEN** ninguna ruta crea administradores, las únicas que crean operadores exigen sesión de administrador y el registro ciudadano sigue rechazando rol y campos extra
