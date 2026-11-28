# 11. Operación, publicación y conservación del MVP

Fecha: 19 de noviembre de 2026. Incorpora las decisiones del usuario sobre estados, seguimiento, mapa, alertas, prioridad, registro ciudadano y fotografías. Los valores de retención y parámetros indicados como «valor inicial» son decisiones técnicas adoptadas para el piloto, configurables y auditables; no plazos legales atribuidos a las instituciones.

## 1. Registro ciudadano y contactos

Registro de cuenta: nombre, correo y contraseña, sin DNI obligatorio. Con cuenta, el teléfono es opcional en el perfil, no se solicita de nuevo al reportar y compartirlo requiere autorización explícita. Como invitado, el teléfono de contacto es obligatorio para enviar (decisión 23/11/2026); explicar su finalidad y acceso limitado a personal competente del caso. No implica identidad verificada ni se publica, se incluye en notificaciones o permite consultar seguimiento por sí solo. Recuperar acceso a cuentas por correo mediante token de un solo uso y vencimiento; proveedor de piloto Gmail API por HTTPS con cuenta dedicada, con verificación desde Render pendiente. Mantener la activación de operadores sin distribuir contraseñas compartidas.

El ciudadano puede enviar como invitado o con cuenta. La sesión identifica al autor con cuenta; para el invitado se registra esa modalidad sin inventar identidad ni rol. No se incorpora el envío a una cuenta por coincidencia de correo, teléfono o dispositivo. El invitado consulta estado y resumen ciudadano con código secreto según sección 3, sin vinculación posterior a cuenta. Puede enviar sin fotografía, pero necesita un punto confirmado por GPS autorizado o selección manual; no se admite ubicación pendiente. El distrito puede quedar pendiente por frontera o cobertura. «Otra emergencia» se asigna a Serenazgo y requiere descripción concreta sin otro campo narrativo. Si faltan distrito o sede habilitada, el administrador resuelve la asignación con metadatos suficientes y sin acceso sanitario adicional.

En esa categoría, el campo existente de descripción muestra «¿Qué otra emergencia está ocurriendo?». La API exige texto no vacío según su política de longitud; el operador verifica que explique el hecho. No usar un clasificador semántico ni bloquear automáticamente por palabras desconocidas. Una designación administrativa por territorio pendiente no inventa coordenadas ni permite acceso fuera del caso asignado.

## 2. Reporte, incidente y participación institucional

**Decisión del 23 de noviembre de 2026:** cada envío confirmado crea directamente un incidente, sin una entidad Reporte independiente que deba validarse antes de crear el caso. «Reportar» sigue siendo la acción ciudadana. Se conservan los datos originales del envío y todas sus correcciones con actor, fecha y motivo; la modalidad invitado no elimina esa trazabilidad. Las personas notificadas, la institución coordinadora y las actuaciones son relaciones del caso, no copias para cada entidad.

Esta decisión sustituye el modelo anterior de cuatro estados de reporte y tres estados de incidente. Etapas operativas confirmadas el 23/11/2026: **REGISTRADO → EN_REVISION → EN_ATENCION → CERRADO**. No se incorporan estados Asignado, En camino ni Resuelto. Verificar el hecho es una decisión separada del estado operativo: no crea un segundo caso ni acredita llegada al lugar. La publicación sigue siendo expresa y restringida a hechos verificados y autorizados. El descarte permite cerrar desde la revisión sin simular una etapa de atención; no añade otro estado terminal.

| Estado | Significado |
|---|---|
| REGISTRADO | Envío persistido y confirmado por el servidor; no implica verificación ni atención. |
| EN_REVISION | Un operador autorizado inicia la revisión del incidente. |
| EN_ATENCION | La principal registra inicio de gestión; no implica llegada física. |
| CERRADO | La principal registra cierre con motivo y resumen ciudadano, distinguiendo resultado Atendido o Descartado. |

