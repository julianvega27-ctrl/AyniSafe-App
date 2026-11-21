# Design

## Context

Motivación en `proposal.md`; criterios en `specs/identidad/recuperacion-activacion-cuenta/spec.md` y el delta de `acceso-ciudadano`. Spec 01 está archivada y su código existe en `apps/api` (módulo Identidad por capas, Prisma, Argon2id con tope de concurrencia, limitador persistente en `VentanaIntentos`, `TokenPort` con 32 bytes CSPRNG y SHA-256) y `apps/mobile` (Flutter con `Navigator`, sin router ni deep links).

Observado: no hay puerto ni adaptador de correo, ni cola de envíos, ni ruta de recuperación. `Usuario.passwordHash` es obligatorio y `EstadoUsuario` solo tiene `activo|suspendido`. El login y la verificación de sesión ya rechazan lo que no sea ciudadano activo. Aplicación Android: `pe.edu.unsch.ayni_safe`, sin intent-filters de enlaces.

Restricciones: USD 0 (RC04); Render Free se suspende tras 15 min y el doc de costos advierte que sondear Neon impide su reposo; el diseño interno prevé outbox pero no está implementado. Decisiones tomadas en explore: Gmail SMTP con cuenta dedicada como remitente de piloto, sesiones revocadas en bloque, sin verificación de correo, sin OAuth/MFA.

## Goals / Non-Goals

**Goals:** recuperación y activación seguras con un único mecanismo de token; envío recuperable tras el commit sin filtrar existencia de cuentas; capacidad de invitación utilizable en la transacción de Spec 06; proveedor comprobado con envío real antes de construir sobre él.

**Non-Goals:** crear operadores o sedes; interfaz web de activación (Spec 04/06); recuperación desde la web; verificar correos; avisos por correo del cambio de contraseña; dominio propio; despliegue permanente; un sistema general de notificaciones (Spec 17/18).

## Decisions

### 1. Proveedor: Gmail API por HTTPS detrás de `CorreoPort`; SMTP solo local

Puerto `CorreoPort.enviar({ para, asunto, texto })` con cuatro adaptadores: `GmailApiCorreoAdapter` (producción), `SmtpCorreoAdapter` (nodemailer, solo local o hosts que permitan SMTP), `CorreoArchivoAdapter` (solo desarrollo, escribe en una carpeta ignorada por Git) y `CorreoPruebaAdapter` (memoria, para tests). Se elige con `EMAIL_ADAPTER=gmail-api|smtp|archivo|prueba`; con `NODE_ENV=production` solo `gmail-api` y `smtp` son válidos y el arranque falla en otro caso.

**Por qué no SMTP en producción (spike 1.2, 21/11/2026):** un servicio Render Free temporal (región Oregon) no pudo conectar a `smtp.gmail.com` ni en 465 ni en 587: ambos fallaron con `ETIMEDOUT` en unos 265 ms (rechazo de red, no lentitud), y un envío autenticado desde ese servicio también falló. El servicio se eliminó al terminar. Desde la máquina de desarrollo el mismo SMTP sí funciona: autenticó y entregó a un buzón `@unsch.edu.pe` y otro `@gmail.com` en bandeja de entrada, con remitente «AyniSafe» y en cerca de un minuto.

**Gmail API (decisión del usuario):** se llama por HTTPS (443), que Render no bloquea, con `fetch` y sin dependencias nuevas.

