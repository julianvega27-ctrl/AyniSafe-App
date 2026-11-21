# AyniSafe API

API REST (Node.js, Express, TypeScript) del monolito modular de AyniSafe. Este directorio contiene
por ahora el modulo **Identidad** (acceso ciudadano). Referencia de diseno:
`openspec/changes/registro-login-ciudadano/`.

> Estado: los cuatro endpoints de acceso ciudadano estan implementados y probados en local. Nada de esto
> esta desplegado ni expuesto a un entorno compartido.

## Requisitos

- Node.js 22 o superior y npm.
- Binarios de PostgreSQL 18 (`initdb`, `pg_ctl`, `psql`) en el `PATH`, o `PG_BIN` apuntando a su carpeta.
- Bash (Git Bash en Windows) para el script de base local.

## Arranque local

Desde `apps/api/`:

```bash
npm install
npm run db:local:init     # crea el cluster aislado y el archivo .env (solo la primera vez)
npm run db:generar        # genera el cliente Prisma en src/generated/prisma
npm run db:verificar      # comprueba la conexion a la base de desarrollo
npm run build
npm start                 # escucha en PORT (3000 por defecto)
```

Siguientes sesiones: `npm run db:local:start` antes de trabajar y `npm run db:local:stop` al terminar.

## Base de datos local aislada

`scripts/bd-local.sh` crea un cluster PostgreSQL propio del proyecto:

- Datos en `apps/api/.pgdata/` (ignorado por Git), puerto **5433**, solo `127.0.0.1`.
- No usa ni modifica otros servidores PostgreSQL de la maquina (el puerto 5432 queda intacto).
- Crea las bases `ayni_safe_dev` y `ayni_safe_test` y un usuario con contrasena aleatoria.
- La contrasena se escribe unicamente en `.env`; el script no la imprime.

## Configuracion y secretos

Copia `.env.example` como referencia de variables. `.env` y `.pgdata/` **nunca** se suben a Git.

| Variable | Uso |
|---|---|
| `NODE_ENV` | `development`, `test` o `production`. |
| `PORT` | Puerto HTTP de la API. |
| `TRUST_PROXY_HOPS` | Saltos de proxy de confianza para obtener la IP del cliente. |
| `DATABASE_URL` | Conexion Prisma a la base de desarrollo. |
| `TEST_DATABASE_URL` | Base aislada para pruebas de API. |
| `RATE_LIMIT_HMAC_SECRET` | Obligatoria, minimo 32 caracteres. Deriva con HMAC las claves del limitador. |
| `RL_REGISTRO_IP_MAX`, `RL_LOGIN_IP_MAX`, `RL_LOGIN_CORREO_IP_MAX` | Umbrales por ventana de 15 min (5, 30 y 5 por defecto). |
| `HASH_MAX_CONCURRENCIA`, `HASH_MAX_COLA` | Hashes simultaneos y cola maxima antes de responder 503 (4 y 16 por defecto). |
| `API_PUBLIC_URL`, `EMAIL_ADAPTER`, `GMAIL_*`, `SMTP_*`, `MAIL_REMITENTE_*`, `EMAIL_DIARIO_MAX`, `RL_RECUP_*`, `RL_TOKEN_IP_MAX`, `ANDROID_*` | Recuperacion y activacion por correo: ver la seccion «Recuperacion de contrasena y activacion de cuentas». |

Los mensajes de error de configuracion y conexion no incluyen valores ni credenciales.

## Estructura

```text
src/
  app.ts                       composicion general
  config/entorno.ts            lectura y validacion de variables
  modules/identidad/
    dominio/ aplicacion/ infraestructura/ presentacion/
    identidad.module.ts        raiz de composicion del modulo
    index.ts                   fachada publica
prisma/                        esquema Prisma y migraciones SQL
scripts/                       base local y verificacion de conexion
```

## Migraciones

El esquema vive en `prisma/schema.prisma`; las migraciones SQL, en `prisma/migrations/`. La migracion
inicial (`identidad_inicial`) crea `usuarios`, `sesiones` y `ventanas_intentos` y anade restricciones
CHECK que Prisma no expresa (correo en minusculas y sin espacios externos, longitudes, vencimiento
posterior a la creacion, contador no negativo).

```bash
npm run db:migrar     # aplica las migraciones pendientes a DATABASE_URL (prisma migrate deploy)
npm run db:generar    # regenera el cliente Prisma tras cambiar el esquema
```