No descartar por falta de foto, respuestas SAMU desconocidas o falta temporal de cobertura. El descarte requiere decisión de un operador competente, motivo y resumen ciudadano; registra CERRADO con resultado DESCARTADO. Se distingue de CERRADO con resultado ATENDIDO en seguimiento e indicadores: un descarte no cuenta como atención realizada. No transitar artificialmente por EN_ATENCION para descartar.

**Duplicados, decisión 23/11/2026:** un operador competente vincula los casos del mismo hecho a un incidente principal para coordinar su atención. Cada envío creó inicialmente un incidente y conserva su identificador, originales, autoría o modalidad invitado, código de consulta cuando corresponda e historial; no se agrega una entidad Reporte con ciclo separado. El seguimiento de cada envío refleja la coordinación con el principal, sin revelar datos privados de los demás informantes. La vinculación es auditada y no implica falsedad, descarte ni cierre como atendido. Evitar ciclos y cadenas ambiguas; resolver responsables activos y permisos de forma transaccional sin duplicar la atención. Solo se comparten los datos que autoricen los permisos vigentes, no todos los adjuntos por pertenecer al mismo grupo.

La principal coordina y cierra el caso; cada institución registra solo sus propias actuaciones. Una intervención urgente comunicada durante la revisión se registra de inmediato sobre el incidente, sin esperar verificación ni publicación. Registrar inicio de gestión no equivale a confirmar llegada al lugar. Solo registrar movilización, llegada o atención si el operador puede acreditarlas dentro de sus funciones.

Correcciones de un descarte o reapertura de un incidente cerrado requieren motivo, operador competente de la principal y trazabilidad. Reabrir crea una nueva revisión/etapa de atención; no restaura información ya eliminada por conservación. Las reasignaciones por ausencia de cobertura o sede las realiza el administrador con motivo, sin tomar decisiones clínicas. Una reasignación no borra las actuaciones de la institución anterior.

En accidentes con heridos, el usuario solicita **prioridad para la atención médica del SAMU**, con apoyo PNP o, si la PNP no puede atender, Serenazgo. Registrar la imposibilidad de apoyo de PNP y su reemplazo con motivo; no deducir indisponibilidad por una notificación sin leer ni inventar un tiempo de respuesta. La app no garantiza el orden de llegada de unidades. Los avisos se crean sin exigir que otra institución confirme primero; la coordinación operativa no debe serializar notificaciones de emergencia.

La regla confirmada cambia también la principal del expediente: **SAMU es principal si hay heridos o necesidad médica informada; PNP es apoyo**. Sin heridos ni necesidad médica, **PNP es principal y no se avisa a SAMU**. Si los datos son desconocidos, registrar revisión médica pendiente y avisar inicialmente a PNP; no interpretar desconocido como respuesta negativa ni confirmar que SAMU haya recibido aviso. El operador puede precisar las condiciones y activar SAMU después. La pregunta adicional «¿Se necesita atención médica?» usa Sí/No/No sé y no exige diagnóstico al ciudadano.

### Asumir caso: un responsable por institución

Los operadores autorizados pueden consultar la bandeja y ver quién es responsable dentro de su institución. Para realizar actuaciones o transiciones, uno debe pulsar **«Asumir caso»**. Mantener una sola asignación activa por caso e institución; las instituciones de apoyo tienen sus propios responsables. Asumir no cambia por sí solo el estado a EN_ATENCION ni acredita movilización de unidades. Confirmado el 23/11/2026: la toma inicial corresponde al operador; el administrador puede liberar o reasignar con motivo como excepción administrativa, sin adquirir permisos de atención. No se incorpora asignación inicial directa por el administrador como flujo ordinario.

**Asignación automática al operador único, decisión del 27/11/2026 (opción B):** si la única sede de la institución principal que participa en el incidente tiene exactamente un operador activo, el sistema le asigna el caso al enrutarlo o cuando esa institución pasa a ser principal (designación, reevaluación o cambio por condición médica), y el incidente pasa de REGISTRADO a EN_REVISION en la misma transacción. La asignación queda en el historial con actor «sistema» y origen automático. Con varias sedes de la principal o varios operadores activos se mantiene la toma manual («Tomar el caso»), porque el sistema no conoce quién está de turno. La asignación automática no acredita lectura, movilización ni atención; el operador puede ser liberado o reasignado por el administrador con motivo, como cualquier asignación. Las instituciones de apoyo siguen tomando su participación manualmente.