- Cliente OAuth de tipo **Aplicación web** en un proyecto de Google Cloud, con la Gmail API habilitada y un único permiso: `https://www.googleapis.com/auth/gmail.send`. Remitente: la cuenta Gmail **dedicada** que autoriza, nombre visible «AyniSafe». Es un remitente de piloto, no institucional.
- Flujo por envío: renovar el token de acceso en `oauth2.googleapis.com/token` con el refresh token (se cachea en memoria hasta poco antes de vencer; nunca se persiste ni se registra) y enviar el mensaje en `gmail.googleapis.com/gmail/v1/users/me/messages/send` con el cuerpo `raw` (RFC 2822 en base64url). Texto plano, asunto codificado, sin HTML ni seguimiento, y las direcciones y el asunto se validan para impedir saltos de línea (inyección de cabeceras).
- Tiempos máximos por llamada (`AbortSignal`) y errores traducidos a los mismos códigos genéricos del puerto: `invalid_grant` o 401 → `AUTENTICACION`; 429 o cuota de Gmail → `CUOTA`; 5xx, red o tiempo agotado → `CONEXION` o `TIEMPO_AGOTADO`; 400 → `RECHAZADO`; el resto → `DESCONOCIDO`. Nunca se conservan tokens, secreto del cliente, destinatario ni cuerpo.
- El refresh token se obtiene una sola vez con un script que abre la pantalla de autorización, recibe el código en `http://localhost:8787/callback` y lo guarda en `.env` sin imprimirlo (el secreto del cliente y el token nunca pasan por el chat ni por una web de terceros).
- Cuota: la de Gmail para cuentas personales (500/día publicados); el tope propio sigue en 400/día (`EMAIL_DIARIO_MAX`).

Alternativas descartadas: Brevo por API HTTPS (alternativa válida, pero exige otra cuenta y la alineación DMARC de un remitente `@gmail.com` puede mandar el correo a spam); Resend (exige dominio propio verificado); SMTP en Render Free (bloqueado). El `CorreoPort` permite cambiar de proveedor sin tocar los casos de uso.

### 2. Un solo mecanismo de token para recuperación y activación

Tabla `TokenCuenta`: `id`, `usuarioId` (FK, cascada), `proposito` (`recuperacion|activacion`), `tokenHash` único (SHA-256 hex vía `TokenPort`), `createdAt`, `expiresAt`, `usedAt` nullable, `invalidadoAt` nullable. Vencimiento: 30 min en recuperación y 72 h en activación (valores técnicos propuestos, configurables). Emitir uno nuevo marca como invalidados los pendientes del mismo usuario y propósito.

Alternativa descartada: códigos cortos de 6–8 dígitos. Serían más cómodos de pegar, pero obligarían a limitar intentos por cuenta y debilitarían el uso único; el token largo ya se transporta por enlace y se pega solo como respaldo.

### 3. Consumo atómico

Una transacción: bloquear la fila del usuario; `UPDATE tokens_cuenta SET used_at = now WHERE token_hash = $1 AND used_at IS NULL AND invalidado_at IS NULL AND expires_at > now RETURNING usuario_id, proposito`; si no devuelve fila, clasificar el motivo (usado/invalidado → `TOKEN_USED`, vencido → `TOKEN_EXPIRED`, ausente → `TOKEN_INVALID`) y revertir. Si devuelve fila: comprobar propósito y estado de la cuenta (recuperación exige ciudadano activo; activación exige `pendiente_activacion`), actualizar el hash, marcar la cuenta activa en la activación, invalidar los demás tokens del usuario y revocar todas sus sesiones (`revocarTodasDe`). Un propósito cruzado o una cuenta no apta revierte todo y responde como token inválido, sin distinguir la causa.

El Argon2id se calcula **fuera** de la transacción y solo después de comprobar con una consulta sin efectos que el token parece vigente; así un token basura no consume CPU. La verificación definitiva es la del `UPDATE`.

### 4. Cola mínima de envíos, sin secretos en reposo y sin sondeo en reposo

Tabla `EnvioCorreo`: `id`, `tipo` (`recuperacion|activacion`), `usuarioId` (FK), `estado` (`pendiente|enviando|enviado|fallido`), `intentos`, `proximoIntentoAt`, `reclamadoHasta`, `venceAt`, `ultimoCodigoError` (código genérico, nunca texto del proveedor), `createdAt`, `enviadoAt`. Índice único parcial por `(usuarioId, tipo)` con estado `pendiente|enviando` para no apilar envíos iguales.

El **token se genera en el momento del envío**, no al encolar: el trabajador reclama el envío con un arrendamiento, genera el token, persiste su huella (invalidando los anteriores), envía el correo y marca el resultado. Así no hay secretos ni enlaces guardados en reposo. Consecuencia aceptada: entrega al menos una vez; si el proceso cae tras aceptar el proveedor y antes de marcar `enviado`, se enviará un segundo correo con un token nuevo que invalida el primero. El texto del correo dice que solo el enlace más reciente es válido.

