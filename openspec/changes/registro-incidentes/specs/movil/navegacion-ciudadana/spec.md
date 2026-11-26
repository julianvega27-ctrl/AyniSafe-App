# Spec Delta

## ADDED Requirements

### Requirement: Inicio con reporte operativo
Inicio MUST presentar «Reportar un incidente» como acción principal operable que abre el formulario de reporte. Con sesión MUST mostrar hasta tres de los últimos reportes propios obtenidos del servidor, o su estado vacío o de error; sin sesión MUST ofrecer «Consultar con código». MUST mostrar los contactos de emergencia publicados, MUST NOT listar reportes ficticios ni números no aprobados y el saludo MUST usar el nombre del perfil.

#### Scenario: Inicio con reportes propios
- **WHEN** un ciudadano con incidentes registrados abre Inicio
- **THEN** ve la acción principal habilitada, sus últimos reportes del servidor y los contactos aprobados o el aviso de que no hay contactos aprobados

#### Scenario: Acción operable
- **WHEN** el usuario activa «Reportar un incidente»
- **THEN** se abre el formulario de reporte sin solicitar permisos

#### Scenario: Inicio sin reportes o con error
- **WHEN** el ciudadano no tiene reportes o la consulta falla
- **THEN** ve un estado vacío o un error con reintento, sin datos de ejemplo

### Requirement: Consultas guardadas del invitado en el dispositivo
Las consultas de invitado guardadas (referencia y código) MUST permanecer en el almacenamiento seguro del dispositivo, separadas de los datos de la cuenta. Cerrar sesión MUST NOT borrarlas ni asociarlas a la cuenta, y MUST NOT enviarse al servidor salvo para consultar su seguimiento.

#### Scenario: Cierre de sesión con consultas guardadas
- **WHEN** un ciudadano con consultas de invitado guardadas inicia y luego cierra sesión
- **THEN** las consultas siguen disponibles en «Consultar con código» y no aparecen en Mis reportes

## MODIFIED Requirements

### Requirement: Destinos no construidos
Mapa y Alertas MUST indicar que aún no están disponibles con texto e icono y explicación acorde al producto. MUST NOT mostrar mapas públicos, reportes, avisos ni cifras de ejemplo en esos destinos, ni solicitar ubicación o notificaciones desde ellos. La ubicación del destino en barra o Drawer MUST NOT interpretarse como capacidad implementada. Reportar y Mis reportes son destinos operativos según sus capacidades.

#### Scenario: Destino pendiente
- **WHEN** el usuario abre Mapa o Alertas
- **THEN** ve un estado «aún no disponible» comprensible, sin datos simulados ni solicitudes de permiso

#### Scenario: Reportar desde la barra
- **WHEN** el usuario abre Reportar desde la navegación inferior
- **THEN** ve el formulario de reporte operativo, con o sin sesión, sin solicitar permisos hasta que pulse «Usar mi ubicación»

### Requirement: Salida y límites de permisos
Cerrar sesión desde el perfil MUST seguir la política de Spec 01 y volver a Inicio público con la pila privada vacía. La navegación MUST NOT pedir ubicación, notificaciones ni DNI ni agregar permisos Android distintos de los declarados; la ubicación solo la solicita «Usar mi ubicación» del formulario de reporte. Cambiar la apariencia o abrir la navegación sin cuenta MUST NOT reutilizar datos de una sesión anterior.

#### Scenario: Cierre de sesión desde el perfil
- **WHEN** el ciudadano cierra sesión
- **THEN** vuelve a Inicio público, el retroceso no muestra pantallas privadas y los datos de perfil e historial se descartan de la memoria

#### Scenario: Permisos
- **WHEN** se inspecciona el manifiesto fusionado
- **THEN** solo existen los permisos `INTERNET`, `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION`, la consulta de intención `tel` y ningún permiso de ubicación en segundo plano

#### Scenario: Revocación o sesión vencida
- **WHEN** una respuesta confirma que la sesión ya no es válida
- **THEN** se descartan datos y navegación privados y se muestra el aviso correspondiente sin interpretar un fallo de red como cierre confirmado

### Requirement: Navegación pública sin cuenta
Sin cuenta, la app MUST ofrecer Inicio público, barra Inicio/Reportar/Mapa/Contactos y Drawer con destinos públicos, «Consultar con código» e ingreso a cuenta. Perfil e historial propio MUST requerir sesión válida. El arranque MUST resolver la restauración antes de mostrar datos privados y distinguir error de servicio de ausencia de sesión. El envío y la consulta con código del invitado MUST estar disponibles sin crear una sesión.

#### Scenario: Primera apertura sin sesión guardada
- **WHEN** se abre la app sin sesión
- **THEN** muestra Inicio público con acceso a cuenta, Reportar y Consultar con código operativos, contenido público aprobado y Mapa y Alertas identificados como pendientes

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

## REMOVED Requirements

### Requirement: Inicio orientado a acciones con estado honesto
**Reason**: P4.1 habilita el reporte y el historial propio; la acción deshabilitada «Disponible próximamente» y los reportes marcados como no disponibles dejan de ser ciertos.
**Migration**: Sustituido por «Inicio con reporte operativo», que conserva el saludo, los contactos aprobados y la prohibición de datos ficticios.
