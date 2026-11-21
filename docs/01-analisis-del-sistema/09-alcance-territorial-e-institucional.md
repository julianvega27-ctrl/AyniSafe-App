# 09. Alcance funcional, territorial e institucional

Actualizado: 19 de noviembre de 2026. Estas reglas incorporan las precisiones del producto y prevalecen sobre las propuestas anteriores de React Native/Expo. Describen el diseño; no acreditan que existan convenios ni operadores institucionales activos.

## 1. Clientes y navegación

La aplicación ciudadana se desarrollará en **Flutter y Dart**, con entrega inicial Android y diseño compatible con una versión para **iPhone (iOS)**. El panel web continúa con **React y TypeScript**. Ambos consumen la API REST de Node.js/Express/TypeScript; los contratos HTTP son independientes del lenguaje de los clientes.

| Interfaz | Secciones y comportamiento requerido |
|---|---|
| App móvil | Registro e inicio de sesión; inicio; registrar reporte con categoría, descripción, fecha, ubicación consentida y evidencias; mis reportes con seguimiento e historial visible al autor; mapa con incidentes publicables y filtros; notificaciones y preferencias; contactos de emergencia; editar perfil; información sobre AyniSafe, finalidad y desarrolladores; privacidad y cierre de sesión. |
| Web pública | Página principal informativa sobre finalidad, funcionamiento y alcance de AyniSafe, desarrolladores y acceso visible al inicio de sesión. Accesible sin cuenta. No muestra bandejas ni información privada. |
| Web del administrador | Instituciones, sedes, cuentas de operadores, coberturas territoriales, categorías atendidas, reglas de enrutamiento, contactos, contenido informativo y bandeja de notificaciones de su ámbito de supervisión. |
| Web del operador | Bandeja de reportes de su ámbito, detalle autorizado, clasificación y revisión, atención y actuaciones, derivaciones, mapa filtrable, indicadores y notificaciones con estado de lectura. |

La información pública no exige iniciar sesión; reportar y consultar datos personales sí. Los contactos se mantienen como catálogo administrable con institución, número, cobertura, fuente y fecha de verificación. El 105 indicado en el alcance es un dato inicial por verificar antes de publicarlo; no completar otros números por suposición. Una acción de llamada abre el marcador del teléfono y requiere la intervención del usuario. Registrar un reporte no equivale a solicitar ni confirmar el despacho de una emergencia.

### Campos del reporte ciudadano

| Campo | Control propuesto | Obligación y valor inicial |
|---|---|---|
| Categoría | Selector de las 16 categorías, con nombres visibles. | Obligatoria; sin categoría preseleccionada en la app real. |
| Descripción breve del hecho | Texto corto. | Obligatoria; no pedir título separado ni formulario narrativo adicional. |
| Momento de ocurrencia | Botones «Ahora» / «Antes»; fecha y hora solo para «Antes». | Obligatorio, con «Ahora» propuesto y modificable; distinto del instante de registro del servidor. |
| Ubicación del incidente | Botones «Usar mi ubicación», «Elegir punto en mapa» o «Sin punto». | Recomendada, compartida solo con autorización. «Mi ubicación» no debe confundirse automáticamente con el lugar del hecho. |
| Distrito | Calculado desde el punto, o selector del catálogo aprobado si no se comparte punto. | Calculado/declarado/pendiente; no exigir escribir distrito, dirección ni coordenadas. Sin punto ni distrito queda pendiente de resolución territorial. |
| Evidencias fotográficas | Botones de cámara y galería. | Opcionales; límites según política de archivos. No bloquear el envío por falta de fotografía. |
| ¿Hay heridos? | Botones «Sí» / «No» / «No sé». | Visible en reportes dirigidos al SAMU y en categorías que requieren esta respuesta para decidir su incorporación. |
| ¿Se necesita atención médica? | Botones «Sí» / «No» / «No sé». | En accidentes, permite resolver SAMU incluso si no se declaran heridas; desconocido conserva revisión pendiente. |
| Cantidad de heridos | Botones 1, 2, 3, 4, 5, «Otra cantidad» y «No sé»; +/− para cantidad exacta adicional. | Condicional si se informan heridos; no usar «5+» como si fuera una cantidad exacta. |
| Signos vitales informados, conciencia y sangrado | Tres grupos de botones por persona descrita, con «No sé». | Evaluación rápida cuando interviene SAMU; sin teclado ni mediciones obligatorias. Permitir enviar con información pendiente. |

