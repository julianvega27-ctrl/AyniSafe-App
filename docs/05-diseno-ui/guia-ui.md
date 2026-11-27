# Guía de flujos y navegación de AyniSafe

Fecha: 20 de noviembre de 2026.

Estado: acuerdos funcionales de UI y seguimiento de entregas. La autoridad visual se consolida en [DESIGN.md](../../DESIGN.md), desde el 22 de noviembre de 2026. Esta guía no acredita implementación ni validación visual o de accesibilidad y no define un sistema de estilo alternativo.

## 1. Alcance y referencias

La UI inicial comprende la navegación de la app ciudadana, la web pública y el panel institucional. El primer flujo a detallar es el registro e inicio de sesión ciudadano.

Esta guía complementa las reglas de producto existentes, sin sustituirlas:

- [Requisitos funcionales](../01-analisis-del-sistema/03-requisitos-funcionales.md): cuentas, permisos, perfil, recuperación y acceso público.
- [Restricciones](../01-analisis-del-sistema/05-restricciones.md): Flutter/Dart para la app y React/TypeScript para la web.
- [Alcance funcional, territorial e institucional](../01-analisis-del-sistema/09-alcance-territorial-e-institucional.md): secciones, roles y límites de acceso.
- [Operación, publicación y conservación](../01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md): registro, privacidad y etiquetas de prioridad.

## 2. Decisiones confirmadas

### 2.1 Dirección visual

Elección explícita del 23/11/2026: reproducir la apariencia de la web y móvil de `Proyecto_incidencias_400par`, sin mejoras durante esta integración. DESIGN.md fija la referencia y sus componentes. Los acuerdos funcionales de AyniSafe se conservan; las secciones de entregas anteriores describen su estado histórico, no una excepción gráfica al diseño elegido.

Los acuerdos de identidad, tipografía, espaciado, controles y semántica de color se mantienen en [DESIGN.md](../../DESIGN.md). La réplica del origen ya fue elegida; no hay una dirección gráfica pendiente de selección. Esta guía conserva los flujos; no fija paletas, tokens ni apariencia de componentes. El orden por llegada de la bandeja sigue siendo una regla de producto.

P2 se aplica por incrementos: P2.1 adapta portada, acceso y activación web; P2.2 el panel institucional; P2.3–P2.4 el tema, los formularios y la navegación Flutter. La aceptación visual Android sigue pendiente. La [evidencia P2](../validacion/p2-replica-visual.md) distingue código implementado, pruebas ejecutadas y aceptación visual pendiente.

### 2.2 Navegación móvil

Ubicación/contacto, decisión 23/11/2026 pendiente de implementación: el envío exige punto mediante GPS con permiso o selección manual. Sin punto se conserva el formulario y se explica cómo continuar; no ofrecer envío «Sin punto». El invitado debe indicar teléfono de contacto con explicación de uso restringido. El registro de cuenta y su perfil conservan teléfono opcional; no extender la obligatoriedad a esos formularios.

Acuerdos de integración del 23/11/2026, pendientes de implementación: el invitado tendrá una consulta de estado y resumen ciudadano mediante código secreto; no se incluye vinculación posterior a una cuenta. Las etapas del incidente son Registrado, En revisión, En atención y Cerrado. La prioridad propuesta por categoría debe distinguirse de la revisada por un operador y no cambia el orden de llegada. Estos acuerdos sustituyen los pendientes equivalentes de los párrafos siguientes; las decisiones operativas completas se mantienen en el documento 11.

Se adopta la composición móvil del origen: AppBar con acceso a perfil, Drawer y barra inferior con cuatro destinos. Esta elección sustituye la ubicación anterior de Mis reportes y Alertas en la barra, conservando ambas funciones en el menú:

| Destino | Contenido principal |
|---|---|
| Inicio | Inicio con composición de la app de origen y contenido real de AyniSafe. |
| Reportar | Formulario de incidente como invitado o con cuenta, con requisitos elegidos. |
| Mapa | Incidentes publicables y filtros autorizados. |
| Contactos | Directorio aprobado, sin números inventados. |

