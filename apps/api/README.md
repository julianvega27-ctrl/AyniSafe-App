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

### Limitaciones de esta entrega

- **Sin recuperacion de contrasena (RF03).** No hay endpoints de recuperacion ni envio de correo: quien olvide su
  contrasena no tiene salida autoservicio. La app lo indica con un texto informativo.
- **Correo sin verificar.** Se puede acceder de inmediato; el correo no prueba identidad ni propiedad del buzon.
- El `409 EMAIL_IN_USE` revela que un correo esta registrado (compromiso aceptado en el diseno); el login, en cambio,
  responde igual ante cualquier credencial invalida.
- Medicion de Argon2id pendiente en Render (ver seccion de hash).
- **Correos en el log de PostgreSQL.** El alta usa `INSERT ... ON CONFLICT DO NOTHING`: una carrera de registro no
  produce un error de unicidad y por eso PostgreSQL no escribe el correo en su log. Una violacion provocada de otra
  forma (por ejemplo, SQL manual contra la tabla) si deja el valor de la clave en el log del servidor.