Reintentos con espera creciente (1, 5, 15 min…). Recuperación vence a los 15 min desde la solicitud y pasa a `fallido`; activación reintenta hasta 24 h. El trabajador vive en el proceso de la API, retoma pendientes al arrancar, se activa inmediatamente tras encolar y solo programa un temporizador mientras existan pendientes; **no sondea en reposo** (Neon, Render). Un fallo del proveedor no altera la respuesta HTTP, que ya fue 202.

Por qué asíncrono: un envío en línea haría que una cuenta existente tarde más y revelaría su existencia, además de atar la respuesta al proveedor. Alternativa descartada: ocultar el tiempo con una espera artificial; es frágil y consume conexiones.

### 5. Capacidad de invitación para Spec 06

`InvitarCuentaUseCase.ejecutar(tx, usuarioId, tipo)` recibe el contexto transaccional del llamador y solo inserta el `EnvioCorreo` de activación; no crea cuentas. Spec 06 crea la cuenta `pendiente_activacion` y llama a la invitación en su misma transacción. En esta entrega solo la usan tests, mediante una fábrica de pruebas, y no hay ruta que la invoque.

Modelo: nuevo valor `pendiente_activacion` en `EstadoUsuario`; `passwordHash` pasa a nulo con un `CHECK` que exige `passwordHash IS NULL` si y solo si el estado es `pendiente_activacion`. Alternativa descartada: un hash inutilizable; oculta el estado y complica el diagnóstico. Impacto: el dominio `Usuario` pasa a `passwordHash: string | null`; el login ya filtra por ciudadano activo y debe ejecutar la rama de verificación ficticia ante un hash nulo. La migración es aditiva y reversible mientras no existan cuentas pendientes.

La activación expone `POST /auth/activaciones`; la URL de la página donde se cierra el flujo para operadores será decidida por Spec 04/06 (configurable por `URL_BASE_ACTIVACION`); hasta entonces apunta a la página de respaldo de la API.

### 6. Contrato HTTP

Base `/api/v1`, JSON, `Cache-Control: no-store`, mismo formato de error y `requestId` de Spec 01. Rutas públicas, sin Bearer; la credencial es el token en el cuerpo.

| Método y ruta | Entrada | Resultado |
|---|---|---|
| POST `/auth/recuperaciones` | `{correo}` | 202 `{estado:"solicitud_recibida"}` uniforme; 400; 429; 503 (cuota agotada, con Retry-After). |
| POST `/auth/tokens/consulta` | `{token}` | 200 `{proposito, expiresAt}`; 404 `TOKEN_INVALID`; 410 `TOKEN_USED` o `TOKEN_EXPIRED`. |
| POST `/auth/contrasena/restablecer` | `{token, contrasena}` | 204; 400 por campo; 404; 410; 429; 503. Revoca todas las sesiones. |
| POST `/auth/activaciones` | `{token, contrasena}` | 204 sin sesión; mismos errores. |
| GET `/cuenta/restablecer`, `/cuenta/activar` | — | Página HTML estática de respaldo (el token queda en el fragmento y no llega al servidor). |
| GET `/.well-known/assetlinks.json` | — | Asociación de App Links con paquete y huellas de entorno. |

Validación del correo y de la contraseña: las mismas funciones de Spec 01, sin campos extra. Un 400 de contraseña ocurre antes de consumir el token.

### 7. Límites y cuota

Reutiliza `VentanaIntentos` con nuevos tipos y claves HMAC: `recuperacion_ip` (10 por 15 min), `recuperacion_correo_ip` (3 por 15 min), `recuperacion_correo` (3 por hora, no bloquea permanentemente), `token_ip` (20 por 15 min para consulta y consumo) y `correo_dia` (contador global por día UTC, tope 400). Todos configurables. El contador global se incrementa por solicitud de recuperación válida, exista o no la cuenta, para no filtrar existencia; el costo asumido es que un atacante con muchas IPs podría agotar la cuota y bloquear la recuperación, mitigado por los límites por IP y por la visibilidad del 503. Las invitaciones de activación se encolan siempre y el trabajador las difiere si el proveedor rechaza por cuota. Se amplía la purga existente a tokens (7 días tras vencer) y a envíos terminados (7 días).

