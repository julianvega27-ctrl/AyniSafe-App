# Tasks

Todas las tareas están pendientes. Este archivo planifica implementación futura; no autoriza despliegue ni acredita pruebas ejecutadas. Referencias: `design.md` y `specs/identidad/{recuperacion-activacion-cuenta,acceso-ciudadano}/spec.md`.

## 1. Spike de proveedor y remitente (condición previa, bloqueante)

Resultado del spike 1.2: Render Free bloquea el SMTP de Gmail; el proveedor de producción es la Gmail API por HTTPS (1.4). La verificación desde el entorno desplegado queda para la entrega de despliegue (ver «Workflow follow-up»).

- [x] 1.1 Crear la cuenta Gmail dedicada con verificación en dos pasos y contraseña de aplicación, guardada solo en variables de entorno; verificar que no hay credenciales en Git ni en la salida de comandos.
- [x] 1.2 Con un script mínimo desechable, comprobar desde un servicio Render Free temporal la conectividad a `smtp.gmail.com` en 465 y 587 y retirar el servicio; verificar y registrar en `design.md` (Decisión 1) qué puerto funciona o que está bloqueado.
- [x] 1.3 Enviar un correo real controlado a al menos dos buzones del equipo (Gmail y un correo institucional); verificar que llega, en qué bandeja cae y que el remitente muestra «AyniSafe», y anotar el resultado. Si el SMTP está bloqueado o cae en spam, detener y aplicar `openspec-update-change` para pasar al plan B o C antes de seguir (resuelto: ver 1.4).
- [ ] 1.4 Habilitar la Gmail API, crear el cliente OAuth de tipo Aplicación web (permiso `gmail.send` únicamente, redirección `http://localhost:8787/callback`) y un script de un solo uso que obtenga el refresh token y lo guarde en `.env` sin imprimirlo; verificar que el token se obtiene con la cuenta dedicada, que ningún secreto aparece en la salida ni en Git, y registrar en `design.md` el estado de la pantalla de consentimiento (si está en «Prueba», documentar el riesgo de caducidad a 7 días).

## 2. Modelo de datos y migración

- [x] 2.1 Añadir `TokenCuenta`, `EnvioCorreo`, el valor `pendiente_activacion` y `passwordHash` nullable con `CHECK` (nulo si y solo si estado pendiente), con índices y el índice único parcial de envíos activos; verificar migración desde BD vacía y desde el esquema de Spec 01, y que PostgreSQL rechaza hash nulo en cuentas activas y hash presente en pendientes.
- [x] 2.2 Adaptar el dominio `Usuario` a hash nulo y la rama de login para ejecutar la verificación ficticia ante hash nulo; verificar con pruebas de integración que una cuenta pendiente recibe el 401 uniforme y que los escenarios de login de Spec 01 siguen pasando.
- [x] 2.3 Añadir `revocarTodasDe` a `SesionesPort` y su adaptador Prisma; verificar con BD real que revoca todas las sesiones del usuario, no toca las de otros y que el cierre voluntario sigue revocando solo la actual.

## 3. Tokens de cuenta y consumo atómico

- [x] 3.1 Implementar emisión de tokens con `TokenPort`, vencimientos 30 min/72 h e invalidación de los pendientes del mismo usuario y propósito; verificar con reloj controlado y que no existe el token en claro en la base de datos.
- [x] 3.2 Implementar consulta de estado (vigente, usado, vencido, inválido) sin efectos; verificar 200/410/410/404 y que la consulta no altera el token.
- [x] 3.3 Implementar consumo atómico con `UPDATE … RETURNING`, bloqueo de usuario, propósito y estado de cuenta, hash fuera de la transacción, invalidación de demás tokens y revocación total; verificar dos consumos simultáneos con una sola ganadora, rollback ante fallo (503, token reutilizable), propósito cruzado y cuenta suspendida tras emitir.
- [x] 3.4 Reutilizar la validación de contraseña de Spec 01 y comprobar el orden (400 de campos antes de consumir); verificar límites 14/15/128/129, espacios y puntos de código no BMP, y que un 400 deja el token vigente.

## 4. Puerto de correo y cola de envíos

