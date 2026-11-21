# Guía de UI inicial de AyniSafe

Fecha: 20 de noviembre de 2026.

Estado: dirección de diseño aceptada. Esta guía documenta acuerdos de la exploración; no acredita implementación ni validación visual o de accesibilidad.

## 1. Alcance y referencias

La UI inicial comprende la navegación de la app ciudadana, la web pública y el panel institucional. El primer flujo a detallar es el registro e inicio de sesión ciudadano.

Esta guía complementa las reglas de producto existentes, sin sustituirlas:

- [Requisitos funcionales](../01-analisis-del-sistema/03-requisitos-funcionales.md): cuentas, permisos, perfil, recuperación y acceso público.
- [Restricciones](../01-analisis-del-sistema/05-restricciones.md): Flutter/Dart para la app y React/TypeScript para la web.
- [Alcance funcional, territorial e institucional](../01-analisis-del-sistema/09-alcance-territorial-e-institucional.md): secciones, roles y límites de acceso.
- [Operación, publicación y conservación](../01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md): registro, privacidad y etiquetas de prioridad.

## 2. Decisiones confirmadas

### 2.1 Dirección visual

Se adopta la alternativa **cívica cercana**, con azul profundo, verde azulado, fondos claros y tarjetas de formas suaves. La intención es transmitir confianza y facilitar la comprensión de las acciones ciudadanas.

Se acuerda utilizar tipografía del sistema, texto base de 16 unidades lógicas, botones con altura mínima de 48 unidades lógicas y espaciado basado en múltiplos de 8. En móvil se adaptarán a las unidades de Flutter y en web a píxeles CSS, respetando el escalado del texto.

Los campos tendrán etiquetas persistentes. Los estados y mensajes combinarán texto e iconos con color, sin depender exclusivamente de este último. El rojo y el ámbar se reservan para mensajes que requieran atención, evitando usarlos como decoración general.

Las etiquetas operativas conservan la semántica ya definida en la política del producto: Sin evaluar (gris/reloj), Normal (azul/información), Alta (ámbar/alerta) y Urgente (rojo/alarma). Esta guía no cambia el orden por llegada de la bandeja.

### 2.2 Navegación móvil

Se adopta un inicio orientado a acciones, con cuatro destinos en la barra inferior:

| Destino | Contenido principal |
|---|---|
| Inicio | Acción principal «Reportar un incidente», últimos reportes propios y contactos de emergencia. |
| Mapa | Incidentes publicables y filtros autorizados. |
| Mis reportes | Reportes del ciudadano y seguimiento privado de cada envío. |
| Alertas | Avisos propios y acceso a sus preferencias. |

El perfil se abre desde la cabecera. Agrupa datos personales, preferencias, privacidad, información sobre AyniSafe y cierre de sesión. La acción «Reportar» es protagonista en Inicio; el mapa no será la pantalla principal de esta alternativa.

La información pública y los contactos no requieren iniciar sesión. Los reportes personales y el envío de un reporte sí requieren autenticación. El diseño deberá mantener esta distinción antes y después del acceso.

### 2.3 Navegación web

La web mantiene una portada pública y un panel protegido, con navegación según los permisos del usuario.

| Superficie | Organización acordada |
|---|---|
| Portada pública | Finalidad, funcionamiento, alcance del piloto, desarrolladores y acceso institucional visible. |
| Panel del operador | Navegación lateral con Reportes, Mapa e Indicadores; avisos y cuenta en cabecera. Actuaciones y derivaciones dentro del detalle del caso. |
| Panel del administrador | Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas y Contenido/contactos; acceso a los avisos de su ámbito. |

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

## 3. Aspectos pendientes

Los siguientes puntos no constituyen decisiones cerradas ni deben presentarse como requisitos ya aprobados:

| Aspecto | Estado y siguiente definición necesaria |
|---|---|
| Valores exactos de la paleta | Se propusieron azul `#17324D`, verde azulado `#007F78`, fondo `#F5F7FA` y texto `#172B3A`. En la app móvil se midió el contraste de las combinaciones usadas (WCAG AA): el verde azulado `#007F78` alcanza 4,54:1 sobre el fondo, pero no 4,5:1 sobre los fondos de mensaje, por lo que el texto de enlaces usa `#006B65`. Quedan por definir estados de interacción adicionales y la validación para la web. |
| Detalle visual de componentes | Definir radios, bordes, sombras, iconos, escala tipográfica completa y colores de interacción. La dirección general ya está aceptada. |
| Marca | Resolver logotipo y otros recursos propios de identidad. Los motivos geométricos de la alternativa comunitaria no fueron adoptados. |
| Política de contraseña | **Resuelto** para el acceso ciudadano: ver sección 2.7. |
| Verificación de correo | **Resuelto** para esta entrega (no se verifica): ver sección 2.7. Una verificación futura se decide por separado de la recuperación. |
| Correo de recuperación | **Resuelto para el piloto con reservas:** Gmail API por HTTPS con cuenta dedicada (ver sección 2.5), porque el SMTP de Gmail está **bloqueado** desde Render Free (comprobado el 21/11/2026). Probado desde la máquina de desarrollo con envío real a dos buzones (entrega a bandeja de entrada en menos de un minuto, asunto correcto). **Pendiente:** que el nombre «AyniSafe» aparezca como remitente, comprobar el envío desde Render, el enlace verificado en un dispositivo real y la entrega a más proveedores de correo. |
| Cambio de correo | **Pendiente (entrega futura).** El correo es la clave de identidad y el destino de la recuperación y no se verifica; editarlo sin verificación permitiría que una sesión robada redirija el enlace de recuperación a un buzón ajeno. Mínimo necesario: correo pendiente, token al **nuevo** buzón, aviso al anterior, reautenticación y revocación de sesiones. Hasta entonces el perfil lo muestra de solo lectura. |
| Texto de privacidad y contenido público | Redactado en la entrega `perfil-navegacion-movil` con los datos que la app trata hoy; falta la revisión del equipo, la aprobación de los contactos (incluido el 105) y la caché persistente de contactos. |
| Distribución adaptable | Detallar dimensiones, puntos de cambio y comportamiento del panel en pantallas estrechas. |
| Pantallas y mensajes finales | Afinar wireframes y textos de privacidad. Los mensajes de validación, conexión y recuperación ya están definidos en la implementación y se revisan con las pruebas de usabilidad. |
| Validación visual y accesibilidad | Comprobar contraste, escalado, foco, lectores de pantalla y comprensión de los flujos. Los criterios acordados no equivalen a pruebas superadas. |

Una versión ciudadana completa para navegador requeriría una decisión explícita de ampliación de alcance. No se considera una entrega pendiente del alcance actual.

## 4. Estado del trabajo

Esta guía registra las decisiones aceptadas y las cuestiones abiertas. La implementación de pantallas y componentes no forma parte de esta documentación.
