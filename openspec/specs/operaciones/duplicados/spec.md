# operaciones/duplicados Specification

## Purpose

Vincular incidentes del mismo hecho a un incidente principal para coordinar una sola atención, conservando cada envío, su autoría o modalidad, su historial y su seguimiento sin exponer datos de otros informantes.

## Requirements

### Requirement: Vinculación auditada a un principal
El responsable activo de la institución principal de un incidente abierto MUST poder vincularlo como duplicado de otro incidente abierto que su sede también ve dentro de su ámbito, con motivo de 10 a 500 caracteres. La vinculación MUST registrarse con actor, instante y motivo y MUST NOT cerrar, descartar ni marcar como falso al duplicado.

#### Scenario: Vincular
- **WHEN** el responsable vincula un incidente EN_REVISION a otro abierto que ve
- **THEN** queda vinculado, conserva su estado propio guardado, originales, código e historial, y la vinculación consta en el historial

#### Scenario: Principal no visible
- **WHEN** el principal indicado no es visible para la sede del responsable
- **THEN** recibe el mismo 404 que ante un incidente inexistente

### Requirement: Sin ciclos ni cadenas
Un incidente MUST NOT vincularse a sí mismo, a un incidente que ya es duplicado ni a uno cerrado. Un incidente que tiene duplicados MUST NOT vincularse como duplicado de otro. Las vinculaciones simultáneas MUST resolverse en la BD sin dejar ciclos.

#### Scenario: Cadena
- **WHEN** se intenta vincular A a B y B ya es duplicado de C
- **THEN** recibe 409 `VINCULO_NO_PERMITIDO`

#### Scenario: Vinculaciones cruzadas simultáneas
- **WHEN** se vincula A a B y B a A al mismo tiempo
- **THEN** solo una se confirma y la otra recibe 409

### Requirement: Estado coordinado del duplicado
Mientras está vinculado, el duplicado MUST NOT admitir transiciones, verificación ni cierre propios y MUST responder 409 `INCIDENTE_VINCULADO`. Las consultas ciudadanas y de bandeja MUST informar el estado efectivo del principal e indicar la coordinación.

#### Scenario: Seguimiento del duplicado
- **WHEN** el principal pasa a EN_ATENCION
- **THEN** el autor del duplicado ve EN_ATENCION y «Coordinado con otro reporte del mismo hecho», sin referencia, descripción ni autor del principal

#### Scenario: Transición en el duplicado
- **WHEN** un operador intenta cerrar un duplicado vinculado
- **THEN** recibe 409 `INCIDENTE_VINCULADO`

### Requirement: Privacidad entre informantes vinculados
Vincular MUST NOT conceder al autor de un incidente acceso a datos, evidencias, evaluación ni código de otro incidente del grupo, y MUST NOT ampliar la visibilidad de una sede a incidentes en los que no participa.

#### Scenario: Autor del principal
- **WHEN** el autor del principal consulta su detalle
- **THEN** no recibe datos de los duplicados