En Drawer: Inicio, Reportar, Mapa, Contactos, Alertas, información, Perfil y Mis reportes según sesión, siguiendo la presentación del origen. La consulta mediante código secreto de invitado usa sus componentes sin acceso al historial privado de cuentas.

El perfil se abre desde la cabecera. Agrupa datos personales, preferencias, privacidad, información sobre AyniSafe y cierre de sesión. La acción «Reportar» es protagonista en Inicio; el mapa no será la pantalla principal de esta alternativa.

La información pública, los contactos y el envío como invitado no requieren sesión. Con cuenta se permite enviar y consultar historial privado propio; perfil y datos de cuenta requieren autenticación. El invitado consulta solo estado/resumen mediante código secreto, sin vinculación posterior a cuenta. Sin sesión, la app abre Inicio público con la misma barra y Drawer; el control de cuenta de la cabecera («Sin cuenta») y la entrada «Iniciar sesión o crear cuenta» del Drawer abren el acceso y registro vigentes. Mis reportes y Perfil solo aparecen con sesión verificada. Tras cerrar sesión se vuelve a Inicio público con el aviso; una sesión vencida o una contraseña nueva abren el acceso con su aviso. Reportar, Mapa, Alertas y Mis reportes muestran su estado pendiente, sin formularios, permisos ni consultas. Las entregas descritas en 2.8 conservan su estado implementado hasta su adaptación.

### 2.3 Navegación web

Acuerdos de integración del 23/11/2026: la toma inicial se realiza con «Asumir caso» por un operador; la reasignación administrativa requiere motivo y no habilita atención. El detalle debe distinguir estado de verificación, mostrar vínculos de duplicados solo dentro de los permisos del usuario y diferenciar cierre Atendido de Descartado. No ofrecer «Descartado» como quinto estado ni contar ese cierre como atención realizada. Son comportamientos pendientes de implementación, definidos en el documento 11.

La web mantiene una portada pública y un panel protegido, con navegación según los permisos del usuario.

| Superficie | Organización acordada |
|---|---|
| Portada pública | Finalidad, funcionamiento, alcance del piloto, desarrolladores y acceso institucional visible. |
| Panel del operador | Inicio/resumen, Incidentes, Mapa, Indicadores e Historial autorizado; campana y cuenta en cabecera. Actuaciones y derivaciones en el detalle; sin ingreso telefónico de incidentes. |
| Panel del administrador | Inicio/resumen administrativo, Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas, Contenido/contactos e Historial autorizado; campana y cuenta. Sin permisos de atención. |

El autorregistro es ciudadano y se realiza desde la app. La web no ofrecerá autorregistro de operadores o administradores. No se incorpora una versión ciudadana completa para navegador en este alcance.

### 2.4 Registro ciudadano

Se adopta un formulario directo en una sola pantalla, con nombre, correo y contraseña. No se divide en pasos.

- Acción principal: «Crear cuenta».
- Enlace para quien ya tiene cuenta: «Inicia sesión».
- Acceso a información de privacidad y contactos de emergencia.
- Sin DNI, selector de rol ni teléfono en este formulario. El teléfono permanece opcional en Perfil.
- Sin solicitud de ubicación o notificaciones durante la creación de cuenta. Cada permiso se explicará cuando se utilice.

La cuenta se confirmará como creada únicamente después de la respuesta satisfactoria del servidor.

### 2.5 Inicio de sesión y recuperación

La pantalla de inicio de sesión incluye correo, contraseña con control Mostrar/Ocultar, acción «Ingresar» y enlaces «Olvidé mi contraseña» y «Crear cuenta».

La recuperación utiliza correo con token de un solo uso y vencimiento (30 minutos), conforme a las reglas existentes. Desde el acceso, el enlace «Olvidé mi contraseña» abre la solicitud del enlace; la contraseña se cambia con un enlace que abre la app o con un código pegado a mano («Tengo un código»). Al cambiarla se cierran **todas** las sesiones de la cuenta y no se inicia sesión automáticamente: se vuelve al acceso con un aviso.

Vistas de la recuperación (entrega `correo-recuperacion-activacion`):

