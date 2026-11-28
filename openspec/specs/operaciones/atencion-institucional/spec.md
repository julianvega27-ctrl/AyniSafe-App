# operaciones/atencion-institucional Specification

## Purpose

Coordinar la atención institucional del incidente único: quién es responsable en cada institución participante, qué transiciones y decisiones puede registrar la principal, cómo interviene el administrador sin atender y qué historial queda para auditoría y para el ciudadano.

## Requirements

### Requirement: Asumir caso por institución
Un operador cuya sede participa en el incidente dentro de su ámbito vigente MUST poder asumir la participación de su institución. MUST existir como máximo una asignación activa por incidente e institución, garantizada por la BD. Repetir la solicitud el mismo responsable MUST devolver su asignación vigente sin duplicarla. Un incidente CERRADO MUST NOT admitir asunciones.

#### Scenario: Asunción simultánea
- **WHEN** dos operadores de la misma institución asumen el mismo incidente a la vez
- **THEN** solo uno obtiene la asignación activa y el otro recibe 409 con el aviso de que otro operador de su institución ya es responsable

#### Scenario: Repetición del responsable
- **WHEN** el responsable vuelve a pulsar «Asumir caso»
- **THEN** recibe 200 con la misma asignación y no se crea otra fila ni otro hito

#### Scenario: Otra institución
- **WHEN** la principal ya tiene responsable y un operador de una institución de apoyo asume
- **THEN** su institución obtiene su propia asignación activa

#### Scenario: Fuera de ámbito
- **WHEN** un operador asume un incidente en el que su sede no participa dentro de su ámbito
- **THEN** recibe el mismo 404 que ante un incidente inexistente

### Requirement: Inicio de revisión al asumir la principal
La primera asunción de la institución principal de un incidente REGISTRADO MUST pasar el incidente a EN_REVISION en la misma transacción que la asignación. Asumir MUST NOT pasar a EN_ATENCION ni acreditar movilización. La asunción de una institución de apoyo MUST NOT cambiar el estado.

#### Scenario: Principal asume
- **WHEN** el primer operador de la principal asume un incidente REGISTRADO
- **THEN** el incidente queda EN_REVISION con su cambio de estado auditado

#### Scenario: Apoyo asume primero
- **WHEN** un operador de apoyo asume un incidente REGISTRADO
- **THEN** el incidente sigue REGISTRADO

### Requirement: Acciones reservadas al responsable de la principal
Iniciar atención, registrar la verificación y cerrar MUST requerir que quien actúa sea el responsable activo de la institución principal vigente. Cualquier otro operador visible MUST recibir 403 con un código que indique si falta asumir o si su institución no es la principal. Si la principal cambia, los permisos MUST seguir a la nueva principal sin borrar asignaciones anteriores.

#### Scenario: Operador sin asumir
- **WHEN** un operador de la principal sin asignación intenta iniciar atención
- **THEN** recibe 403 `ASIGNACION_REQUERIDA` y el estado no cambia

#### Scenario: Responsable de apoyo
- **WHEN** el responsable de una institución de apoyo intenta cerrar
- **THEN** recibe 403 `NO_PRINCIPAL` y el estado no cambia

#### Scenario: Principal cambiada por condición médica
- **WHEN** una aclaración hace de SAMU la principal de un accidente con responsable PNP
- **THEN** el responsable PNP conserva su asignación como apoyo y solo un responsable SAMU puede cerrar

### Requirement: Transiciones operativas permitidas
El sistema MUST admitir solo: EN_REVISION → EN_ATENCION; EN_ATENCION → CERRADO con resultado ATENDIDO; REGISTRADO o EN_REVISION → CERRADO con resultado DESCARTADO. Cada transición MUST indicar el estado esperado y MUST rechazarse con 409 si el estado actual es otro. Un incidente CERRADO MUST NOT cambiar de estado en esta capacidad.

#### Scenario: Iniciar atención
- **WHEN** el responsable de la principal inicia atención de un incidente EN_REVISION
- **THEN** el incidente queda EN_ATENCION sin registrar llegada al lugar

#### Scenario: Descartar desde revisión
- **WHEN** el responsable descarta un incidente EN_REVISION con motivo y resumen
- **THEN** queda CERRADO con resultado DESCARTADO sin haber pasado por EN_ATENCION

#### Scenario: Atendido sin atención
- **WHEN** se intenta cerrar como ATENDIDO un incidente EN_REVISION
- **THEN** recibe 409 `TRANSICION_NO_PERMITIDA`

#### Scenario: Estado esperado desactualizado
- **WHEN** dos pestañas del responsable envían transiciones desde el mismo estado
- **THEN** la primera se aplica y la segunda recibe 409 `ESTADO_CAMBIADO` con el estado vigente

### Requirement: Cierre con motivo y resumen ciudadano
Cerrar MUST exigir resultado ATENDIDO o DESCARTADO, un motivo interno de 10 a 500 caracteres y un resumen ciudadano de 10 a 300 caracteres. El motivo interno MUST NOT mostrarse al ciudadano. Un descarte MUST NOT contarse como atención realizada.

