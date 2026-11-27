# operaciones/enrutamiento Specification

## Purpose

Resolver, para cada incidente registrado, las instituciones destinatarias según la matriz versionada del documento 09 y las sedes que participan por cobertura y competencia. Si no puede asignarse, el caso debe quedar visible para el administrador, sin perderlo ni simular su recepción.

## Requirements

### Requirement: Enrutamiento asíncrono del incidente registrado
Cada evento `IncidenteRegistrado` MUST producir un único enrutamiento del incidente, procesado mediante su entrega persistida y sin retrasar el registro. Repetir la entrega MUST NOT duplicar el enrutamiento ni las participaciones. Los eventos anteriores a la puesta en marcha del enrutamiento MUST enrutarse también.

#### Scenario: Registro enrutado
- **WHEN** se confirma un envío y su entrega de enrutamiento se procesa
- **THEN** el incidente tiene un enrutamiento con la versión de la regla, la categoría y el distrito usados y los destinatarios resueltos

#### Scenario: Entrega repetida
- **WHEN** la entrega de enrutamiento se repite tras terminar el consumidor
- **THEN** sigue existiendo un solo enrutamiento y las mismas participaciones

#### Scenario: Eventos previos
- **WHEN** arranca la API con incidentes registrados antes del enrutamiento
- **THEN** todos quedan enrutados o pendientes sin intervención manual

#### Scenario: Reinicio antes de enrutar
- **WHEN** la API se reinicia tras confirmar un accidente con heridos y antes de procesar su entrega
- **THEN** tras arrancar, el incidente queda enrutado con SAMU principal y PNP de apoyo

### Requirement: Matriz de destinatarios versionada
Los destinatarios MUST salir de una matriz versionada con una principal por categoría y sus simultáneas y condicionadas del documento 09 §4, limitada a PNP, Bomberos, SAMU y Serenazgo. Cada enrutamiento MUST guardar la versión aplicada. Cada institución MUST aparecer una sola vez por incidente, con su papel de mayor rango. El apoyo local opcional de Serenazgo MUST NOT activarse sin una configuración que lo habilite.

#### Scenario: Principal por categoría
- **WHEN** se enruta un incendio, un robo, un caso de «Otra emergencia» o una emergencia médica
- **THEN** la principal es Bomberos, PNP, Serenazgo o SAMU respectivamente

#### Scenario: Simultáneas obligatorias
- **WHEN** se enruta una actividad sospechosa o un vandalismo
- **THEN** PNP es principal y Serenazgo participa como simultánea

#### Scenario: Sin apoyo local configurado
- **WHEN** se enruta un asalto
- **THEN** solo participa PNP y Serenazgo no recibe el caso como apoyo local

#### Scenario: Tipo no admitido
- **WHEN** una regla resuelve una institución fuera de las cuatro admitidas
- **THEN** el enrutamiento falla con un error registrado y la entrega se reintenta sin crear participaciones

### Requirement: Condiciones médicas en accidentes
En un accidente de tránsito, heridos o necesidad médica `si` MUST hacer de SAMU la principal y de PNP una simultánea. Con ambas respuestas `no`, PNP MUST ser principal sin SAMU. Si alguna es desconocida y ninguna es `si`, PNP MUST ser principal sin SAMU y el enrutamiento MUST marcar revisión médica pendiente. Una respuesta desconocida MUST NOT tratarse como `no`.

#### Scenario: Accidente con heridos
- **WHEN** se enruta un accidente con heridos `si`
- **THEN** SAMU es principal y PNP simultánea

#### Scenario: Accidente con necesidad médica sin heridos
- **WHEN** se enruta un accidente con heridos `no` y atención médica `si`
- **THEN** SAMU es principal y PNP simultánea

#### Scenario: Accidente sin condición médica
- **WHEN** se enruta un accidente con heridos `no` y atención médica `no`
- **THEN** PNP es principal, SAMU no participa y no hay revisión médica pendiente

#### Scenario: Accidente con condición desconocida
- **WHEN** se enruta un accidente con heridos `no_se` o sin respuesta y atención médica distinta de `si`
- **THEN** PNP es principal, SAMU no participa y el enrutamiento marca revisión médica pendiente

### Requirement: SAMU condicionado por heridos
En agresión, pelea y violencia, heridos `si` MUST añadir a SAMU como condicionada sin cambiar la principal PNP. Heridos `no_se` o sin respuesta MUST marcar revisión médica pendiente sin añadir SAMU. Las demás categorías MUST NOT añadir SAMU por la respuesta de heridos.

#### Scenario: Agresión con heridos
- **WHEN** se enruta una agresión con heridos `si`
- **THEN** PNP es principal y SAMU participa como condicionada

#### Scenario: Pelea con heridos desconocidos
- **WHEN** se enruta una pelea con heridos `no_se`
- **THEN** PNP es principal, SAMU no participa y el enrutamiento marca revisión médica pendiente

