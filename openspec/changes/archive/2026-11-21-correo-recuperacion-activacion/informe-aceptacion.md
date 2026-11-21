# Informe de aceptación: correo-recuperacion-activacion

Fecha de las ejecuciones: 21/11/2026. Resultados reales de esta sesión. Este informe **no declara RF03 completo en producción**: lo pendiente está en la sección «Pendiente».

## Resumen

| Área | Estado |
|---|---|
| API (recuperación, activación, cola de correos, límites, contrato) | Implementada y probada contra PostgreSQL real aislado. |
| App Flutter (pantallas, enlaces, sesiones) | Implementada y probada con widgets y API falsa. |
| Proveedor de correo | Gmail SMTP está **bloqueado desde Render Free** (spike 1.2). Se implementó la **Gmail API por HTTPS** (probada con envío real desde local; falta probarla desde Render). El nombre «AyniSafe» como remitente no aparece: pendiente. |
| Desde Render Free, enlace verificado en dispositivo real, accesibilidad manual, extremo a extremo | **No ejecutado** (ver Pendiente). |

## Comandos y resultados

| Comando (directorio) | Resultado |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` (`apps/api`) | Sin errores. |
| `npm run build` (`apps/api`) | Compila. |
| `npm run contrato:validar` (`apps/api`) | Contrato OpenAPI 3.1.0 válido, 8 operaciones. |
| `npx vitest run` (`apps/api`, `TEST_DATABASE_URL` aislada) | **18 archivos, 247 pruebas, todas pasan.** Antes de esta entrega: 11 archivos, 137 pruebas. |
| `flutter analyze` (`apps/mobile`) | Sin problemas. |
| `flutter test` (`apps/mobile`) | **178 pruebas, todas pasan.** Antes: 122. |
| `flutter build apk --debug` (`apps/mobile`) | Compila. El manifiesto fusionado contiene el intent-filter `autoVerify` con el host resuelto y solo el permiso `INTERNET` pedido por la app. |
| `openspec validate correo-recuperacion-activacion --strict` | Válido. |

Spec 01 sigue pasando: las pruebas de registro, login, sesión, limitador y contrato de esa entrega continúan en verde (el contrato de Spec 01 se amplió, no se alteró).

## Cobertura por escenario de la spec

| Escenario | Dónde se comprueba | Resultado |
|---|---|---|
| Solicitud uniforme (existente, inexistente, suspendida, pendiente, operador) | `recuperacion-http.test.ts` (5.1) | 202 y cuerpo idénticos; solo la cuenta ciudadana activa recibe correo. |
| Token vencido / usado / alterado | `tokens-cuenta.test.ts`, `recuperacion-http.test.ts`, `contrato.test.ts` | 410 `TOKEN_EXPIRED`, 410 `TOKEN_USED`, 404 `TOKEN_INVALID`. |
| Dos consumos simultáneos | `tokens-cuenta.test.ts` (3.3) | Exactamente uno gana; solo su contraseña autentica. |
| Fallo antes del commit | `tokens-cuenta.test.ts` (3.3) | 503, token reutilizable, contraseña y sesiones sin cambios (fallo real con tabla renombrada). |
| Envío fallido y reintento sin filtrar secretos | `cola-correo.test.ts`, `recuperacion-http.test.ts` (6.5) | Reintentos con 1/5/15 min, solo códigos genéricos; ni logs ni respuestas ni tablas contienen token, enlace, contraseña ni correo. |
| Política de contraseña 14/15/128/129, espacios, Unicode | `tokens-cuenta.test.ts` (3.4), `nueva_contrasena_test.dart` | Se respeta en API y app; 400 no consume el token. |
| Revocación de todas las sesiones y 401 en otro dispositivo | `recuperacion-http.test.ts` (5.5), `nueva_contrasena_test.dart` (8.5) | Las sesiones previas dan 401; las de otro usuario siguen; el cierre voluntario sigue siendo individual. |
| Límites (IP, correo+IP, correo/hora, tokens) y persistencia tras reinicio | `recuperacion-http.test.ts` (6.1) | 429 con `Retry-After`; no bloquea de forma permanente. |
| Tope diario global | `recuperacion-http.test.ts` (6.2) | 503 idéntico exista o no la cuenta; se libera al cambiar el día; una solicitud bloqueada por IP no gasta cuota. |
| Invitación en la transacción del llamador | `recuperacion-http.test.ts` (5.3) | Con rollback no quedan cuenta, token ni envío. |
| Sin creación de operadores ni verificación de correo | `alcance.test.ts` (11.4) | Rutas exactamente las del contrato; sin columnas de verificación. |
| Pantallas, doble toque, 200 %, enlaces | `solicitar_recuperacion_test.dart`, `nueva_contrasena_test.dart`, `flujo_recuperacion_test.dart`, `enlaces_cuenta_test.dart` | Todas pasan con widgets de prueba. |
| Producción rechaza el adaptador de pruebas | `config-correo.test.ts` (4.1) | El arranque falla sin mostrar valores. |

## Proveedor de correo: qué está verificado y qué no

- **Verificado (21/11/2026, desde la máquina de desarrollo):** `smtp.gmail.com` conecta en 465 (74 ms) y 587 (51 ms); la autenticación con contraseña de aplicación fue correcta; Gmail aceptó un correo de prueba para un buzón `@unsch.edu.pe` y otro `@gmail.com`; ambos llegaron a la **bandeja de entrada**, con remitente «AyniSafe» y en cerca de un minuto.
- **Bloqueado desde Render Free (verificado 21/11/2026):** los puertos 465 y 587 de `smtp.gmail.com` fallan con `ETIMEDOUT` en ~265 ms desde un servicio Free de Render, y un envío autenticado falla igual. Gmail SMTP solo sirve en local; para producción se necesita un proveedor por HTTPS (443).
- **No verificado:** la entrega a otros proveedores de correo y un correo **de recuperación real** extremo a extremo.
- El adaptador de pruebas y el servidor SMTP local (`smtp-server`) comprueban la composición del mensaje y el manejo de errores, pero **no cuentan como validación del proveedor**.

## Pendiente (no ejecutado en esta sesión)

| Tarea | Motivo |
|---|---|
| 1.2 Conectividad SMTP desde Render Free | **Ejecutada: bloqueado.** Puertos 465 y 587 de `smtp.gmail.com` fallan con `ETIMEDOUT` en ~265 ms desde un servicio Free temporal, y un envío autenticado también falla. Servicio eliminado. Requiere el plan de reserva (envío por HTTPS). |
| 9.2 Verificación de dominio de los App Links | Requiere un dispositivo Android conectado (no había ninguno en `adb devices`) y un host público con `assetlinks.json`. Huella SHA-256 del certificado de depuración local para `ANDROID_CERT_SHA256`: `83:6B:6D:75:DF:05:53:19:D0:51:9C:64:E6:97:65:48:B5:57:8B:D6:E5:1D:EC:80:CC:29:05:41:81:33:0D:E9`. La compilación de liberación aún firma con la clave de depuración: su huella definitiva se conocerá al firmarla. |
| 11.2 Prueba extremo a extremo en Android con el proveedor real | Requiere dispositivo, dos sesiones, un host público y la 1.2 resuelta. |
| 11.3 Accesibilidad manual | Requiere TalkBack y teclado en un dispositivo. Los tests automáticos (ver sección anterior) cubren guías de objetivos, etiquetas y contraste, texto al 200 % y errores con icono, pero **no** sustituyen la revisión con TalkBack. |

## Verificación en dispositivo y accesibilidad (segunda ejecución, 21/11/2026)

- **Arranque en frío en el teléfono (Android 16):** con la app cerrada, un enlace `https://<host>/cuenta/restablecer#t=<token>` abrió «Nueva contraseña» con el formulario y la ayuda de 15 a 128 caracteres, sin mostrar el token. Se probó con un intent explícito hacia la app, es decir, **sin** depender de la verificación del dominio.
- **Enlace con la app en segundo plano y cambio de contraseña completado desde la pantalla: no verificados en el dispositivo.** La prueba se interrumpió porque se enviaron entradas con `adb input` mientras otra app estaba en primer plano; no se repite de esa forma. La lógica de ambos casos sí está cubierta por pruebas de widgets (`enlaces_cuenta_test.dart`, `nueva_contrasena_test.dart`).
- **`pm get-app-links` (solo lectura):** la app tiene registrado el filtro y la firma de depuración `83:6B:…:0D:E9`; el estado de verificación de `api.ayinisafe.invalid` es `1024` (sin verificar), lo esperado con un host reservado. La verificación real exige un host público `https` que sirva `assetlinks.json` con esa huella.
- **Accesibilidad automática** (`accesibilidad_recuperacion_test.dart`): las pantallas de solicitar enlace, confirmación, nueva contraseña, activar cuenta, enlace usado/vencido/inválido y «Tengo un código» cumplen las guías de Flutter de objetivos táctiles (`androidTapTargetGuideline`), controles etiquetados (`labeledTapTargetGuideline`) y contraste (`textContrastGuideline`); el error de contraseña es texto con icono en región en vivo y el foco avanza con Tab. **No sustituye** la revisión manual con TalkBack ni la prueba de texto ampliado al 200 % en un equipo real.