### 8. Revocación de sesiones

`SesionesPort.revocarTodasDe(usuarioId, ahora)` marca `revokedAt` en las sesiones no revocadas. Es compatible con Spec 01: solo el cierre voluntario revoca solo la actual, no hay requisito de que otras sobrevivan, y GET `/auth/sesion` ya devuelve 401 para sesiones revocadas. No se inicia sesión tras el cambio, igual que el registro no abre sesión, para separar el commit de la credencial de la creación de sesión.

### 9. Enlace y llegada a la app

Enlace del correo: `https://<host-api>/cuenta/restablecer#t=<token>` (activación: `/cuenta/activar#t=...`). El fragmento no se envía al servidor ni aparece en sus logs. Android: intent-filter con `autoVerify` para `/cuenta/*` en el host de `API_PUBLIC_URL`; la API publica `assetlinks.json` con `pe.edu.unsch.ayni_safe` y las huellas SHA-256 de `ANDROID_CERT_SHA256` (depuración y liberación). Flutter usa `app_links` (versión fijada) y una pantalla «Tengo un código» como alternativa manual. La página de respaldo lleva un script en línea que lee el fragmento para mostrar el código con un botón de copiar, con CSP restrictiva, sin analítica ni enlaces externos.

Riesgo: los clientes de correo pueden reescribir o registrar enlaces. Se acepta por la corta vida y el uso único. En desarrollo con host local los App Links no verifican; se prueba con el código pegado y, en dispositivo real, con el host público del spike. iOS queda para Spec 23.

### 10. UI móvil

Estructura según la guía UI y los componentes existentes (`CampoFormulario`, `CampoContrasena`, `BotonPrincipal`, `MensajeAccesible`):

```text
Acceso --"Olvidé mi contraseña"--> Solicitar --> Confirmación neutral
                                                      |  (correo)
              enlace/código --> Nueva contraseña --> Éxito --> Acceso (aviso)
                     |
                     +--> Enlace usado/vencido --> Solicitar otro enlace
```

Controladores por pantalla con estado enviando/error/429/503/conexión, un solo envío en curso y ningún reintento automático de POST. La contraseña y el token viven solo en memoria del formulario. Textos: confirmación «Si el correo corresponde a una cuenta, te enviaremos instrucciones. Revisa también la carpeta de spam.»; éxito «Cambiaste tu contraseña. Cerramos tus otras sesiones.». Contraste y escalado se comprueban como en Spec 01.

### 11. Configuración y secretos

Nuevas variables validadas en `entorno.ts` sin imprimir valores: `EMAIL_ADAPTER` (`gmail-api|smtp|archivo|prueba`), `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (con `gmail-api`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`, `SMTP_CLAVE` (con `smtp`), `MAIL_REMITENTE_NOMBRE`, `MAIL_REMITENTE_DIRECCION`, `EMAIL_DIARIO_MAX`, `API_PUBLIC_URL`, `ANDROID_CERT_SHA256`, `URL_BASE_ACTIVACION` (opcional). `.env.example` solo con marcadores. Nada de esto entra en Git, logs ni respuestas; el secreto del cliente, el refresh token y la contraseña de aplicación se guardan solo en el entorno.

### 12. Verificación

| Nivel | Cobertura |
|---|---|
| Unidad | Vencimientos con reloj controlado, clasificación de estados de token, política de contraseña reutilizada, construcción del enlace, selección de adaptador. |
| API con PostgreSQL real | Uniformidad de 202 (cuerpo y estado), 410/404, consumo concurrente con una sola ganadora, rollback, revocación total, propósito cruzado, cuenta pendiente/suspendida, límites persistentes y cuota global, cola con reinicio y reintentos, recuperación tras caída del adaptador, redacción de secretos. |
| Flutter | Pantallas y estados, doble toque, Mostrar/Ocultar, descarte de memoria, manejo de 410/429/503, avisos. |
| Integración Android | Apertura por enlace verificado en dispositivo real con el host del spike, código pegado, 401 en un segundo dispositivo, lector de pantalla y 200 %. |
| Proveedor real | Envío real a buzones del equipo desde el remitente de piloto; entrega, bandeja/spam y enlace funcional documentados. Los dobles no cuentan. |

