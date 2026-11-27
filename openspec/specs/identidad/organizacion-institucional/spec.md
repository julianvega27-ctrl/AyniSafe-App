# identidad/organizacion-institucional Specification

## Purpose

Organizar la atención institucional del piloto con instituciones cerradas, sedes, operadores invitados, coberturas por distrito y competencias por categoría, aplicando el ámbito de cada operador en el backend sin conceder permisos de atención al administrador.

## Requirements

### Requirement: Catálogo institucional cerrado
El sistema MUST contener exactamente las instituciones PNP, Bomberos, SAMU y Serenazgo, una por tipo, disponibles desde la migración. MUST NOT exponer ninguna ruta que cree instituciones ni admitir otro tipo en la BD. El administrador MUST poder editar nombre visible, contacto y estado de cada una.

#### Scenario: Catálogo inicial
- **WHEN** un administrador activo lista las instituciones tras migrar una base vacía
- **THEN** recibe exactamente cuatro, con tipos pnp, bomberos, samu y serenazgo, sin sedes ni operadores asociados

#### Scenario: Tipo fuera del alcance
- **WHEN** se intenta registrar por API o directamente en la BD una institución de tipo municipalidad u otro
- **THEN** la API responde 405 con `Allow` y la BD rechaza la fila por restricción

#### Scenario: Edición de datos visibles
- **WHEN** el administrador cambia el nombre o contacto de una institución con datos válidos
- **THEN** se responde 200 con los nuevos datos y el tipo permanece inalterado

### Requirement: Alta atómica de sede con operador inicial
Crear una sede MUST requerir institución, nombre, distrito de ubicación opcional y los datos del operador inicial (nombre y correo). Sede, pertenencia, cuenta operador `pendiente_activacion` e invitación MUST confirmarse en una sola transacción. Si cualquier paso falla, MUST NOT quedar sede, cuenta, pertenencia ni envío.

#### Scenario: Alta correcta
- **WHEN** el administrador crea una sede de una institución activa con un operador inicial de correo no usado
- **THEN** se responde 201 con la sede deshabilitada para atención y su operador pendiente de activación, y se encola un único correo de activación que se entrega tras el commit

#### Scenario: Falla al crear el operador inicial
- **WHEN** la creación de la cuenta o de la invitación falla después de insertar la sede
- **THEN** la transacción se revierte, no existe sede, cuenta, pertenencia ni envío, y la API responde con error genérico

#### Scenario: Sede sin operador inicial
- **WHEN** se solicita crear una sede sin datos del operador inicial
- **THEN** se rechaza con 400 de validación sin persistir nada

### Requirement: Reintento sin duplicación
La creación de sede MUST ser segura ante reintentos: el nombre normalizado de la sede MUST ser único por institución y el correo normalizado único entre cuentas. Un reintento con datos ya confirmados MUST NOT crear una segunda sede, cuenta ni invitación.

#### Scenario: Reintento tras respuesta perdida
- **WHEN** el administrador repite la misma alta después de que la primera se confirmó
- **THEN** se responde 409 SEDE_EXISTENTE y siguen existiendo una sola sede, una sola cuenta y un solo envío

#### Scenario: Correo ya registrado
- **WHEN** el correo del operador inicial pertenece a cualquier cuenta existente
- **THEN** se responde 409 EMAIL_IN_USE sin crear la sede ni modificar la cuenta existente

#### Scenario: Altas concurrentes
- **WHEN** dos solicitudes crean simultáneamente la misma sede o usan el mismo correo
- **THEN** exactamente una se confirma y la otra recibe 409 sin filas parciales

### Requirement: Verificación documental separada de la atención
Cada sede MUST conservar estado de verificación documental (sin verificar o verificada, con fuente y fecha) separado de su habilitación para atención. Toda sede MUST nacer deshabilitada para atención. Registrar o verificar una sede MUST NOT habilitarla.

#### Scenario: Verificar sin habilitar
- **WHEN** el administrador marca una sede como verificada con fuente y fecha
- **THEN** la sede queda verificada y continúa deshabilitada para atención

#### Scenario: Datos de demostración
- **WHEN** una sede o un operador se crean marcados como demostración
- **THEN** las respuestas de la API los identifican como demostración en todos los listados

### Requirement: Habilitación para atención
Habilitar una sede para atención MUST exigir institución activa, sede activa y verificada, al menos un distrito de cobertura, al menos una categoría de competencia y al menos un operador activo. Si falta alguno, MUST rechazarse indicando cada requisito incumplido.

