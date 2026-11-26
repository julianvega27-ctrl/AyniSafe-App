# Spec Delta

## Purpose

Desacoplar el registro de hechos de su procesamiento posterior mediante eventos persistidos en PostgreSQL y entregas por consumidor recuperables, para que enrutamiento, correlación y avisos no retrasen ni pierdan un registro confirmado.

## ADDED Requirements

### Requirement: Evento en la transacción del hecho
Un hecho de negocio que deba procesarse después MUST guardarse como evento en la misma transacción que el hecho. Si la transacción se revierte, MUST NOT quedar evento. El evento MUST tener identificador único, tipo, versión de esquema, identificador del agregado e instante, y MUST NOT contener teléfonos, códigos secretos, descripciones ni coordenadas.

#### Scenario: Registro con evento
- **WHEN** se confirma el registro de un incidente
- **THEN** existe un evento IncidenteRegistrado con el identificador del incidente

#### Scenario: Reversión sin evento
- **WHEN** la transacción del registro falla
- **THEN** no existe evento para ese intento

#### Scenario: Carga mínima
- **WHEN** se inspecciona el contenido persistido del evento
- **THEN** solo contiene identificadores, tipo, versión, modalidad e instante, sin datos personales ni narrativos

### Requirement: Entregas por consumidor
Cada consumidor registrado MUST tener una entrega persistida y única por evento, con estado, intentos, próximo intento y último error sin datos sensibles. Un consumidor registrado después MUST recibir también los eventos anteriores que no procesó. Sin consumidores registrados el evento MUST conservarse sin entregas.

#### Scenario: Dos consumidores
- **WHEN** hay dos consumidores registrados y se registra un evento
- **THEN** existen dos entregas independientes y el fallo de una no bloquea la otra

#### Scenario: Unicidad de entrega
- **WHEN** dos procesos intentan crear la entrega del mismo evento y consumidor
- **THEN** existe una sola entrega

#### Scenario: Consumidor nuevo
- **WHEN** se registra un consumidor tras existir eventos pendientes para él
- **THEN** se crean y procesan sus entregas de esos eventos

### Requirement: Reintentos y fallo definitivo
Una entrega fallida MUST reintentarse con espera creciente hasta un máximo documentado y luego quedar como fallida, identificable y recuperable manualmente sin perder el evento. Cada fallo MUST registrar causa resumida e intentos en logs estructurados sin datos sensibles.

#### Scenario: Fallo transitorio
- **WHEN** un consumidor falla y luego se recupera
- **THEN** la entrega se reintenta con espera creciente y termina procesada

#### Scenario: Agotamiento
- **WHEN** un consumidor falla en todos los intentos permitidos
- **THEN** la entrega queda fallida con su causa e intentos, y puede volver a pendiente mediante el procedimiento documentado

### Requirement: Recuperación tras reinicio
Al arrancar, la API MUST reanudar las entregas pendientes y las que quedaron en proceso por una interrupción, tras un tiempo de bloqueo documentado. Varios procesadores MUST NOT ejecutar a la vez la misma entrega.

#### Scenario: Reinicio antes de procesar
- **WHEN** la API se reinicia después de confirmar un registro y antes de procesar su entrega
- **THEN** tras arrancar, la entrega se procesa sin intervención manual

#### Scenario: Interrupción durante el proceso
- **WHEN** el proceso termina mientras una entrega estaba en curso
- **THEN** al vencer su bloqueo vuelve a procesarse

#### Scenario: Procesadores concurrentes
- **WHEN** dos procesadores buscan entregas pendientes a la vez
- **THEN** cada entrega es tomada por uno solo

### Requirement: Efectos sin duplicar
La entrega MUST marcarse procesada solo después de que el consumidor termine. Los consumidores MUST ser idempotentes por identificador de evento, de modo que repetir una entrega no duplique efectos persistentes.

#### Scenario: Repetición tras fallo al marcar
- **WHEN** el consumidor termina pero el proceso cae antes de marcar la entrega
- **THEN** la repetición no duplica el efecto persistido por el consumidor

### Requirement: Observabilidad de entregas
El sistema MUST permitir contar entregas por consumidor y estado (pendiente, en proceso, procesada, fallida), y registrar en logs estructurados cada fallo y cada recuperación con identificadores del evento, sin datos personales.

#### Scenario: Conteo de estados
- **WHEN** se consulta el estado de las entregas tras una prueba con fallos inyectados
- **THEN** cada entrega aparece como procesada o como pendiente o fallida con sus intentos