#### Scenario: Robo con heridos
- **WHEN** se enruta un robo con heridos `si`
- **THEN** solo participa PNP

### Requirement: Selección de sedes participantes
Para cada institución destinataria, MUST participar cada sede activa y habilitada para atención de una institución activa con cobertura del distrito del incidente, competencia sobre su categoría y al menos un operador activo. Si varias sedes cumplen, MUST participar todas sin duplicar el caso. Cada participación MUST guardar sede, institución, papel y origen.

#### Scenario: Sede elegible
- **WHEN** existe una sede PNP habilitada que cubre el distrito, es competente para robo y tiene un operador activo
- **THEN** esa sede participa como principal en el robo

#### Scenario: Varias sedes elegibles
- **WHEN** dos sedes de Serenazgo cumplen para un vandalismo
- **THEN** ambas participan como simultáneas y el incidente sigue siendo uno

#### Scenario: Sede no elegible
- **WHEN** una sede cubre el distrito pero no es competente para la categoría, está deshabilitada o no tiene operadores activos
- **THEN** no participa

### Requirement: Enrutamiento pendiente
Si el incidente no tiene distrito resuelto, o si una institución destinataria no tiene ninguna sede elegible, el enrutamiento MUST quedar en `ENRUTAMIENTO_PENDIENTE` con un motivo por cada faltante. Las sedes encontradas MUST participar igualmente. El incidente MUST conservarse en REGISTRADO, sin simular recepción ni descartar el caso.

#### Scenario: Sin distrito
- **WHEN** se enruta un incidente con territorio pendiente
- **THEN** queda en ENRUTAMIENTO_PENDIENTE con el motivo sin distrito, sin participaciones, y su estado sigue siendo REGISTRADO

#### Scenario: Falta la principal
- **WHEN** ninguna sede SAMU cubre un accidente con heridos y una sede PNP sí
- **THEN** la sede PNP participa como simultánea y el enrutamiento queda pendiente por falta de sede SAMU principal

#### Scenario: Otra emergencia sin sede
- **WHEN** se enruta «Otra emergencia» en un distrito sin sede de Serenazgo elegible
- **THEN** queda pendiente para designación del administrador

### Requirement: Lista de pendientes del administrador
El administrador MUST poder listar los enrutamientos pendientes en orden de registro, del más antiguo al más reciente, con desempate por identificador y cursor. Cada fila MUST incluir referencia, categoría, distrito o motivo territorial, instante de registro y faltantes. MUST NOT incluir descripción, teléfono, coordenadas ni respuestas sanitarias. Otros roles MUST recibir 403.

#### Scenario: Lista FIFO
- **WHEN** el administrador consulta los pendientes
- **THEN** los recibe del más antiguo al más reciente, solo con los campos permitidos

#### Scenario: Operador sin permiso
- **WHEN** un operador consulta la lista de pendientes
- **THEN** recibe 403

### Requirement: Designación administrativa auditada
El administrador MUST poder designar, para un faltante, una sede activa y habilitada de la misma institución con al menos un operador activo, con un motivo de 10 a 500 caracteres. La designación MUST crear una participación de origen designación, con el administrador, el motivo y el instante, como excepción limitada al caso. MUST NOT exigir cobertura ni conceder acceso sanitario o a otros casos.

#### Scenario: Designar la principal faltante
- **WHEN** el administrador designa una sede SAMU habilitada para la principal faltante, con motivo
- **THEN** la sede participa como principal designada, queda registrada la auditoría y, si no quedan faltantes, el enrutamiento pasa a enrutado

#### Scenario: Sede inválida
- **WHEN** se designa una sede de otra institución, deshabilitada o sin operadores activos
- **THEN** se responde 409 con el requisito incumplido y no cambia el enrutamiento

#### Scenario: Designaciones simultáneas
- **WHEN** dos administradores designan a la vez para el mismo faltante
- **THEN** solo una designación prospera y la otra recibe 409 sin duplicar participaciones

#### Scenario: Caso no pendiente
- **WHEN** se designa para un incidente sin ese faltante
- **THEN** se responde 409 y no cambia nada

### Requirement: Reevaluación tras corregir la configuración
El administrador MUST poder reevaluar un enrutamiento pendiente. La reevaluación MUST aplicar la misma versión de la regla, con los datos originales y la configuración vigente, solo para los faltantes. MUST conservar las participaciones existentes y el historial.

#### Scenario: Cobertura añadida
- **WHEN** el administrador añade la cobertura que faltaba y reevalúa
- **THEN** la nueva sede elegible participa y, sin faltantes, el enrutamiento pasa a enrutado

#### Scenario: Sigue faltando
- **WHEN** se reevalúa sin cambios de configuración
- **THEN** el enrutamiento sigue pendiente con los mismos motivos y no se duplican participaciones

