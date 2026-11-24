# 08. Escenarios de atributos de calidad

## EQ-01. Escalabilidad: aumento de ciudadanos y solicitudes (evolución, fuera del MVP) (evolución, fuera del MVP)

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Escalabilidad |
| **Fuente** | Incremento de ciudadanos que utilizan la aplicación móvil. |
| **Estímulo** | Aumentan simultáneamente las consultas al mapa y los registros de incidentes. |
| **Condición** | El backend dispone de una configuración que permite incorporar instancias y distribuir solicitudes; se utiliza una mezcla de consultas y registros documentada. |
| **Respuesta esperada** | El sistema soporta el aumento de usuarios sin superar los límites acordados de tiempo de respuesta y errores. |
| **Medida** | **Propuesta por validar:** soportar el pase de 100 a 200 usuarios simultáneos y ampliar de una a dos instancias equivalentes del backend, manteniendo el 95 % de las respuestas por debajo de 3 segundos y menos del 1 % de errores técnicos. |
| **Verificación** | Ejecutar pruebas de carga con ambas configuraciones y comparar solicitudes atendidas, tiempos de respuesta, errores y uso de recursos del backend y la base de datos. |
| **Estado** | Pendiente de aprobar la carga objetivo, la mezcla de operaciones y la infraestructura de prueba. |

## EQ-02. Rendimiento: registro de reportes

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Rendimiento |
| **Fuente** | Ciudadanos |
| **Estímulo** | Los ciudadanos envían múltiples solicitudes de registro. |
| **Condición** | El backend y la base de datos están disponibles; las evidencias ya se cargaron y las tareas de análisis y notificación pueden quedar pendientes para procesamiento asíncrono. |
| **Respuesta esperada** | El sistema permite el reporte, le asigna un identificador y un estado inicial, y confirma su registro sin esperar la correlación ni el envío de notificaciones. |
| **Medida** | **Propuesta por validar:** con 50 solicitudes de registro por minuto durante 10 minutos y demoras simuladas de 30 segundos en los servicios externos, el 95 % de los registros se confirma en 2 segundos o menos, con menos del 1 % de errores técnicos. Todo registro confirmado debe existir en la base de datos y conservar sus tareas pendientes. |
| **Verificación** | Simular las demoras externas, generar la carga y medir desde la recepción de la solicitud en la API hasta su respuesta; comprobar la persistencia de los reportes y la ejecución posterior de las tareas. |
| **Estado** | Pendiente de aprobar la carga, el tiempo objetivo y el mecanismo de persistencia de tareas pendientes. |

## EQ-03. Disponibilidad: continuidad ante la falla de una instancia (evolución, fuera del MVP) (evolución, fuera del MVP)

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Disponibilidad |
| **Fuente** | Falla de una instancia del backend. |
| **Estímulo** | Una instancia deja de responder mientras los ciudadanos consultan el mapa o registran incidentes. |
| **Condición** | Existen al menos dos instancias con capacidad suficiente para atender la carga de prueba, distribución de solicitudes y comprobaciones de salud; la base de datos y los demás servicios necesarios siguen disponibles. |
| **Respuesta esperada** | La instancia fallida deja de recibir solicitudes y las instancias saludables continúan atendiendo. Los reportes confirmados antes de la falla permanecen disponibles. |
| **Medida** | **Propuesta por validar:** retirar la instancia fallida del tráfico en un máximo de 60 segundos y, a partir de ese momento, atender correctamente al menos el 99 % de las consultas y registros válidos durante los siguientes 10 minutos, sin pérdida de reportes previamente confirmados. |
| **Verificación** | Interrumpir una instancia bajo carga controlada; revisar las comprobaciones de salud, la distribución del tráfico, los errores y la integridad de los reportes confirmados. |
| **Estado** | Pendiente de aprobar los tiempos de detección y la capacidad de las instancias restantes. |

## EQ-04. Seguridad y privacidad: protección de reportes y evidencias

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Seguridad y privacidad |
| **Fuente** | Usuario sin sesión o usuario autenticado sin permisos sobre el recurso solicitado. |
| **Estímulo** | El usuario intenta consultar o modificar reportes ajenos, acceder directamente a evidencias privadas u obtener información sensible mediante el mapa o las alertas. |
| **Condición** | Se dispone de cuentas de ciudadano, operador y administrador, permisos definidos y reportes con datos sensibles para las pruebas. |
| **Respuesta esperada** | El sistema verifica los permisos sobre cada recurso, rechaza los accesos y cambios no autorizados, y publica únicamente los datos permitidos en el mapa y las alertas. Las evidencias privadas requieren autorización para su consulta. |
| **Medida** | Rechazar el 100 % de los intentos no autorizados del conjunto de pruebas, sin modificaciones indebidas ni exposición de identidades, ubicaciones precisas restringidas o evidencias privadas en las respuestas públicas revisadas. |
| **Verificación** | Ejecutar pruebas de acceso autorizado y no autorizado, revisar las respuestas y comprobar que no se expongan datos sensibles. |
| **Estado** | Pendiente de definir los permisos por tipo de usuario y las operaciones protegidas.|

