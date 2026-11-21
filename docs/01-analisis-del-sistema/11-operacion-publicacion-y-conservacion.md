# 11. Operación, publicación y conservación del MVP

Fecha: 19 de noviembre de 2026. Incorpora las decisiones del usuario sobre estados, seguimiento, mapa, alertas, prioridad, registro ciudadano y fotografías. Los valores de retención y parámetros indicados como «valor inicial» son decisiones técnicas adoptadas para el piloto, configurables y auditables; no plazos legales atribuidos a las instituciones.

## 1. Registro ciudadano y contactos

Registro: nombre, correo y contraseña. No exigir DNI. El teléfono es opcional en el perfil, no otro campo obligatorio al reportar; compartirlo con una institución requiere autorización explícita y acceso limitado al caso asignado. No publicarlo ni incluirlo en notificaciones. Recuperar acceso por correo mediante token de un solo uso y con vencimiento; canal acordado; proveedor y remitente de piloto: Gmail API por HTTPS con una cuenta dedicada (cuota publicada de 500 correos al día, límite propio de 400), porque el SMTP de Gmail está bloqueado desde Render Free (comprobado el 21/11/2026); falta verificar el envío desde el entorno desplegado. Mantener la misma política para activación del operador sin distribuir contraseñas compartidas.

La sesión identifica al autor. El ciudadano puede reportar sin fotografía y con ubicación pendiente. La categoría «Otra emergencia» se asigna a **Serenazgo** y requiere que la descripción aclare qué emergencia no está categorizada; no agregar un segundo campo narrativo ni una categoría nueva. Si faltan distrito o sede habilitada, el administrador resuelve la asignación con metadatos suficientes y sin acceso sanitario adicional.

En esa categoría, el campo existente de descripción muestra «¿Qué otra emergencia está ocurriendo?». La API exige texto no vacío según su política de longitud; el operador verifica que explique el hecho. No usar un clasificador semántico ni bloquear automáticamente por palabras desconocidas. Una designación administrativa por territorio pendiente no inventa coordenadas ni permite acceso fuera del caso asignado.

## 2. Reporte, incidente y participación institucional

El reporte conserva el envío original. La revisión operativa no sobrescribe la categoría, evaluación ni evidencias originales; registra correcciones con autor, fecha y motivo. El incidente agrupa uno o varios reportes validados. Las personas notificadas, la institución coordinadora y las actuaciones son relaciones del caso, no copias del reporte para cada entidad.

| Estado del reporte | Entrada o transición | Qué se muestra al autor |
|---|---|---|
| REGISTRADO | Transacción de envío confirmada. | Identificador, momento de recepción y seguimiento pendiente. |
| EN_REVISION | Un operador autorizado inicia su revisión. | Revisión en curso e institución asignada. |
| VALIDADO | El operador confirma el hecho; crea o vincula un incidente. | Enlace al seguimiento de ese incidente y categoría revisada. No significa atención física confirmada. |
| DESCARTADO | El operador descarta con motivo. | Estado y explicación comprensible; conservar la decisión auditada. |

No descartar por falta de foto, respuestas SAMU desconocidas o falta temporal de cobertura. Un posible duplicado se vincula al mismo incidente tras revisión, sin borrar autoría ni presentarlo como falso. La consolidación no es otro estado del reporte.

| Estado del incidente | Transición autorizada |
|---|---|
| PENDIENTE_ATENCION | Creación al validar el primer reporte. Los avisos provisionales ya pueden existir antes. |
| EN_ATENCION | La institución principal registra el inicio de gestión con una actuación. Las entidades de apoyo registran su participación independientemente. |
| CERRADO | La institución principal registra motivo y resumen ciudadano de cierre. No cerrar por el simple hecho de derivar o notificar; la atención externa debe registrarse de forma explícita. |

La principal coordina y cierra el caso; cada institución registra solo sus propias actuaciones. Una intervención urgente comunicada durante la revisión se registra de inmediato sin esperar la publicación; al validar, se enlaza al incidente y su estado refleja las actuaciones ya registradas. Registrar inicio de gestión no equivale a confirmar llegada al lugar. Solo registrar movilización, llegada o atención si el operador puede acreditarlas dentro de sus funciones.

