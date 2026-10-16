# 08. Escenarios de atributos de calidad

## EQ-01. Escalabilidad: aumento de ciudadanos y solicitudes

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Escalabilidad |
| **Fuente** | Incremento de ciudadanos que utilizan la aplicación móvil. |
| **Estímulo** | Aumentan simultáneamente las consultas al mapa y los registros de incidentes. |
| **Condición** | El backend dispone de una configuración que permite incorporar instancias y distribuir solicitudes; se utiliza una mezcla de consultas y registros documentada. |
| **Respuesta esperada** | El sistema soporta el aumento de usuarios sin superar los límites acordados de tiempo de respuesta y errores. |
| **Medida** | **Propuesta por validar:** soportar el pase de 100 a 200 usuarios simultáneos y ampliar de una a dos instancias equivalentes del backend, manteneniendo el 95 % de las respuestas por debajo de 3 segundos y menos del 1 % de errores técnicos. |
| **Verificación** | Ejecutar pruebas de carga con ambas configuraciones y comparar solicitudes atendidas, tiempos de respuesta, errores y uso de recursos del backend y la base de datos. |
| **Estado** | Pendiente de aprobar la carga objetivo, la mezcla de operaciones y la infraestructura de prueba. |

## EQ-02. Rendimiento: registro de reportes

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Rendimiento |
| **Fuente** | Ciudadanos |
| **Estímulo** | Los ciudadanos envían múltiples solicitudes de registro. |
| **Condición** | El backend y la base de datos están disponibles; las evidencias ya se cargaron y las tareas de análisis y notificación pueden quedar pendientes para procesamiento asíncrono. |
| **Respuesta esperada** | El sistema permite el reporte, le asigna un identificador y un estado inicial, y confirma su registro sin esperar la clasificación con IA ni el envío de notificaciones. |
| **Medida** | **Propuesta por validar:** con 50 solicitudes de registro por minuto durante 10 minutos y demoras simuladas de 30 segundos en los servicios externos, el 95 % de los registros se confirma en 2 segundos o menos, con menos del 1 % de errores técnicos. Todo registro confirmado debe existir en la base de datos y conservar sus tareas pendientes. |
| **Verificación** | Simular las demoras externas, generar la carga y medir desde la recepción de la solicitud en la API hasta su respuesta; comprobar la persistencia de los reportes y la ejecución posterior de las tareas. |
| **Estado** | Pendiente de aprobar la carga, el tiempo objetivo y el mecanismo de persistencia de tareas pendientes. |

## EQ-03. Disponibilidad: continuidad ante la falla de una instancia

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
| **Fuente** | Operador o administrador autorizado. |
| **Estímulo** | Revisa, valida, consolida, descarta o cambia el estado de un incidente. |
| **Condición** | El usuario tiene una sesión válida y permisos para realizar la acción; el sistema mantiene un historial de actuaciones. |
| **Respuesta esperada** | El sistema registra la actuación y permite relacionarla con el incidente, el actor autorizado y el momento en que ocurrió. Para los cambios de estado, conserva los estados anterior y posterior. |
| **Medida** | El 100 % de las revisiones y cambios confirmados en las pruebas debe contar con un registro consultable que incluya identificador del incidente, identificador del actor, acción y fecha y hora; los cambios de estado deben incluir ambos estados. Ningún cambio confirmado debe quedar sin su registro de trazabilidad. |
| **Verificación** | Ejecutar las acciones con distintos usuarios autorizados y comparar los cambios con el historial. |
| **Estado** | Pendiente de definir la conservación del historial, los permisos de consulta y el mecanismo que asegura la consistencia entre actuación y cambio. |