La app no solicita de nuevo nombre del autor, DNI, teléfono, institución destinataria, sede, prioridad ni estado para registrar el hecho. El autor procede de la sesión; los destinatarios se resuelven con reglas, y la etiqueta de prioridad la asigna el operador sin alterar el orden de llegada. No se agregan campos de contacto de terceros en este formulario. El servidor genera identificador, fecha de registro, estado inicial, versión de reglas y trazabilidad. La app conserva la clave del intento para reintentar sin duplicar el envío.

Para agilizar, usar selección de un toque y conservar las respuestas al cambiar de sección. «No sé» debe estar siempre visible y no equivaler a «No». Solo «Ahora» tiene un valor inicial propuesto; no preseleccionar respuestas sanitarias. Agregar otra ficha de persona es opcional y nunca se exige una ficha por cada herido. El orden propuesto es categoría, descripción, cuándo, ubicación/distrito, fotos opcionales y evaluación SAMU cuando aplique, con envío disponible aunque falten observaciones sanitarias.

## 2. Exactamente tres roles

| Rol | Alta y alcance | Permisos principales |
|---|---|---|
| Ciudadano | Autorregistro desde la app. | Crear reportes, consultar su seguimiento, editar su perfil y consultar información pública y alertas propias. No accede a reportes privados ajenos. |
| Administrador | Cuenta inicial aprovisionada mediante procedimiento de despliegue; sin autorregistro público. | Crear instituciones y sedes; al crear una sede, crear al menos una cuenta de operador asociada; administrar coberturas, categorías, reglas, cuentas, contactos y contenido. Consulta alertas de su ámbito de supervisión, inicialmente toda el área del piloto. |
| Operador | Cuenta creada por el administrador dentro de una sede e institución. | Revisar, clasificar, validar, consolidar, descartar y atender reportes e incidentes autorizados; registrar actuaciones, derivaciones y recepción de alertas. Está limitado por institución, sede, cobertura y competencias. |

**«Personal autorizado» significa operador**, no un cuarto rol. PNP, Bomberos, SAMU y Serenazgo son las únicas instituciones del alcance actual, no roles ni usuarios adicionales. Una sede puede tener varios operadores; cada operador pertenece inicialmente a una sede. Si se necesita movilidad entre sedes, debe reasignarse de manera auditada.

La creación de sede, asociación institucional, cobertura y operador inicial debe ser atómica en BD. Las invitaciones y avisos se procesan después del commit. Las credenciales no se publican ni se envían como contraseñas compartidas; La activación de un solo uso (token de 72 horas, cuenta en estado `pendiente_activacion` sin contraseña) y la recuperación de cuenta están definidas en la entrega `correo-recuperacion-activacion`, que deja lista la capacidad de invitación pero **no crea operadores**: el alta de operadores y sedes que la consume corresponde a una entrega posterior y aún no existe. Suspender una sede o un operador impide nuevos accesos y entregas sin borrar historial. El administrador no obtiene permisos de atención clínica/policial por administrar cuentas: las decisiones operativas corresponden al operador.

## 3. Distritos metropolitanos y mapas

El alcance es el área metropolitana de la ciudad de Ayacucho, dividida en **distritos configurados para el piloto**. Los cinco distritos acordados son Ayacucho, San Juan Bautista, Carmen Alto, Jesús Nazareno y Andrés Avelino Cáceres Dorregaray. Falta verificar UBIGEO y polígonos versionados; no inferirlos del mapa base. Véase el [catálogo territorial y de sedes](10-catalogo-territorial-y-sedes.md).