Correcciones de un descarte o reapertura de un incidente cerrado requieren motivo, operador competente de la principal y trazabilidad. Reabrir crea una nueva revisión/etapa de atención; no restaura información ya eliminada por conservación. Las reasignaciones por ausencia de cobertura o sede las realiza el administrador con motivo, sin tomar decisiones clínicas. Una reasignación no borra las actuaciones de la institución anterior.

En accidentes con heridos, el usuario solicita **prioridad para la atención médica del SAMU**, con apoyo PNP o, si la PNP no puede atender, Serenazgo. Registrar la imposibilidad de apoyo de PNP y su reemplazo con motivo; no deducir indisponibilidad por una notificación sin leer ni inventar un tiempo de respuesta. La app no garantiza el orden de llegada de unidades. Los avisos se crean sin exigir que otra institución confirme primero; la coordinación operativa no debe serializar notificaciones de emergencia.

La regla confirmada cambia también la principal del expediente: **SAMU es principal si hay heridos o necesidad médica informada; PNP es apoyo**. Sin heridos ni necesidad médica, **PNP es principal y no se avisa a SAMU**. Si los datos son desconocidos, registrar revisión médica pendiente y avisar inicialmente a PNP; no interpretar desconocido como respuesta negativa ni confirmar que SAMU haya recibido aviso. El operador puede precisar las condiciones y activar SAMU después. La pregunta adicional «¿Se necesita atención médica?» usa Sí/No/No sé y no exige diagnóstico al ciudadano.

### Asumir caso: un responsable por institución

Los operadores autorizados pueden consultar la bandeja y ver quién es responsable dentro de su institución. Para realizar actuaciones o transiciones, uno debe pulsar **«Asumir caso»**. Mantener una sola asignación activa por caso e institución; las instituciones de apoyo tienen sus propios responsables. Asumir no cambia por sí solo el estado a EN_ATENCION ni acredita movilización de unidades.

La adquisición se verifica y persiste en una transacción con restricción de unicidad o bloqueo equivalente. Dos operadores que pulsan al mismo tiempo no pueden quedar asignados: uno obtiene el caso y el otro recibe conflicto con la asignación actual. Repetir la solicitud por el mismo responsable devuelve su asignación vigente sin duplicarla. No confiar únicamente en deshabilitar el botón en el cliente.

Antes de validar, la asignación se vincula al reporte en revisión; al crear o vincular un incidente, conservar historial y trasladarla a su participación institucional. Si el incidente consolidado ya tiene otro responsable activo en esa institución, conservar ese responsable y resolver la transferencia auditada, sin crear una segunda asignación vigente. Compartir un ID de incidente no concede acceso a reportes privados de otros autores.

El responsable puede solicitar transferencia de turno. El administrador puede liberar/reasignar con motivo a otro operador activo, competente y autorizado de la misma institución; no necesita acceso al detalle sanitario para ello. No liberar automáticamente por cerrar el navegador ni por perder conexión. Deshabilitar una cuenta o sede deja una tarea visible de reasignación. El nuevo responsable y los anteriores quedan en el historial.

Si nuevas observaciones activan SAMU como principal en un accidente ya asignado a PNP, actualizar principal y permisos de cierre de forma atómica y auditada. El responsable PNP conserva su participación de apoyo; SAMU debe asumir su participación. Hasta entonces el caso no se considera atendido por SAMU ni se pierde el responsable PNP. La principal vigente coordina cierre y reapertura; el cambio de principal no borra actuaciones anteriores.

## 3. Seguimiento ciudadano

El autor ve estado de su reporte, incidente vinculado, institución responsable, fecha de recepción, resumen público para el autor de actuaciones y motivos de descarte/cierre. La vista es privada y puede ser más detallada que el mapa público. No muestra nombres/cuentas de operadores, notas internas, credenciales, información de otros reportantes ni fichas sanitarias ajenas. El autor conserva acceso a su propia evaluación mientras siga retenida según la sección 7.

## 4. Bandeja por llegada y etiquetas de prioridad

La bandeja de pendientes usa **orden de llegada: más antiguos primero**, con desempate por ID. Cambiar prioridad no altera silenciosamente ese orden. El operador puede filtrar por estado, distrito, categoría y etiqueta; si se habilita otro orden debe mostrarse expresamente como una selección del usuario.