La adquisición se verifica y persiste en una transacción con restricción de unicidad o bloqueo equivalente. Dos operadores que pulsan al mismo tiempo no pueden quedar asignados: uno obtiene el caso y el otro recibe conflicto con la asignación actual. Repetir la solicitud por el mismo responsable devuelve su asignación vigente sin duplicarla. No confiar únicamente en deshabilitar el botón en el cliente.

La asignación se vincula desde el comienzo al incidente y a su participación institucional; no se traslada de Reporte a Incidente al verificarlo. Al vincular duplicados, conservar responsables e historial y resolver transferencias de forma auditada para mantener un responsable activo por institución en la atención coordinada. Compartir un ID de incidente no concede acceso a datos privados de otros informantes.

El responsable puede solicitar transferencia de turno. El administrador puede liberar/reasignar con motivo a otro operador activo, competente y autorizado de la misma institución; no necesita acceso al detalle sanitario para ello. No liberar automáticamente por cerrar el navegador ni por perder conexión. Deshabilitar una cuenta o sede deja una tarea visible de reasignación. El nuevo responsable y los anteriores quedan en el historial.

Si nuevas observaciones activan SAMU como principal en un accidente ya asignado a PNP, actualizar principal y permisos de cierre de forma atómica y auditada. El responsable PNP conserva su participación de apoyo; SAMU debe asumir su participación. Hasta entonces el caso no se considera atendido por SAMU ni se pierde el responsable PNP. La principal vigente coordina cierre y reapertura; el cambio de principal no borra actuaciones anteriores.

## 3. Seguimiento ciudadano

**Invitado, decisión 23/11/2026:** puede consultar únicamente estado y resumen ciudadano mediante un código secreto, diferente de la referencia pública. El código no permite acceder a notas internas, evidencias, datos personales o evaluación sanitaria. No se incluye vinculación posterior con una cuenta. Su posesión autoriza solo esta vista limitada: no identifica civilmente al informante. No incluir el secreto en referencias públicas, logs ni enlaces del mapa. Generación, almacenamiento protegido, vigencia y límites de intentos se concretarán como controles técnicos antes de implementar.

El ciudadano con cuenta ve el estado del incidente que informó, institución responsable, fecha de recepción, resumen ciudadano de actuaciones y motivos de descarte/cierre. La vista es privada y puede ser más detallada que el mapa público. No muestra nombres/cuentas de operadores, notas internas, credenciales, información de otros informantes ni fichas sanitarias ajenas. El autor conserva acceso a su propia evaluación mientras siga retenida según la sección 7. El invitado accede solo a estado y resumen ciudadano mediante código secreto, según lo definido arriba; el identificador público no concede acceso privado.

## 4. Bandeja por llegada y etiquetas de prioridad

La bandeja de pendientes usa **orden de llegada: más antiguos primero**, con desempate por ID. Cambiar prioridad no altera silenciosamente ese orden. El operador puede filtrar por estado, distrito, categoría y etiqueta; si se habilita otro orden debe mostrarse expresamente como una selección del usuario.

Decisión del 23/11/2026: la categoría **propone una prioridad inicial**, que el operador confirma o corrige con motivo y fecha. La etiqueta propuesta se distingue de la revisada por una persona. Conservar el valor inicial, origen, versión de configuración y cambios auditados. Las etiquetas son **Sin evaluar** (gris, icono reloj), **Normal** (azul, icono información), **Alta** (ámbar, icono alerta) y **Urgente** (rojo, icono alarma), siempre con texto e icono además de color. Si falta configuración válida, queda Sin evaluar; no asumir Normal. La tabla de prioridades por categoría debe cerrarse antes de activar esta función.