- [x] 4.1 Definir `CorreoPort`, el adaptador de pruebas en memoria, el de archivo para desarrollo y la selección por entorno con rechazo en producción; verificar con pruebas que producción con adaptador de pruebas falla al arrancar sin mostrar valores.
- [x] 4.2 Implementar `SmtpCorreoAdapter` con nodemailer (versión fijada), tiempo máximo de conexión y códigos de error genéricos; verificar con un servidor SMTP local de pruebas la composición del mensaje y que los errores no incluyen texto del proveedor ni credenciales. Este servidor local no cuenta como validación del proveedor.
- [x] 4.3 Implementar la cola `EnvioCorreo`: encolado dentro de la transacción del llamador, reclamo con arrendamiento, generación del token al enviar, reintentos con espera creciente, vencimiento de envíos de recuperación y activación del trabajador sin sondeo en reposo; verificar con adaptador que falla/recupera, reinicio con pendientes, no duplicar uno ya enviado y que no hay temporizador sin pendientes.
- [x] 4.4 Redactar el correo en texto plano (recuperación y activación) con enlace de fragmento, vigencia y aviso de «vale el enlace más reciente»; verificar con pruebas que el enlace no contiene el token fuera del fragmento y que los logs no incluyen cuerpo ni enlace.
- [x] 4.5 Implementar `GmailApiCorreoAdapter` con `fetch`: renovar y cachear el token de acceso, enviar el mensaje RFC 2822 en base64url, aplicar tiempos máximos y traducir los errores a códigos genéricos; verificar con un servidor HTTP falso la renovación y el envío, `invalid_grant` → `AUTENTICACION`, 429 o cuota → `CUOTA`, 5xx, red o tiempo agotado → `CONEXION` o `TIEMPO_AGOTADO`, 400 → `RECHAZADO`, la ausencia de inyección de cabeceras (saltos de línea en asunto o destinatario), que la cola clasifica `AUTENTICACION` y reintenta sin filtrar secretos, y que ni errores ni logs contienen tokens, secreto del cliente, destinatario ni cuerpo. El servidor falso no cuenta como validación del proveedor.
- [x] 4.6 Añadir `gmail-api` a `EMAIL_ADAPTER` y validar `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` y `GMAIL_REFRESH_TOKEN` en `entorno.ts`; en producción solo se admiten `gmail-api` y `smtp`; verificar con pruebas de configuración (variables faltantes, producción con `prueba` o `archivo`, mensajes sin valores) y con `.env.example` actualizado.
- [x] 4.7 Enviar un correo real por la Gmail API desde la máquina de desarrollo a dos buzones del equipo (Gmail y un correo institucional); verificar que llega, en qué bandeja cae y que el remitente muestra «AyniSafe», y anotar el resultado.

## 5. Casos de uso y rutas HTTP

- [x] 5.1 Implementar solicitud de recuperación con respuesta 202 uniforme y encolado solo para ciudadano activo; verificar cuenta existente/inexistente/suspendida/pendiente/operador con cuerpo y estado idénticos y que solo la primera genera envío.
- [x] 5.2 Implementar rutas `POST /auth/tokens/consulta`, `/auth/contrasena/restablecer` y `/auth/activaciones` con límites de cuerpo, Content-Type, no-store y formato de error común; verificar contratos 204/400/404/410/429/503 y que las respuestas no incluyen sesión.
- [x] 5.3 Implementar `InvitarCuentaUseCase` que acepta la transacción del llamador y solo encola; verificar que se revierte con la transacción del llamador y que ninguna ruta pública crea operadores o administradores.
- [x] 5.4 Servir `GET /cuenta/restablecer`, `/cuenta/activar` y `/.well-known/assetlinks.json` con CSP restrictiva y sin registrar fragmentos; verificar contenido, cabeceras, que la página lee el fragmento en el cliente y que el JSON refleja paquete y huellas configuradas.
- [x] 5.5 Verificar la política de sesiones: tras restablecer, sesiones previas devuelven 401 en GET `/auth/sesion` y el cierre voluntario sigue siendo individual; verificar con dos sesiones en BD real.

## 6. Límites, cuota, purga y configuración

- [x] 6.1 Añadir tipos de ventana (`recuperacion_ip`, `recuperacion_correo_ip`, `recuperacion_correo`, `token_ip`, `correo_dia`) con umbrales configurables y claves HMAC; verificar 429 con Retry-After, concurrencia, persistencia tras reinicio y que no hay bloqueo permanente de un correo.
- [x] 6.2 Implementar el tope diario global con 503 uniforme y diferimiento de invitaciones; verificar que alcanza el tope sin distinguir cuentas y se libera al cambiar el día con reloj controlado.
- [x] 6.3 Extender la purga a tokens y envíos terminados (7 días); verificar con reloj controlado que no borra tokens vigentes ni envíos pendientes.
- [x] 6.4 Validar y documentar en `entorno.ts` y `.env.example` las variables nuevas sin imprimir valores; verificar mensajes de error sin secretos y arranque local con el adaptador de archivo.
- [x] 6.5 Prueba de redacción: ejecutar solicitud, envío fallido, consulta y cambio con valores identificables; verificar que ni logs, errores, respuestas ni persistencia contienen contraseña, token, enlace ni clave SMTP.

## 7. Contrato y documentación de API

- [x] 7.1 Añadir las rutas nuevas, errores y cabeceras a `openapi.yaml` y validar con el script de contrato existente; verificar que coincide con las respuestas reales y que no hay rutas de creación de operadores.
- [x] 7.2 Documentar en el README de API el flujo, variables, el spike, límites, cuota de Gmail y cómo probar con el adaptador de archivo; verificar que otra persona puede seguir los comandos y que se declara que el adaptador de pruebas no valida el proveedor.
- [x] 7.3 Documentar en el README de la API la configuración de la Gmail API (proyecto de Google Cloud, cliente web, permiso `gmail.send`, usuarios de prueba, estado «En producción», script del refresh token, variables) y que el SMTP solo sirve en local; verificar que otra persona puede reproducir el procedimiento sin secretos en el texto.

