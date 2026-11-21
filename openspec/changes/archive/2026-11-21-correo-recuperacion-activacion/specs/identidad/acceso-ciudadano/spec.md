# Spec Delta

## ADDED Requirements

### Requirement: Límite de acceso y recuperación habilitada
El sistema MUST mantener información y contactos públicos sin sesión y restringir la identidad privada al propietario. El acceso MUST mostrar el enlace activo «Olvidé mi contraseña», que conduce a la recuperación por correo definida en `identidad/recuperacion-activacion-cuenta`, sin exigir verificar el correo para iniciar sesión. MUST excluir altas privilegiadas y no solicitar permisos del dispositivo en autenticación.

#### Scenario: Acceso público y privacidad
- **WHEN** una persona sin sesión abre información o contactos públicos y luego intenta consultar identidad privada
- **THEN** el acceso público permanece disponible y la consulta privada devuelve 401
- **AND** una sesión ciudadana solo obtiene su propia identidad, sin elegir un usuario por parámetro

#### Scenario: Recuperación disponible
- **WHEN** se abre el inicio de sesión
- **THEN** existe un enlace interactivo «Olvidé mi contraseña» de al menos 48 de alto que abre la solicitud de recuperación
- **AND** ya no aparece el texto «Recuperación de contraseña: próximamente»

#### Scenario: Sin verificación ni permisos
- **WHEN** se registra una cuenta, se inicia sesión o se recupera la contraseña
- **THEN** no se exige verificar el correo para acceder y no aparecen campos de DNI, teléfono o rol ni solicitudes de ubicación o notificaciones

## REMOVED Requirements

### Requirement: Límite de acceso y funciones diferidas
**Reason**: La recuperación de contraseña (RF03) deja de estar diferida: este requisito prohibía endpoints de recuperación y fijaba el texto «próximamente». Lo sustituye «Límite de acceso y recuperación habilitada», que conserva el acceso público, la restricción de identidad y la exclusión de altas privilegiadas.
**Migration**: Retirar el texto no interactivo de la pantalla de acceso y habilitar el enlace «Olvidé mi contraseña» con las rutas de `identidad/recuperacion-activacion-cuenta`.
