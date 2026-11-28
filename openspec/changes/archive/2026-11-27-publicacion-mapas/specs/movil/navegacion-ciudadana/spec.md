# Spec Delta

## MODIFIED Requirements

### Requirement: Destinos no construidos
Alertas MUST indicar que aún no está disponible con texto e icono y explicación acorde al producto. MUST NOT mostrar reportes, avisos ni cifras de ejemplo en ese destino, ni solicitar ubicación o notificaciones desde él. La ubicación del destino en barra o Drawer MUST NOT interpretarse como capacidad implementada. Reportar, Mis reportes y Mapa son destinos operativos según sus capacidades; Mapa sigue `movil/mapa-publico`.

#### Scenario: Destino pendiente
- **WHEN** el usuario abre Alertas
- **THEN** ve un estado «aún no disponible» comprensible, sin datos simulados ni solicitudes de permiso

#### Scenario: Mapa operativo
- **WHEN** el usuario abre Mapa desde la barra inferior
- **THEN** ve el mapa público de publicaciones vigentes sin solicitud de permisos

#### Scenario: Reportar desde la barra
- **WHEN** el usuario abre Reportar desde la navegación inferior
- **THEN** ve el formulario de reporte operativo, con o sin sesión, sin solicitar permisos hasta que pulse «Usar mi ubicación»

### Requirement: Navegación pública sin cuenta
Sin cuenta, la app MUST ofrecer Inicio público, barra Inicio/Reportar/Mapa/Contactos y Drawer con destinos públicos, «Consultar con código» e ingreso a cuenta. Perfil e historial propio MUST requerir sesión válida. El arranque MUST resolver la restauración antes de mostrar datos privados y distinguir error de servicio de ausencia de sesión. El envío y la consulta con código del invitado MUST estar disponibles sin crear una sesión.

#### Scenario: Primera apertura sin sesión guardada
- **WHEN** se abre la app sin sesión
- **THEN** muestra Inicio público con acceso a cuenta, Reportar y Consultar con código operativos, contenido público aprobado, Mapa operativo y Alertas identificado como pendiente

#### Scenario: Acceso a cuenta desde la navegación pública
- **WHEN** una persona sin cuenta abre el control de cuenta o solicita un destino privado
- **THEN** puede ir al acceso y registro vigentes, sin consultas de perfil ni historial privado y sin crear una sesión ficticia de invitado

#### Scenario: Contactos sin sesión
- **WHEN** se abre Contactos sin cuenta
- **THEN** se consulta el contenido público, se muestran solo contactos aprobados o su ausencia y no se solicita autenticación para leerlos

#### Scenario: Error durante restauración
- **WHEN** la comprobación de una sesión guardada falla por red o servicio
- **THEN** se ofrece reintentar sin dar por válida la sesión ni exponer datos privados, conservando accesos públicos que no dependen de ella

#### Scenario: Reporte de invitado
- **WHEN** una persona sin cuenta abre Reportar
- **THEN** puede completar y enviar el reporte como invitado sin iniciar sesión

