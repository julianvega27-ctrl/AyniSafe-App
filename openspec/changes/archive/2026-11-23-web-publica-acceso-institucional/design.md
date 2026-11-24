# Design

## Context

Motivación en `proposal.md`; criterios en los specs de este cambio. Specs 01–03 están archivadas.

Observado en el código:

- La sesión es un token opaco (32 bytes CSPRNG, huella SHA-256 en `sesiones`) de 24 h absolutas, aceptado **solo** por `Authorization: Bearer` (`tokenBearer`).
- Todo el acceso es ciudadano y está fijado en tres capas: `esCiudadanoActivo` (dominio), `ConsultarSesionUseCase` y el adaptador Prisma, cuyo SQL escribe `rol = 'ciudadano'` en `crearSiUsuarioHabilitado` y `buscarVigente`. `aUsuarioPublico` fija `rol: 'ciudadano'`.
- `/auth/recuperaciones` y el consumo de recuperación exigen ciudadano activo (use case y SQL). `/auth/activaciones` y `/auth/tokens/consulta` son públicos y no dependen del rol: la activación solo exige `pendiente_activacion`.
- El correo de activación se redacta con `RedactorCorreoTextoPlano(urlPublicaApi)` y la ruta `/cuenta/activar`, que abre la app. El envío reclamado ya trae `destinatario.rol`.
- `TipoLimite` es una unión cerrada en `limitador.port.ts`; la tabla `ventanas_intentos.tipo` es texto libre.
- No hay CORS, cookies, `apps/web` ni `.github/`. El remoto es GitHub. Hosting objetivo (RC04): web en Vercel y API en Render, es decir, **orígenes distintos**.
- El logger (`LoggerConsola`) es de lista cerrada de campos; ya excluye cabeceras y cuerpos.

Restricciones: USD 0 (sin dominio propio), Render Free con arranque en frío, `docs/` fija React+TypeScript para la web, ciudadano solo en la app, tres roles.

## Goals / Non-Goals

**Goals:** sesión de navegador robusta frente a XSS y CSRF sin degradar el acceso ciudadano; un único modelo de sesión; alta y recuperación del administrador sin contraseñas compartidas; web mínima real con permisos verificados en servidor; CI sin secretos.

**Non-Goals:** crear operadores o administrar cuentas (Spec 06); 2FA; recuperación pública de privilegiados; despliegue real a Vercel/Render; páginas de negocio del panel; sesiones deslizantes; cambio de la sesión móvil.

## Decisions

### 1. Sesión del navegador: cookie HttpOnly del mismo origen (confirmada)

El token opaco existente viaja en una cookie `__Host-ayni_inst` (`HttpOnly; Secure; SameSite=Strict; Path=/`, sin `Domain`, `Max-Age` = tiempo restante hasta el vencimiento absoluto). En desarrollo local (http) se usa `ayni_inst` sin `Secure` ni prefijo, decidido por configuración de entorno. El cuerpo de las respuestas **no** incluye el token.

Alternativas: (B) Bearer en memoria o `localStorage`: cualquier XSS lo roba y recargar pierde la sesión; descartada para cuentas privilegiadas. (A) Cookie `SameSite=None` entre `vercel.app` y `onrender.com`: ambos están en la Public Suffix List, por lo que son sitios distintos y la cookie sería de terceros, bloqueada por Safari/Firefox y cada vez más por Chrome; frágil. (E) Dominio propio compartido: resuelve `SameSite` pero cuesta; queda como plan alterno. BFF en funciones de Vercel: añade infraestructura sin ventaja frente a la reescritura.

### 2. Mismo origen mediante reescritura de Vercel

`apps/web/vercel.json` reescribe `/api/(.*)` hacia el origen de la API en Render; el navegador solo habla con el dominio de la web. En desarrollo, Vite hace proxy de `/api` a `http://127.0.0.1:3000`. La web usa únicamente rutas relativas. Como el navegador nunca hace una petición entre orígenes, **no se habilita CORS**: es más seguro dejar la API sin `Access-Control-*` y comprobarlo con una prueba.

La API se publica también en su dominio de Render (la app móvil y los App Links la usan directamente); la cookie `__Host-` nunca se envía a ese dominio, y el `Origin` exigido en rutas con cookie impide que un sitio ajeno la use.

Dos puntos sin comprobar se resuelven con spikes antes de fijar el despliegue (tarea 1): (a) si la reescritura de Vercel tolera el arranque en frío de Render (~1 min) o devuelve un 504 que la web debe tratar como «servicio no disponible»; (b) si conserva `Origin` y las cabeceras `Sec-Fetch-*`. Si (a) es inviable, el plan alterno es dominio propio (E) sin cambiar el código de la API.

### 3. Protección CSRF por verificación de origen