Para crear una migracion nueva durante el desarrollo: `npx prisma migrate dev --create-only --name <nombre>`,
revisar el SQL generado y aplicarlo con `npm run db:migrar`. No se borran cuentas como mecanismo de
reversion; eliminar el esquema solo es valido en entornos efimeros sin datos reales.

## Normalizacion de correo y clave de identidad

- Se recorta el correo y se guarda en minusculas en `usuarios.correo_normalizado` (UNIQUE): esa es la
  clave de identidad. `Vecina@Ejemplo.com` y `vecina@ejemplo.com` son la misma cuenta.
- No se eliminan puntos ni sufijos `+`: `ana.maria@x.com`, `anamaria@x.com` y `ana+a@x.com` son cuentas distintas.
- La sintaxis admitida es ASCII (parte local hasta 64 caracteres, etiquetas de dominio hasta 63, total
  hasta 254). Correos con caracteres no ASCII se rechazan: es una limitacion conocida de esta entrega.
- Validar la sintaxis no prueba que el buzon exista ni que sea de quien registra: el correo **no se verifica**.
- La restriccion UNIQUE es la autoridad ante registros simultaneos; la base ademas rechaza (CHECK) un
  correo que no llegue normalizado.

## Contrasenas y hash

- Longitud de 15 a 128 **puntos de codigo Unicode**, con espacios, sin reglas de composicion. No se recorta,
  normaliza ni trunca. Los vectores de prueba estan en `apps/shared/vectores-validacion.json` y los usan la
  API y la app.
- Hash **Argon2id** (`@node-rs/argon2`) con sal individual y parametros `m=19456 KiB, t=2, p=1`, guardados en
  el formato codificado del hash. Esos son los minimos del diseno y no se reducen por limites de hosting.
  Los parametros estan en `PARAMETROS_ARGON2ID` (`infraestructura/argon2id-hash.adapter.ts`).
- Para cuentas inexistentes o no admitidas se verifica contra un hash ficticio del mismo costo.

### Medicion de memoria y latencia

`npx tsx scripts/medir-hash.ts` (equipo de desarrollo: 24 CPU, 16 GB, Node 24, hilos de libuv por defecto = 4):

| Concurrencia | hash/seg | p50 ms | p95 ms | RSS pico MB |
|---|---|---|---|---|
| 1 | 71,9 | 14 | 15 | 130 |
| 4 | 140,7 | 27 | 30 | 211 |
| 16 | 163,2 | 66 | 99 | 211 |
| 32 | 165,6 | 116 | 193 | 211 |

Lectura: con el `UV_THREADPOOL_SIZE` por defecto solo corren 4 hashes a la vez, asi que la memoria queda
acotada (RSS base 92 MB, pico 211 MB, unos 30 MB por hash simultaneo) y las solicitudes extra esperan en
cola. **Esta medicion no valida Render**: la CPU compartida del plan gratuito es mucho mas lenta y los hashes
tardaran proporcionalmente mas. Repetir el script en el entorno objetivo antes de habilitar el registro en un
entorno compartido; si satura, se ajusta la concurrencia o el plan, sin bajar los parametros.

## Pruebas

```bash
npm run test:unidad        # validacion y hash; no necesita base de datos
npm run test:integracion   # esquema y alta de cuentas contra la base aislada de pruebas
npm test                   # todo
```

Las pruebas de integracion usan `TEST_DATABASE_URL`. Antes de ejecutarlas, `test/preparar-bd.ts` recrea el
esquema `public` vacio de esa base y aplica las migraciones (solo actua si el nombre de la base termina en
`_test`), lo que reproduce el esquema desde cero en cada ejecucion.

## Cuentas privilegiadas

No existe alta publica de operadores ni administradores: el registro fija siempre rol `ciudadano` y estado
`activo`, y rechaza cualquier campo de rol o institucion. Estas instrucciones no siembran cuentas
privilegiadas ni contrasenas compartidas; su alta corresponde a un flujo administrativo posterior.
La capacidad de invitacion y activacion (ver mas abajo) prepara ese flujo pero no crea operadores: las cuentas
invitadas nacen sin contrasena y la definen con un enlace de un solo uso.

## API de acceso ciudadano