| Vista | Contenido y comportamiento |
|---|---|
| Solicitar enlace | Correo precargado desde el acceso, acción «Enviar enlace» y acceso a «Tengo un código». Un solo envío en curso. |
| Confirmación neutral | «Si el correo corresponde a una cuenta, te enviaremos instrucciones… Revisa también la carpeta de spam». No afirma que la cuenta exista ni repite el correo. |
| Nueva contraseña | Campo «Contraseña nueva» con Mostrar/Ocultar, pegado permitido y la ayuda de 15 a 128 caracteres. El servidor indica si el enlace es de recuperación o de activación y el texto y el botón se adaptan. |
| Enlace usado, vencido o inválido | Mensaje con icono y texto, sin pedir contraseña, y acción «Solicitar otro enlace». |
| Tengo un código | Campo para pegar el código del correo; continúa como el enlace. |
| Estados de red | Sin conexión, servicio no disponible, espera por demasiados intentos y tope diario de correos: se explican sin afirmar que el correo se envió ni reintentar solos. |

Los mismos criterios de accesibilidad de la sección 2.6 aplican a estas vistas (etiquetas persistentes, texto base de 16, controles de al menos 48, errores con texto e icono y texto ampliable al 200 %).

**Remitente de piloto:** los correos salen de una cuenta de Gmail dedicada mediante la **Gmail API por HTTPS** (el SMTP de Gmail está bloqueado en Render Free; ver sección 3). No es un remitente institucional ni un dominio propio, y su cuota publicada es de 500 correos al día (el sistema limita las solicitudes a 400). El nombre «AyniSafe» como remitente **aún no se muestra** en el buzón (Gmail usa el nombre guardado en la cuenta): queda pendiente de corregir.

**Activación de cuentas invitadas:** la misma pantalla de nueva contraseña sirve para activar una cuenta invitada («Activa tu cuenta»). Esta entrega no crea operadores ni muestra pantallas de administración.

Los errores de formato o validación se muestran junto al campo correspondiente. Las credenciales incorrectas utilizan un mensaje general. Ante problemas de conexión se informa el problema y se ofrece reintentar, sin indicar un éxito no confirmado.

### 2.6 Componentes y comportamiento compartidos

Flutter y React compartirán criterios visuales y de interacción; sus componentes se implementarán en cada tecnología.

| Componente | Criterio acordado |
|---|---|
| Campo de formulario | Etiqueta visible, ayuda, error y compatibilidad con autocompletado. |
| Campo de contraseña | Mostrar/Ocultar; permitir pegar y utilizar gestores de contraseñas. |
| Botón | Estados normal, pulsado, cargando y deshabilitado. |
| Mensaje | Texto e icono, explicación comprensible y acción para continuar cuando corresponda. |
| Tarjeta y etiqueta | Jerarquía consistente; estados identificables por texto, icono y color. |
| Navegación | Destino activo reconocible y retorno predecible. |
| Accesibilidad transversal | Foco visible, compatibilidad con lectores de pantalla y texto ampliable. |

### 2.7 Contraseña, correo y sesión (confirmado en `registro-login-ciudadano`)

Estas decisiones resuelven los pendientes de «Política de contraseña» y «Verificación de correo» de la sección 3 y se documentan en `openspec/changes/registro-login-ciudadano/`.

- **Contraseña:** de 15 a 128 puntos de código Unicode, con espacios admitidos y sin reglas de composición. No se recorta, normaliza ni trunca. Se permite pegar y usar gestores de contraseñas. Texto de ayuda: «Entre 15 y 128 caracteres. Puedes usar espacios.».
- **Correo:** no se verifica. El acceso es inmediato tras el registro y el correo no acredita propiedad del buzón. La verificación, si se decide, será una entrega independiente.
- **Sesión:** token opaco de 24 horas desde su creación, sin renovación. Al reabrir la app se verifica con el servidor antes de mostrar contenido privado. Al salir se borran los datos locales; sin conexión se avisa de que la sesión remota vencerá en su plazo.
- **Enlaces públicos:** privacidad y contactos de emergencia se declaran «aún no disponibles» mientras no exista contenido aprobado; no se muestran números inventados.

