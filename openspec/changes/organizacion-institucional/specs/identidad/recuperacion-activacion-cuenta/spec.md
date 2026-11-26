# Spec Delta

## MODIFIED Requirements

### Requirement: Invitación y activación de cuentas
El sistema MUST ofrecer una capacidad interna para invitar una cuenta en estado `pendiente_activacion` que se ejecute dentro de la transacción del llamador, y un endpoint público de activación que, con un token vigente y una contraseña válida, deje la cuenta activa y responda 204 sin crear sesión. Solo la organización institucional, con sesión de administrador, MUST poder crear cuentas operador e invitarlas; ninguna ruta MUST crear administradores ni sedes fuera de ese flujo.

#### Scenario: Activación correcta
- **WHEN** una cuenta pendiente recibe su invitación y su titular envía el token con una contraseña válida
- **THEN** se responde 204, la cuenta pasa a activa con esa contraseña y no se emite sesión

#### Scenario: Atomicidad con el llamador
- **WHEN** la transacción que crea la cuenta e invita falla y se revierte
- **THEN** no existen cuenta, token ni envío pendientes

#### Scenario: Sin creación pública de privilegiados
- **WHEN** se inspeccionan las rutas públicas y el registro ciudadano
- **THEN** ninguna permite crear cuentas operador o administrador y el registro ciudadano sigue rechazando rol y campos extra