El contrato completo esta en [`openapi.yaml`](openapi.yaml) (`npm run contrato:validar` comprueba su sintaxis).
La prueba `test/integracion/contrato.test.ts` valida las respuestas reales contra sus esquemas y falla si un
estado documentado no se ejercita o si la API responde un estado no documentado.

| Metodo y ruta | Resultado |
|---|---|
| `POST /api/v1/auth/ciudadanos/registro` | 201 con la identidad basica; **no** inicia sesion. |
| `POST /api/v1/auth/ciudadanos/sesiones` | 200 con `token`, `expiresAt` y la identidad. |
| `GET /api/v1/auth/sesion` | 200 con la identidad del propietario del token, o 401. |
| `DELETE /api/v1/auth/sesion` | 204 siempre (idempotente); revoca solo la sesion presentada. |

Ejemplo (respuestas reales del servidor local; el token se abrevia):

```bash
B=http://localhost:3000/api/v1
curl -i -X POST $B/auth/ciudadanos/registro -H 'Content-Type: application/json'   -d '{"nombre":"Rosa Quispe","correo":"rosa@ejemplo.com","contrasena":"contraseña de ejemplo 123"}'
# 201  {"usuario":{"id":"5482bbd9-...","nombre":"Rosa Quispe","correo":"rosa@ejemplo.com","rol":"ciudadano"}}

curl -s -X POST $B/auth/ciudadanos/sesiones -H 'Content-Type: application/json'   -d '{"correo":"rosa@ejemplo.com","contrasena":"contraseña de ejemplo 123"}'
# 200  {"token":"<43 caracteres>","expiresAt":"2026-11-22T13:48:50.555Z","usuario":{...}}

curl -s $B/auth/sesion -H "Authorization: Bearer $TOKEN"        # 200 {"usuario":{...},"expiresAt":"..."}
curl -s -X DELETE $B/auth/sesion -H "Authorization: Bearer $TOKEN"  # 204
```

Errores: `{"error":{"code","message","fields?","requestId"}}`. `fields` nunca contiene el valor enviado.
Todas las respuestas llevan `Cache-Control: no-store`. El token solo se acepta por `Authorization: Bearer`;
en la URL o en el cuerpo se ignora. Cuerpos JSON de hasta 8 KiB (413), solo `application/json` en UTF-8 (415).

### Expiracion de la sesion

Token opaco de 32 bytes aleatorios (base64url); en la base solo se guarda su SHA-256. La sesion vence **24 horas
despues de crearse**, sin renovacion ni refresh: al vencer, `GET /auth/sesion` responde 401 y hay que iniciar
sesion de nuevo. Se admiten varias sesiones por usuario; cerrar una no afecta a las demas. Cada peticion
comprueba tambien que la cuenta siga siendo un ciudadano activo. Una purga cada hora elimina sesiones revocadas
o vencidas con mas de 7 dias y ventanas de intentos con mas de 24 horas, por lotes de 500.

### Limitador de intentos

Ventanas fijas de 15 minutos, persistidas en PostgreSQL con incremento atomico (sobreviven a reinicios):

| Limite | Por defecto |
|---|---|
| Registro por IP | 5 |
| Acceso por IP | 30 |
| Acceso por correo + IP | 5 |

Se cuentan las solicitudes validas sintacticamente (antes del hash), tengan exito o no; las de formato invalido
(400) no cuentan. Al superar un umbral: 429 con `Retry-After` en segundos hasta el fin de la ventana, sin crear
cuentas ni sesiones. El contador por correo+IP no bloquea el correo desde otra IP. Las claves se derivan con
HMAC (`RATE_LIMIT_HMAC_SECRET`): no se guardan correos ni IP en claro. Los limites por IP pueden afectar a
usuarios tras un mismo NAT y no frenan ataques distribuidos; revisar las metricas del piloto.

### Proxy de confianza

`TRUST_PROXY_HOPS` es el numero de proxies de confianza delante de la API (0 en local, 1 en Render). Express
toma la IP del cliente `TRUST_PROXY_HOPS` saltos desde la derecha de `X-Forwarded-For`; las entradas anteriores
(que un cliente puede falsificar) se ignoran. Con valor 0, la cabecera se ignora por completo. Un valor mal
configurado hace que todos los clientes compartan una IP (se bloquearian entre si) o que el limite se eluda.

## Recuperacion de contrasena y activacion de cuentas