### 2.8 Perfil, navegación y contenido público (entrega `perfil-navegacion-movil`)

Implementa la navegación de la sección 2.2 con lo que existe hoy y declara con honestidad lo que aún no.

| Vista | Contenido y comportamiento |
|---|---|
| Inicio | Saludo con el nombre; «Reportar un incidente» **deshabilitado** con el texto «Disponible próximamente» (no abre ningún flujo); últimos reportes como «aún no disponible»; contactos de emergencia aprobados o el aviso de que aún no los hay. |
| Mapa, Mis reportes, Alertas | Estado «Aún no disponible» con texto e icono. Sin mapas, reportes, avisos ni cifras de ejemplo y sin solicitar ubicación ni notificaciones. |
| Perfil (cabecera) | Datos personales, preferencias (aún no disponibles), Privacidad, Acerca de AyniSafe, Desarrolladores, Contactos de emergencia y Cerrar sesión. El cierre de sesión vive aquí. |
| Editar datos | Nombre y teléfono opcional, con la autorización «Autorizo compartir mi teléfono». El correo **no** se edita y no se presenta como verificado. |
| Páginas informativas | Leen el contenido público versionado de la API. Una sección pendiente se declara «no disponible»; ante un fallo de red se ofrece «Reintentar». |

Reglas del teléfono: es opcional (7 a 15 dígitos); la autorización es revocable sin borrar el número, se revoca al borrarlo o cambiarlo, y **por ahora no se comparte con ninguna institución**: solo se guarda la preferencia que consumirá el registro de reportes. El retroceso del sistema en una pestaña distinta de Inicio vuelve a Inicio; tras cerrar sesión no queda historial que reabra datos privados.

Contenido público: finalidad, funcionamiento, desarrolladores, privacidad y contactos salen de una fuente versionada en la API (`GET /publico/contenido`) que también podrá usar la web. Los **contactos de emergencia están vacíos**: ninguno está aprobado y el 105 sigue por verificar. El texto de privacidad publicado está redactado solo con lo que la app trata hoy y **queda pendiente de revisión por el equipo**. Sin caché en disco: un contacto de emergencia no se vería sin red; la entrega de administración de contenido decidirá la caché persistente antes de publicar contactos reales.

### 2.9 Web pública y acceso institucional (entrega `web-publica-acceso-institucional`)

Implementa la superficie web de la sección 2.3 con lo que existe hoy y declara con honestidad lo que aún no. La web
es una SPA (React, TypeScript, Vite) servida bajo el **mismo origen** que la API; no hay autorregistro de ninguna
clase ni versión ciudadana completa para el navegador.

| Vista | Contenido y comportamiento |
|---|---|
| Portada (`/`) | Pública, sin sesión. Finalidad, funcionamiento, alcance del piloto y desarrolladores **salen de `GET /publico/contenido`**; la web no escribe texto propio de contenido ni números de emergencia. Una sección pendiente (hoy, el alcance del piloto) se declara «Aún no disponible» con icono. Acceso institucional visible; con sesión vigente ofrece «Ir a mi panel». Errores de red o servicio con «Reintentar». |
| Acceso (`/acceso`) | Correo y contraseña con Mostrar/Ocultar, pegado y gestores de contraseñas. Credenciales incorrectas, de un ciudadano o de una cuenta no activa reciben el **mismo mensaje general**. Estados de espera (429), solicitud no admitida (403), sin conexión y servicio no disponible, con texto e icono y «Reintentar», sin afirmar que se inició sesión. Un solo envío en curso; la contraseña no se guarda. |
| Activación (`/activar`) | Cuenta invitada: lee el código del enlace del correo (fragmento `#t=`), lo quita de la dirección y del historial y lo guarda solo en memoria; si falta, permite pegar el código. Nueva contraseña de 15 a 128 caracteres (misma ayuda que la app). Éxito → vuelve al acceso **sin iniciar sesión**; enlace usado, vencido o inválido sin pedir contraseña. |
| Panel (`/panel/administrador`, `/panel/operador`) | Cabecera con nombre, rol y «Cerrar sesión». Navegación con las secciones de la sección 2.3 (operador: Reportes, Mapa, Indicadores; administrador: Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas, Contenido/contactos), **todas «Aún no disponible»**, sin datos, mapas ni cifras de ejemplo. Lo que se muestra depende solo de la respuesta de la API para ese rol (rol ajeno → 403 → «No tienes permiso»). |

