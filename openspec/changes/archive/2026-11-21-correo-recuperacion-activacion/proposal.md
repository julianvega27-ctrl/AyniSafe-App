# Proposal

## Why

Quien olvida su contraseña hoy no tiene salida: Spec 01 mostró «Recuperación de contraseña: próximamente» y dejó RF03 sin resolver. Además, RF29 y los documentos 09 y 11 exigen que los operadores se activen sin contraseñas compartidas y con un token de un solo uso; Spec 06 necesita esa capacidad ya construida. El proveedor y el remitente de correo estaban pendientes (RF03, `revision-consistencia-y-costos.md` P1): esta entrega los resuelve para el piloto con la Gmail API y una cuenta dedicada.

## What Changes

- Habilitar la recuperación de contraseña del ciudadano por correo: solicitud con respuesta uniforme, token de un solo uso con vencimiento (30 min) y cambio de contraseña con la política vigente de 15 a 128 puntos de código.
- Al cambiar la contraseña se **revocan todas las sesiones** del usuario y se invalidan sus demás tokens; no se inicia sesión automáticamente. Es coherente con Spec 01: solo se añade un motivo de revocación, el cierre de sesión sigue revocando únicamente la actual.
- Crear la capacidad reutilizable de **invitación y activación de cuentas**: una cuenta en estado `pendiente_activacion` recibe un enlace de un solo uso (72 h) y define su contraseña. Esta entrega **no crea operadores ni expone un endpoint para hacerlo**; Spec 06 la consumirá dentro de su propia transacción.
- Añadir un puerto de correo con adaptadores **Gmail API por HTTPS con OAuth** (producción, cuenta Gmail dedicada como remitente de piloto), SMTP de Gmail (solo local o hosts que lo permitan), archivo (desarrollo) y de pruebas, más una cola persistente mínima de envíos con reintentos que no sondea en reposo.
- Llegada del enlace a la app: Android App Links sobre el dominio de la API, con página de respaldo y pegado manual del código.
- Pantallas Flutter: «Olvidé mi contraseña», solicitud, confirmación neutral, nueva contraseña, enlace usado/vencido, activación y éxito.
- **Resultado del spike previo (21/11/2026):** Render Free bloquea el SMTP saliente de Gmail (465 y 587). Por eso el proveedor de producción es la Gmail API por HTTPS, con un script de un solo uso para obtener el refresh token. La verificación del envío desde Render y del enlace que abre la app queda para la entrega de despliegue: hasta entonces RF03 no se declara completo en producción.
- **BREAKING (documental):** se retira el requisito de Spec 01 que prohíbe endpoints de recuperación y fija el texto «próximamente».

Fuera de alcance: verificación de correo (no se marca ningún correo como verificado), OAuth o MFA para el acceso de los usuarios (OAuth solo autoriza a la API a enviar correo con la cuenta dedicada), recuperación de operadores/administradores desde la web (Spec 04/06), crear operadores o sedes, notificar por correo el cambio de contraseña (consume cuota) y cualquier despliegue permanente.

## Capabilities

### New Capabilities

- `identidad/recuperacion-activacion-cuenta`: solicitud y consumo de tokens de un solo uso para recuperar contraseña y activar cuentas invitadas, entrega de correo asíncrona y recuperable, límites de abuso y cuota, y pantallas móviles asociadas.

### Modified Capabilities

- `identidad/acceso-ciudadano`: el requisito «Límite de acceso y funciones diferidas» se retira y lo reemplaza «Límite de acceso y recuperación habilitada»; el acceso muestra el enlace activo «Olvidé mi contraseña».

## Impact

- API (`apps/api`): módulo Identidad con nuevos casos de uso, puertos `CorreoPort`, `TokensCuentaPort` y `EnviosCorreoPort`, adaptadores Prisma/SMTP/prueba, rutas públicas, página de respaldo y `assetlinks.json`; `SesionesPort` gana revocación total por usuario.
- Datos: migración con `TokenCuenta`, `EnvioCorreo`, el estado `pendiente_activacion` y `passwordHash` nulo solo en ese estado; nuevos tipos en `VentanaIntentos`.
- Dependencias: cliente SMTP (nodemailer) en la API para uso local; la Gmail API se llama con `fetch`, sin dependencias nuevas; `app_links` en Flutter; nuevas variables de entorno (SMTP, `GMAIL_*`, remitente, URL base, huellas Android, cuota diaria).
- Móvil (`apps/mobile`): intent-filter verificado, nuevas pantallas y repositorio; sustituye el texto de [acceso_pantalla.dart](../../../apps/mobile/lib/presentacion/pantallas/acceso_pantalla.dart).
- Documentación: guía UI (§2.5 y §3), RF03 y docs 09/11, `revision-consistencia-y-costos.md`, OpenAPI y README de API.
- Operación: cuota gratuita de Gmail (500/día); no se despliega servicio permanente en este cambio. Los secretos de OAuth viven solo en variables de entorno.