La propuesta por categoría no es triaje clínico ni decide despacho; no interpreta respuestas sanitarias desconocidas como negativas. No reordena la bandeja FIFO ni bloquea registro o avisos. Análisis conserva correlación por categoría, distancia y tiempo; los parámetros de duplicados aún deben definirse. No se importa la tabla de prioridades del origen sin revisarla.

**Configuración acordada, respuesta 16B confirmada el 23/11/2026:** mantener la tabla inicial aprobada de las 16 categorías como configuración versionada, con versión, fecha y trazabilidad. No se incorpora edición libre de esa tabla desde el panel. Al crear un incidente, su categoría propone el valor aprobado; el operador competente puede confirmarlo, elevarlo o reducirlo con motivo e historial. No interpretar la tabla como escala clínica. Si la configuración falta o es inválida, utilizar Sin evaluar. Cambiar categoría no sobrescribe silenciosamente una prioridad ya revisada por una persona: conservar decisiones y solicitar confirmación cuando corresponda.

### Tabla inicial de prioridades — aprobada el 23/11/2026

Tabla revisada y aprobada explícitamente por el responsable el 23/11/2026, incluida la facultad del operador de elevar o reducir la prioridad. Sustituye la copia inicial del seed: iguala Agresión y Asalto en Alta e incorpora Urgente en Emergencia médica e Incendio. Es una configuración operativa de AyniSafe, no una escala clínica ni una clasificación institucional acreditada. La agrupación por etiqueta en este documento no cambia FIFO. Versión documental inicial: prioridad-categoria-v1; su implementación ejecutable sigue pendiente.

| Categoría | Prioridad inicial aprobada |
|---|---|
| Emergencia médica | Urgente |
| Incendio | Urgente |
| Accidente de tránsito | Alta |
| Acoso | Alta |
| Agresión | Alta |
| Asalto | Alta |
| Daños por sismo | Alta |
| Deslizamiento | Alta |
| Inundación | Alta |
| Pelea | Alta |
| Robo | Alta |
| Violencia | Alta |
| Actividad sospechosa | Normal |
| Otra emergencia | Normal |
| Otro incidente de seguridad | Normal |
| Vandalismo | Normal |

Justificación de la propuesta: usar Urgente como etiqueta inicial para las dos categorías explícitas de emergencia médica/incendio; Alta para categorías de violencia, afectación personal o eventos físicos que ameritan revisión operativa destacada; Normal para señales o categorías amplias sin gravedad determinada por el nombre. Normal no significa seguro ni sin riesgo: un caso de cualquier categoría puede requerir corrección a Alta o Urgente. Esta tabla no estima gravedad individual; el operador confirma o corrige con motivo a partir de la información disponible. Las observaciones sanitarias desconocidas no se convierten en condiciones normales ni generan reglas clínicas automáticas.

Sin configuración válida se mantiene Sin evaluar. No introducir Baja como equivalente: son conceptos diferentes. La prioridad propuesta no altera FIFO ni determina despacho. «Otra emergencia» puede contener situaciones graves: la etiqueta inicial Normal nunca sustituye su revisión ni impide elevarla.

La prioridad se copia de la categoría al crear el incidente en el origen y puede cambiar por revisión. La migración inspeccionada modifica valores de categorías, sin actualizar las prioridades de incidentes ya creados. Esto permite que registros de la misma categoría tengan valores diferentes; la captura no prueba por sí sola cuál es el valor inicial vigente ni por qué cambió una fila concreta.

**Aprobación registrada:** «apruebo y el operador puede elevarlo o reducirlo». El cambio individual registra valor anterior/nuevo, operador, fecha y motivo; no modifica la tabla por categoría ni reordena la bandeja FIFO. La implementación versionará esta configuración sin reescribir prioridades históricas o ya revisadas. Aprobación documental no equivale a funcionalidad implementada ni probada.

## 5. Publicación y mapa ciudadano