Sesión del navegador: cookie `HttpOnly; Secure; SameSite=Strict` (24 h absolutas, sin renovación) que JavaScript no ve;
al refrescar se consulta al servidor antes de mostrar nada privado. Los guards de ruta de la web solo orientan: la
autorización está en la API. Cabeceras de seguridad (CSP sin terceros, sin incrustación, sin referrer) en `vercel.json`.

Las cuentas de administrador se crean por un procedimiento controlado de línea de comandos y las de operador las
creará la entrega de gestión de cuentas (Spec 06); la web solo permite **activar** una cuenta invitada.

### 2.11 Enrutamiento y bandeja inicial (P4.2)

La evidencia de implementación y sus límites están en [P4.2](../validacion/p4-enrutamiento.md). Se conserva la composición del origen y los componentes de DESIGN.md.

| Vista | Navegación, campos y acciones |
|---|---|
| Incidentes del operador | `/panel/operador/incidentes`: filas de su sede en el orden recibido, del más antiguo al más reciente; referencia, categoría, distrito, papel institucional, estado, condición médica por confirmar y «Sin evaluar». «Cargar más» usa el cursor y «Actualizar» vuelve a consultar desde el inicio. No hay polling. |
| Resumen del operador | `/panel/operador/incidentes/:id`: datos permitidos del caso, descripción, ocurrencia y respuestas marcadas como informadas por el ciudadano. Volver a la bandeja conserva su posición. Un 404 se presenta como «Incidente no disponible», sin distinguir si existe. Sin teléfono ni coordenadas; la condición médica y la evaluación SAMU se describen en 2.12. |
| Inicio del administrador | `/panel/administrador`: solo el bloque «Enrutamiento pendiente», FIFO con paginación y faltantes por institución. «Designar sede» abre un diálogo con sede de la institución faltante y motivo obligatorio de 10 a 500 caracteres. «Reevaluar» consulta la configuración corregida. El resultado confirmado actualiza la lista; un 409 se explica sin simular éxito. El resto del resumen sigue no disponible. |
| Seguimiento móvil | El detalle del autor y la consulta con código muestran el nombre de la institución principal asignada, con icono; sin asignación reconocida, «Pendiente de asignación». Una asignación no confirma recepción institucional ni atención. No se exponen sedes u operadores. |

Las consultas muestran carga, vacío y error con «Reintentar». Un 401 vuelve al acceso sin datos privados y un 403 explica la falta de permiso. El ámbito se valida en cada consulta del backend; las designaciones son excepciones limitadas al caso. El administrador no obtiene acceso a la descripción ni a datos sanitarios.

Pendiente para P6: prioridad revisada, «Asumir caso», actuaciones, cambios de estado, reclasificación, sede coordinadora y sustitución de PNP por Serenazgo. La evaluación y la actualización positiva de la condición médica se describen en 2.12 (P5.1). Pendiente para P8: avisos por usuario, lectura, contador, campana, polling, resumen completo e historial. La administración de reglas y el apoyo local opcional de Serenazgo siguen sin activarse.

### 2.12 Evaluación rápida para SAMU (P5.1)

La evidencia de implementación y sus límites están en [P5.1](../validacion/p5-evaluacion.md). Se conserva la composición del origen (tarjeta de `triageBlock` en Flutter, composición `kv` de `IncidentTriage.jsx` en la web) y los componentes de DESIGN.md. Los controles del origen que exigían teclado (desplegable y campo numérico de afectados) se sustituyen por botones porque lo exige RF44.