#### Scenario: Cierre sin resumen
- **WHEN** el responsable cierra sin resumen ciudadano
- **THEN** recibe 400 con el campo señalado y el estado no cambia

#### Scenario: Resultado distinguible
- **WHEN** se consulta un incidente descartado
- **THEN** su estado es CERRADO y su resultado DESCARTADO, distinto de ATENDIDO

### Requirement: Verificación separada del estado
Cada incidente MUST tener una verificación SIN_VERIFICAR, VERIFICADO o NO_VERIFICADO, inicialmente SIN_VERIFICAR. El responsable de la principal MUST poder registrarla o corregirla con motivo de 10 a 500 caracteres mientras el incidente no esté CERRADO. La verificación MUST NOT cambiar el estado, crear otro caso ni publicar, y MUST NOT exigirse para cerrar.

#### Scenario: Verificar sin cambiar estado
- **WHEN** el responsable marca VERIFICADO un incidente EN_REVISION
- **THEN** la verificación cambia, el estado sigue EN_REVISION y el cambio queda auditado

#### Scenario: Corrección
- **WHEN** el responsable cambia VERIFICADO a NO_VERIFICADO con motivo
- **THEN** ambos cambios constan en el historial con valor anterior y nuevo

### Requirement: Historial atómico de cambios
Cada asunción, liberación, reasignación, transición y verificación confirmada MUST registrar en la misma transacción incidente, acción, actor, institución, instante y, para estados y verificación, valor anterior y nuevo. Si falla el registro, MUST revertirse el cambio.

#### Scenario: Trazabilidad completa
- **WHEN** se ejecutan asunción, inicio de atención y cierre por distintos operadores
- **THEN** cada cambio confirmado tiene exactamente un registro con incidente, actor, acción, instante y estados anterior y nuevo

### Requirement: Hitos ciudadanos de las actuaciones
Cada transición MUST crear un hito ciudadano con instante y texto fijo: «En revisión», «En atención por <institución>» y «Cerrado: atendido» o «Cerrado: descartado» con el resumen ciudadano. Los hitos MUST NOT incluir operadores, sedes, motivo interno ni verificación.

#### Scenario: Hitos tras el cierre
- **WHEN** un incidente pasó por revisión, atención y cierre atendido
- **THEN** tiene tres hitos en orden cronológico, el último con el resumen ciudadano

### Requirement: Asignaciones visibles para el administrador
El administrador MUST poder listar las asignaciones activas con referencia, estado, institución, sede y nombre del responsable, marcando las de operadores o sedes suspendidos como pendientes de reasignación. La lista MUST NOT incluir descripción, contacto, ubicación, evidencias ni datos sanitarios. Un operador MUST recibir 403.

#### Scenario: Responsable suspendido
- **WHEN** el administrador suspende un operador con una asignación activa
- **THEN** la asignación sigue activa y aparece marcada como pendiente de reasignación

### Requirement: Liberar y reasignar con motivo
El administrador MUST poder liberar una asignación activa o reasignarla a otro operador activo de una sede activa y habilitada de la misma institución que participe en el incidente, con motivo de 10 a 500 caracteres. MUST NOT cambiar el estado ni otorgar al administrador permisos de atención. El historial MUST conservar al responsable anterior.

#### Scenario: Reasignar
- **WHEN** el administrador reasigna la asignación PNP a otro operador PNP de una sede participante
- **THEN** el nuevo operador es el responsable activo y el historial muestra ambos

#### Scenario: Destino no válido
- **WHEN** el administrador reasigna a un operador de otra institución, suspendido o de una sede que no participa
- **THEN** recibe 409 `DESTINO_NO_VALIDO` y la asignación no cambia

#### Scenario: Liberar
- **WHEN** el administrador libera una asignación con motivo
- **THEN** la institución queda sin responsable activo y otro operador puede asumir

### Requirement: Asignación automática al operador único
Cuando la institución principal de un incidente abierto y sin vincular participa con una sola sede y esa sede tiene exactamente un operador activo, el sistema MUST asignarle el caso en la misma transacción en que la institución queda como principal (enrutamiento, designación, reevaluación o cambio por condición médica) y MUST pasar REGISTRADO a EN_REVISION. MUST registrarse con actor «sistema» y origen automático. Con varias sedes u operadores MUST mantenerse la toma manual.

#### Scenario: Sede con un operador
- **WHEN** se enruta un robo cuya única sede PNP tiene un operador activo
- **THEN** ese operador queda como responsable, el incidente pasa a EN_REVISION y el historial registra el actor «sistema»

#### Scenario: Sede con varios operadores
- **WHEN** la única sede principal tiene dos operadores activos
- **THEN** no se asigna a nadie y el incidente sigue REGISTRADO hasta que uno lo tome

#### Scenario: SAMU pasa a principal
- **WHEN** una aclaración hace principal a SAMU y su única sede tiene un operador activo
- **THEN** SAMU queda con responsable automático y la asignación PNP previa se conserva como apoyo
