## Why

La web de AyniSafe no existe: no hay portada pública (RF38), ningún administrador u operador puede iniciar sesión (RF02, RF05) y no hay un procedimiento seguro para crear al primer administrador sin compartir contraseñas (base de RF22). Además el repositorio no tiene integración continua, de modo que las pruebas de API y Flutter solo se ejecutan a mano. Esta entrega crea la base web y el acceso institucional con una sesión pensada para el navegador, sin debilitar la autenticación ciudadana ya aceptada (Specs 01–03).

## What Changes

- **Acceso institucional** (API): inicio, consulta y cierre de sesión de administradores y operadores (`POST/GET/DELETE` bajo `/auth/institucional/…`). La sesión es la misma opaca de 24 h absolutas sin renovación, pero viaja en una **cookie HttpOnly** (`__Host-`, `Secure`, `SameSite=Strict`) y nunca en el cuerpo ni en JavaScript. Un ciudadano, una cuenta suspendida, pendiente o inexistente reciben el mismo 401 uniforme, con limitador propio.
- **Seguridad del navegador**: la web y la API se sirven bajo un mismo origen (Vercel reescribe `/api/*` hacia Render), por lo que **no se habilita CORS**. Las rutas con cookie verifican `Origin` contra `WEB_ORIGIN`, rechazan `Sec-Fetch-Site: cross-site` y aceptan solo JSON. Las rutas de panel aceptan **solo cookie** y las ciudadanas **solo Bearer**: un token móvil no sirve en el panel ni al revés. Sin migración de `sesiones`.
- **Paneles mínimos y permisos por rol**: `GET /administrador/panel` y `GET /operador/panel` devuelven identidad y las secciones de la guía como «aún no disponible»; el rol ajeno recibe 403 y sin sesión 401. No hay operaciones de negocio.
- **Aprovisionamiento del administrador**: CLI `admin:bootstrap` crea la cuenta en `pendiente_activacion` e invita con la capacidad de Spec 02; el administrador elige su contraseña en la web. Idempotente por correo, sin contraseña en Git ni en logs; `--emitir-enlace` imprime el enlace solo en la terminal local y se niega si `CI=true`.
- **Recuperación del administrador**: CLI break-glass `admin:reiniciar` (pasa a `pendiente_activacion`, revoca sesiones y reinvita). **No** se abre `/auth/recuperaciones` a roles privilegiados; la recuperación ciudadana no cambia.
- **Enlace de activación por rol**: el correo de un administrador u operador apunta a `WEB_PUBLIC_URL/activar#t=…`; el de un ciudadano sigue apuntando a la API/app. La web reutiliza `/auth/tokens/consulta` y `/auth/activaciones` sin cambios.
- **Web `apps/web`** (React, TypeScript, Vite, SPA estática): portada pública (finalidad, funcionamiento, alcance del piloto, desarrolladores desde `GET /publico/contenido`, acceso institucional visible), `/acceso`, `/activar` y shell por rol. Los guards de ruta son solo experiencia de usuario; la protección real es la API. Sin autorregistro y sin versión ciudadana en navegador.
- **Contenido público**: se agrega la sección `piloto` (alcance del piloto), **pendiente** de aprobación y sin texto, para que la portada no publique texto no aprobado.
- **CI (GitHub Actions)**: API (tipos, compilación, contrato, pruebas con Postgres de servicio), Flutter (`analyze` y `test`, sin `integration_test`) y web (lint, tipos, compilación, pruebas). Sin secretos, permisos de solo lectura, acciones fijadas por SHA y logs sin secretos.
- **Spikes** documentados antes de fijar el despliegue: reescritura Vercel→Render con arranque en frío y `TRUST_PROXY_HOPS` tras dos proxies.
- **Fuera de alcance**: creación real de operadores y administración de cuentas (Spec 06), recuperación pública de privilegiados, autorregistro administrativo o ciudadano en la web, 2FA, páginas de negocio del panel, despliegue real en Vercel/Render.

## Capabilities

### New Capabilities

- `identidad/acceso-institucional`: sesión institucional por cookie, 401 uniforme, estado por petición, CSRF por Origin, aislamiento Bearer/cookie, sin CORS y permisos por rol en los paneles mínimos.
- `identidad/aprovisionamiento-administrador`: alta controlada del primer administrador y reinicio break-glass por CLI, sin contraseñas compartidas ni secretos en logs o repositorio.
- `web/portada-publica`: portada pública sin sesión con finalidad, funcionamiento, alcance del piloto, desarrolladores y acceso institucional visible, desde el contenido versionado.
- `web/panel-institucional`: acceso, activación de cuenta y shell por rol en la web, estados de error accesibles y protección de rutas solo como experiencia.
- `plataforma/integracion-continua`: verificación automática de API, Flutter y web sin secretos y con registros limpios.

### Modified Capabilities

- `identidad/recuperacion-activacion-cuenta`: el enlace del correo de activación depende del rol del destinatario (web para administrador u operador, API/app para ciudadano).
- `consultas/contenido-publico`: la fuente incorpora la sección `piloto` con aprobación explícita y la web es un cliente reconocido de la misma estructura.

## Impact

- **API** (`apps/api`): nuevas rutas y casos de uso institucionales; middlewares de cookie y Origin; limitador con nuevos tipos; `WEB_ORIGIN` y `WEB_PUBLIC_URL`; redactor de correo con base por rol; scripts `admin:bootstrap` y `admin:reiniciar`; `openapi.yaml` con `cookieAuth`; contenido versionado v2. Sin migración de esquema prevista.
- **Web** (`apps/web`, nuevo): proyecto Vite con `vercel.json` (rewrite) y proxy de desarrollo.
- **App móvil**: solo verificar que tolera la sección `piloto`; sin cambios funcionales.
- **Repositorio**: `.github/workflows/`.
- **Docs**: guía UI (superficie web), revisión de consistencia (procedimiento del administrador inicial, RF38/RF22 parciales).
- **Dependencias**: Specs 01–03 archivadas. La verificación de correo desde Render sigue pendiente y condiciona el bootstrap por correo. Desbloquea Spec 06 (alta de operadores) y la web de Specs 11–20.
- **Riesgos abiertos**: comportamiento del rewrite con el arranque en frío de Render; IP real del cliente tras dos proxies para el limitador.