Un middleware `exigirOrigenWeb` se aplica a inicio y cierre de sesión institucional (y a toda ruta futura que cambie estado con cookie): exige `Origin` presente y **idéntico** a `WEB_ORIGIN`, rechaza `Sec-Fetch-Site: cross-site` y, junto con `exigirJson` existente, solo admite `application/json`. Responde 403 `FORBIDDEN_ORIGIN` sin tocar cookies. Se evalúa **antes** de limitar intentos y de verificar contraseñas. `GET` de lectura no cambia estado y no exige Origin.

Alternativas: token sincronizador o doble envío: más estado y piezas móviles sin ventaja con SameSite=Strict, mismo origen y verificación de `Origin`. `SameSite=Strict` solo no basta como única defensa (defensa en profundidad), por eso se combinan.

Rastro de la IP: la limitación por IP depende de `req.ip`; con Vercel delante habrá dos proxies y el número de saltos de confianza (`TRUST_PROXY_HOPS`) debe fijarse con evidencia (spike tarea 1.2). Si Vercel no entrega la IP real de forma fiable, el limitador por IP degrada a bloqueo compartido; en ese caso se prioriza el limitador por correo+IP y se documenta el riesgo.

### 4. Reutilizar el modelo de sesión; separar por rol y canal

Sin migración. `SesionesPort` se parametriza por **roles admitidos**:

- `crearSiUsuarioHabilitado(nueva, roles)` y `buscarVigente(hash, ahora, roles)` sustituyen el literal `'ciudadano'` por `rol = ANY(roles)`. Los casos de uso ciudadanos pasan `['ciudadano']` y su comportamiento queda idéntico (pruebas de Spec 01 sin cambios).
- Nuevos casos de uso `IniciarSesionInstitucionalUseCase` y `ConsultarSesionInstitucionalUseCase` pasan `['administrador','operador']`. `CerrarSesionUseCase` ya revoca por huella y se reutiliza.
- Dominio: `esInstitucionalActivo(usuario)`; `UsuarioInstitucional` con `rol: 'administrador' | 'operador'`. `UsuarioPublico` ciudadano no cambia.
- Aislamiento: los roles son disjuntos, así que una sesión ciudadana jamás valida como institucional y viceversa. Además, el middleware de panel lee **solo** la cookie y el ciudadano **solo** `Authorization`; la cabecera/cookie del otro canal se ignora. Se descartó añadir una columna `canal` a `sesiones`: el rol ya separa los dos, evita una migración y un token robado de un canal no sirve en el otro.

El inicio institucional reutiliza la forma del ciudadano: validación de correo/contraseña existente, `aplicarLimites` con tipos nuevos `login_inst_ip` y `login_inst_correo_ip` (se amplía `TipoLimite` y la política con `RL_LOGIN_INST_IP_MAX` y `RL_LOGIN_INST_CORREO_IP_MAX`, por defecto igual a los ciudadanos), verificación Argon2id con rama ficticia para cuentas inexistentes, no admitidas o sin hash, y emisión transaccional que bloquea la fila.

### 5. Contrato HTTP y paneles mínimos

Base `/api/v1`. Los errores usan el formato y `requestId` existentes; se añade el código `FORBIDDEN_ORIGIN` (403) y `FORBIDDEN` (403) para rol ajeno.

| Método y ruta | Auth | Resultado |
|---|---|---|
| POST `/auth/institucional/sesiones` | Origin | 200 `{usuario:{id,nombre,correo,rol}, expiresAt}` + `Set-Cookie`; 400; 401 `INVALID_CREDENTIALS`; 403 `FORBIDDEN_ORIGIN`; 415; 429; 503 |
| GET `/auth/institucional/sesion` | cookie | 200 `{usuario, expiresAt}`; 401 |
| DELETE `/auth/institucional/sesion` | cookie opcional + Origin | 204 + borra cookie (idempotente); 403 |
| GET `/administrador/panel` | cookie, rol administrador | 200 `{usuario, secciones:[{id,titulo,disponible:false}]}`; 401; 403 |
| GET `/operador/panel` | cookie, rol operador | ídem; 401; 403 |
| POST `/auth/tokens/consulta`, `/auth/activaciones` | públicas | sin cambios; las usa la web |

`secciones` sale de una lista de dominio por rol alineada con la guía UI (operador: Reportes, Mapa, Indicadores; administrador: Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas, Contenido/contactos), todas `disponible: false`; cada spec futura las irá habilitando. OpenAPI pasa a 0.4.0 con `cookieAuth` y estos recursos; el validador de contrato ya existente y la prueba de alcance se actualizan.

Middlewares: `autenticarInstitucional(consultar)` deja `res.locals.sesionInstitucional`; `exigirRol(rol)` responde 403. La cookie se lee de la cabecera `Cookie` con un analizador mínimo propio (nombre exacto, valor acotado en longitud), sin dependencia nueva.

