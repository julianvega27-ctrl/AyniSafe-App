# Spec Delta

## MODIFIED Requirements

### Requirement: Detalle privado del autor
El autor MUST poder consultar el detalle de un incidente propio con referencia, categoría, descripción, ocurrencia, recepción, estado, resultado territorial, respuestas para SAMU, institución responsable y resumen de actuaciones. La responsable es la principal con participación; sin ella, y sin actuaciones, esos datos MUST mostrarse como pendientes, sin valores inventados. MUST NOT incluir notas internas, operadores, sedes ni datos de otros informantes.

#### Scenario: Detalle propio recién registrado
- **WHEN** el autor consulta un incidente en REGISTRADO aún no enrutado
- **THEN** ve sus datos originales y la institución responsable y las actuaciones marcadas como pendientes

#### Scenario: Detalle con principal resuelta
- **WHEN** el autor consulta un incidente cuya principal SAMU participa
- **THEN** ve SAMU como institución responsable, sin sede ni operadores, y las actuaciones como pendientes

#### Scenario: Principal faltante
- **WHEN** el enrutamiento está pendiente por falta de una sede principal
- **THEN** la institución responsable aparece como pendiente aunque participen instituciones de apoyo

#### Scenario: Incidente ajeno o inexistente
- **WHEN** un ciudadano consulta por identificador un incidente de otro autor, de invitado o inexistente
- **THEN** recibe la misma respuesta 404, sin revelar si existe

### Requirement: Vista limitada del invitado
Con referencia y código secreto válidos en el cuerpo de la solicitud, el sistema MUST devolver solo referencia, categoría, estado, recepción, institución responsable (tipo y nombre) o pendiente y resumen ciudadano de actuaciones. MUST NOT devolver descripción, punto, distrito, teléfono, evidencias, respuestas sanitarias, sedes, operadores ni notas internas.

#### Scenario: Consulta correcta
- **WHEN** un invitado envía su referencia y su código vigente
- **THEN** recibe estado y resumen ciudadano de su incidente, con la institución responsable si existe una principal con participación

#### Scenario: Datos excluidos
- **WHEN** se inspecciona la respuesta de la vista del invitado
- **THEN** no contiene descripción, coordenadas, teléfono, respuestas sanitarias, sedes ni identificadores internos

#### Scenario: Código en la URL
- **WHEN** el código o la referencia se envían como parámetros de URL en lugar del cuerpo
- **THEN** se rechaza la solicitud sin consultar