Entrega `correo-recuperacion-activacion` (RF03; soporte para RF29). Contrato en `openapi.yaml`.

| Ruta | Resultado |
|---|---|
| `POST /api/v1/auth/recuperaciones` | **202 uniforme** (mismo cuerpo exista o no la cuenta). Solo una cuenta ciudadana activa recibe correo. |
| `POST /api/v1/auth/tokens/consulta` | 200 `{proposito, expiresAt}`, 404 `TOKEN_INVALID`, 410 `TOKEN_USED` / `TOKEN_EXPIRED`. No consume el token. |
| `POST /api/v1/auth/contrasena/restablecer` | 204. Cambia la contrasena, **revoca todas las sesiones** del usuario y no inicia sesion. |
| `POST /api/v1/auth/activaciones` | 204. Activa una cuenta `pendiente_activacion` con la contrasena elegida; sin sesion. |
| `GET /cuenta/restablecer`, `GET /cuenta/activar` | Pagina de respaldo del enlace (ver abajo). |
| `GET /.well-known/assetlinks.json` | Asociacion de App Links de Android; 404 si no hay huellas configuradas. |

### Tokens

Opacos (32 bytes aleatorios, base64url); en la base solo se guarda su SHA-256. Un solo uso y vencimiento desde la
emision: **30 minutos** en recuperacion y **72 horas** en activacion. Emitir uno nuevo invalida los pendientes de la
misma cuenta y proposito; consumir uno invalida los demas de la cuenta. El consumo es atomico (una unica sentencia
`UPDATE ... RETURNING` con el usuario bloqueado): de dos solicitudes simultaneas con el mismo token solo una gana.
La contrasena nueva sigue la politica de Spec 01 (15 a 128 puntos de codigo, sin recortar ni normalizar) y se valida
**antes** de tocar el token: un 400 no lo consume.

### Entrega del correo

La solicitud solo encola un envio (`envios_correo`) y responde; un trabajador dentro de la API lo entrega despues.
Asi la respuesta no depende del proveedor ni revela por latencia si la cuenta existe.

- **El token se genera al enviar**, no al encolar: la cola no guarda secretos ni enlaces. La entrega es al menos una
  vez: si el proceso cae tras aceptar el proveedor y antes de marcar `enviado`, se reenvia con un token nuevo que
  invalida el anterior (el correo avisa de que solo vale el enlace mas reciente).
- Reintentos con espera creciente (1, 5, 15, 30 y 60 min). Recuperacion se abandona a los 15 min (`fallido`, codigo
  `VENCIDO` o el del ultimo error); activacion reintenta hasta 24 h. Solo se guardan **codigos genericos** de error.
- **Sin sondeo en reposo**: el trabajador corre al arrancar, tras encolar y mientras haya reintentos pendientes. Sin
  envios activos no hay temporizador (Neon y Render Free no se mantienen despiertos).
- Un envio `enviando` cuyo arrendamiento (2 min) vence lo retoma otro pase, asi se recupera de un reinicio.

### Adaptadores de correo (`EMAIL_ADAPTER`)

| Valor | Uso |
|---|---|
| `archivo` (por defecto en desarrollo) | Escribe cada correo como `.txt` en `.correos-dev/` (ignorado por Git). **Contiene el enlace**: solo local. No envia nada. |
| `prueba` (por defecto en test) | En memoria, para las pruebas. **No valida el proveedor real.** |
| `gmail-api` | Envio real por la **Gmail API (HTTPS, 443)** con OAuth. Es el de **produccion**: Render Free bloquea el SMTP. |
| `smtp` | Envio real por SMTP de Gmail. Solo local u hosts que permitan SMTP. |

En produccion solo se admiten `gmail-api` y `smtp`: con `archivo` o `prueba` el arranque falla. Sin `EMAIL_ADAPTER`
en produccion se usa `gmail-api`.

Variables (ver `.env.example`; nunca se suben credenciales): `API_PUBLIC_URL` (obligatoria y `https` en produccion),
`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` y `MAIL_REMITENTE_DIRECCION` (obligatorias con
`gmail-api`; la direccion debe ser la cuenta que autorizo el token), `MAIL_REMITENTE_NOMBRE` (`AyniSafe`),
`SMTP_HOST` (por defecto `smtp.gmail.com`), `SMTP_PORT` (465), `SMTP_USUARIO`, `SMTP_CLAVE` (con `smtp`),
`EMAIL_DIARIO_MAX` (400), `ANDROID_PACKAGE` y `ANDROID_CERT_SHA256`. Los mensajes de error de configuracion nunca
incluyen valores.