## 8. Flutter: pantallas y repositorio

- [x] 8.1 Ampliar `AuthRepositorio` y el cliente HTTP con solicitud, consulta, restablecimiento y activación, mapeando 202/204/400/404/410/429/503 a estados; verificar con pruebas de repositorio y que no hay reintentos automáticos ni almacenamiento persistente de token o contraseña.
- [x] 8.2 Sustituir el texto «próximamente» por el enlace «Olvidé mi contraseña» y construir solicitud de recuperación con confirmación neutral; verificar con pruebas de widgets el mensaje neutral, un solo envío con doble toque y los estados 429/503/conexión.
- [x] 8.3 Construir las pantallas de nueva contraseña, «Tengo un código», enlace usado/vencido y éxito con aviso al volver al acceso; verificar contraseña 14/15/128/129, Mostrar/Ocultar sin pérdida, descarte al salir, textos con icono y botones de 48.
- [x] 8.4 Construir la pantalla de activación reutilizable (sin crear cuentas) para el token de activación; verificar con pruebas de widgets que consume el endpoint y vuelve al acceso sin sesión.
- [x] 8.5 Comprobar el 401 en el segundo dispositivo: la restauración con sesión revocada borra el token y pide iniciar sesión; verificar con prueba de controlador de sesión sin mostrar datos privados.

## 9. Android: enlaces verificados

- [x] 9.1 Añadir intent-filter `autoVerify` para `/cuenta/*` y `app_links` (versión fijada) con enrutamiento a las pantallas; verificar que `flutter analyze` pasa y que el enlace abre la pantalla correcta con la app en frío y en segundo plano.

## 10. Documentación del producto y conciliación

- [x] 10.1 Actualizar `docs/05-diseno-ui/guia-ui.md` (§2.5 y §3): retirar la excepción temporal, describir las pantallas y marcar «Correo de recuperación» como resuelto para el piloto; verificar que no contradice las specs.
- [x] 10.2 Actualizar RF03 y los documentos 09, 11 y `revision-consistencia-y-costos.md` (P1 y línea de proveedor) con el remitente de piloto, sus límites y la activación sin contraseñas compartidas; verificar con búsqueda que no queda «proveedor y remitente pendientes» sin matiz ni se declara RF29 completo.
- [x] 10.3 Conciliar la guía UI, RF03, los documentos 09 y 11, la revisión de costos y el README con la Gmail API como proveedor de producción, el resultado del spike y que RF03 no se declara completo en producción hasta verificar el envío y el enlace desde el entorno desplegado; verificar con una búsqueda que no quedan referencias a Gmail SMTP como camino de producción.

## 11. Integración y aceptación

- [x] 11.1 Ejecutar la suite completa de API contra PostgreSQL real aislado y la de Flutter; verificar que Spec 01 sigue pasando y registrar comandos y resultados en `informe-aceptacion.md` del cambio.
- [ ] 11.2 Prueba extremo a extremo en Android, en local, con el proveedor real (Gmail API): registrar cuenta, abrir sesión en dos dispositivos, solicitar recuperación (correo real al buzón del equipo), pegar el código en «Tengo un código» (el enlace verificado queda para el despliegue), cambiar la contraseña, comprobar el 401 en el segundo dispositivo, el enlace reutilizado y el vencido (adelantando su vencimiento en la base de pruebas); verificar y documentar cada resultado, incluido el comportamiento en bandeja y spam.
- [ ] 11.3 Revisar accesibilidad con lector de pantalla, teclado y texto al 200 % en las pantallas nuevas; verificar y registrar hallazgos sin declarar la validación visual cumplida si no se ejecutó.
- [x] 11.4 Comprobar que no se crearon operadores, que no hay verificación de correo y que el login ciudadano no exige correo confirmado; verificar con una revisión de rutas, datos y pruebas.

## Workflow follow-up

- Al archivar, sincronizar los deltas y editar a mano el *Purpose* de `identidad/acceso-ciudadano` (hoy dice que la recuperación pertenece a cambios posteriores).
- Verificar tras archivar que `openspec validate` pasa con ambas capacidades.
- Spec 06 consumirá `InvitarCuentaUseCase` dentro de su propia transacción.
- **Pendiente para la entrega de despliegue (Spec 22), fuera de este cambio:** (a) comprobar desde Render Free el envío real por la Gmail API; (b) configurar `API_PUBLIC_URL` y `ANDROID_CERT_SHA256` y verificar el dominio de los App Links con `adb shell pm get-app-links`; (c) comprobar en un dispositivo real que el enlace del correo abre la app y que sin la app se ve la página de respaldo con el código copiable; (d) repetir el recorrido de 11.2 con el enlace verificado. Hasta entonces RF03 no se declara completo en producción.
- Un commit o despliegue permanente son acciones separadas y requieren autorización.
