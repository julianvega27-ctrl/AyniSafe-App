# Spec Delta

## Purpose
Servir sin sesión el contenido público de AyniSafe (finalidad, funcionamiento, desarrolladores, privacidad y contactos de emergencia) desde una fuente versionada que reutilizan la app y la web, declarando qué está aprobado y qué no.

## ADDED Requirements

### Requirement: Contenido público sin sesión
La API MUST exponer `GET /publico/contenido` sin exigir sesión, con una versión del contenido, su fecha de actualización y las secciones de aplicación (finalidad y funcionamiento), desarrolladores, privacidad y contactos de emergencia. La respuesta MUST contener únicamente información pública y MUST NOT variar por usuario. La ruta MUST aceptar solo lectura.

#### Scenario: Lectura anónima
- **WHEN** una persona sin sesión consulta el contenido público
- **THEN** recibe 200 con la versión, la fecha y todas las secciones

#### Scenario: Sin datos privados
- **WHEN** se consulta con o sin sesión
- **THEN** el cuerpo es el mismo y no contiene datos de cuentas ni credenciales

### Requirement: Aprobación explícita por sección
Cada sección de texto MUST declarar su estado de aprobación (`aprobado` o `pendiente`) y MUST publicar su texto solo cuando esté aprobado. El sistema MUST NOT publicar números de emergencia, instituciones ni textos no aprobados. Un contacto MUST incluir institución, número, cobertura, fuente y fecha de verificación para publicarse. En esta entrega la lista de contactos (`contactos.items`) MUST estar vacía porque ninguno está aprobado.

#### Scenario: Contactos sin aprobar
- **WHEN** se consulta el contenido con la fuente actual
- **THEN** `contactos.items` es una lista vacía con estado pendiente y ninguna sección contiene números inventados

#### Scenario: Sección pendiente
- **WHEN** una sección figura como pendiente
- **THEN** se entrega su estado sin texto y los clientes muestran que aún no está disponible

#### Scenario: Contacto incompleto
- **WHEN** la fuente contiene un contacto sin fuente o fecha de verificación
- **THEN** la validación de la fuente falla y el contacto no se publica

### Requirement: Fuente versionada y reutilizable
El contenido MUST provenir de una fuente única versionada en el repositorio, validada contra su esquema al arrancar y en pruebas. Un cambio de contenido MUST incrementar la versión. La respuesta MUST permitir caché pública breve y MUST NOT usar `no-store`. La estructura MUST ser independiente del cliente para que la web la reutilice.

#### Scenario: Fuente inválida
- **WHEN** la fuente no cumple el esquema o repite una versión con contenido distinto
- **THEN** las pruebas fallan y el arranque con esa fuente se rechaza

#### Scenario: Reutilización por la web
- **WHEN** otro cliente consume el endpoint
- **THEN** obtiene la misma estructura que la app sin transformaciones específicas de Flutter

### Requirement: Contenido público disponible en la app sin sesión
La app MUST mostrar privacidad y contactos de emergencia desde el acceso sin sesión usando esa fuente. MUST distinguir carga, error de conexión o servicio con acción «Reintentar», contenido vacío y sección pendiente, sin afirmar que existen contactos. Una acción de llamada MUST abrir el marcador con el número sin iniciar la llamada ni solicitar permisos de llamada.

#### Scenario: Acceso sin sesión
- **WHEN** una persona sin sesión abre Privacidad o Contactos desde el acceso
- **THEN** ve el contenido aprobado o el aviso de que no está disponible, y no se solicita iniciar sesión

#### Scenario: Error de conexión
- **WHEN** el contenido no puede obtenerse
- **THEN** la app muestra el problema con texto e icono y «Reintentar», sin mostrar contenido supuesto

#### Scenario: Llamada al marcador
- **WHEN** existe un contacto de prueba con número y el usuario pulsa «Llamar»
- **THEN** se abre el marcador con el número cargado y no se inicia ninguna llamada ni se pide permiso de llamada