#### Scenario: Requisitos completos
- **WHEN** el administrador habilita una sede que cumple todos los requisitos
- **THEN** se responde 200 y la sede queda habilitada para atención

#### Scenario: Requisitos incompletos
- **WHEN** el administrador habilita una sede sin cobertura o cuyo único operador sigue pendiente de activación
- **THEN** se responde 409 REQUISITOS_HABILITACION con la lista de requisitos faltantes y la sede sigue deshabilitada

### Requirement: Coberturas por distrito
El administrador MUST configurar el conjunto de distritos que cubre cada sede, eligiendo solo identificadores del catálogo territorial. Un distrito MUST poder estar cubierto por varias sedes y una sede cubrir varios distritos. El distrito de ubicación MUST NOT implicar cobertura.

#### Scenario: Reemplazo del conjunto de cobertura
- **WHEN** el administrador guarda los distritos DIS-01 y DIS-03 para una sede
- **THEN** la cobertura de esa sede es exactamente esos dos distritos, sin afectar a otras sedes

#### Scenario: Distrito inexistente
- **WHEN** se envía un identificador que no pertenece al catálogo territorial
- **THEN** se rechaza con 400 sin modificar la cobertura previa

#### Scenario: Ubicación no es cobertura
- **WHEN** se crea una sede ubicada en DIS-02 sin configurar cobertura
- **THEN** la sede no cubre ningún distrito

### Requirement: Competencias por categoría
El administrador MUST configurar las categorías que atiende cada sede eligiendo solo identificadores del catálogo de categorías. Guardar MUST reemplazar el conjunto completo de forma atómica.

#### Scenario: Categorías válidas
- **WHEN** el administrador guarda las categorías robo y asalto para una sede de PNP
- **THEN** las competencias de esa sede son exactamente esas dos

#### Scenario: Categoría desconocida
- **WHEN** se envía una categoría fuera del catálogo
- **THEN** se rechaza con 400 sin cambios parciales

#### Scenario: Habilitada sin competencias
- **WHEN** se intenta dejar vacías la cobertura o las competencias de una sede habilitada para atención
- **THEN** se rechaza con 409 SEDE_HABILITADA hasta deshabilitarla primero

### Requirement: Operadores adicionales por sede
El administrador MUST poder agregar operadores a una sede existente con nombre y correo. Cada alta MUST crear la cuenta pendiente, su pertenencia a una única sede y la invitación en la misma transacción. Cada operador MUST pertenecer a exactamente una sede.

#### Scenario: Operador adicional
- **WHEN** el administrador agrega un operador con correo no usado a una sede
- **THEN** se responde 201 con el operador pendiente de activación y se encola su invitación

#### Scenario: Sede inexistente
- **WHEN** se agrega un operador a una sede que no existe
- **THEN** se responde 404 sin crear cuenta

### Requirement: Suspensión y reactivación sin borrar historial
El administrador MUST poder suspender y reactivar sedes y operadores. Suspender un operador MUST revocar sus sesiones y enlaces de activación sin usar. Suspender una sede MUST deshabilitarla para atención. Ninguna acción MUST borrar filas.

#### Scenario: Suspender operador con sesión
- **WHEN** el administrador suspende un operador que tiene una sesión abierta
- **THEN** la siguiente solicitud de ese operador recibe 401 y su inicio de sesión responde el 401 uniforme

#### Scenario: Último operador activo de una sede habilitada
- **WHEN** se suspende el único operador activo de una sede habilitada para atención
- **THEN** se rechaza con 409 ULTIMO_OPERADOR_ACTIVO hasta deshabilitar la sede o activar otro operador

#### Scenario: Reactivar
- **WHEN** se reactiva un operador suspendido que ya había activado su cuenta
- **THEN** puede volver a iniciar sesión con su contraseña sin crear otra cuenta

#### Scenario: Suspender un operador pendiente de activación
- **WHEN** se suspende un operador que aún no activó su cuenta y luego se reactiva
- **THEN** el enlace recibido deja de servir en ambos momentos y la cuenta vuelve a pendiente hasta reenviar la invitación

### Requirement: Reenvío de invitación pendiente
El administrador MUST poder reenviar la invitación de un operador pendiente de activación. El reenvío MUST invalidar el enlace anterior y MUST NOT aplicarse a cuentas activas o suspendidas.