## EQ-06. Mantenibilidad: Cambio sin afectar otras funciones

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Mantenibilidad |
| **Fuente** | Equipo de desarrollo. |
| **Estímulo** | Se solicita modificar una regla de negocio o sustituir el proveedor de IA. |
| **Condición** | El backend está organizado como monolito modular con Clean Architecture, contratos para servicios externos y pruebas de las funciones afectadas. |
| **Respuesta esperada** | El cambio se concentra en el módulo responsable, en su adaptador y configuración, manteniendo el contrato de aplicación. Los módulos no relacionados conservan su comportamiento. |
| **Medida** | Para los dos cambios de prueba, aprobar el 100 % de las pruebas acordadas del módulo afectado, de contrato y de regresión. La sustitución del proveedor de IA no debe exigir cambios en el dominio ni en los clientes móvil y web; toda modificación fuera del módulo responsable debe justificarse en la revisión. |
| **Verificación** | Realizar ambos cambios por separado, inspeccionar los archivos y dependencias modificados y ejecutar las pruebas acordadas. |
| **Estado** | Pendiente de definir los contratos, las reglas de dependencia y las pruebas obligatorias. |

## EQ-07. Recuperación y observabilidad: fallas del procesamiento asíncrono

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Recuperación y observabilidad |
| **Fuente** | Servicio externo no disponible o interrupción de un proceso en segundo plano. |
| **Estímulo** | Falla el análisis con IA o el envío de notificaciones de un reporte ya registrado. |
| **Condición** | Las tareas pendientes se conservan de forma persistente y existen registros, métricas y una política de reintentos y tratamiento de fallas definitivas. |
| **Respuesta esperada** | El sistema conserva el reporte, identifica la tarea fallida y registra su causa y número de intentos. Reintenta según la política definida y permite recuperar las tareas que agotan sus intentos, evitando duplicar los efectos ya completados. |
| **Medida** | **Propuesta por validar:** reflejar la falla en registros y métricas en un máximo de 60 segundos. En una prueba con 20 tareas afectadas, todas deben quedar identificadas como completadas o pendientes de recuperación; tras restablecer el servicio y recuperar las pendientes, completar las 20 en un máximo de 5 minutos, sin perder reportes ni duplicar efectos ya confirmados. |
| **Verificación** | Simular errores externos e interrumpir un proceso durante una tarea. Restablecer el servicio, ejecutar la recuperación y comprobar los resultados y el control de duplicados. |
| **Estado** | Pendiente de aprobar los tiempos, la política de reintentos, el procedimiento de recuperación y los mecanismos de control de duplicados. |

## EQ-08. Usabilidad móvil: registro con permisos y errores de conexión

| Elemento | Descripción |
|---|---|
| **Atributo de calidad** | Usabilidad móvil |
| **Fuente** | Ciudadano que utiliza la aplicación en un teléfono Android. |
| **Estímulo** | Intenta registrar un incidente, responde a la solicitud de permiso de ubicación y experimenta una interrupción de conexión al enviar. |
| **Condición** | El ciudadano tiene una sesión iniciada; se prueban dispositivos Android representativos, permisos concedidos y denegados, y una pérdida controlada de conectividad. |
| **Respuesta esperada** | La aplicación explica los campos y permisos, informa cómo continuar si se deniega la ubicación y no la obtiene sin autorización. Ante una falla de conexión, conserva los datos introducidos durante el flujo, comunica el problema y permite reintentar. Confirma el éxito únicamente cuando el servidor confirma el registro. |
| **Medida** | **Propuesta por validar:** al menos 8 de 10 participantes completan un reporte sin asistencia en 3 minutos o menos con conexión disponible. Al menos 8 de 10 identifican cómo continuar ante el permiso denegado y cómo reintentar tras la desconexión. En todos los casos probados, no se obtiene ubicación sin permiso ni se pierden los campos introducidos por la falla de conexión durante el flujo. |
| **Verificación** | Realizar sesiones de usabilidad con ciudadanos representativos; medir tiempos, finalización y necesidad de ayuda, y observar la comprensión de mensajes. Simular denegación de permisos y desconexión, y comprobar la conservación de datos y la confirmación del registro tras el reintento. |
| **Estado** | Pendiente de validar el flujo ante permisos denegados, seleccionar participantes y dispositivos y aprobar las metas de usabilidad. |