| Vista | Navegación, campos y acciones |
|---|---|
| Formulario móvil | «¿Hay heridos?» también en Emergencia médica. El bloque «Evaluación rápida para SAMU» aparece cuando SAMU interviene con las respuestas (emergencia médica siempre; accidente con heridos o atención «Sí»; agresión, pelea o violencia con heridos «Sí») y se oculta cuando deja de intervenir, conservando lo marcado sin enviarlo. Cantidad con 1–5, «Otra cantidad» con − y + (6 a 999) y «No sé», sin teclado; observaciones de una sola persona principal (signos de vida, conciencia, sangrado) con «No sé» visible y distinto de «No». Sin preselección; se puede enviar con información pendiente. |
| Mis reportes (detalle) | «Tu evaluación para SAMU» con las respuestas propias, «Informado el» y «Sin respuesta» en las omitidas, sin presentarlas como estado actual. Si SAMU interviene sin observaciones, aviso con icono y «Completar evaluación»; si no, «Aclarar evaluación» mientras el caso esté abierto. La aclaración reutiliza los controles, envía solo lo que cambia y conserva lo marcado ante un error de red. La consulta con código no muestra la evaluación. |
| Resumen del operador | Bloque «Condición médica» con la respuesta original del ciudadano y, por separado, la condición vigente (heridos, atención, cantidad, quién la informó, institución, instante y versión) y la condición por confirmar. «Precisar condición médica» abre un diálogo con grupos de opciones y motivo obligatorio de 10 a 500 caracteres; si la precisión incorpora a SAMU, se informa y el resumen se recarga. |
| Evaluación SAMU | Solo cuando la API indica acceso sanitario (sede SAMU participante): «Evaluación rápida» con la versión vigente, las observaciones de la persona principal, el historial como lista ordenada (origen, institución, instante, campos y motivo) y «Registrar aclaración». Las demás instituciones no ven esta sección ni los motivos. Un fallo muestra «Evaluación no disponible» sin ocultar el resto del resumen. |

Presentación web (ajuste del 27/11/2026, dentro del sistema actual por decisión del responsable): la condición vigente y las observaciones se muestran en mini-tarjetas (`.cards`/`.mini-card` del origen) con el valor como insignia con texto e icono: «Sí» con el aviso ámbar, «No» con la insignia neutra, y «No sabe» o «Sin respuesta» con la insignia gris de «Sin evaluar». No es una clasificación clínica. La respuesta original aparece en la tarjeta solo cuando difiere de la vigente. El historial es una línea de tiempo de la versión más reciente a la más antigua, con los campos modificados como insignias y el motivo destacado. No se añadieron colores ni tipografías: solo disposición con tokens existentes.

Los grupos de opciones de la web usan `fieldset`, leyenda y radios con la composición `.choice-list` del origen, operables con teclado. En Flutter, las tarjetas de preguntas no fusionan su contenido en un único nodo semántico: el título es el único encabezado. El administrador, el invitado, el mapa y los avisos no reciben datos sanitarios.

### 2.13 Fotografías del reporte (P5.2)

La evidencia de implementación y sus límites están en [P5.2](../validacion/p5-evidencias.md). Se conserva la composición del origen: botón «Adjuntar foto opcional» con hoja de galería y cámara en `report.dart`, y rejilla `.evidence-grid` con `.evidence-card` en `Incidents.jsx`. El origen admitía una sola foto; aquí se admiten tres sin crear estilos nuevos. Las fotos se suben después del registro: su falta o su fallo nunca deshacen ni bloquean el reporte.

