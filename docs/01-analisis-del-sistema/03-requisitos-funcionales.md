# 03. Requisitos funcionales

| ID | Requisito funcional | Historias de usuario relacionada |
|---|---|---|
| RF01 | El sistema debe permitir autorregistro ciudadano con nombre, correo y contraseña, sin DNI obligatorio y con teléfono opcional en perfil; el alta de administradores es controlada y la de operadores corresponde al administrador. | HU01 |
| RF02 | El sistema debe permitir el inicio de sesión de los usuarios registrados. | HU01 |
| RF03 | El sistema debe recuperar acceso mediante correo con token de un solo uso y vencimiento. Proveedor y remitente de piloto: Gmail API (HTTPS) con cuenta dedicada, porque el SMTP de Gmail está bloqueado desde Render Free; su verificación en el entorno desplegado sigue pendiente. | HU01 |
| RF04 | El sistema debe permitir al ciudadano editar la información básica de su perfil desde la app. | HU18 |
| RF05 | El sistema debe gestionar permisos diferenciados para exactamente tres roles: ciudadano, administrador y operador. «Personal autorizado» significa operador. La API debe aplicar permisos por propiedad, institución, sede, categoría y cobertura territorial. | HU01, HU07, HU11 |
| RF06 | El sistema debe permitir registrar reportes de seguridad y emergencias con una de las 16 categorías del catálogo inicial, especificando su categoría, descripción, fecha y hora de ocurrencia. | HU02 |
| RF07 | El sistema debe incorporar la ubicación georreferenciada del incidente únicamente con autorización del usuario. | HU03 |
| RF08 | El sistema debe permitir adjuntar las evidencias admitidas por la plataforma a un reporte. | HU03 |
| RF09 | El sistema debe asignar un identificador único y un estado inicial a cada reporte registrado. | HU02 |
| RF10 | El sistema debe permitir al autor consultar el estado y seguimiento de sus reportes. | HU04 |
| RF11 | El sistema debe permitir al operador confirmar o corregir la categoría seleccionada por el ciudadano, registrando el motivo, el actor y el cambio. | HU08 |
| RF12 | El sistema debe permitir al operador asignar o modificar una etiqueta de prioridad con texto, color e icono, motivo y fecha. El valor inicial es Sin evaluar y la bandeja conserva el orden de llegada. | HU08, HU26 |
| RF13 | El sistema debe comparar categoría, distancia y ventana temporal mediante parámetros configurables para sugerir posibles relaciones o duplicados; el operador confirma si corresponden al mismo incidente. | HU09 |
| RF14 | El sistema debe permitir a los operadores revisar y validar los reportes registrados. | HU07 |
| RF15 | El sistema debe permitir a los operadores consolidar los reportes relacionados con un mismo incidente. | HU09 |
| RF16 | El sistema debe permitir a los operadores descartar reportes que no correspondan a incidentes válidos. | HU07 |
| RF17 | El sistema debe registrar las actuaciones realizadas, los responsables autorizados, las fechas y los cambios de estado de cada incidente para mantener su trazabilidad. | HU10 |
| RF18 | El sistema debe distribuir alertas preventivas de incidentes publicables por distritos elegidos y/o cercanía a la última ubicación consentida vigente, respetando categorías, desactivación y deduplicación por usuario. | HU06, HU25 |
| RF19 | El sistema debe notificar los cambios relevantes en el estado de los incidentes a los usuarios interesados, cuando corresponda. | HU13 |
| RF20 | El sistema debe mostrar los incidentes recientes y activos en un mapa interactivo, con límites distritales y filtros combinables por distrito, categoría y período, presentando únicamente la información autorizada para consulta pública. | HU05 |
| RF21 | El sistema debe presentar indicadores agregados e históricos de los incidentes registrados, organizados por zona geográfica, categoría, día y franja horaria. | HU12 |
| RF22 | El administrador debe gestionar cuentas y asignar únicamente los tres roles definidos, sin autorregistro privilegiado. | HU11 |
| RF23 | El sistema debe conservar las 16 categorías iniciales y permitir su administración auditada, sin borrar categorías ya utilizadas. | HU11 |
| RF24 | El sistema debe permitir configurar las reglas de distribución de alertas preventivas. | HU11 |
| RF25 | El administrador debe mantener el contenido público sobre finalidad, funcionamiento y desarrolladores, así como los contactos de emergencia con fuente y fecha de verificación. | HU22 |
| RF26 | El sistema debe permitir a los operadores consultar los reportes registrados desde su panel de gestión. | HU07 |
| RF27 | El sistema debe permitir a los operadores visualizar estadísticas básicas de los incidentes desde su panel de gestión. | HU12 |
| RF28 | El administrador debe crear y mantener registros institucionales y sedes exclusivamente de PNP, Bomberos, SAMU y Serenazgo; el sistema no debe admitir otros tipos de institución en el alcance actual. | HU14 |
| RF29 | Al crear una sede, el administrador debe crear al menos un operador inicial asociado, persistiendo sede, pertenencia y cuenta de forma atómica. | HU14 |
| RF30 | El administrador debe configurar los distritos de cobertura y categorías/competencias de cada sede; el backend debe aplicar ese ámbito en cada acceso. | HU15 |
| RF31 | El sistema debe mantener un catálogo distrital con geometrías y fuente/versionado, dibujar sus límites en móvil/web y resolver el distrito del incidente o marcarlo pendiente/declarado. | HU03, HU05, HU15 |
| RF32 | El sistema debe enrutar cada reporte según categoría y distrito, con una principal por incidente; Otra emergencia corresponde a Serenazgo y los casos sin distrito o sede requieren designación administrativa auditada. | HU07, HU20, HU21 |
| RF33 | El sistema debe notificar simultáneamente a las instituciones indicadas en la matriz y activar los avisos condicionados por heridos, lesiones o apoyo local, limitando los destinatarios institucionales a PNP, Bomberos, SAMU y Serenazgo, con reglas versionadas y revisión humana. | HU20 |
| RF34 | El panel debe mostrar avisos persistentes por usuario, contador de no leídos y marcado de lectura; cada operador recibe avisos de su ámbito y cada administrador de su ámbito de supervisión. | HU16, HU21 |
| RF35 | El sistema debe conservar enrutamientos pendientes por falta de ubicación, sede u operador y permitir al administrador designar una sede habilitada con motivo y excepción limitada al caso, sin conceder acceso sanitario general. | HU21 |
| RF36 | La app debe mostrar contactos de emergencia administrables y permitir abrir el marcador sin iniciar llamadas automáticamente. | HU17, HU22 |
| RF37 | La app debe incluir páginas sobre su finalidad, funcionamiento y desarrolladores, además de gestión del perfil y preferencias. | HU18 |
| RF38 | La web debe disponer de una portada pública informativa con acceso al inicio de sesión, separada de las rutas protegidas del panel. | HU19, HU22 |
| RF39 | Cada institución participante debe registrar recepción operativa y actuaciones propias; leer un aviso no confirma atención ni despacho de personal. | HU10, HU20 |
| RF40 | Reclasificar, cambiar distrito, consolidar o actualizar condiciones que afecten los destinatarios (como heridos/lesiones) debe recalcular destinatarios y permisos de forma auditada, conservar el historial y evitar registros de aviso duplicados por usuario/evento. | HU09, HU20, HU23 |
| RF41 | Todo reporte dirigido al SAMU, como destinatario principal, simultáneo o condicionado, debe incluir una evaluación rápida: existencia de heridos, cantidad conocida o desconocida y, por persona afectada descrita, signos vitales observados/informados, estado de conciencia y sangrado, admitiendo «no sé/no observado». | HU23 |
| RF42 | El sistema debe mostrar el formulario al activar un destinatario SAMU, conservar los datos ya ingresados y permitir enviar con respuestas desconocidas o evaluación pendiente, sin retrasar el registro ni la notificación por falta de datos. Si SAMU se incorpora posteriormente, debe solicitar completar la información sin bloquear su aviso. | HU23, HU20 |
| RF43 | El sistema debe conservar la evaluación inicial y las aclaraciones posteriores con autor, origen, fecha y versión; permitir su consulta detallada a operadores SAMU competentes y al autor, sin incluirla en mapas públicos ni en el contenido de notificaciones push. | HU24, HU23 |
| RF44 | La evaluación rápida debe utilizar botones de selección única para respuestas Sí/No/No sé y signos de vida observados/no observados/no sé. La cantidad de heridos se registra con botones de cantidades y controles +/− para otras cantidades exactas, sin exigir teclado. No preseleccionar condiciones normales ni exigir completar fichas de todos los afectados para enviar. | HU23 |
| RF45 | El sistema debe gestionar los estados de reporte REGISTRADO, EN_REVISION, VALIDADO y DESCARTADO, con motivo de descarte; consolidar vincula al incidente sin borrar el envío original. | HU04, HU07, HU09 |
| RF46 | El sistema debe gestionar incidentes PENDIENTE_ATENCION, EN_ATENCION y CERRADO; la principal coordina/cierra con motivo y cada institución registra sus propias actuaciones. | HU10, HU20 |
| RF47 | El autor debe consultar institución responsable, recepción, estados, resúmenes de actuaciones y motivo de descarte/cierre, sin notas internas, identidad de operadores ni datos ajenos. | HU04, HU13 |
| RF48 | La bandeja debe ordenar pendientes por llegada (más antiguos primero, desempate por ID) y mostrar etiquetas Sin evaluar, Normal, Alta y Urgente con texto, icono y color; la etiqueta no reordena silenciosamente. | HU26, HU08 |
| RF49 | Solo se deben publicar incidentes validados y autorizados expresamente, con zona aproximada y datos mínimos; aplicar reserva de categorías/casos sensibles, retiro al cierre y vigencia según la política. | HU05 |
| RF50 | El ciudadano debe elegir distritos, categorías y cercanía; activar ambas modalidades, borrar su ubicación compartida y desactivar alertas preventivas sin perder acceso al reporte ni al seguimiento. | HU25, HU06 |
| RF51 | El sistema debe proteger datos de cuenta y teléfono opcional; no compartirlo con instituciones sin autorización expresa ni pedirlo nuevamente para reportar. | HU01, HU18 |
| RF52 | El reporte debe admitir hasta 3 fotografías de 5 MB cada una, JPEG/PNG/WebP, sin videos ni documentos; validar contenido/tamaño, retirar EXIF y permitir enviar sin adjuntos. | HU03 |
| RF53 | El sistema debe aplicar conservación por tipo de dato, bloqueo al vencer, eliminación recuperable ante fallos y limpieza de proveedor/derivados/backups conforme a la política; las excepciones se justifican y revisan. | HU27 |
| RF54 | El sistema debe mantener los cinco distritos acordados y el catálogo de sedes candidatas con verificación y operación separadas; no activar recepción real por registrar un nombre o referencia municipal. | HU14, HU15 |
| RF55 | Otra emergencia debe exigir que la descripción precise el hecho no categorizado y avisar a Serenazgo competente; si falta distrito o sede, pasa al administrador para designación. | HU02, HU20, HU21 |
| RF56 | Un operador debe asumir el caso para actuar, con una sola asignación activa por caso e institución y control transaccional de concurrencia; los demás ven el responsable. Transferencias, reasignaciones y consolidaciones conservan historial y no duplican asignaciones vigentes. | HU28, HU20 |
| RF57 | En accidentes, heridos o necesidad médica informada activan SAMU como principal y PNP de apoyo; sin heridos ni necesidad médica PNP es principal sin aviso automático a SAMU. Preguntar necesidad médica mediante Sí/No/No sé; los desconocidos quedan para revisión sin bloquear el reporte. PNP no disponible se sustituye por apoyo de Serenazgo de forma auditada. | HU23, HU20 |

La [especificación territorial e institucional](09-alcance-territorial-e-institucional.md) define el catálogo exacto, principales acordadas, simultaneidad, condiciones y criterios de aceptación. El enrutamiento interno provisional ocurre tras el registro; la publicación ciudadana requiere validación y autorización.