- Mantener un catálogo `Distrito` con identificador estable/UBIGEO cuando esté verificado, nombre, geometría Polygon/MultiPolygon en GeoJSON, fuente, versión, vigencia y pertenencia al área del piloto. Los polígonos son datos de AyniSafe; OpenFreeMap aporta cartografía base, no las reglas territoriales del negocio.
- Móvil y web dibujan los límites y permiten seleccionar uno o varios distritos y combinar categoría, período y estado visible. La API aplica los filtros; filtrar en pantalla nunca concede acceso a otros ámbitos.
- El backend determina el distrito desde el punto del **incidente**, no desde la ubicación actual del reportante ni la sede más cercana. Un ciudadano puede reportar un hecho en otro distrito.
- Usar una comprobación punto-en-polígono en código con preselección por caja envolvente para el catálogo pequeño del MVP; PostGIS es una evolución posible. No se requiere pagar geocodificación por cada reporte. Registrar versión geométrica y distrito calculado.
- Si se deniega GPS, permitir ubicar manualmente el incidente con consentimiento o seleccionar un distrito declarado sin coordenadas. Distinguir distrito calculado, declarado y pendiente; el declarado permite clasificación territorial provisional, pero no búsquedas de cercanía exacta.
- Un punto sobre frontera, geometrías superpuestas o fuera de cobertura no se asigna arbitrariamente: queda pendiente de revisión territorial y genera aviso al administrador. Si no hay punto ni distrito declarado, guardar el reporte y resolver su ámbito manualmente; no divulgarlo a todas las sedes.
- La cobertura de una sede puede abarcar varios distritos y un distrito puede estar cubierto por varias sedes. Mantener esta relación explícita; la dirección de la sede no define su jurisdicción.

Los límites distritales pueden ser públicos. El mapa ciudadano muestra únicamente incidentes validados y autorizados para publicación, con coordenadas generalizadas y sin evidencias ni datos personales. La asignación territorial utiliza el punto restringido original; no recalcular el distrito con la posición generalizada que ve el público.

## 4. Catálogo de categorías y destinatarios

Las **16 categorías** siguientes constituyen el catálogo inicial obligatorio. Conservar identificadores estables y desactivar en lugar de borrar categorías ya utilizadas. Los cambios posteriores requieren trazabilidad y actualización de las reglas. La tabla refleja las reglas del producto solicitadas, no una declaración legal de competencias institucionales.

Las principales de la matriz han sido confirmadas por el usuario. En accidentes, SAMU es principal cuando hay heridos o necesidad médica informada; sin heridos ni necesidad médica, PNP es principal y no se avisa automáticamente a SAMU. «Otra emergencia» corresponde a Serenazgo. Notificar a entidades de apoyo no las convierte en principales. Solo habrá una principal vigente por incidente, con historial de sus cambios.

| Categoría exacta | Principal inicial | Notificación simultánea obligatoria adicional | Derivación o aviso condicionado |
|---|---|---|---|
| Accidente de tránsito | SAMU si hay heridos o necesidad médica informada; PNP en los demás casos | Con SAMU principal, PNP recibe aviso de apoyo sin esperar una confirmación previa | Serenazgo apoya si PNP declara que no puede atender; también puede recibir apoyo local configurado. Sin heridos ni necesidad médica, no se avisa a SAMU. Condiciones desconocidas quedan para revisión. |
| Acoso | PNP | — | Serenazgo para apoyo local, si está habilitado. |
| Actividad sospechosa | PNP | Serenazgo | — |
| Agresión | PNP | — | SAMU si existen personas heridas; Serenazgo para apoyo local, si está habilitado. |
| Asalto | PNP | — | Serenazgo para apoyo local, si está habilitado. |
| Daños por sismo | Bomberos | — | Serenazgo para apoyo local, si está habilitado. |
| Deslizamiento | Bomberos | — | Serenazgo para apoyo local, si está habilitado. |
| Emergencia médica | SAMU | — | Serenazgo para apoyo local, si está habilitado. |
| Incendio | Bomberos | — | Serenazgo para apoyo local, si está habilitado. |
| Inundación | Bomberos | — | Serenazgo para apoyo local, si está habilitado. |
| Otra emergencia | Serenazgo | — | La descripción debe especificar la emergencia no categorizada; el operador evalúa apoyos entre las cuatro instituciones. |
| Otro incidente de seguridad | PNP | — | Serenazgo para apoyo local, si está habilitado. |
| Pelea | PNP | — | SAMU si hay heridos; Serenazgo para apoyo local, si está habilitado. |
| Robo | PNP | — | Serenazgo para apoyo local, si está habilitado. |
| Vandalismo | PNP | Serenazgo | — |
| Violencia | PNP | — | SAMU si hay lesiones; Serenazgo para apoyo local, si está habilitado. |