## Gmail API como proveedor de producción (tercera ejecución, 21/11/2026)

Tras el spike 1.2 (SMTP bloqueado en Render Free) se implementó la Gmail API por HTTPS.

- **Implementado y probado:** `GmailApiCorreoAdapter` (renovación y caché del token de acceso, envío RFC 2822, tiempos máximos, errores a códigos genéricos, sin inyección de cabeceras), selección por `EMAIL_ADAPTER=gmail-api` (en producción solo `gmail-api` o `smtp`), script `obtener-refresh-token.mjs` y `probar-correo.ts`. Resultados: **277 pruebas de API pasan** (antes 247) y 186 de Flutter (antes 178); 28 pruebas del adaptador contra un servidor HTTP falso (no valida el proveedor real) y una prueba de la cola con credenciales revocadas (`AUTENTICACION`, reintentos, sin secretos en logs ni tablas).
- **Envío real desde la máquina de desarrollo (tarea 4.7):** la Gmail API aceptó correos de prueba para un buzón `@unsch.edu.pe` y otro `@gmail.com` en ~1 s cada uno. Ambos llegaron a la **bandeja de entrada** en **menos de un minuto**, con el asunto (con tilde) correcto.
- **Hallazgo: el nombre «AyniSafe» no aparece como remitente.** Con la Gmail API el correo sale como la cuenta que autorizó el token y Gmail puede mostrar el nombre guardado en esa cuenta. Se corrigió la codificación de la cabecera `From` (nombre ASCII entre comillas) sin efecto visible. El usuario indicó que la cuenta es institucional y no permite editar el nombre, y decidió **conservar la configuración actual** y corregir el nombre más adelante. Queda **pendiente**; no afecta a la entrega ni a la bandeja.
- **No verificado:** que la cuenta que autorizó el token sea la cuenta dedicada prevista (se intentó reautorizar y el intento caducó sin cambios); el estado de la pantalla de consentimiento (si está en «Prueba», el refresh token puede caducar a los 7 días, dato no verificado contra la documentación de Google); y el envío desde Render Free por HTTPS.

