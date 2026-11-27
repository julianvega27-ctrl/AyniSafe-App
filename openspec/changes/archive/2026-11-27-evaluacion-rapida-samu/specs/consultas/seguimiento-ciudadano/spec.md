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

#### Scenario: Principal cambiada por condición médica
- **WHEN** una aclaración hizo de SAMU la principal de un accidente con PNP principal
- **THEN** el autor ve SAMU como institución responsable

## ADDED Requirements

### Requirement: Evaluación propia del autor
El detalle del autor MUST incluir, si el incidente tiene evaluación, sus propias respuestas vigentes con su instante, si puede aclararlas y si se solicita completarlas porque SAMU interviene sin observaciones de la persona principal. MUST NOT incluir cambios ni motivos de operadores. La vista del invitado MUST NOT incluir datos de la evaluación.

#### Scenario: SAMU incorporado después
- **WHEN** un operador activó a SAMU en un accidente del autor sin observaciones
- **THEN** el detalle indica que se solicita completar la evaluación, sin mostrar la precisión del operador

#### Scenario: Invitado con código
- **WHEN** un invitado consulta un incidente con evaluación
- **THEN** la respuesta no contiene heridos, cantidad ni observaciones