### Gmail API: configuracion

**Por que la Gmail API y no SMTP.** El 21/11/2026 se comprobo que Render Free **bloquea el SMTP saliente** de Gmail
(465 y 587, `ETIMEDOUT` en ~265 ms desde un servicio Free temporal). La Gmail API usa HTTPS (443), que Render no bloquea
(no verificado aun desde Render: queda para la entrega de despliegue).

**Cuenta y cuota.** Se envia desde una cuenta Gmail **dedicada** (remitente de piloto, no institucional). Cuota publicada
de 500 correos al dia para cuentas personales (el tope propio es 400). **Usa una cuenta personal de Gmail, no una
institucional:** el correo sale desde la cuenta que autoriza el token y una cuenta de organizacion puede impedir
cambiar su nombre visible.

**Pasos unicos en Google Cloud** (proyecto propio, por ejemplo «AyniSafe»):

1. Habilita la **Gmail API** (APIs y servicios > Biblioteca).
2. En «Acceso a los datos» agrega **solo** el permiso `https://www.googleapis.com/auth/gmail.send`.
3. En «Publico»: tipo **Externo**; agrega la cuenta dedicada como **usuario de prueba**.
4. En «Clientes» crea un cliente de tipo **Aplicacion web** (no «Android»): deja vacio «Origenes autorizados de
   JavaScript» y en «URI de redireccionamiento autorizados» pon exactamente `http://localhost:8787/callback`.
5. Copia el **Client ID** y el **Client secret** a `apps/api/.env` como `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET`
   (sin comillas; nunca en Git ni en el chat) y define `MAIL_REMITENTE_DIRECCION` con la cuenta dedicada.
6. Obten el refresh token: `node scripts/obtener-refresh-token.mjs`. Abre la pantalla de autorizacion de Google;
   inicia sesion con la **cuenta dedicada**, acepta el permiso (si dice «no verificada», «Avanzado» > «Ir a ...») y el
   script guarda `GMAIL_REFRESH_TOKEN` en `.env` **sin imprimirlo**. Escucha solo en `localhost:8787`, valida un
   `state` anti-CSRF y espera hasta 10 minutos.
7. Prueba un envio real: `EMAIL_ADAPTER=gmail-api npx tsx scripts/probar-correo.ts tu-correo@ejemplo.com`. El correo no
   lleva enlaces ni codigos y el script solo imprime el resultado, nunca credenciales.

**Caducidad del token.** Con la pantalla de consentimiento en estado **«Prueba»**, Google puede caducar el refresh
token a los 7 dias (dato no verificado contra la documentacion de Google en este proyecto): cuando todo funcione, pasa
el estado a **«En produccion»**. Si los envios empiezan a fallar con el codigo `AUTENTICACION` (token caducado o
autorizacion revocada), repite el paso 6. La solicitud de recuperacion seguira respondiendo 202 y el envio quedara
reintentandose y despues `fallido`.

**Como funciona el adaptador.** Renueva el token de acceso con el refresh token y lo guarda solo en memoria hasta
poco antes de que venza; envia el mensaje (texto plano, RFC 2822 en base64url) a la Gmail API, con tiempo maximo por
llamada. Traduce los errores a codigos genericos (`AUTENTICACION`, `CUOTA`, `CONEXION`, `TIEMPO_AGOTADO`, `RECHAZADO`,
`DESCONOCIDO`) y nunca conserva tokens, el secreto del cliente, el destinatario ni el cuerpo. Rechaza direcciones con
saltos de linea y elimina los saltos de linea del asunto y del nombre del remitente (sin inyeccion de cabeceras).

**Limitacion conocida: nombre del remitente.** Con la Gmail API el correo sale como la cuenta que autorizo el token, y
Gmail puede mostrar el nombre guardado en esa cuenta en lugar del de la cabecera `From`. En la prueba del 21/11/2026
los correos llegaron a la bandeja de entrada en menos de un minuto con el asunto correcto, pero **sin** el nombre
«AyniSafe» como remitente. Queda pendiente: poner ese nombre en la cuenta dedicada (Gmail > «Cuentas e importacion» >
«Enviar como» > «editar informacion», o el nombre de la cuenta de Google).