## EQ-05. Trazabilidad: seguimiento de revisiones y cambios de estado

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Trazabilidad |
| **Fuente** | Operador autorizado de una sede competente. |
| **Estímulo** | Revisa, valida, consolida, descarta o cambia el estado de un incidente. |
| **Condición** | El usuario tiene una sesión válida y permisos para realizar la acción; el sistema mantiene un historial de actuaciones. |
| **Respuesta esperada** | El sistema registra la actuación y permite relacionarla con el incidente, el actor autorizado y el momento en que ocurrió. Para los cambios de estado, conserva los estados anterior y posterior. |
| **Medida** | El 100 % de las revisiones y cambios confirmados en las pruebas debe contar con un registro consultable que incluya identificador del incidente, identificador del actor, acción y fecha y hora; los cambios de estado deben incluir ambos estados. Ningún cambio confirmado debe quedar sin su registro de trazabilidad. |
| **Verificación** | Ejecutar las acciones con distintos usuarios autorizados y comparar los cambios con el historial. |
| **Estado** | La política del documento 11 define conservación y permisos; falta implementar/probar atomicidad de actuación y cambio. |

## EQ-06. Mantenibilidad: Cambio sin afectar otras funciones

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Mantenibilidad |
| **Fuente** | Equipo de desarrollo. |
| **Estímulo** | Se solicita modificar una regla de negocio o sustituir el proveedor de notificaciones. |
| **Condición** | El backend está organizado como monolito modular con Clean Architecture, contratos para servicios externos y pruebas de las funciones afectadas. |
| **Respuesta esperada** | El cambio se concentra en el módulo responsable, en su adaptador y configuración, manteniendo el contrato de aplicación. Los módulos no relacionados conservan su comportamiento. |
| **Medida** | Para los dos cambios de prueba, aprobar el 100 % de las pruebas acordadas del módulo afectado, de contrato y de regresión. La sustitución del proveedor de notificaciones no debe exigir cambios en el dominio ni en los clientes móvil y web; toda modificación fuera del módulo responsable debe justificarse en la revisión. |
| **Verificación** | Realizar ambos cambios por separado, inspeccionar los archivos y dependencias modificados y ejecutar las pruebas acordadas. |
| **Estado** | Pendiente de definir los contratos, las reglas de dependencia y las pruebas obligatorias. |

## EQ-07. Recuperación y observabilidad: fallas del procesamiento asíncrono

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Recuperación y observabilidad |
| **Fuente** | Servicio externo no disponible o interrupción de un proceso en segundo plano. |
| **Estímulo** | Falla el análisis de reglas o el envío de notificaciones de un reporte ya registrado. |
| **Condición** | Las tareas pendientes se conservan de forma persistente y existen registros, métricas y una política de reintentos y tratamiento de fallas definitivas. |
| **Respuesta esperada** | El sistema conserva el reporte, identifica la tarea fallida y registra su causa y número de intentos. Reintenta según la política definida y permite recuperar las tareas que agotan sus intentos, evitando duplicar los efectos ya completados. |
| **Medida** | **Propuesta por validar:** reflejar la falla en registros y métricas en un máximo de 60 segundos. En una prueba con 20 tareas afectadas, todas deben quedar identificadas como completadas o pendientes de recuperación; tras restablecer el servicio y recuperar las pendientes, completar las 20 en un máximo de 5 minutos, sin perder reportes ni duplicar registros persistentes de análisis o notificaciones. La entrega push externa puede repetirse ante respuestas inciertas; se deduplica por notificacionId en el cliente cuando sea posible. |
| **Verificación** | Simular errores externos e interrumpir un proceso durante una tarea. Restablecer el servicio, ejecutar la recuperación y comprobar los resultados y el control de duplicados. |
| **Estado** | Pendiente de aprobar los tiempos, la política de reintentos, el procedimiento de recuperación y los mecanismos de control de duplicados. |

## EQ-08. Usabilidad móvil: registro con permisos y errores de conexión

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Usabilidad móvil |
| **Fuente** | Ciudadano que utiliza la aplicación en un teléfono Android. |
| **Estímulo** | Intenta registrar un incidente, responde a la solicitud de permiso de ubicación y experimenta una interrupción de conexión al enviar. |
| **Condición** | Probar modalidad con cuenta e invitado, dispositivos Android representativos, permiso GPS concedido/denegado y pérdida controlada de conectividad. Invitado requiere teléfono; ambos requieren punto por GPS autorizado o selección manual. |
| **Respuesta esperada** | La aplicación explica los campos y permisos, informa cómo continuar si se deniega la ubicación y no la obtiene sin autorización. Ante una falla de conexión, conserva los datos introducidos durante el flujo, comunica el problema y permite reintentar. Confirma el éxito únicamente cuando el servidor confirma el registro. |
| **Medida** | **Propuesta por validar:** al menos 8 de 10 participantes completan un reporte sin asistencia en 3 minutos o menos con conexión disponible. Al menos 8 de 10 identifican cómo continuar ante el permiso denegado y cómo reintentar tras la desconexión. En todos los casos probados, no se obtiene ubicación sin permiso ni se pierden los campos introducidos por la falla de conexión durante el flujo. |
| **Verificación** | Realizar sesiones de usabilidad con ciudadanos representativos; medir tiempos, finalización y necesidad de ayuda, y observar la comprensión de mensajes. Simular denegación de permisos y desconexión, y comprobar la conservación de datos y la confirmación del registro tras el reintento. |
| **Estado** | El flujo ante permisos denegados ya está definido en el alcance; falta probarlo, seleccionar participantes/dispositivos y aprobar las metas de usabilidad. |