#### Scenario: Reenviar a pendiente
- **WHEN** el administrador reenvía la invitación de un operador pendiente
- **THEN** se responde 202, el enlace anterior deja de ser válido y se encola un nuevo correo

#### Scenario: Reenviar a cuenta activa
- **WHEN** se reenvía la invitación de un operador ya activo
- **THEN** se responde 409 sin encolar correo

### Requirement: Administración exclusiva del administrador
Todas las rutas de organización que leen o modifican instituciones, sedes, operadores, coberturas o competencias MUST exigir sesión institucional de administrador activo. Administrar organización MUST NOT conceder permisos de atención ni de lectura de incidentes.

#### Scenario: Operador en rutas de organización
- **WHEN** un operador activo consulta o modifica cualquier ruta de organización, incluso de su propia sede
- **THEN** recibe 403 sin datos

#### Scenario: Sin sesión o con sesión ciudadana
- **WHEN** se llama a una ruta de organización sin cookie institucional o con un token ciudadano
- **THEN** se responde 401 sin datos

#### Scenario: Protección entre sitios
- **WHEN** una solicitud de modificación llega sin el origen web permitido
- **THEN** se rechaza conforme a la protección vigente de acceso institucional

### Requirement: Ámbito del operador
El sistema MUST resolver para cada operador activo su institución, sede, distritos de cobertura, categorías y si la sede está habilitada. MUST exponerlo como contrato interno y como lectura del propio operador. Un operador suspendido o de sede suspendida MUST tener ámbito vacío.

#### Scenario: Lectura del propio ámbito
- **WHEN** un operador activo consulta su ámbito
- **THEN** recibe solo su institución, sede, distritos y categorías, sin datos de otras sedes ni de otros operadores

#### Scenario: Cambio de cobertura
- **WHEN** el administrador cambia la cobertura de la sede de un operador
- **THEN** la siguiente consulta del ámbito refleja el nuevo conjunto sin caché obsoleta

#### Scenario: Administrador consultando ámbito de operador
- **WHEN** un administrador llama a la lectura de ámbito del operador
- **THEN** recibe 403

### Requirement: Validación estricta y errores sin datos sensibles
Las entradas de organización MUST validar tipos, longitudes, correos normalizados e identificadores, rechazando campos desconocidos. Los errores MUST usar códigos estables y MUST NOT incluir correos ajenos, tokens ni detalles de la BD.

#### Scenario: Campo desconocido
- **WHEN** el cuerpo incluye un campo no documentado como rol, contraseña o institución de otro tipo
- **THEN** se responde 400 sin persistir cambios

#### Scenario: Error de almacenamiento
- **WHEN** la BD no está disponible durante un alta
- **THEN** se responde 503 genérico sin datos parciales

### Requirement: Sedes elegibles para enrutamiento
Identidad MUST ofrecer como contrato interno las sedes elegibles para una institución, un distrito y una categoría: sedes activas y habilitadas para atención de una institución activa, con cobertura del distrito, competencia sobre la categoría y al menos un operador activo. El resultado MUST reflejar la configuración vigente sin caché obsoleta y MUST NOT exponerse como ruta pública.

#### Scenario: Sede que cumple
- **WHEN** se consultan las sedes elegibles de PNP para un distrito y una categoría que una sede habilitada cubre, con un operador activo
- **THEN** el resultado incluye esa sede

#### Scenario: Sede sin operador activo
- **WHEN** el único operador de una sede que cumple el resto está suspendido o pendiente de activación
- **THEN** la sede no es elegible

#### Scenario: Cambio de configuración
- **WHEN** el administrador añade una cobertura y se vuelve a consultar
- **THEN** la nueva sede elegible aparece sin reiniciar la API

### Requirement: Validación de sede designable
Identidad MUST ofrecer como contrato interno la comprobación de que una sede puede recibir una designación administrativa para una institución dada: sede activa y habilitada, de esa institución activa y con al menos un operador activo, sin exigir cobertura ni competencia. MUST devolver cada requisito incumplido.

#### Scenario: Sede designable
- **WHEN** se comprueba una sede SAMU habilitada con un operador activo para la institución SAMU
- **THEN** se acepta aunque no cubra el distrito del incidente

#### Scenario: Requisitos incumplidos
- **WHEN** se comprueba una sede deshabilitada de otra institución
- **THEN** se devuelven los requisitos institución y habilitación incumplidos