## Estado de las tareas al archivar

| Tarea | Estado |
|---|---|
| 1.4 Cliente OAuth y script del refresh token | Script y token funcionan; **sin verificar** que la cuenta sea la dedicada ni el estado de la pantalla de consentimiento. |
| 11.2 Recorrido extremo a extremo en Android con el proveedor real | **No ejecutada.** El proveedor real ya está probado por separado (4.7) y el recorrido de la app está cubierto por pruebas de widgets, pero no se hizo el recorrido en el teléfono con un correo real. |
| 11.3 Accesibilidad con TalkBack | **No ejecutada** (requiere revisión manual en el dispositivo). Las guías automáticas de Flutter pasan. |
| Verificación desplegada (Render, App Links, enlace que abre la app) | Fuera de este cambio: entrega de despliegue (Spec 22). RF03 **no** se declara completo en producción. |

## Riesgos conocidos

- Cuota de Gmail (500/día) y remitente personal sin dominio institucional.
- Quien tenga muchas IP podría agotar el tope diario y frenar la recuperación de todos (503 visible).
- Entrega al menos una vez: puede llegar un segundo correo tras un fallo del proceso; el texto avisa de que vale el último enlace.
- El token viaja en el fragmento del enlace y puede quedar en el historial del navegador o en clientes de correo; se mitiga con vida corta y uso único.
- Advertencias de `npm audit` en `prisma`/`effect` ya existían antes de esta entrega y no se modificaron; `nodemailer` se fijó en la versión corregida 10.6.1.