## Alcance del MVP y escenarios complementarios

EQ-01 y EQ-03 con varias instancias corresponden a evolución, no a compromisos del MVP gratuito. EQ-02 y EQ-07 requieren backend activo; medir arranque en frío aparte. EQ-08 se ejecutará inicialmente en Android y se repetirá en iPhone antes de declarar soporte iOS validado.

| Escenario | Estímulo y respuesta | Medida y verificación propuesta |
|---|---|---|
| EQ-09 · Aislamiento territorial | Operador intenta consultar un reporte ajeno a su institución/sede/cobertura/competencia mediante URL directa o cambiando filtros. | Rechazar todos los accesos indebidos del conjunto de pruebas, sin datos sensibles. Probar también cambio de ámbito tras reclasificación. |
| EQ-10 · Avisos por usuario | Llega un accidente con heridos en distrito cubierto por PNP y SAMU, con varios operadores; reinicia la API. | Conservar un aviso por usuario/evento, SAMU como principal y PNP como apoyo, sin perderlos al reiniciar. La lectura de un usuario no modifica la de otro. Actualizar en el próximo polling exitoso con backend activo. |
| EQ-11 · Clasificación territorial | Punto interior, frontera, fuera de cobertura y punto manual tras denegar GPS. | Coincidencia del backend con catálogo versionado; distrito ambiguo pendiente. Sin punto no crear incidente; conservar formulario. |
| EQ-12 · Alta institucional atómica | Falla la creación del operador inicial durante el alta de sede. | No queda sede parcial ni cuenta huérfana; el reintento controlado no duplica datos. |
| EQ-13 · Evaluación rápida SAMU | Incidente con varios heridos y observaciones parciales de una persona principal; otra institución o código de invitado intenta consultar el detalle sanitario. | Registrar/notificar con desconocidos y cantidad total independiente, sin exigir fichas adicionales ni extrapolar observaciones. Conservar versiones e idempotencia; excluir detalle de mapa, push y respuestas no autorizadas. Probar incorporación posterior de SAMU. |
| EQ-14 · Recuperación del MVP | Se reinicia la única instancia tras confirmar un reporte y antes de procesar sus avisos. | Tras restablecer API y BD, el reporte y las entregas pendientes siguen presentes y se reanudan; no se promete continuidad durante suspensión. Definir tiempo objetivo de recuperación antes de la prueba. |

EQ-04 incluye los permisos sanitarios de RF43; la existencia de tres roles no basta para autorizar el detalle SAMU. EQ-13 también verifica botones de un toque y cantidad sin teclado (RF44).

EQ-04 incluye los permisos sanitarios de RF43; la existencia de tres roles no basta para autorizar el detalle SAMU. EQ-13 también verifica botones de un toque y cantidad sin teclado (RF44).

## Escenarios de los acuerdos operativos

| ID | Verificación |
|---|---|
| EQ-15 | Registrar tres fotos válidas; rechazar una cuarta, un archivo mayor de 5 MB y un documento renombrado; ofrecer envío sin adjuntos sin perder el formulario. |
| EQ-16 | Cambiar etiqueta y comprobar que el FIFO no cambia; mostrar etiqueta con texto/icono/color y auditar el cambio. |
| EQ-17 | Cerrar por principal, retirar mapa/alertas, simular vencimientos sanitarios/fotos/expediente y comprobar bloqueo, eliminación y no reaparición al restaurar backup. |
| EQ-18 | Coincidir distrito y cercanía con categorías permitidas: un solo aviso; al desactivar o caducar ubicación, respetar preferencias y no usar proximidad obsoleta. |
| EQ-19 | Otra emergencia con descripción concreta llega a Serenazgo; sin distrito o sede, queda para designación del administrador sin acceso sanitario adicional. |
| EQ-20 | Dos operadores de la misma institución asumen simultáneamente: solo uno obtiene asignación activa; repetir su solicitud no duplica. La participación de otra institución tiene su propio responsable. |
| EQ-21 | Accidente con heridos/necesidad médica activa SAMU principal y PNP apoyo; sin condición médica no genera aviso SAMU; desconocido deja revisión pendiente. Una actualización positiva cambia principal/permisos de cierre sin borrar historial. |