Catálogo institucional cerrado para el alcance actual: **PNP, Bomberos, SAMU y Serenazgo**. La API debe rechazar otros tipos de institución al crear registros, sedes o reglas de destinatarios. Crear sus registros no afirma que ya participen en el piloto. El administrador habilita sedes y operadores reales solo cuando estén disponibles; las cuentas de demostración se identifican como tales.

La app admite indicar personas heridas/lesionadas como `sí`, `no` o `desconocido`; el operador puede precisar la condición con motivo registrado. Las reglas automáticas no confirman ni descartan por sí solas estas condiciones. Si se informa una condición que activa SAMU, crear el aviso condicionado sin esperar el análisis de reglas; señalar que proviene del ciudadano hasta su revisión. `desconocido` exige evaluación, no se interpreta como ausencia de heridos. La información de apoyo se limita al mínimo necesario; no compartir detalles sensibles indiscriminadamente con todas las instituciones.

## 5. Enrutamiento y notificaciones del panel

<a id="evaluacion-rapida-samu"></a>

### Evaluación rápida para reportes destinados al SAMU (HU23–HU24, RF41–RF44)

La app incorpora un formulario breve de **evaluación rápida reportada por el ciudadano** («triaje rápido» en el alcance funcional). Recoge observaciones, no asigna una clasificación clínica, diagnóstico ni confirma ausencia de vida. La valoración sanitaria corresponde a los profesionales del SAMU. El MINSA describe la recepción de información del paciente y su derivación a un médico para la atención; los campos siguientes son una propuesta del producto que deberá validarse con profesionales antes del piloto. [Información del MINSA sobre llamadas al SAMU](https://www.gob.pe/institucion/minsa/noticias/23899-sepa-como-realizar-una-llamada-de-emergencia-en-salud).

Se activa cuando SAMU sea principal (emergencia médica o accidente con heridos/necesidad médica informada), condicionado (agresión, pelea o violencia con heridos/lesiones), o cuando un operador lo incorpore tras evaluar cualquier otra categoría. La condición efectiva de destinatario manda sobre una lista fija de categorías. Mostrar el formulario no altera por sí solo los destinatarios de la matriz.

Todas las respuestas de esta evaluación se presentan como botones de selección única (RF44), no como preguntas de texto libre. La cantidad utiliza accesos rápidos y +/− para evitar teclado; «No sé» permite continuar. En accidentes, agresión, pelea y violencia, la pregunta de heridos aparece antes de resolver el destinatario SAMU. En accidentes se añade «¿Se necesita atención médica?» con Sí/No/No sé (RF57), para cubrir necesidad médica sin lesión declarada. Una respuesta desconocida conserva una marca de revisión médica pendiente, no equivale a «No» y no bloquea el registro; PNP recibe el accidente para revisión mientras no se haya informado una condición que active SAMU.

| Campo | Respuestas admitidas y significado |
|---|---|
| ¿Hay personas heridas? | Sí / No / No sé. No sustituye la necesidad de atención por una enfermedad sin lesiones. |
| ¿Cuántas personas heridas hay? | Número entero conocido o cantidad desconocida. Si hay heridos, el número conocido es mayor que cero; «no» implica cero; «no sé» conserva la cantidad desconocida. No convertir desconocido en cero. |
| Signos vitales observados o informados, por persona | Se observan/informan signos de vida / No se han observado / No sé. La opción negativa describe una observación, no una constatación clínica de ausencia de signos vitales ni fallecimiento. No pedir al ciudadano medir pulso, presión u otros valores para poder enviar. |
| ¿Está consciente?, por persona | Sí / No / No sé. |
| ¿Hay sangrado visible?, por persona | Sí / No / No sé. La ausencia de sangrado visible no descarta lesiones. |

Usar fichas «Persona 1», «Persona 2», etc., sin exigir nombres ni documentos. Las condiciones se refieren a cada persona descrita y no se copian a todos los afectados. Distinguir cantidad total de heridos declarada y cantidad de personas descritas; no exigir una ficha por cada herido para enviar. Una emergencia médica sin heridos también permite describir al paciente. Personas no descritas y respuestas omitidas se identifican como información pendiente/desconocida, nunca como condiciones normales.

**Envío y actualización:** el objeto de evaluación acompaña al reporte dirigido al SAMU, aunque sus respuestas sean desconocidas. Si se interrumpe el formulario, permitir «Enviar con información pendiente». Si SAMU se agrega posteriormente a un reporte existente, crear el estado de evaluación pendiente y solicitar completarla sin bloquear el aviso. No esperar a que el ciudadano regrese ni a que exista una evaluación completa para notificar. «No hay heridos» no elimina a SAMU si se declaró necesidad médica o si la categoría es emergencia médica. En accidentes sin heridos ni necesidad médica, SAMU no es destinatario automático. Una reclasificación posterior audita el cambio, sin borrar entregas o actuaciones previas.

Validar coherencia entre existencia y cantidad de heridos, sin transformar una respuesta a escondidas: ofrecer corregirla o enviar con esa cantidad marcada pendiente. Un borrador inválido no se persiste como evaluación consistente. Cada aclaración crea una versión con actor, origen (ciudadano u operador SAMU), instante y campos modificados; conservar la versión enviada con cada aviso. Un cambio relevante genera un evento de actualización deduplicado, sin crear un segundo incidente. Las observaciones pueden cambiar con el tiempo: mostrar siempre cuándo se informaron y no inferir estado clínico actual.

**Permisos:** Reportes conserva la evaluación ciudadana; Operaciones conserva aclaraciones del operador SAMU mediante contratos públicos. Detalle accesible solo al autor y operadores SAMU activos con competencia y cobertura. Las otras instituciones reciben únicamente el resumen de heridos necesario para la coordinación y sus permisos, no el detalle sanitario completo. El administrador no recibe acceso sanitario por administrar cuentas. Mapas, estadísticas públicas, logs y payloads push no incluyen respuestas individuales; la notificación remite al detalle protegido de la API. Registrar el acceso autorizado sin copiar datos sanitarios al log.

**Aceptación:** comprobar accidente con cantidad desconocida; agresión con heridos que activa SAMU; emergencia médica sin lesión con paciente descrito; varios heridos con una sola ficha disponible; incorporación posterior de SAMU; reintento del envío sin duplicación; y acceso rechazado al detalle sanitario desde otra institución. La evaluación no genera instrucciones de primeros auxilios ni un puntaje clínico automático.

### Distribución de avisos

1. Guardar reporte y evento en la misma transacción. Usar la categoría seleccionada y el distrito calculado/declarado para el enrutamiento **provisional** de revisión. La alerta interna no espera a que el reporte se publique ni al procesamiento posterior.
2. Resolver instituciones principales, simultáneas y condicionadas mediante reglas versionadas. Guardar la regla, sus condiciones y los destinatarios resueltos. Para «Otra emergencia», notificar Serenazgo competente y exigir que la descripción precise la emergencia no categorizada. Sin distrito o sede habilitada, el administrador designa la atención de forma auditada.
3. Seleccionar las sedes activas de cada institución destinataria que cubran el distrito y tengan configurada la categoría/competencia. Notificar a sus operadores activos. Si varias sedes cumplen, todas reciben el aviso; designar la sede coordinadora mediante asignación auditada, sin duplicar el caso.
4. Crear notificación persistente por usuario y evento, con tipo, reporte/incidente, sede, motivo, fecha y estado de lectura. Deduplicar destinatarios: Serenazgo no recibe dos avisos por la misma regla simultánea y de apoyo. Los administradores reciben avisos de reportes de su ámbito de supervisión y de fallos de asignación, con contenido acorde a sus permisos.
5. Cuando falten cobertura, categoría competente u operadores, conservar el reporte y registrar `ENRUTAMIENTO_PENDIENTE`; avisar al administrador para corregir configuración o asignar manualmente. No simular recepción institucional ni descartar avisos silenciosamente.
6. La bandeja y el contador del panel se actualizan mediante consulta incremental autenticada de la API. Propuesta MVP: polling cada 30 segundos mientras la pestaña esté visible, pausa al ocultarse y reintentos con espera creciente ante errores. Objetivo de actualización en el próximo ciclo exitoso con servidor activo; no es garantía de tiempo real. No requiere proveedor de push para mostrar avisos dentro del panel.
7. Recuperar avisos no leídos tras cerrar sesión o reconectar. Leer una notificación no significa aceptar ni atender un incidente. Registrar por separado recepción operativa, actuaciones y estado del caso; cada institución tiene su propio historial de participación.
8. Al reclasificar, cambiar ámbito o consolidar, recalcular destinatarios y permisos, auditar cambios y avisar a los nuevos responsables. Conservar historial restringido, pero no conservar acceso operativo completo en una sede que perdió competencia. Guardar destinatarios ya notificados para no duplicar entregas.

Un **reporte** es el envío original; un **incidente** es el caso de atención validado por Operaciones, que puede agrupar varios reportes. El enrutamiento provisional permite revisar el envío antes de crear o vincular el incidente. La validación conserva o corrige la asignación; consolidar no elimina autoría, evidencia ni trazabilidad. Las alertas preventivas a ciudadanos se evalúan después de la autorización de publicación y son distintas de los avisos internos del panel.

Las instituciones actúan en AyniSafe mediante sus operadores. Notificar sus cuentas no equivale a integrar sus centrales ni confirma que se haya movilizado personal. La coordinación externa se registra con canal, responsable, momento y acuse cuando exista, conforme a RC06.

## 6. Datos, módulos y contratos mínimos

| Módulo existente | Ampliación, sin crear microservicios |
|---|---|
| Identidad | Institución, sede, usuario operador, pertenencia, cobertura por distrito y competencias; alta administrativa y autorización por ámbito. |
| Reportes | Categorías iniciales, distrito calculado/declarado y versión territorial, evaluación rápida SAMU reportada por el ciudadano con fichas por persona y referencias de evidencia. |
| Operaciones | Enrutamiento provisional, institución principal, participaciones simultáneas/condicionadas, evaluación manual, aclaraciones SAMU versionadas, sede coordinadora y actuaciones por institución. |
| Alertas | Destinatarios autorizados, bandeja persistente, lectura por usuario, deduplicación y tareas de entrega. FCM para móvil; consulta autenticada para panel. |
| Consultas | Polígonos y filtros distritales, DTO público, bandejas por ámbito, directorio de emergencia y contenido informativo público. |
| Análisis | Correlación por categoría, distancia y tiempo; resultados revisables por el operador. Las etiquetas de prioridad las asigna Operaciones mediante el operador y la bandeja conserva el FIFO. |

Contratos propuestos: alta de instituciones y sedes con operador inicial; catálogo territorial versionado; consulta del mapa por `distritoIds`, categoría y período; consulta de bandeja con cursor y marcado de lectura por usuario; asignación y reclasificación operativa auditadas. Validar el ámbito en el backend para cada recurso, no solo en los filtros del cliente. El autor procede de la sesión, no del cuerpo de la solicitud.

## 7. Criterios de aceptación del diseño

La categoría seleccionada por el ciudadano es provisional; el operador la confirma o corrige con motivo registrado (RF11). La bandeja se ordena por llegada y el operador asigna etiquetas con texto, color e icono; inicialmente «Sin evaluar» (RF12, RF48). No se calcula una prioridad clínica automática. La detección de posibles duplicados combina categoría, distancia y ventana temporal configurables (RF13); sin coordenadas no aplica cercanía exacta. Solo el operador confirma la consolidación. Ningún resultado de análisis cambia por sí solo el estado operativo del incidente.

- No es posible autorregistrarse como administrador u operador; crear una sede correctamente crea su operador inicial y las asociaciones, o revierte todo. Existen exactamente tres valores de rol.
- El catálogo contiene las 16 categorías sin renombrarlas; cada categoría tiene una principal definida y genera los avisos simultáneos/condicionados aplicables. En accidentes, heridos o necesidad médica informada activan SAMU como principal y PNP como apoyo; sin heridos ni necesidad médica, PNP es principal sin aviso SAMU. Un dato desconocido permanece pendiente de evaluación.
- El catálogo y las reglas admiten solo PNP, Bomberos, SAMU y Serenazgo. Agresión o violencia con heridos/lesiones añade SAMU. Daños por sismo, deslizamiento e inundación tienen a Bomberos como principal; Serenazgo puede apoyar y se deduplica. La falta de una sede deja un pendiente visible al administrador.
- El mismo punto se clasifica con el mismo distrito y versión en ambos clientes. Filtrar distritos no permite a un operador consultar expedientes fuera de su ámbito; los casos de frontera y sin ubicación tienen salida manual verificable.
- Cada usuario tiene su propio estado de lectura; dos operadores notificados no comparten accidentalmente ese estado. Reiniciar API/navegador no pierde avisos persistidos.
- La portada web es accesible sin sesión; las rutas operativas rechazan acceso no autorizado. El ciudadano encuentra seguimiento, mapa filtrado, reporte, contactos, perfil e información de la app/desarrolladores.
- Android es la primera entrega. La versión iPhone requiere validar plugins, permisos, notificaciones, compilación y distribución iOS; compartir Flutter no equivale a tener una versión iOS probada.

## 8. Tecnología móvil y presupuesto

La propuesta técnica pasa a Flutter/Dart, ubicación mediante un plugin multiplataforma como `geolocator`, MapLibre para Flutter con OpenFreeMap y `firebase_messaging` para FCM. Expo queda fuera de esta arquitectura. En iOS, configurar también APNs y permisos. El panel recibe avisos mediante la API y su bandeja persistida; no necesita FCM para el MVP.

Referencias técnicas: [MapLibre Flutter](https://flutter-maplibre.pages.dev/), [Geolocator](https://pub.dev/packages/geolocator), [FCM para Flutter](https://firebase.google.com/docs/cloud-messaging/flutter/get-started).

Se mantiene el objetivo de infraestructura gratuita con límites del piloto. La compilación y publicación iOS se presupuestan aparte: Flutter documenta macOS/Xcode para ese flujo y membresía Apple Developer para publicar en App Store. No se promete publicación de iPhone a coste cero. [Despliegue iOS de Flutter](https://docs.flutter.dev/deployment/ios).

## 9. Acuerdos operativos y pendientes

El [catálogo territorial y de sedes](10-catalogo-territorial-y-sedes.md) identifica cinco distritos, trece sedes candidatas y una referencia municipal que no es institución de atención. La [política de operación, publicación y conservación](11-operacion-publicacion-y-conservacion.md) concreta estados aceptados, seguimiento, bandeja por llegada, etiquetas, preferencias de alertas, registro ciudadano y hasta tres fotos de 5 MB.

En accidentes se resolvió la principal condicionada: SAMU con heridos/necesidad médica informada y PNP de apoyo; sin condición médica, PNP sin aviso SAMU. «Otra emergencia» tiene principal Serenazgo y exige descripción concreta. Cada institución participante tiene un operador responsable mediante «Asumir caso» (RF56). Casos sin distrito o sede son designados por el administrador con motivo; esa excepción concede solo acceso al caso asignado, no acceso sanitario general, y no inventa un distrito calculado.

Los reportes tienen estados REGISTRADO, EN_REVISION, VALIDADO o DESCARTADO. Los incidentes tienen PENDIENTE_ATENCION, EN_ATENCION o CERRADO. El cierre y las actuaciones se regulan en la política operativa. El operador propone la transición mediante contratos públicos; Reportes persiste el estado de revisión de sus envíos y Operaciones el estado del incidente, sin escrituras directas a tablas ajenas.

Las alertas ciudadanas admiten distritos elegidos y última ubicación consentida con vencimiento, categorías y desactivación. Los valores iniciales de radio, vigencia y privacidad figuran en la política y no implican rastreo continuo. Una corrección de heridos/lesiones recalcula los destinatarios y solicita evaluación SAMU sin bloquear avisos.

La bandeja persiste una notificación por usuario/evento; el proveedor push puede repetir entregas y se deduplica por identificador cuando sea posible. Las proyecciones públicas no incorporan datos sanitarios. Cada aviso conserva una referencia a la versión evaluada, sin transportar respuestas clínicas. Retirar una sede del caso actualiza sus permisos.

Siguen pendientes: polígonos/UBIGEO, contactos/coberturas y operación real de sedes, verificación del proveedor de correo del piloto (Gmail API con cuenta dedicada) desde el entorno desplegado, validación de almacenamiento privado y backups y parámetros de correlación. Las tres aclaraciones de accidentes/asignación ya están resueltas. El prototipo de formulario es ilustrativo y no acredita la implementación de los nuevos requisitos.