La prioridad es una etiqueta operativa asignada/revisada por un operador: **Sin evaluar** (gris, icono reloj), **Normal** (azul, icono información), **Alta** (ámbar, icono alerta) y **Urgente** (rojo, icono alarma). Son valores iniciales del diseño, no un triaje clínico. Combinar texto, icono y color; no depender solo del color. Al registrar, queda **Sin evaluar**; no asumir normalidad si hay respuestas desconocidas.

Conservar el mecanismo de sugerencias mediante reglas explícitas como opción de evolución deshabilitada inicialmente; ninguna regla médica automática decide el despacho. El operador asigna etiqueta con motivo y fecha. Análisis permanece para correlación por categoría, distancia y tiempo; los parámetros de duplicados aún deben definirse. No bloquear la creación de avisos por esperar prioridad o análisis.

## 5. Publicación y mapa ciudadano

Solo se publica un incidente validado con autorización expresa de un operador competente. Una institución principal puede retirar publicación inmediatamente con motivo. Mostrar categoría pública, distrito, zona aproximada, estado publicable y antigüedad; nunca la descripción original, fotografías, identidad, teléfono ni fichas de evaluación rápida.

Valor inicial: **Acoso, Violencia, Agresión y Emergencia médica** no muestran puntos individuales. Se pueden incluir únicamente en conteos por distrito y mes cuando haya al menos cinco incidentes en el grupo y la agregación no permita identificar personas; si no se cumple, suprimir el grupo. Para las otras categorías, usar zonas aproximadas de 300 metros y mostrar que son aproximaciones; respetar el distrito real, sin calcularlo desde la posición generalizada. El operador puede marcar reservado cualquier caso adicional.

Un incidente cerrado deja de generar alertas preventivas y sale del mapa activo. Valor inicial de publicación: hasta siete días desde la ocurrencia o hasta el cierre/retiro, lo que suceda primero; no renovar la antigüedad por agregar otro reporte al mismo caso. El historial identificable no es público. Datos originales y seguimiento del autor siguen sujetos a sus permisos y plazos de conservación.

## 6. Alertas preventivas: distritos y cercanía

Cada ciudadano puede activar ambas modalidades, elegir categorías y desactivar todas las alertas preventivas. Mantener el seguimiento de sus propios reportes como preferencia independiente. Rechazar permiso de notificaciones no impide reportar ni consultar la bandeja en la app.

- **Por distrito:** suscripción a uno o varios de los cinco distritos. No exige compartir ubicación.
- **Por cercanía:** valor inicial de radio 1 km respecto de la última ubicación compartida voluntariamente, válida por un máximo de 24 horas; no rastreo continuo ni obtención en segundo plano implícita. Mostrar cuándo se actualizó y permitir borrarla. Si caduca, pedir actualización al abrir la app; no usarla para nuevos avisos de proximidad. Las suscripciones por distrito permanecen activas.
- Aplicar permisos, categorías seleccionadas y autorización de publicación antes de resolver destinatarios. Si coinciden distrito y cercanía, generar un solo aviso por usuario/incidente y versión relevante. La proximidad se calcula en el backend con coordenadas restringidas; la notificación muestra solo zona aproximada.
- Valor inicial: alertar al publicarse un incidente ocurrido en las últimas 24 horas. No reenviar solo por cada sondeo; una actualización requiere hecho relevante documentado. La caducidad se verifica también al entregar, evitando avisos preventivos obsoletos después de una suspensión. El polling del panel no es una alerta ciudadana ni exige ubicación personal del operador.

## 7. Fotografías, conservación y eliminación

Máximo **3 fotografías de hasta 5 MB cada una**, sin videos ni documentos. Usar JPEG, PNG o WebP; convertir HEIC/HEIF en el cliente cuando sea posible o explicar el formato admitido. Verificar formato real y tamaño también en la API; eliminar EXIF/GPS de la copia almacenada por el MVP y comprimir en el dispositivo para reducir transferencia. No describir estas imágenes normalizadas como originales forenses. No habilitar carga pública ni presets sin autorización del servidor. Los límites de cuota del proveedor pueden impedir adjuntar más fotos; ofrecer enviar sin ellas sin borrar reportes confirmados.

### Plazos iniciales adoptados para el piloto