### Requirement: Evento de enrutamiento resuelto
Cada resultado de enrutamiento, designación, reevaluación o actualización de la condición médica MUST publicar un evento `EnrutamientoResuelto` en la misma transacción, con el identificador del incidente, el resultado (enrutado o pendiente) y su origen (regla, designación, reevaluación o condicion_medica), sin datos personales, narrativos ni sanitarios. Sin consumidores registrados, el evento MUST conservarse.

#### Scenario: Evento al enrutar
- **WHEN** el consumidor enruta un incidente
- **THEN** existe un evento EnrutamientoResuelto con su resultado, creado en la misma transacción

#### Scenario: Sin avisos de usuario
- **WHEN** se inspecciona la base tras enrutar
- **THEN** no existen avisos por usuario ni estados de lectura, que pertenecen a la capacidad de avisos

#### Scenario: Evento por condición médica
- **WHEN** una aclaración activa a SAMU en un incidente enrutado
- **THEN** existe un evento EnrutamientoResuelto con origen condicion_medica y sin respuestas sanitarias

### Requirement: Propiedad y límites del enrutamiento
Solo Operaciones MUST escribir enrutamientos y participaciones. Los datos originales MUST obtenerse por la fachada de Reportes y las sedes por la fachada de Identidad. El enrutamiento MUST NOT cambiar el estado operativo del incidente ni escribir en tablas de otros módulos.

#### Scenario: Verificación de límites
- **WHEN** se ejecuta el verificador de arquitectura
- **THEN** no hay importaciones prohibidas ni ciclos entre Operaciones, Reportes, Identidad y Consultas

#### Scenario: Estado sin cambios
- **WHEN** se enruta cualquier incidente
- **THEN** su estado sigue siendo REGISTRADO

### Requirement: Condición médica vigente al enrutar
El enrutamiento inicial MUST aplicar la matriz con heridos y atención médica de la versión vigente de la evaluación, no solo con las respuestas originales. Si una aclaración se confirma antes de procesar la entrega de enrutamiento, MUST usarse la condición aclarada.

#### Scenario: Aclaración antes de enrutar
- **WHEN** el autor informa heridos si en un accidente cuyo enrutamiento aún no se procesó
- **THEN** el enrutamiento resultante tiene SAMU principal y PNP simultánea

### Requirement: Actualización positiva de la condición médica
Cuando una versión nueva hace que la matriz requiera a SAMU, MUST recalcularse en su transacción con la versión de regla guardada. En accidente, SAMU MUST pasar a principal y PNP a simultánea conservando su participación; en agresión, pelea o violencia, SAMU MUST añadirse como condicionada. Las sedes SAMU MUST salir de la selección vigente; sin ellas, MUST quedar `ENRUTAMIENTO_PENDIENTE` con el faltante.

#### Scenario: Accidente pasa a SAMU principal
- **WHEN** un operador PNP precisa heridos si en un accidente con PNP principal y revisión pendiente
- **THEN** SAMU participa como principal, PNP sigue participando como simultánea y la revisión médica deja de estar pendiente

#### Scenario: Agresión con heridos aclarados
- **WHEN** el autor de una agresión con heridos no_se informa heridos si
- **THEN** SAMU se añade como condicionada y PNP sigue siendo principal

#### Scenario: SAMU sin sede elegible
- **WHEN** se activa SAMU en un distrito sin sede SAMU elegible
- **THEN** el enrutamiento queda pendiente con el faltante de SAMU y PNP conserva su participación

#### Scenario: Incidente aún no enrutado
- **WHEN** la aclaración llega antes del enrutamiento inicial
- **THEN** no se crea un segundo enrutamiento y el inicial usa la condición vigente

### Requirement: Sin retiro por condición médica
Una actualización de la condición médica MUST NOT retirar participaciones ni rebajar el papel de SAMU ya participante. Precisar a `no` todas las respuestas desconocidas MUST cerrar la revisión médica pendiente sin añadir SAMU. Un recálculo sin cambios en destinatarios ni revisión MUST NOT publicar eventos.

#### Scenario: Corrección negativa con SAMU participante
- **WHEN** se precisa heridos no y atención médica no en un accidente con SAMU principal
- **THEN** SAMU sigue como principal y PNP como simultánea

#### Scenario: Revisión resuelta sin SAMU
- **WHEN** se precisan heridos no y atención médica no en un accidente con revisión pendiente
- **THEN** PNP sigue como principal, SAMU no participa y la revisión médica deja de estar pendiente

### Requirement: Auditoría de cambios de enrutamiento
Cada recálculo con efecto MUST registrar el incidente, la versión de evaluación que lo causó, el origen y el actor (autor o operador), los destinatarios y la revisión pendiente antes y después, y el instante, sin respuestas sanitarias ni motivos. Los registros MUST NOT modificarse ni borrarse fuera de la conservación.

#### Scenario: Historial del cambio de principal
- **WHEN** un accidente pasa de PNP principal a SAMU principal
- **THEN** existe un registro con PNP principal antes, SAMU principal y PNP simultánea después y la versión que lo causó
