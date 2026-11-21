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

La recuperación utiliza correo con token de un solo uso y vencimiento, conforme a las reglas existentes. Se contemplan las vistas de solicitud de recuperación, nueva contraseña y enlace vencido o usado; el envío real depende de resolver el proveedor y remitente pendientes.

**Excepción temporal (entrega `registro-login-ciudadano`):** la recuperación (RF03) queda diferida a una entrega posterior. Hasta entonces el acceso **no** muestra el enlace «Olvidé mi contraseña»: muestra el texto informativo no interactivo «Recuperación de contraseña: próximamente», sin ruta ni envío de correo. Al habilitar RF03 se reemplaza por el enlace descrito arriba. Mientras tanto, quien olvide su contraseña no tiene salida autoservicio.

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

## 3. Aspectos pendientes

Los siguientes puntos no constituyen decisiones cerradas ni deben presentarse como requisitos ya aprobados:

| Aspecto | Estado y siguiente definición necesaria |
|---|---|
| Valores exactos de la paleta | Se propusieron azul `#17324D`, verde azulado `#007F78`, fondo `#F5F7FA` y texto `#172B3A`. En la app móvil se midió el contraste de las combinaciones usadas (WCAG AA): el verde azulado `#007F78` alcanza 4,54:1 sobre el fondo, pero no 4,5:1 sobre los fondos de mensaje, por lo que el texto de enlaces usa `#006B65`. Quedan por definir estados de interacción adicionales y la validación para la web. |
| Detalle visual de componentes | Definir radios, bordes, sombras, iconos, escala tipográfica completa y colores de interacción. La dirección general ya está aceptada. |
| Marca | Resolver logotipo y otros recursos propios de identidad. Los motivos geométricos de la alternativa comunitaria no fueron adoptados. |
| Política de contraseña | **Resuelto** para el acceso ciudadano: ver sección 2.7. |
| Verificación de correo | **Resuelto** para esta entrega (no se verifica): ver sección 2.7. Una verificación futura se decide por separado de la recuperación. |
| Correo de recuperación | Seleccionar proveedor y remitente y validar entrega, vencimiento y uso único. |
| Distribución adaptable | Detallar dimensiones, puntos de cambio y comportamiento del panel en pantallas estrechas. |
| Pantallas y mensajes finales | Afinar wireframes, textos de privacidad y mensajes concretos de validación, conexión y recuperación. |
| Validación visual y accesibilidad | Comprobar contraste, escalado, foco, lectores de pantalla y comprensión de los flujos. Los criterios acordados no equivalen a pruebas superadas. |

Una versión ciudadana completa para navegador requeriría una decisión explícita de ampliación de alcance. No se considera una entrega pendiente del alcance actual.

## 4. Estado del trabajo

Esta guía registra las decisiones aceptadas y las cuestiones abiertas. La implementación de pantallas y componentes no forma parte de esta documentación.