Solo se publica un incidente validado con autorización expresa de un operador competente. Una institución principal puede retirar publicación inmediatamente con motivo. Mostrar categoría pública, distrito, zona aproximada, estado publicable y antigüedad; nunca la descripción original, fotografías, identidad, teléfono ni fichas de evaluación rápida.

Valor inicial: **Acoso, Violencia, Agresión y Emergencia médica** no muestran puntos individuales. Se pueden incluir únicamente en conteos por distrito y mes cuando haya al menos cinco incidentes en el grupo y la agregación no permita identificar personas; si no se cumple, suprimir el grupo. Para las otras categorías, usar zonas aproximadas de 300 metros y mostrar que son aproximaciones; respetar el distrito real, sin calcularlo desde la posición generalizada. El operador puede marcar reservado cualquier caso adicional.

Un incidente cerrado deja de generar alertas preventivas y sale del mapa activo. Valor inicial de publicación: hasta siete días desde la ocurrencia o hasta el cierre/retiro, lo que suceda primero; no renovar la antigüedad por agregar otro reporte al mismo caso. El historial identificable no es público. Datos originales y seguimiento del autor siguen sujetos a sus permisos y plazos de conservación.

**Precisiones de P7, decisión del 27/11/2026.** Concretan esta sección sin cambiar sus valores iniciales.

- **Quién publica.** Publica el responsable asignado de la institución principal, el mismo que verifica y cierra. Solo puede publicar si el incidente está VERIFICADO y abierto (EN_REVISION o EN_ATENCION), no está vinculado como duplicado, tiene el distrito resuelto y ocurrió hace menos de siete días.
- **Quién retira.** Retira, con motivo, cualquier operador activo de la principal.
- **Sin publicación del administrador.** El administrador no publica ni retira.
- **Retiro automático.** El sistema retira la publicación, en la misma operación, en tres casos:
  - al cerrar el incidente;
  - al corregir la verificación a NO_VERIFICADO;
  - al vincularlo como duplicado.

  Republicar exige otra autorización y conserva el vencimiento original.
- **Zona aproximada.** Se calcula con una cuadrícula fija de 300 m y se publica el centro de la celda, nunca el punto. Se guarda al publicar una instantánea con solo:
  - la categoría;
  - el distrito real;
  - la celda;
  - la ocurrencia y el vencimiento.
- **Categorías sensibles y casos reservados.** Sus conteos por distrito y mes excluyen las publicaciones retiradas por decisión o por NO_VERIFICADO. Cuentan juntos, sin revelar la categoría.
- **Mapas.**
  - **Mapa público:** está en la app.
  - **Mapa operativo del panel:** es una consulta autorizada, distinta del mapa público. Muestra al operador el punto exacto solo de los incidentes en que participa su sede dentro de su ámbito. No es público ni lo ve el administrador.
- **Teselas.** El proveedor por defecto es OpenStreetMap estándar, con atribución visible, Referer o User-Agent identificable y sin precarga masiva. Es configurable; su cuota no es contractual. Si falla, siguen la lista, los filtros y los límites distritales.

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

Evaluación sanitaria, decisión 23/11/2026: se simplifica a una persona principal, conservando cantidad total de heridos conocida/desconocida y preguntas con «No sé». Sin fichas múltiples ni extrapolación a otros afectados. Se mantienen versiones, acceso de SAMU competente y del autor autenticado, y exclusión de datos sanitarios del mapa, notificaciones y consulta del invitado. Pendiente de implementación.

Se acordaron cinco nombres distritales, pero faltan geometrías/UBIGEO y coberturas de las sedes. Las sedes candidatas no acreditan operación. Siguen pendientes la verificación del proveedor de correo desde el entorno desplegado, backup (el almacenamiento privado de fotos se validó en Cloudinary el 27/11/2026 con el spike de P5.2; ver `docs/validacion/p5-evidencias.md`), parámetros de correlación y confirmación de disponibilidad real de operadores. La principal condicionada y aviso SAMU en accidentes, así como «Asumir caso», ya están definidos.