**SMTP (solo local).** `EMAIL_ADAPTER=smtp` con `SMTP_USUARIO` y `SMTP_CLAVE` (contrasena de aplicacion de la cuenta
dedicada). Desde la maquina de desarrollo conecta en 465 y 587 y entrego correos reales a un buzon `@unsch.edu.pe` y otro
`@gmail.com` con remitente «AyniSafe». **No sirve en Render Free.**

Probar a mano sin enviar nada: con `EMAIL_ADAPTER=archivo`, `POST /auth/recuperaciones` con un correo registrado y
abrir el `.txt` generado en `.correos-dev/`.

### Limites y cuota

Ventanas fijas persistidas (sobreviven a reinicios), claves con HMAC: recuperacion 10 por IP y 3 por correo+IP en
15 min, y **3 por correo por hora** (frena el bombardeo sin bloquear de forma permanente); consulta y consumo de
tokens 20 por IP en 15 min. Todos configurables (`RL_RECUP_IP_MAX`, `RL_RECUP_CORREO_IP_MAX`, `RL_RECUP_CORREO_MAX`,
`RL_TOKEN_IP_MAX`). Ademas, un **tope diario global** (`EMAIL_DIARIO_MAX`, dia UTC) cuenta solo las solicitudes que ya
pasaron los limites anteriores; al agotarse, toda solicitud valida recibe el mismo **503 con `Retry-After`**, exista o
no la cuenta. Riesgo aceptado: quien tenga muchas IP podria agotar la cuota y frenar la recuperacion de todos.

### Enlace del correo y App Links

El enlace es `https://<API_PUBLIC_URL>/cuenta/restablecer#t=<token>` (activacion: `/cuenta/activar`). El token va en el
**fragmento**, que no se envia al servidor ni queda en sus registros de acceso. En Android el enlace abre la app si el
dominio esta verificado (`assetlinks.json` con `ANDROID_PACKAGE` y las huellas de `ANDROID_CERT_SHA256`, en formato
`AA:BB:...` separadas por comas). Si la app no esta instalada, la pagina de respaldo muestra el codigo para copiarlo y
retira el fragmento de la direccion; el codigo tambien se pega en «Tengo un codigo» dentro de la app. Las paginas llevan
CSP por hash (sin `unsafe-inline`), `no-store` y `Referrer-Policy: no-referrer`, y no reflejan ningun parametro.

### Invitacion de cuentas (capacidad para Spec 06)

`modulo.invitarCuenta.ejecutar(usuarioId, tx)` encola el correo de activacion **dentro de la transaccion de quien
llama**: si esta se revierte no queda ni cuenta ni envio. **No crea cuentas, operadores ni sedes**, y esta entrega no
expone ninguna ruta que lo haga. Tras el commit, el llamador debe invocar `modulo.gestorEnvios.despertar()`. La cuenta
invitada queda `pendiente_activacion` con `password_hash` nulo (restriccion `CHECK`); no puede iniciar sesion ni
recuperarse hasta activarse.

### Mantenimiento

La purga horaria elimina ademas tokens inservibles y envios terminados con mas de 7 dias, por lotes de 500.

### Limitaciones de esta entrega

- **La recuperacion depende del proveedor de correo.** Con la Gmail API (HTTPS) ya implementada, falta comprobar el
  envio desde Render Free y el enlace verificado en un dispositivo real (entrega de despliegue): hasta entonces RF03 no
  se debe declarar completo en produccion. El adaptador de pruebas y el servidor SMTP local no validan el proveedor real.
- **Correo sin verificar.** Se puede acceder de inmediato; el correo no prueba identidad ni propiedad del buzon.
- El `409 EMAIL_IN_USE` revela que un correo esta registrado (compromiso aceptado en el diseno); el login, en cambio,
  responde igual ante cualquier credencial invalida.
- Medicion de Argon2id pendiente en Render (ver seccion de hash).
- **Correos en el log de PostgreSQL.** El alta usa `INSERT ... ON CONFLICT DO NOTHING`: una carrera de registro no
  produce un error de unicidad y por eso PostgreSQL no escribe el correo en su log. Una violacion provocada de otra
  forma (por ejemplo, SQL manual contra la tabla) si deja el valor de la clave en el log del servidor.
