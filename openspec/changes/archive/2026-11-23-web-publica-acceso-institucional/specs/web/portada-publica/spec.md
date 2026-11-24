## ADDED Requirements

### Requirement: Portada pública sin sesión
La web MUST ofrecer en su ruta raíz una portada pública, accesible sin sesión y separada de las rutas protegidas del panel, con finalidad, funcionamiento, alcance del piloto, desarrolladores y un acceso institucional visible. La portada MUST NOT ofrecer registro de operadores ni de administradores, ni una versión ciudadana completa para el navegador.

#### Scenario: Visita anónima
- **WHEN** una persona sin sesión abre la raíz de la web
- **THEN** ve las secciones de la portada y el acceso institucional sin ser redirigida ni solicitada una credencial

#### Scenario: Acceso institucional visible
- **WHEN** se recorre la portada con teclado
- **THEN** el acceso institucional es alcanzable, tiene un nombre accesible y lleva a `/acceso`

#### Scenario: Sin autorregistro
- **WHEN** se inspeccionan la portada y sus rutas
- **THEN** no existe formulario ni enlace de registro de operadores, administradores o ciudadanos

#### Scenario: Persona con sesión en la portada
- **WHEN** una persona con sesión institucional abre la portada
- **THEN** la portada sigue siendo pública y el acceso conduce a su panel sin repetir credenciales

### Requirement: Contenido de la portada desde la fuente pública
La portada MUST obtener su texto de `GET /publico/contenido` y MUST NOT incluir textos propios de finalidad, funcionamiento, piloto o desarrolladores, ni números de emergencia. Una sección pendiente MUST indicar que aún no está disponible.

#### Scenario: Sección pendiente
- **WHEN** el alcance del piloto figura como pendiente
- **THEN** la portada muestra «aún no disponible» con texto e icono y no un texto de reemplazo

#### Scenario: Fallo de la API
- **WHEN** la lectura del contenido falla por red o servicio
- **THEN** se muestra el problema y «Reintentar» sin presentar un éxito no confirmado

### Requirement: Accesibilidad y diseño de la portada
La portada MUST seguir la guía de UI: tipografía del sistema, texto base de 16 px, botones y enlaces de acción de al menos 48 px de alto, foco visible, estados con texto e icono además del color, jerarquía de encabezados y texto ampliable al 200 % sin pérdida de contenido. Los contrastes de las combinaciones usadas MUST medirse y cumplir WCAG AA.

#### Scenario: Texto ampliado
- **WHEN** se amplía el texto al 200 % en un ancho de móvil
- **THEN** todo el contenido y las acciones siguen siendo operables sin desplazamiento horizontal

#### Scenario: Contraste
- **WHEN** se ejecutan las comprobaciones de contraste de los pares de color usados
- **THEN** cada par cumple 4,5:1 para texto normal

#### Scenario: Lector de pantalla
- **WHEN** se navega con un lector de pantalla
- **THEN** los encabezados, regiones y estados de carga o error se anuncian con nombres comprensibles
