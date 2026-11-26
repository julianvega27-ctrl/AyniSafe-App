# operaciones/incidentes Specification

## Purpose

Mantener el incidente único como caso operativo con identificador, referencia pública y estado propio de Operaciones, creado desde cada envío confirmado sin un ciclo de Reporte separado ni estados duplicados en otros módulos.

## Requirements

### Requirement: Un incidente por envío confirmado
Cada envío confirmado MUST crear exactamente un incidente en la misma transacción que sus originales. MUST NOT existir una entidad Reporte con ciclo de estados propio ni crearse un segundo caso al verificar. Operaciones MUST ser el único dueño del estado operativo; otros módulos MUST NOT guardar copias del estado que puedan contradecirlo.

#### Scenario: Creación conjunta
- **WHEN** se confirma un envío
- **THEN** existe un incidente y un registro de originales vinculado a él, creados en la misma transacción

#### Scenario: Sin estado duplicado
- **WHEN** se inspecciona el esquema de Reportes
- **THEN** no contiene columnas de estado operativo del incidente

#### Scenario: Reversión conjunta
- **WHEN** falla la escritura de los originales tras crear el incidente en la transacción
- **THEN** no queda el incidente ni sus originales

### Requirement: Estado inicial REGISTRADO
Todo incidente nuevo MUST iniciar en REGISTRADO, el primero de los cuatro estados REGISTRADO, EN_REVISION, EN_ATENCION y CERRADO. La BD MUST rechazar cualquier otro valor. En esta capacidad no existe ninguna transición: REGISTRADO MUST NOT implicar verificación, recepción institucional ni atención.

#### Scenario: Estado al crear
- **WHEN** se crea un incidente desde un envío
- **THEN** su estado es REGISTRADO y su instante de registro es el del servidor

#### Scenario: Estado no admitido
- **WHEN** se intenta guardar un estado fuera de los cuatro definidos, como ASIGNADO o PENDIENTE_ATENCION
- **THEN** la restricción de la BD lo rechaza

#### Scenario: Sin transiciones expuestas
- **WHEN** se revisa el contrato publicado
- **THEN** no hay rutas para cambiar el estado de un incidente

### Requirement: Referencia pública no secuencial
Cada incidente MUST tener una referencia pública única, legible y no secuencial, distinta de su identificador interno y del código secreto. La referencia MUST NOT conceder acceso privado por sí sola ni permitir deducir el volumen de incidentes.

#### Scenario: Unicidad
- **WHEN** se crean muchos incidentes
- **THEN** todas las referencias son distintas y una colisión al generarlas se reintenta sin fallar el envío

#### Scenario: Referencia sin acceso
- **WHEN** alguien consulta el seguimiento solo con la referencia
- **THEN** no obtiene datos del incidente

### Requirement: Contrato interno del incidente
Operaciones MUST ofrecer por su fachada la creación del incidente dentro del contexto transaccional del llamador y la lectura del estado ciudadano de incidentes por identificador. Otros módulos MUST NOT escribir ni leer directamente sus tablas.

#### Scenario: Verificación de límites
- **WHEN** se ejecuta el verificador de arquitectura
- **THEN** Reportes y Consultas solo usan la fachada de Operaciones y no hay infracciones