### 6. Sin recuperación pública para privilegiados

Se conserva la restricción actual: la solicitud pública de recuperación y su consumo siguen limitados a ciudadano activo; para un administrador responde el 202 uniforme sin correo. Motivo: una ruta pública por correo para cuentas con poder amplía la superficie de ataque al buzón de piloto (Gmail personal, sin dominio institucional), y mantenerla intacta evita regresiones en la autenticación ciudadana. La recuperación del administrador es break-glass (decisión 7). La recuperación de operadores la define Spec 06 (el administrador reinvita).

### 7. Aprovisionamiento y reinicio del administrador por CLI

Scripts en `apps/api/scripts/` (`admin-bootstrap.ts`, `admin-reiniciar.ts`), con scripts npm `admin:bootstrap` y `admin:reiniciar`. Ambos cargan la configuración y el cliente Prisma de la API (acceso a `DATABASE_URL` equivale a autoridad), reutilizan `InvitarCuentaUseCase` y el puerto de envíos dentro de una `$transaction`, y llaman a `gestorEnvios.despertar()` tras confirmar.

- **Bootstrap**: argumentos `--correo` y `--nombre` (o `ADMIN_CORREO`, `ADMIN_NOMBRE`); valida correo con las funciones existentes; en una transacción, `SELECT … FOR UPDATE` por correo: no existe → crea `administrador` `pendiente_activacion` sin hash y encola `activacion`; existe como administrador pendiente → reencola (el índice único parcial evita duplicados); administrador activo → informa «ya activo» sin cambios; otro rol → error. Sin contraseña en argumentos, entorno ni archivos.
- **Reiniciar**: solo administrador; en una transacción deja `estado = pendiente_activacion`, `password_hash = NULL` (el CHECK existente lo exige), revoca sesiones, invalida tokens pendientes y reencola.
- **`--emitir-enlace`**: en vez de encolar, emite un token de activación con `EmitirTokenCuentaUseCase`, imprime el enlace una vez en `stdout` y no lo guarda ni lo registra; falla si `CI=true` o si `stdout` no es una terminal. Es la reserva mientras el envío desde Render no esté verificado.
- Salida y logs: solo eventos genéricos (`creada`, `reencolada`, `ya_activa`, `reiniciada`, `rechazada`); nunca correo, token, enlace ni cadena de conexión. No hay auditoría persistente (la auditoría de cuentas llega con Spec 06); se acepta y se documenta.

La activación sigue el flujo ya existente: el correo lleva a `WEB_PUBLIC_URL/activar#t=…`, la web consulta el token y consume `/auth/activaciones`, y la cuenta queda activa sin sesión.

### 8. Enlace de activación por rol

`RedactorCorreo.redactar` recibe también el `rol` del destinatario (ya disponible en `EnvioReclamado.destinatario`). La base del enlace es `WEB_PUBLIC_URL` y la ruta `/activar` para `administrador` y `operador`, y `API_PUBLIC_URL` con `/cuenta/activar` para el resto; el texto del correo institucional omite la mención a la app. Nueva configuración `WEB_ORIGIN` (para Origin y cookie) y `WEB_PUBLIC_URL`, validadas como `API_PUBLIC_URL`: en producción https obligatorio, solo origen, sin credenciales ni ruta; en desarrollo valor por defecto `http://localhost:5173`. Ambas variables designan el mismo origen (la web sirve también la API por reescritura): en producción el arranque falla si difieren, y en desarrollo `WEB_PUBLIC_URL` toma por defecto el valor de `WEB_ORIGIN`.

### 9. Contenido público: sección `piloto` pendiente

La fuente versionada incrementa a versión 2 y agrega `piloto` con estado `pendiente` y sin texto, validada por el esquema existente. La web la muestra como «aún no disponible». Riesgo: el parser de Flutter podría fallar ante una clave desconocida; una prueba de la app lo comprueba y, si falla, se vuelve tolerante (los clientes MUST ignorar secciones desconocidas).

### 10. Web: `apps/web`

