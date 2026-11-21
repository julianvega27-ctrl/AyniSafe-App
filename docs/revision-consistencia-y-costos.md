# Revisión de consistencia y costos

Revisión documental actualizada: **19 de noviembre de 2026**. Estado: contradicciones claras corregidas; decisiones de diseño pendientes identificadas. No se ejecutó una aplicación: el repositorio contiene documentación, diagramas y una propuesta de formulario.

## 1. Alcance y fuente de las reglas

Se revisaron README, los **22 documentos Markdown de docs/** (incluido este informe), los **10 SVG** y el contenido semántico de las **7 vistas HTML** publicadas. Se comprobaron identificadores, referencias, enlaces locales y correspondencia de los diagramas. La revisión de imágenes es semántica, no una revisión visual de distribución o legibilidad ni una prueba en navegador.

La [especificación funcional](01-analisis-del-sistema/09-alcance-territorial-e-institucional.md) reúne las reglas acordadas: Flutter/Dart, Android inicial e iPhone previsto; tres roles; cuatro instituciones (PNP, Bomberos, SAMU y Serenazgo); 16 categorías; mapa distrital; evaluación rápida SAMU con botones; clasificación revisada por operador y análisis de reglas locales. HU01–HU28 y RF01–RF57 mantienen la trazabilidad de estas funciones.

Los ADR definen las decisiones técnicas y sus límites. Las tablas C4 y de módulos detallan las responsabilidades. Los diagramas de clases/secuencia y el código son ejemplos abreviados: todavía no incluyen todos los contratos territoriales, sanitarios e institucionales. El diagrama inicial es un bosquejo histórico. Los archivos locales de .archify son material histórico de generación, no la fuente normativa del alcance actual.

Verificación de esta actualización: 57 RF y 28 HU con identificadores únicos y referencias HU válidas; 67 enlaces locales/anclas válidos; cinco distritos y trece sedes candidatas; 10 SVG con XML válido y 14 scripts de las siete vistas HTML con sintaxis válida. Se revisaron 23 Markdown contando README (22 dentro de docs). Estos controles no acreditan funcionamiento ni disponibilidad institucional.

## 2. Inconsistencias encontradas y estado

### Corregidas en esta revisión

| ID | Evidencia | Inconsistencia | Corrección |
|---|---|---|---|
| C01 | Informe anterior | Mezclaba problemas antiguos resueltos con pendientes; todavía señalaba roles indefinidos y enlaces inexistentes. | Se sustituyó el diagnóstico histórico por este estado actual y se verificaron los destinos locales. |
| C02 | README frente a RC09 | Describía toda la región cuando el piloto es metropolitano. | Se delimitó el alcance a la ciudad y sus distritos configurados. |
| C03 | RF04 y RF25 frente a HU18/HU22 | Perfil y contenido seguían vinculados a historias demasiado generales. | Se vinculó edición de perfil a HU18 y gestión de contenido/contactos a HU22. |
| C04 | Diseño interno y C4 | Las tablas principales solo cubrían el alcance antiguo y omitían organización, enrutamiento y evaluación SAMU. | Se ampliaron responsabilidades y referencias RF; RF44 se distingue como presentación Flutter. |
| C05 | Flujo de registro y C4 nivel 3 | Solo se describía ReporteRegistrado hacia Análisis, pero el panel debía recibir reportes antes de la validación. | Se explicitó el consumidor independiente de Operaciones y la entrega posterior a Alertas. La bandeja no espera prioridad/correlación ni publicación. |
| C06 | RF40 y condiciones SAMU | Se mencionaba recalcular por categoría/distrito, sin aclarar que cambiar la información de heridos también puede activar SAMU. | Se explicitó reevaluación por cambios de condiciones y evaluación pendiente sin bloqueo. |
| C07 | EQ-01/EQ-03, DA05 y ADR-007 | Las metas con varias instancias podían leerse como compromiso gratuito. | Se etiquetaron como evolución; EQ-14 cubre recuperación de la única instancia del MVP. |
| C08 | EQ-07 e idempotencia | Podía interpretarse como garantía de entrega push exactamente una vez. | Se distingue unicidad de registros persistentes de posibles reenvíos externos; la bandeja y el identificador permiten recuperación/deduplicación. |
| C09 | Patrones | Facade y Observer aparecían solo como futuros aunque el diseño ya dependía de fachadas y eventos persistentes. | Se documentaron Facade y Transactional Outbox como diseñados; Observer en memoria no sustituye la durabilidad. |
| C10 | Contexto, contenedores y notas HTML | Cartografía seguía «por seleccionar», push «por definir», Redis podía parecer dependencia inicial y una nota HTML todavía mencionaba el cliente móvil anterior. | Se alinearon tablas, etiquetas y notas con Flutter, OpenFreeMap candidato, FCM y caché fuera del MVP. Se aclara que mapas también se consumen en web. |
| C11 | C4 nivel 4 y diseño interno | El enlace a la evaluación SAMU dependía de un encabezado largo cambiante. | Se añadió un ancla explícita estable; versiones C4 actualizadas a 1.1. |
| C12 | SVG/HTML | Persistían etiquetas que atribuían clasificación a Análisis o mostraban S3 como proveedor definitivo. | Se alinearon etiquetas con prioridad/correlación y Storage privado; S3EvidenciasAdapter permanece como ejemplo alternativo declarado. |

### Pendientes reales, sin resolver por suposición

P0: resolver antes de datos reales o de prometer atención. P1: resolver antes de implementar el flujo afectado. P2: completar para facilitar mantenimiento y verificación.

| Prioridad | Tema | Falta definir o comprobar | Impacto |
|---|---|---|---|
| P0 | Territorio y sedes reales | Los cinco nombres distritales están acordados; faltan UBIGEO, polígonos, direcciones/coberturas y operación real de las trece sedes candidatas. | El catálogo separa referencia municipal y sedes, sin asumir jurisdicción ni participación. |
| P0 | Privacidad de archivos y datos sanitarios | Validar proveedor privado, caducidad, derivados, permisos, conservación y eliminación. | Cloudinary es candidato; el rol operador por sí solo no autoriza fichas SAMU. |
| P0 | Alcance de operación | Aceptar interrupciones del MVP y validar evaluación rápida con profesionales antes del piloto. | Hosting gratuito no garantiza aviso inmediato ni la app confirma despacho o valoración clínica. |
| Resuelto en diseño | Ciclo de atención | Estados de reporte e incidente, cierre por principal y seguimiento definidos en documento 11. | Asignación individual y coordinación en accidentes acordadas; falta implementar y probar. |
| Parcial | Prioridad y duplicados | FIFO y etiquetas manuales definidos; sugerencias automáticas de prioridad deshabilitadas inicialmente. Faltan parámetros de correlación. | No reordenar silenciosamente por etiqueta ni calcular triaje clínico automático. |
| Resuelto en diseño | Alertas cercanas | Ambas modalidades, categorías y desactivación acordadas; radio inicial 1 km y ubicación vigente 24 horas, configurables. | Requiere implementación de consentimiento, caducidad y deduplicación. |
| Resuelto en diseño | Publicación | Autorización expresa, reserva de categorías sensibles, zonas aproximadas, retiro al cierre y vigencia definidos en documento 11. | Falta comprobar privacidad de mapas y agregados en la implementación. |
| P1 | Activación y recuperación de cuentas | Canal/proveedor, tokens, expiración y procedimiento del administrador inicial. | **Parcialmente resuelto** (entrega `correo-recuperacion-activacion`): Gmail API (HTTPS) con cuenta dedicada como proveedor de piloto, tokens de un solo uso (30 min recuperación, 72 h activación) y capacidad de invitación sin contraseñas compartidas. **Resultado del spike:** el SMTP saliente de Gmail está **bloqueado** en Render Free (21/11/2026), por eso se usa la Gmail API por HTTPS (probada en local con envío real). **Pendiente:** comprobar el envío desde Render, el enlace en un dispositivo real, el nombre «AyniSafe» como remitente, el procedimiento del administrador inicial y el alta de operadores (no existe). RF03 no debe declararse completo en producción hasta entonces. |
| P1 | Datos/API/consistencia | Modelo relacional, OpenAPI, transacciones de asignación, concurrencia de operadores e idempotencia ampliada. | Los contratos ilustrativos no implementan el alcance completo. |
| Parcial | Fotos y recuperación | Tres fotos de 5 MB, formatos, EXIF y plazos de conservación definidos; falta validar almacenamiento privado, tareas de eliminación y restauración. | Una cuota gratuita no acredita por sí sola backup ni borrado puntual. |
| Resuelto en diseño | Otra emergencia y pendientes | Serenazgo atiende Otra emergencia con descripción concreta; el administrador designa casos sin distrito o sede. | Falta confirmar disponibilidad institucional y el responsable individual de cada caso. |
| P2 | Diagramas abreviados | Representación gráfica completa del nuevo enrutamiento y contratos ampliados. | La tabla C4 explicita el flujo, pero las imágenes no muestran todas las colaboraciones. No deben tomarse como implementación completa. |

## Datos de proveedores: alcance temporal

Las secciones 3–5 conservan la investigación de proveedores realizada el **18/11/2026**. Sus cifras son una referencia fechada, no una nueva comprobación de tarifas en esta revisión. Antes del despliegue deben verificarse las condiciones vigentes y la configuración de cada cuenta. Los hechos del producto no dependen de que una cuota permanezca igual.

## 3. Notificaciones, mapas y ubicación: qué necesita un servicio externo

### Notificaciones

La selección de destinatarios, proximidad, preferencias, contenido, bandeja e historial se implementan en AyniSafe. Para push remoto convencional con la app en segundo plano se utiliza la infraestructura de la plataforma: FCM en Android y APNs en iOS. Un WebSocket propio o una notificación local no ofrece por sí solo el mismo comportamiento.

Recomendación actualizada: backend → FCM → aplicación Flutter (APNs en iOS). La integración usa firebase_messaging, conserva tokens y reintentos y no depende de Expo. [FCM para Flutter](https://firebase.google.com/docs/cloud-messaging/flutter/get-started).

Por tanto, es correcto conservar push como sistema externo. La aplicación puede funcionar con bandeja y consulta periódica si se prescinde del push, pero cambiaría el comportamiento esperado de HU06/RF18. Las notificaciones locales sirven para contenido ya disponible en el dispositivo.

### Ubicación

Obtener coordenadas mediante un plugin Flutter como geolocator usa las capacidades del dispositivo y permisos del sistema operativo. No requiere contratar cartografía. Geocodificación y rutas son capacidades distintas y no son obligatorias para este MVP. [Geolocator](https://pub.dev/packages/geolocator).

### Mapas

MapLibre dibuja el mapa y los marcadores mediante código abierto; la cartografía base sigue necesitando datos y distribución. Propuesta: MapLibre para Flutter en móvil y MapLibre GL JS en web, con cartografía de OpenFreeMap. Su instancia pública anuncia uso gratuito sin clave ni límite de vistas/solicitudes; carece de SLA. Mantener atribución y URL del estilo configurables. [OpenFreeMap](https://openfreemap.org/), [integración](https://openfreemap.org/quick_start/).

No confundir OpenFreeMap con el servidor raster público de OpenStreetMap: este último tiene otra política, límites de uso y restricciones de descarga masiva. Autohospedar cartografía también consume almacenamiento y transferencia; no elimina los costes por escribir código. [Política de tiles de OSM](https://operations.osmfoundation.org/policies/tiles/).

La propuesta actual utiliza Flutter/Dart; la selección de plugins y pruebas cubre Android y posteriormente iOS. La compilación/publicación iOS requiere preparar macOS/Xcode y las condiciones de Apple; se separa del presupuesto de hosting. [Flutter iOS](https://docs.flutter.dev/deployment/ios).

## 4. Despliegue candidato de USD 0 para el MVP

Es una propuesta condicionada a cuotas y pruebas, no una garantía de gratuidad indefinida ni de servicio continuo.

| Pieza | Propuesta | Límite o condición relevante |
|---|---|---|
| Panel React estático | Vercel Hobby | Plan gratuito con cuotas. Mantener API y procesamiento persistente en Render. Verificar condiciones aplicables a la cuenta y al uso antes de publicar. |
| API Express y consumidor de outbox | Un Render Free Web Service | Suspende por inactividad y puede reiniciarse. Trabajo pendiente se recupera cuando vuelve a ejecutarse. No prometer latencia de alertas durante suspensión. |
| Datos y outbox | Neon Free PostgreSQL | Tarifa publicada: 1 GB y 100 CU-h/mes por proyecto. Dimensionar conexiones y consultas; una consulta constante al outbox puede impedir reposo y consumir la cuota. |
| Evidencias | Cloudinary Free, sujeto a prueba de privacidad | 25 créditos mensuales compartidos por consumo de recursos; no equivalen a 25 GB independientes para cada recurso. |
| Push móvil Flutter | FCM (APNs en iOS) | Sin coste de envío; configurar credenciales, consentimiento y bandeja persistente. |
| Ubicación | Plugin Flutter como `geolocator` | Permiso, manejo de error, ingreso manual y ubicación opcional. |
| Cartografía | OpenFreeMap + MapLibre | Dependencia externa gratuita sin garantía de disponibilidad. Si falla el mapa, conservar lista de incidentes y registro de reportes. |
| Análisis inicial | Reglas versionadas y correlación en código | RF11: revisión de categoría; RF12: etiqueta manual. Análisis conserva correlación local, sin prioridad automática en el MVP. |
| Caché y mensajería | PostgreSQL/outbox; sin Redis ni SQS inicialmente | Añadir caché solo con mediciones que la justifiquen. Limitar lotes y concurrencia del consumidor para no saturar la API. |
| Recuperación de cuenta por correo | Gmail API por HTTPS con cuenta dedicada (piloto) | Cuota publicada de 500 correos/día (tope propio 400). Remitente personal de Gmail, sin dominio institucional. El SMTP de Gmail **está bloqueado desde Render Free** (comprobado el 21/11/2026), por eso se usa la API por HTTPS, probada solo en local: **RF03 no puede declararse completo en producción** hasta comprobar el envío desde Render y el enlace verificado (plan de reserva: Brevo). Si el refresh token de OAuth caduca (7 días con la pantalla en «Prueba», dato no verificado) o se revoca, los envíos fallan hasta repetir la autorización. Un tope diario agotado por abuso bloquea la recuperación de todos. |

Fuentes: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Neon](https://neon.com/pricing), [Cloudinary](https://cloudinary.com/pricing).

Render Free se suspende tras 15 minutos sin tráfico entrante y puede tardar aproximadamente un minuto en arrancar. Sus 750 horas/mes se comparten por workspace; el disco local es efímero. No usar su PostgreSQL gratuito como almacenamiento duradero del proyecto: expira a los 30 días. El exceso de transferencia/build puede facturarse si hay medio de pago; sin él se suspenden servicios/builds según el recurso. [Render Free](https://render.com/docs/free).

El consumidor se inicia con la API, reclama tareas por lotes con bloqueo recuperable y procesa lo disponible mientras el proceso permanece activo. No se propone mantener despierto Render mediante pings. Si se requiere ejecución puntual aun sin tráfico, debe seleccionarse y verificar por separado un ejecutor/programador compatible; este diseño gratuito no lo asegura.

## 5. Cloudinary: decisión condicionada por privacidad

Cloudinary sirve para el prototipo si se valida el flujo completo. Un upload firmado autentica la carga, pero no vuelve privada la entrega. `private` puede dejar derivados públicos; `authenticated` protege originales y derivados. Una URL de entrega firmada convencional no implica caducidad. Para acceso temporal, evaluar descarga firmada con expiración o mediación de la API; los tokens/cookies de control de acceso CDN requieren un plan superior. [Control de acceso](https://cloudinary.com/documentation/control_access_to_media).

Prueba previa obligatoria para aceptar este proveedor en la propuesta:

1. Cargar una imagen restringida desde un flujo autorizado y guardar propietario, proveedor e identificador en BD.
2. Verificar que originales y derivados no sean públicos y que otro ciudadano no obtenga acceso a través de AyniSafe.
3. Comprobar que la descarga temporal caduca realmente y no tiene una ruta pública alternativa. Si se usa proxy, no exponer la URL de origen y considerar su transferencia adicional.
4. Verificar disponibilidad en Free, consumo y borrado. Cloudinary advierte que `private_download_url` no usa caché CDN y consume más ancho de banda; validar el presupuesto con ese comportamiento. [Descarga temporal](https://cloudinary.com/documentation/control_access_to_media#providing_time_limited_access_to_private_media_assets).

Si falla esta prueba, mantener evidencia ficticia o desactivar adjuntos en el piloto hasta seleccionar almacenamiento privado compatible. No resolver el presupuesto exponiendo evidencias reales.

## 6. Estado de los diagramas y del código

| Vista | Resultado semántico y límite |
|---|---|
| Arquitectura inicial | Bosquejo histórico: mezcla cliente/API y no detalla panel. La documentación lo identifica expresamente como simplificación, no despliegue vigente. |
| Estilo | Monolito y seis módulos coherentes; tres bandas lógicas no sustituyen las cuatro capas internas. Las tablas describen el alcance ampliado. |
| Enfoque | Dependencias hacia el núcleo correctas; Storage privado es sustituible. Los puertos esquemáticos no son todos los contratos finales. |
| Contexto C4 | Personas, sistema y servicios delimitados. Las instituciones participan mediante operadores; no se presuponen cuatro integraciones oficiales. Ubicación y cartografía siguen agrupadas con explicación de su diferencia. |
| Contenedores C4 | Flutter, React, API y PostgreSQL coherentes. Redis se marca fuera del MVP; la lectura de cartografía desde web se declara en el texto. |
| Componentes C4 | Las tablas añaden organización, SAMU y enrutamiento independiente. El SVG resume solo algunas relaciones; falta ampliar el dibujo para cubrir todo el flujo. |
| Paquetes | Dependencias coherentes con Clean Architecture. El adaptador S3 es un ejemplo; no fija el proveedor real. |
| Clases | Tipos y referencias del registro básico coherentes; faltan distrito, evaluación SAMU e idempotencia en el contrato ilustrado. Está señalado como ejemplo incompleto. |
| Secuencia | Registro y evento atómicos antes de 201; desarrolla solo el consumidor Análisis. La entrega independiente a Operaciones se documenta en C4 nivel 3 y diseño interno. |
| SOLID | Ejemplos válidos de inversión y sustitución; una implementación alternativa debe conservar privacidad y atomicidad, no solo firmas. |

Las vistas HTML conservan la misma semántica de sus SVG equivalentes. Se verifican XML y sintaxis de scripts, pero no se afirma revisión visual ni prueba de interacción completa. La propuesta de formulario en .visualizations sirve para explorar controles; no es una app conectada ni acredita validaciones del backend.

## 7. Próximos cierres recomendados

1. Verificar polígonos/UBIGEO y sedes/coberturas; implementar las reglas confirmadas de accidentes y asignación.
2. Validar los acuerdos del documento 11 y cerrar los parámetros de correlación.
3. Completar contratos de datos/API, idempotencia, concurrencia y permisos, incluyendo detalle SAMU y revisión de heridos.
4. Validar almacenamiento privado y restauración, y decidir el canal de activación/recuperación de cuentas.
5. Ampliar diagramas abreviados y ejecutar los escenarios de calidad. Ningún chequeo documental sustituye estas pruebas.

La infraestructura candidata sigue siendo Vercel + Render + Neon, con almacenamiento privado pendiente. El presupuesto de USD 0 exige respetar cuotas, impedir upgrades/complementos facturados y aceptar suspensión; compilación/publicación iOS se trata aparte. Las alertas presupuestarias no equivalen por sí solas a un tope de facturación.

## Actualización con respuestas del usuario

Las tres aclaraciones finales están resueltas: SAMU principal en accidentes con heridos o necesidad médica informada, PNP como apoyo y sin aviso SAMU cuando no se informa ninguna condición médica; «Asumir caso» establece un responsable por institución con exclusión transaccional. RF56–RF57 y HU28 recogen estos acuerdos. Datos desconocidos quedan explícitamente para revisión, no como ausencia de lesiones ni como atención SAMU confirmada.

El [catálogo territorial y sedes](01-analisis-del-sistema/10-catalogo-territorial-y-sedes.md) recoge cinco distritos, trece sedes candidatas y una referencia municipal sin convertirla en quinta institución. La [política operativa](01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md) adopta los estados, seguimiento, FIFO/etiquetas, preferencias, registro, fotos y conservación. Se verificó parcialmente la bibliografía del catálogo: se distinguen fuentes consultadas, antecedentes históricos, resultados indexados y enlaces no recuperados. La denominación/número de Salvador San Juan y varias direcciones siguen pendientes, no confirmadas por inferencia.
