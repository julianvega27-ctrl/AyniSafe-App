# Design

## Context

Motivación y alcance en `proposal.md`; comportamiento en las specs del cambio. Base destino: `0f2366a` (PR #2 fusionado, CI aprobado), rama `feat/p3-organizacion`.

Estado observado:
- **Identidad:** gestiona `usuarios` con `rol` (ciudadano/operador/administrador) y `estado` (activo/suspendido/pendiente_activacion), sesiones opacas y `tokens_cuenta`. También la cola `envios_correo`, con un índice único parcial de envíos activos. `InvitarCuentaUseCase` encola la activación dentro de un `ContextoTransaccional` opaco del llamador, y el gestor de envíos se despierta después del commit. `SesionesPort.revocarTodasDe` ya existe.
- **Panel:** `dominio/paneles.ts` declara las secciones del panel, todas `disponible: false`. La web (`Panel.tsx`) renderiza «Aún no disponible» según esa respuesta.
- **Consultas (P3.1):** es dueña de `distritos` (DIS-01…05) y exporta su contrato por la fachada. `verificar-arquitectura.cjs` impide importar internos de otro módulo; solo se admite su `index.ts`.
- **Reportes:** el módulo todavía no existe.
- **Donante:** `efc1bce8` (`institutions/router.js`, `sites.js`, `users.js`, `coverage.js`, `admin/src/pages/Organization.jsx`) tiene SQL MySQL en routers, roles SuperAdministrador/AdministradorInstitucional, contraseña en el alta y cobertura por polígonos. Se reutilizan:
  - la validación de entradas;
  - la transacción con bloqueo de institución;
  - la composición visual de la página Organización.

  No se reutilizan sus roles, los polígonos de cobertura ni el envío de contraseñas.

## Goals / Non-Goals

**Goals:**
- Que el alta de sede y su operador sea atómica y demostrable con un fallo inyectado en PostgreSQL real (EQ-12).
- Un contrato de ámbito del operador, consumible por P4/P6 sin leer tablas de Identidad.
- Que Identidad dependa de Consultas y de Reportes solo mediante puertos inyectados en la composición.

**Non-Goals:**
- Tabla genérica de auditoría ni historial consultable (P8). Se registran `creado_por`/`actualizado_en` y la suspensión no borra filas, pero no se presenta como auditoría completa.
- Caché del ámbito. Se lee de la BD en cada consulta, porque el volumen es de decenas de filas.
- Idempotencia por cabecera `Idempotency-Key`.

## Decisions

### 1. Propiedad de datos y módulos

| Dato | Módulo | Motivo |
|---|---|---|
| Instituciones, sedes, pertenencias, coberturas, competencias | Identidad | El documento 09 §6 asigna organización y autorización por ámbito a Identidad. |
| Catálogo de categorías | Reportes (nuevo, solo catálogo) | El documento 09 §6 asigna las categorías a Reportes. Crear ahora el módulo con su fachada evita moverlo en P4. |
| Distritos | Consultas (P3.1) | Ya existe. Solo se consume. |

Identidad define dos puertos propios: `CatalogoDistritosPort` (existe el identificador) y `CatalogoCategoriasPort`. `main.ts` los implementa con las fachadas de Consultas y Reportes. En la BD, `coberturas_sede.distrito_id` y `competencias_sede.categoria_id` tienen FK a las tablas de esos módulos. Así la integridad está en la BD y la validación previa (400 en lugar de error de FK) en la aplicación.

Alternativa descartada: guardar las categorías en Identidad o en Consultas. Rompe la asignación documentada y obligaría a migrarlas en P4.

### 2. Modelo y migración aditiva

| Tabla | Columnas clave y restricciones |
|---|---|
| `instituciones` | id texto (`pnp`, `bomberos`, `samu`, `serenazgo`), `tipo` con CHECK de esos 4 y UNIQUE, nombre, contacto nullable, `activa`. Las 4 filas se insertan en la migración. |
| `sedes` | uuid, `institucion_id` FK, nombre, `nombre_normalizado` y UNIQUE(institucion_id, nombre_normalizado), `distrito_ubicacion_id` FK nullable, dirección/contacto nullable, `verificacion` (`sin_verificar`/`verificada`), `fuente_verificacion`/`verificada_en` (CHECK: ambos obligatorios si está verificada), `habilitada_atencion` (default false), `activa`, `es_demostracion`, `creado_por` FK usuario, timestamps. |
| `pertenencias_operador` | `usuario_id` PK y FK (una sola sede por operador), `sede_id` FK, `creado_en`. Un trigger comprueba que el usuario tenga rol operador. |
| `coberturas_sede` | PK(sede_id, distrito_id), FK a `distritos`. |
| `categorias` | id texto estable, nombre UNIQUE, orden, `activa`. Las 16 filas se insertan en la migración. |
| `competencias_sede` | PK(sede_id, categoria_id), FK a `categorias` con ON DELETE RESTRICT. |

Índices en `sedes(institucion_id)`, `pertenencias_operador(sede_id)` y `coberturas_sede(distrito_id)` para el enrutamiento futuro. Las FK no tienen cascada: ninguna operación borra filas. La migración es aditiva. Rollback: revertir el despliegue mientras no existan sedes, o dejar las tablas sin uso. No se borran datos.

### 3. Transacción del alta de sede

El caso de uso `CrearSedeConOperador` se ejecuta en una sola `prisma.$transaction` del adaptador `PrismaOrganizacionAdapter`:
1. `SELECT … FOR SHARE` de la institución (debe estar activa).
2. INSERT de la sede. La violación de unicidad se traduce a `SedeExistenteError`.
3. INSERT del usuario operador `pendiente_activacion` sin hash. La violación de correo se traduce a `CorreoEnUsoError`.
4. INSERT de la pertenencia.
5. `InvitarCuentaUseCase.ejecutar(usuarioId, tx)`.

Tras el commit, `gestorEnvios.despertar()`. El puerto de organización recibe una función que trabaja dentro del contexto transaccional, de modo que la aplicación orquesta los pasos sin conocer Prisma (mismo patrón opaco que `ContextoTransaccional`).

Concurrencia: la unicidad de la BD resuelve las carreras. La transacción perdedora se revierte entera y responde 409. Aislamiento READ COMMITTED, suficiente porque las invariantes están en restricciones.

Prueba de EQ-12: un trigger temporal en la BD aislada falla al insertar la pertenencia o el envío. Se comprueba que no quedan filas en `sedes`, `usuarios` ni `envios_correo`. Es el mismo patrón que la prueba de rollback de P3.1.

Alternativa descartada: `Idempotency-Key` con tabla de respuestas. Añade almacenamiento y caducidad, y la unicidad natural ya impide duplicados. El cliente recarga la lista tras un 409 o un fallo incierto.

### 4. Habilitación, suspensión e invariantes

`HabilitarSede` bloquea la sede (`FOR UPDATE`), evalúa requisitos con una consulta de conteo y devuelve la lista de faltantes en un error de dominio. Las operaciones que podrían romper una sede habilitada se rechazan con 409 en la misma transacción con bloqueo de la sede: vaciar cobertura o competencias, suspender al último operador activo o desactivar la institución. Así se evita la carrera entre habilitar y suspender.

Suspender un operador cambia `usuarios.estado` y llama a `revocarTodasDe` en la misma transacción. Suspender una sede pone `habilitada_atencion=false`. Sus operadores conservan la cuenta, pero su ámbito queda vacío.

Suspender también invalida los enlaces de activación sin usar. Decisión del 25/11/2026 tomada al implementar: un operador pendiente puede suspenderse para revocar su invitación. Para ello la migración relaja `usuarios_hash_estado_chk` de «pendiente ⇔ sin contraseña» a «pendiente ⇒ sin contraseña y activo ⇒ con contraseña»; una cuenta suspendida admite ambos casos. La activación sigue exigiendo estado pendiente y el acceso, estado activo. Reactivar una cuenta que nunca se activó la devuelve a pendiente.

Reenviar una invitación solo aplica a `pendiente_activacion`. Si ya hay un envío activo, devuelve 202 sin duplicar (índice parcial existente). El token se genera al enviar e invalida el anterior, según el mecanismo vigente.

### 5. HTTP y OpenAPI

Rutas bajo `/administrador/organizacion/…`, con `autenticarInstitucional`, `exigirRol('administrador')`, `exigirOrigenWeb` en las mutaciones, `exigirJson` y `no-store`:
- `GET /instituciones`, `PATCH /instituciones/{id}`
- `GET /sedes`, `POST /sedes` (alta con operador inicial), `PATCH /sedes/{id}` (datos, verificación, activa)
- `PUT /sedes/{id}/cobertura`, `PUT /sedes/{id}/competencias`, `POST /sedes/{id}/habilitacion`, `DELETE /sedes/{id}/habilitacion`
- `GET /sedes/{id}/operadores`, `POST /sedes/{id}/operadores`
- `PATCH /operadores/{id}` (suspender/reactivar), `POST /operadores/{id}/invitacion`

Rutas de otros roles:
- **Operador:** `GET /operador/ambito`.
- **Pública:** `GET /publico/categorias` (Reportes), con HEAD y 405/Allow como en territorio.

Errores: `EMAIL_IN_USE` (el mismo código del registro, con mensaje propio; sustituye al `CORREO_EN_USO` planificado para no duplicar códigos del contrato), `SEDE_EXISTENTE`, `REQUISITOS_HABILITACION` (con `faltantes[]`), `SEDE_HABILITADA`, `ULTIMO_OPERADOR_ACTIVO`, `INVITACION_NO_APLICABLE`, `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `FORBIDDEN_ORIGIN`, `SERVICE_UNAVAILABLE` y `METHOD_NOT_ALLOWED` (405 con `Allow` en métodos no declarados). Un catálogo de otro módulo caído se informa como 503. OpenAPI se actualiza en el mismo incremento y cada estado queda cubierto en `contrato.test.ts`.

`PUT` reemplaza conjuntos completos: es idempotente y más simple de razonar que altas y bajas de elementos sueltos.

### 6. Ámbito del operador

`ConsultarAmbitoOperador(usuarioId)` hace una consulta con joins de usuario activo, pertenencia, sede activa, institución activa, coberturas y competencias. Devuelve `{institucion, sede, distritos[], categorias[], habilitadaAtencion}`, o un ámbito vacío si falla alguna condición. Se exporta por la fachada de Identidad para P4/P6. En P3.2 no existe ningún recurso de incidentes que filtrar. EQ-09 se cubre aquí solo en lo organizativo: 403 del operador en rutas de administración y ámbito propio sin datos ajenos.

### 7. Web

Nuevas vistas en `apps/web/src/paginas/organizacion/` montadas desde `PanelRol` cuando la sección es disponible: `InstitucionesSedes`, `Operadores` y `Coberturas`. Reproducen la composición de `Organization.jsx` (intro de página, paneles por institución, tarjetas de sede y formulario compacto) con los componentes y tokens existentes (`Campo`, `Boton`, `Mensaje`, `referencia-institucional.css`). No se crean colores ni radios locales. El formulario quita el campo contraseña del origen.

El cliente API añade funciones tipadas, y cada estado de error se traduce a un mensaje de campo o de formulario. Pruebas: Vitest + Testing Library con `api-falsa`, a11y con axe y la captura `e2e/panel-visual.mjs` en escritorio y 360 px.

`paneles.ts` marca disponibles `instituciones-sedes`, `operadores` y `coberturas`. En esas secciones, `Panel.tsx` usa la intro del origen (eyebrow «Organización», título de la sección y descripción) y cada institución, sede o bloque de configuración va en su propio `.panel`, como `Organization.jsx`. El botón «Usuarios con acceso» del origen se reproduce como enlace «Operadores de la sede» a la sección Operadores con `?sede=`. Las clases portadas del `style.css` del origen se registran en `referencia-institucional.css`. Allí también se anotan las adaptaciones AyniSafe: 48 px, contraste AA y estados con texto e icono.

## Risks / Trade-offs

- [FK entre módulos en la BD] → Se acepta para la integridad. El código solo cruza módulos por fachada/puerto, y el verificador de arquitectura lo sigue comprobando.
- [Sin `Idempotency-Key`, un fallo de red tras el commit devuelve 409 al reintentar] → La web trata el 409 tras un resultado incierto recargando y mostrando la sede existente. Documentado en la spec web.
- [Sin auditoría consultable] → Se conservan las filas y las marcas de actor/fecha. P8 añade el historial. No se presenta como auditoría completa en la evidencia.
- [Correo real no verificado en el entorno desplegado] → Las pruebas usan el adaptador de prueba/archivo existente. No se declara entrega real de correo de operadores.
- [El trigger de rol en pertenencias añade lógica en la BD] → Es un trigger pequeño y probado. La alternativa (confiar solo en la aplicación) permitiría pertenencias de ciudadanos por error de código.

## Migration Plan

1. `prisma migrate deploy` crea las tablas y las semillas (4 instituciones y 16 categorías) sin tocar datos existentes.
2. Desplegar la API y luego la web. La web anterior sigue funcionando, porque solo depende de `disponible`.
3. Rollback: volver a la versión previa de API/web. Las tablas nuevas quedan sin uso. No se ejecuta un down que borre sedes u operadores ya creados.

## Open Questions

- Texto definitivo del correo de invitación de operador (sustituible sin cambiar contratos).
- ¿Hace falta paginar las sedes cuando haya más de 50? No afecta al contrato si se añade un cursor opcional.