## Risks / Trade-offs

- Render Free bloquea SMTP → resuelto: producción usa la Gmail API por HTTPS y el SMTP queda solo para local. No verificado aún: que la salida HTTPS hacia Google funcione desde Render (presumible); se comprueba en la entrega de despliegue.
- El refresh token de OAuth caduca a los 7 días si la pantalla de consentimiento está en «Prueba» (dato no verificado contra la documentación de Google) → publicar el estado «En producción» y vigilar en los registros los fallos `AUTENTICACION`.
- La autorización puede revocarse o invalidarse (cambio de contraseña de la cuenta, revocación manual) → los envíos fallan con `AUTENTICACION`, se reintentan y quedan `fallido`; hay que repetir el script del token. La solicitud de recuperación sigue respondiendo 202.
- Secretos de OAuth en las variables de entorno de Render → nunca en Git ni en logs; rotar el secreto del cliente si se filtra.
- Gmail personal como remitente: ligado a una cuenta, 500/día, sin dominio institucional y sujeto a cambios de política de Google → remitente dedicado, tope 400/día, `CorreoPort` permite sustituirlo.
- Cuota agotada por abuso desde muchas IPs → 503 visible y límites por IP; no hay mitigación perfecta sin dominio ni CAPTCHA (fuera de alcance).
- Entrega al menos una vez: posible segundo correo tras un fallo → texto aclara que vale el último enlace.
- El token en el fragmento puede quedar en historial o clientes de correo → vida corta, uso único e invalidación al emitir otro.
- Enumeración: el registro ya revela correos ocupados con 409; este flujo no añade señales (202 y 503 uniformes) → límites de solicitudes del registro siguen vigentes.
- Revocar todas las sesiones obliga a reingresar en todos los dispositivos → es el efecto buscado y se informa en el aviso.
- `passwordHash` nulo debilita un invariante de Spec 01 → el `CHECK` lo limita a `pendiente_activacion` y hay pruebas de login ante ese estado.
- Sin recordatorio por correo del cambio de contraseña: un titular no se entera de un cambio indebido por correo → diferido para no consumir cuota; queda registrado como mejora.

## Migration Plan

1. Spike (tarea 1.2, hecho): SMTP de Gmail bloqueado en Render Free → adaptador Gmail API. Obtener el refresh token con el script (tarea 1.4), implementar el adaptador y probar el envío real en local antes de seguir.
2. Migración aditiva: valor de enum, `TokenCuenta`, `EnvioCorreo`, `CHECK` y columna `password_hash` nullable; aplicar en BD aislada y comprobar restricciones y rollback transaccional.
3. API detrás de la configuración: sin SMTP configurado fuera de producción se usa el adaptador de archivo; las rutas existen siempre.
4. Móvil después de la API; el enlace «Olvidé mi contraseña» se habilita en la misma versión que el flujo completo.
5. Rollback: retirar rutas y enlace conservando las tablas; no borrar cuentas ni tokens. Revertir la migración solo en entornos efímeros sin cuentas `pendiente_activacion`.

## Open Questions

- Huella de firma de liberación de Android: se conocerá al preparar la compilación de liberación; basta la de depuración para el piloto del spike.
- Plantilla exacta del correo (texto plano, sin seguimiento) y textos finales de las pantallas: se afinan en implementación sin cambiar contrato ni escenarios.
- Estado de la pantalla de consentimiento (Prueba o En producción) y caducidad real del refresh token: se confirma al obtener el token.
- Verificación en el entorno desplegado (envío por la Gmail API desde Render, dominio de los App Links y enlace que abre la app): corresponde a la entrega de despliegue y no bloquea este cambio.
