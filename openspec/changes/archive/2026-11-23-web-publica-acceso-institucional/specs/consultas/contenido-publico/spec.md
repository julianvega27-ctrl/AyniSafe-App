## MODIFIED Requirements

### Requirement: Contenido público sin sesión
La API MUST exponer `GET /publico/contenido` sin exigir sesión, con una versión del contenido, su fecha de actualización y las secciones de aplicación (finalidad y funcionamiento), alcance del piloto, desarrolladores, privacidad y contactos de emergencia. La respuesta MUST contener únicamente información pública y MUST NOT variar por usuario. La ruta MUST aceptar solo lectura.

#### Scenario: Lectura anónima
- **WHEN** una persona sin sesión consulta el contenido público
- **THEN** recibe 200 con la versión, la fecha y todas las secciones, incluido el alcance del piloto

#### Scenario: Sin datos privados
- **WHEN** se consulta con o sin sesión
- **THEN** el cuerpo es el mismo y no contiene datos de cuentas ni credenciales

## ADDED Requirements

### Requirement: Alcance del piloto con aprobación explícita
La fuente MUST incluir una sección `piloto` con el mismo mecanismo de aprobación que las demás. Mientras no esté aprobada MUST figurar como pendiente y sin texto, y la versión del contenido MUST incrementarse al incorporarla.

#### Scenario: Sección pendiente
- **WHEN** se consulta el contenido con la fuente actual
- **THEN** `piloto` figura como pendiente sin texto y la versión es posterior a la anterior

#### Scenario: Clientes existentes
- **WHEN** la app móvil consume la respuesta con la nueva sección
- **THEN** sigue mostrando sus páginas sin errores y no presenta la sección nueva

### Requirement: Contenido público disponible en la web sin sesión
La portada web MUST mostrar finalidad, funcionamiento, alcance del piloto y desarrolladores desde `GET /publico/contenido` sin iniciar sesión, usando la estructura sin transformaciones específicas de un cliente. MUST distinguir carga, error de conexión o servicio con «Reintentar» y sección pendiente, sin mostrar texto supuesto ni números de contacto.

#### Scenario: Contenido aprobado
- **WHEN** una persona sin sesión abre la portada
- **THEN** ve cada sección aprobada y, para las pendientes, el aviso de que aún no está disponible

#### Scenario: Error de conexión
- **WHEN** el contenido no puede obtenerse
- **THEN** la portada muestra el problema con texto e icono y «Reintentar», sin contenido supuesto
