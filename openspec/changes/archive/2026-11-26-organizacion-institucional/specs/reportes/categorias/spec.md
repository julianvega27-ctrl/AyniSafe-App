# Spec Delta

## Purpose

Mantener el catálogo cerrado de las 16 categorías de incidentes con identificadores estables, para configurar competencias de sedes ahora y registrar incidentes después sin renombrar ni inventar categorías.

## ADDED Requirements

### Requirement: Catálogo de las 16 categorías
El sistema MUST contener exactamente las 16 categorías del documento 09, con su nombre visible sin modificar y un identificador estable en minúsculas con guiones: accidente-transito, acoso, actividad-sospechosa, agresion, asalto, danos-sismo, deslizamiento, emergencia-medica, incendio, inundacion, otra-emergencia, otro-incidente-seguridad, pelea, robo, vandalismo y violencia.

#### Scenario: Catálogo tras migrar
- **WHEN** se migra una base vacía y se consulta el catálogo
- **THEN** se obtienen las 16 categorías con esos identificadores y nombres, todas activas

#### Scenario: Identificador estable
- **WHEN** otra capacidad guarda una referencia a una categoría
- **THEN** usa el identificador estable y no el nombre visible

### Requirement: Catálogo sin edición libre
Esta capacidad MUST NOT exponer rutas para crear, renombrar ni borrar categorías. Las categorías MUST poder marcarse inactivas en datos sin borrar filas referenciadas.

#### Scenario: Intento de crear o borrar
- **WHEN** se envía POST, PUT, PATCH o DELETE a la ruta del catálogo
- **THEN** se responde 405 con cabecera Allow sin cambios

#### Scenario: Categoría referenciada
- **WHEN** se intenta borrar en la BD una categoría usada por una competencia
- **THEN** la restricción de integridad lo impide

### Requirement: Lectura pública del catálogo
El catálogo MUST poder leerse sin sesión y devolver el mismo cuerpo para anónimos y para los tres roles. MUST incluir solo identificador, nombre, orden y estado activo, sin reglas, prioridades ni destinatarios.

#### Scenario: Lectura anónima y autenticada
- **WHEN** se consulta el catálogo sin sesión y con sesión de ciudadano, operador y administrador
- **THEN** las cuatro respuestas son 200 con cuerpo idéntico

#### Scenario: Sin datos de enrutamiento
- **WHEN** se inspecciona la respuesta del catálogo
- **THEN** no contiene institución principal, prioridad ni reglas de aviso