| Vista | Navegación, campos y acciones |
|---|---|
| Formulario móvil | «Fotos (opcional)» después de la evaluación y antes del teléfono. «Adjuntar foto opcional» abre «Elegir de galería» o «Tomar foto». Hasta 3 miniaturas («Foto N de M»), cada una con «Quitar». Se comprime en el dispositivo; una foto de más de 5 MB, o que no sea JPEG, PNG ni WebP, se rechaza junto a la sección con texto e icono, sin perder el formulario. Negar el permiso de cámara o galería explica la alternativa y no impide enviar. |
| Comprobante móvil | Tarjeta «Fotos» con el estado de cada una: pendiente, enviando, adjuntada, no se adjuntó, rechazada o fuera de plazo, con texto e icono. Si alguna falla: «Reintentar fotos» (misma clave, sin duplicar) y «Continuar sin esta foto». El permiso de carga del invitado nunca se muestra. |
| Mis reportes (detalle) | «Tus fotos» con las miniaturas propias, obtenidas con la sesión y guardadas solo en memoria; al tocar una se amplía y «Cerrar» la cierra. Una foto que no se puede obtener aparece «No disponible». La consulta con código no muestra fotos. |
| Resumen del operador | Panel «Fotografías» con las tarjetas del origen: la imagen, que es un botón para ampliarla en el diálogo del sistema, y el pie «Adjuntada …». Sin fotos: «El ciudadano no adjuntó fotografías.». Una foto no disponible no oculta el resto del resumen. Sin URLs ni identificadores del proveedor; nada se guarda en el navegador. |

El administrador, el invitado, el mapa y los avisos no reciben fotos.

## 3. Aspectos pendientes

Los siguientes puntos no constituyen decisiones cerradas ni deben presentarse como requisitos ya aprobados:

| Aspecto | Estado y siguiente definición necesaria |
|---|---|
| Valores exactos de la paleta | Se gestionan en [DESIGN.md](../../DESIGN.md), sección Colors. Las pruebas de contraste existentes (`apps/web/test/diseno.test.ts` y las de Flutter) verifican combinaciones de la implementación heredada; no aprueban una dirección de rediseño. |
| Detalle visual de componentes | Se gestiona en [DESIGN.md](../../DESIGN.md). Dirección elegida: réplica del origen; pendiente implementación y comparación renderizada, sin otra elección visual. |
| Marca | Compromisos en [PRODUCT.md](../../PRODUCT.md); tratamiento visual y pendientes en [DESIGN.md](../../DESIGN.md). |
| Política de contraseña | **Resuelto** para el acceso ciudadano: ver sección 2.7. |
| Verificación de correo | **Resuelto** para esta entrega (no se verifica): ver sección 2.7. Una verificación futura se decide por separado de la recuperación. |
| Correo de recuperación | **Resuelto para el piloto con reservas:** Gmail API por HTTPS con cuenta dedicada (ver sección 2.5), porque el SMTP de Gmail está **bloqueado** desde Render Free (comprobado el 21/11/2026). Probado desde la máquina de desarrollo con envío real a dos buzones (entrega a bandeja de entrada en menos de un minuto, asunto correcto). **Pendiente:** que el nombre «AyniSafe» aparezca como remitente, comprobar el envío desde Render, el enlace verificado en un dispositivo real y la entrega a más proveedores de correo. |
| Cambio de correo | **Pendiente (entrega futura).** El correo es la clave de identidad y el destino de la recuperación y no se verifica; editarlo sin verificación permitiría que una sesión robada redirija el enlace de recuperación a un buzón ajeno. Mínimo necesario: correo pendiente, token al **nuevo** buzón, aviso al anterior, reautenticación y revocación de sesiones. Hasta entonces el perfil lo muestra de solo lectura. |
| Texto de privacidad y contenido público | Redactado en la entrega `perfil-navegacion-movil` con los datos que la app trata hoy; falta la revisión del equipo, la aprobación de los contactos (incluido el 105) y la caché persistente de contactos. |
| Distribución adaptable | Se gestiona en [DESIGN.md](../../DESIGN.md), sección Layout. Los recorridos y permisos de esta guía se conservan al adaptar la composición. |
| Pantallas y mensajes finales | Afinar wireframes y textos de privacidad. Los mensajes de validación, conexión y recuperación ya están definidos en la implementación y se revisan con las pruebas de usabilidad. |
| Validación visual y accesibilidad | Comprobar contraste, escalado, foco, lectores de pantalla y comprensión de los flujos. Los criterios acordados no equivalen a pruebas superadas. |

Una versión ciudadana completa para navegador requeriría una decisión explícita de ampliación de alcance. No se considera una entrega pendiente del alcance actual.

## 4. Estado del trabajo

Esta guía registra las decisiones aceptadas y las cuestiones abiertas. La implementación de pantallas y componentes no forma parte de esta documentación.