| Dato | Conservación normal | Acción al vencer |
|---|---|---|
| Reporte validado, incidente, seguimiento y actuaciones no sanitarias | Mientras el incidente esté abierto y 12 meses después del cierre final. | Eliminar contenido y datos identificables; conservar solo agregados realmente anónimos si sirven al análisis. |
| Fotografías y sus derivados | Mientras el caso esté abierto y 90 días desde el cierre. | Bloquear consultas y eliminar archivos/derivados del proveedor y referencias de acceso. Conservar una marca sin contenido de que existió evidencia eliminada por plazo. |
| Evaluación rápida y aclaraciones sanitarias | Mientras el caso esté abierto y 30 días desde el cierre. | Eliminar fichas, versiones y respuestas sanitarias, incluidos los datos copiados indebidamente a descripciones o notas. No conservar una copia en logs/proyecciones. |
| Reporte descartado y adjuntos | 30 días desde el descarte firme. | Eliminar contenido, imágenes y evaluación; conservar solo evento de decisión sin narrativa sensible en la auditoría. |
| Carga de foto sin reporte asociado | 24 horas desde la carga. | Bloquear asociación/consulta y eliminar como huérfana. |
| Auditoría de acceso y decisiones | 12 meses desde cada evento. | Eliminar según plazo; no incluir imágenes, respuestas sanitarias, descripciones completas ni teléfonos. Los ID se consideran restringidos, no datos automáticamente anónimos. |
| Avisos en bandeja y tokens | Avisos hasta 90 días; tokens mientras sean válidos/autorizados. | Eliminar avisos vencidos y retirar tokens al revocarse permiso/cerrar sesión en el dispositivo o notificarse su invalidez. El seguimiento se consulta por separado. |
| Backups que contengan datos eliminados | Rotación máxima de 30 días. | Expirar copias y reaplicar el registro de eliminaciones antes de permitir accesos tras restaurar. |

Los plazos se cuentan por fecha de cierre del incidente vinculado; consolidar no reinicia un reloj. En reapertura antes de la eliminación, recalcular solo lo que siga existiendo, sin restaurar datos borrados. Revisar mensualmente casos sin cierre que superen 90 días para evitar conservación abierta indefinida: documentar finalidad y próximo control o cerrar cuando proceda. No cerrar automáticamente una emergencia por ahorrar almacenamiento.

**Motivo de esta elección:** 90 días para fotos limita el consumo multimedia y permite un margen de seguimiento; 30 días para observaciones sanitarias reduce su exposición; 12 meses para el expediente operativo permite revisar el piloto sin almacenar indefinidamente. El principio de conservación limitada a la finalidad figura en el [material oficial del MINJUSDH sobre protección de datos](https://cdn.www.gob.pe/uploads/document/file/7633280/6472057-reglamento-de-la-ley-de-proteccion-de-datos-personales-principio-de-responsabilidad-proactiva.pdf?v=1739549541). Esa fuente no impone estos números: son la política técnica inicial del proyecto. Antes de uso institucional real, contrastar finalidad, base de tratamiento, obligaciones de archivo y solicitudes de titulares con los responsables participantes.

Una conservación excepcional por requerimiento documentado o controversia debe identificar alcance, fundamento, responsable y vencimiento/revisión; restringir esos datos y revisar al menos cada 30 días. No permitir retención indefinida por un checkbox del administrador ni ampliar silenciosamente la conservación de todos los casos.

Al vencer el plazo, el backend rechaza acceso aunque la eliminación física esté pendiente. Ejecutar limpieza por lotes al arrancar y mientras la API esté activa; persistir tareas y reintentos. Render suspendido no garantiza borrado físico en una hora exacta: supervisar pendientes y no habilitar datos reales sin un mecanismo que permita cumplir los plazos operativos de borrado. Las URLs de acceso nunca deben durar más que el permiso/plazo restante.

No se asume que el plan gratuito incluya backups adecuados. La rotación, la exportación cifrada y una restauración probada deben configurarse y validarse antes de usar datos reales; si no se consigue dentro del presupuesto, limitar el piloto a datos ficticios en lugar de afirmar que existe recuperación garantizada.

## 8. Pendientes concretos

Se acordaron cinco nombres distritales, pero faltan geometrías/UBIGEO y coberturas de las sedes. Las sedes candidatas no acreditan operación. Siguen pendientes la verificación del proveedor de correo desde el entorno desplegado, validación de almacenamiento privado/backup, parámetros de correlación y confirmación de disponibilidad real de operadores. La principal condicionada y aviso SAMU en accidentes, así como «Asumir caso», ya están definidos.
