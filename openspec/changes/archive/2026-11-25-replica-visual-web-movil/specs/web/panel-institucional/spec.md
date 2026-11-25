# Spec Delta

## MODIFIED Requirements

### Requirement: Shell por rol
El panel MUST mostrar las secciones de su rol recibidas de la API según la guía UI: operador con Inicio, Incidentes, Mapa, Indicadores e Historial; administrador con Inicio, Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas, Contenido/contactos e Historial. MUST mostrar cuenta y cierre de sesión en cabecera. Cada destino aún no construido MUST indicar «Aún no disponible» con texto e icono, sin datos, cifras ni mapas de ejemplo.

#### Scenario: Panel del administrador
- **WHEN** un administrador entra a su panel
- **THEN** ve las secciones de administración marcadas como no disponibles y su nombre y rol en la cabecera

#### Scenario: Panel del operador
- **WHEN** un operador entra a su panel
- **THEN** ve las secciones de operación marcadas como no disponibles

#### Scenario: Rol ajeno
- **WHEN** un operador navega a la ruta del panel del administrador
- **THEN** la web no muestra sus secciones y la API devuelve 403 a sus consultas

#### Scenario: Cierre de sesión
- **WHEN** la persona pulsa «Cerrar sesión»
- **THEN** la sesión se revoca, la web vuelve a la portada o a `/acceso` y el botón Atrás no reabre contenido privado

#### Scenario: Sección no operativa
- **WHEN** se selecciona Inicio, Historial u otro destino sin implementación operativa
- **THEN** se abre su explicación pendiente sin consultar servicios futuros ni presentar ceros como métricas reales

## ADDED Requirements

### Requirement: Marco institucional de referencia
El panel MUST reproducir la barra lateral, cabecera, área de trabajo y sus variantes responsive de la referencia fijada en DESIGN.md. La navegación activa MUST ser identificable y operable con teclado y en pantallas estrechas. La reproducción MUST conservar las rutas públicas y protegidas vigentes de AyniSafe.

#### Scenario: Escritorio y pantalla estrecha
- **WHEN** se abre cada panel con sesión válida en un viewport de escritorio o estrecho
- **THEN** su marco sigue la variante efectiva del origen y todos los destinos autorizados siguen siendo alcanzables con foco visible y nombre accesible

#### Scenario: Recarga de ruta protegida
- **WHEN** se recarga o abre directamente una ruta del panel
- **THEN** se comprueba la sesión antes de mostrar identidad o contenido privado, sin destello de un rol ajeno

### Requirement: Cuenta y campana con disponibilidad honesta
La cabecera MUST usar la composición de cuenta y campana del origen. El menú de cuenta MUST ofrecer identidad autorizada y cierre de sesión. Mientras no exista la capacidad de notificaciones, la campana MUST indicar «Aún no disponible», sin contadores ni mensajes ficticios, y MUST NOT llamar a endpoints futuros.

#### Scenario: Cuenta accesible
- **WHEN** se abre y cierra el menú de cuenta con teclado
- **THEN** el foco se gestiona de forma operable, se muestran solo datos autorizados y el cierre de sesión conserva su comportamiento vigente

#### Scenario: Campana pendiente
- **WHEN** se consulta la campana antes de implementar notificaciones
- **THEN** se anuncia la no disponibilidad y no se afirma que hay cero avisos ni se generan solicitudes operativas