React + TypeScript + Vite como SPA estática; React Router; sin librería de estado global (el estado de sesión es una pequeña máquina: `cargando | anónimo | autenticado(rol) | error`). Cliente de API con `fetch` a rutas relativas, `credentials: 'same-origin'`, sin guardar nada en `localStorage`. Rutas: `/` (portada), `/acceso`, `/activar`, `/panel` (redirige por rol a `/panel/administrador` o `/panel/operador`). Los guards consultan `GET /auth/institucional/sesion` al cargar; 401 → `/acceso` con aviso; fallo de red → pantalla con «Reintentar» sin asumir estado. Tokens de diseño de la guía UI (azul `#17324D`, verde azulado `#007F78`, fondo `#F5F7FA`, texto `#172B3A`, enlaces sobre fondos tintados `#006B65`), con una prueba de contraste de los pares usados. Componentes propios equivalentes a los de Flutter (campo, contraseña con Mostrar/Ocultar, botón con estados, mensaje con icono). Cabeceras de seguridad vía `vercel.json`: CSP sin terceros, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`. Pruebas con Vitest y Testing Library (flujos de acceso, restauración, 401/403/429/red, activación, ausencia de almacenamiento) y verificación de a11y automatizada básica; la validación con lector de pantalla se declara manual y pendiente.

Protección real: el SPA estático no puede proteger HTML por rol; lo que está protegido en servidor son los datos (rutas de API con cookie y rol). La condición de salida «rutas protegidas en servidor» se entiende así y se verifica con pruebas de API por rol.

### 11. CI en GitHub Actions

Un archivo `.github/workflows/ci.yml` con tres trabajos independientes y `concurrency` por rama:

- **api**: Node 22, `npm ci`, `typecheck`, `build`, `contrato:validar`, `test` con un servicio `postgres` efímero. Se pasa `TEST_DATABASE_URL` con base `ayni_safe_test` y `RATE_LIMIT_HMAC_SECRET`, generado en el paso con `openssl rand -hex 32` y enmascarado con `::add-mask::`. La API no tiene script de lint: la comprobación de tipos estrictos hace de lint en esta entrega (se registra como límite, no se añade ESLint al backend aquí).
- **mobile**: Flutter estable fijado, `pub get`, `flutter analyze`, `flutter test`; `integration_test` excluido (requiere dispositivo) y documentado.
- **web**: Node 22, `npm ci`, `lint`, `typecheck`, `build`, `test`.
- **secretos**: escaneo de credenciales del repositorio (herramienta por SHA fijado, sin imprimir valores) y una prueba de la API que recorre los logs buscando valores sensibles de ejemplo.

Endurecimiento: `permissions: contents: read`, disparadores `push` a `main` y `pull_request` (nunca `pull_request_target`), acciones de terceros fijadas por SHA de commit, `npm ci` con caché, sin `set -x` ni `env`/`printenv`, sin secretos requeridos (por eso las copias del repositorio ejecutan todo). Las versiones exactas y los SHA se resuelven al implementar.

## Risks / Trade-offs

- [El rewrite de Vercel no tolera el arranque en frío de Render] → spike 1.1; tratar 502/504 como «servicio no disponible» con «Reintentar» y, si es inviable, dominio propio sin cambiar la API.
- [IP del cliente mal resuelta tras dos proxies: bloqueo mutuo de administradores o IP falsificable] → spike 1.2 fija `TRUST_PROXY_HOPS`; el limitador por correo+IP protege aunque la IP sea imprecisa; documentar.
- [Cookie `__Host-` no funciona en http local ni en Safari en `localhost`] → nombre y `Secure` por entorno; pruebas con ambos modos.
- [Parametrizar `SesionesPort` por rol puede regresionar el acceso ciudadano] → las pruebas de Spec 01–03 se ejecutan sin modificación y se añaden casos cruzados de rol.
- [Un único administrador es punto único de fallo; el reinicio exige acceso a la base] → aceptado en el piloto; el procedimiento permite varios administradores por correo y el runbook documenta quién conserva el acceso.
- [Envío de correo desde Render sin verificar] → `--emitir-enlace` como reserva; el bootstrap por correo no se declara completo en producción hasta verificarlo (misma reserva que RF03).
- [Sin auditoría persistente del bootstrap] → solo eventos genéricos en logs; la auditoría de cuentas llega con Spec 06.
- [Sección `piloto` rompe el parser de la app] → prueba en Flutter y tolerancia a claves desconocidas.
- [El SPA estático expone todas las rutas de UI] → no hay datos en el HTML; toda la autorización está en la API.
- [Cache del navegador de respuestas autenticadas] → `no-store` ya aplicado a `/auth` y se extiende a los paneles.

## Migration Plan

Sin migración de base de datos prevista. Orden: (1) spikes, (2) API aditiva (config, sesión por rol, middlewares, rutas, redactor, scripts) con las pruebas ciudadanas intactas, (3) contenido v2, (4) `apps/web`, (5) CI, (6) documentación. Rollback: la API es aditiva, así que revertir los commits restablece el comportamiento previo; las cuentas creadas por el bootstrap pueden eliminarse o reiniciarse con el procedimiento. El despliegue real a Vercel/Render queda para Spec 22.

## Open Questions

- Duración distinta de la sesión institucional (por ejemplo, un turno de 8 h): se conserva 24 h absolutas por coherencia con la política vigente; puede ajustarse sin cambiar el contrato.
- Herramienta concreta de escaneo de secretos y versión del SDK de Flutter para CI: se fijan al implementar, sin afectar los specs.
