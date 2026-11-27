# Design

## Context

Motivación y alcance en `proposal.md`. Estado de partida (`main` `ecbaea7`, con P5.1 fusionado y archivado):

- **Reportes.** `RegistrarIncidenteUseCase` registra el envío en una `UnidadDeTrabajo`. El comprobante del invitado entrega una vez un código secreto, del que se guarda solo una huella HMAC (`hmac-secretos.adapter.ts`). El limitador persistente de Identidad llega mediante `LimitadorEnviosPort`. Las rutas usan JSON de hasta 8 KiB; no hay parser multipart.
- **Consultas.** `BandejaInstitucional.resumen` y `.evaluacion` resuelven el ámbito (Identidad) y la participación (Operaciones), y devuelven el mismo `IncidenteNoDisponibleError` (404) para lo ajeno, inexistente o malformado. El detalle del autor sale de las rutas de seguimiento.
- **Límites.** `scripts/verificar-arquitectura.cjs` ya prohíbe `cloudinary`, `fs`, `http` y `https` fuera de la infraestructura y de la presentación. Ningún módulo lee tablas de otro.
- **Configuración.** `apps/api/.env` contiene `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` de una cuenta compartida (entorno de prueba del plan gratuito). La key no puede leer `/usage`. Los valores no se leen ni se imprimen durante la planificación.
- **Donante** (`efc1bce`, solo lectura):
  - `cloudinary-store.js`: subida `authenticated`, lectura por URL firmada del servidor y `destroy` con `invalidate`;
  - `evidence.js`: multer en memoria, `sharp` con `failOn`, `limitInputPixels`, `rotate` y re-codificación, y conteo de 3 en una transacción;
  - `guest-evidence.js`: JWT de 24 h para cargas de invitado;
  - `evidence-storage.js`/`evidence-store.js`: almacén local.

  Problemas para AyniSafe:
  - sube el objeto **dentro** de la transacción y sin registrarlo antes, así que una respuesta perdida deja objetos sin registro;
  - usa el prefijo `incidencias/` y no aplica etiqueta ni carpeta;
  - guarda `secure_url`;
  - el JWT exige un secreto y una dependencia que el destino no usa;
  - el conteo `COUNT(*)` con `FOR UPDATE` sobre el incidente cruza el límite del módulo de Operaciones;
  - el almacén local no sirve en Render.

## Goals / Non-Goals

**Goals:**
- Ningún objeto del proveedor sin un registro en PostgreSQL que permita borrarlo, ni siquiera ante una caída entre pasos.
- Aislamiento verificable dentro de la cuenta compartida: el código no puede borrar ni leer nada fuera de `aynisafe/`.
- Las URLs que dan acceso a las fotos no salen del servidor.
- El reporte nunca depende de la disponibilidad del proveedor.
- Un mecanismo de eliminación persistente que P9 reutilice para los plazos.

**Non-Goals:**
- Plazos de conservación tras el cierre, backups y restauración (P6/P9).
- Miniaturas o derivados generados por el proveedor: no se piden transformaciones.
- Una política de CDN o caché de imágenes en clientes, más allá de no persistirlas.
- Un almacén local para producción.

## Decisions

### 1. Carga en dos fases con registro previo del `public_id`

`AdjuntarEvidenciaUseCase` sigue estos pasos:
1. Autoriza al solicitante (decisión 4).
2. Procesa la imagen: decodifica, valida y re-codifica sin metadatos (decisión 6).
3. Abre la **transacción A**:
   - bloquea las ranuras del incidente;
   - resuelve la idempotencia;
   - comprueba el máximo de 3 y la cuota local;
   - inserta la evidencia en estado `pendiente`, con `public_id = aynisafe/<uuid v4>`;
   - confirma.
4. Sube el objeto al proveedor fuera de cualquier transacción, con timeout.
5. Verifica que la respuesta trae el mismo `public_id`, `type = authenticated` y bytes coherentes.
6. Abre la **transacción B**: pasa a `disponible` con `confirmada_en`.
7. Si los pasos 4–6 fallan o dan un resultado incierto, pasa la evidencia a `eliminacion_pendiente` (o la deja `pendiente` si también falla la BD) y responde 503.

Alternativa descartada: subir dentro de la transacción, como el donante. Mantiene una conexión de BD abierta durante una llamada externa de hasta 15 s y deja objetos sin registro si se pierde la respuesta del proveedor.

### 2. Esquema (migración aditiva, módulo Reportes)

- **`evidencias_incidente`.** Columnas:
  - `id uuid` y `incidente_id`;
  - `ranura smallint` CHECK 1–3;
  - `public_id text UNIQUE` con CHECK `~ '^aynisafe/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`;
  - `proveedor` ('cloudinary' | 'memoria');
  - `estado` ∈ pendiente/disponible/eliminacion_pendiente/eliminada;
  - `tipo_medio` (CHECK de los tres tipos), `bytes` (CHECK ≤ 5 242 880), `ancho`, `alto` y `sha256` de la copia normalizada;
  - `huella_carga` (sha256 del archivo recibido) y `clave_idempotencia uuid`;
  - `modalidad` y `autor_usuario_id` (null para invitado);
  - `creada_en`, `confirmada_en`, `eliminada_en` y `motivo_eliminacion` (fallo_carga, huerfana, plazo, que reservará P9);
  - `intentos_eliminacion` y `proximo_intento_en`.

  Índices y restricciones:
  - `UNIQUE (incidente_id, ranura) WHERE estado <> 'eliminada'`: garantiza el máximo de 3 ante la concurrencia sin bloquear filas de Operaciones;
  - `UNIQUE (incidente_id, clave_idempotencia)`;
  - un índice parcial de tareas `(proximo_intento_en) WHERE estado IN ('pendiente','eliminacion_pendiente')`.

  Una fila `eliminada` conserva solo identificadores, instantes y motivo: es la marca sin contenido del documento 11. `sha256` y las dimensiones se ponen a null al eliminar.
- **`permisos_evidencia`.** Contiene `incidente_id` (PK), la huella HMAC del permiso, `vence_en` y `emitido_en`. La reemisión reemplaza la huella.
- **`accesos_evidencia`.** Contiene `id`, `evidencia_id`, `usuario_id`, `rol` y `accedido_en`, sin contenido.

La transacción A asigna la menor ranura libre. Si dos cargas concurrentes eligen la misma, la violación de la restricción única se reintenta una vez con la siguiente; sin ranura libre, se responde 409.

### 3. Puertos y adaptadores

- **`AlmacenEvidenciasPort`** (Reportes, aplicación), con tres operaciones:
  - `subir(publicId, bytes, tipo)` → `{publicId, tipo, bytes}`;
  - `obtener(publicId, tipo)` → `Buffer`, con un tope de 5 MB al leer;
  - `eliminar(publicId)` → `'eliminado' | 'no_existe'`.

  Errores tipados: `ProveedorNoDisponible`, `CuotaProveedor` y `RespuestaInvalida`.
- **`CloudinaryEvidenciasAdapter`** (infraestructura). Configura el cliente por instancia, no con el `cloudinary.config` global, y sube con:
  - `type: 'authenticated'` y `resource_type: 'image'`;
  - `public_id`, `asset_folder: 'aynisafe'` y `tags: ['aynisafe']`;
  - `overwrite: false`, `unique_filename: false` y sin `eager` ni transformaciones;
  - un timeout.

  `obtener` firma la URL del lado del servidor (`sign_url`, `type: authenticated`), descarga con `redirect: 'error'` y un tope de bytes, y nunca devuelve la URL. `eliminar` llama a `uploader.destroy(publicId, { type: 'authenticated', invalidate: true })`. Las tres operaciones validan el `public_id` con la misma expresión del CHECK antes de llamar al proveedor. El adaptador no expone funciones de borrado por prefijo, etiqueta ni carpeta, y ningún código las llama.
- **`MemoriaEvidenciasAdapter`.** Solo se permite con `NODE_ENV=test` o en el arnés de carga. La configuración rechaza `memoria` en producción.
- **`ProcesadorImagenPort`** con `SharpProcesadorAdapter` (decisión 6).
- **Configuración.** `EVIDENCIAS_ADAPTADOR` admite `cloudinary`, `deshabilitado` (por defecto) y `memoria` (solo en pruebas). Con `cloudinary` se exigen las tres variables `CLOUDINARY_*`; un error de configuración nombra la variable que falta, nunca su valor. Se añaden `EVIDENCIAS_CUOTA_BYTES` (valor inicial: 500 MB) y `EVIDENCIAS_CUOTA_OBJETOS` (valor inicial: 1 000), que se suman desde la BD sobre los estados distintos de `eliminada`.

### 4. Autorización de la carga

- **Con cuenta:** la sesión Bearer del ciudadano debe ser la del autor del envío. Reportes lo comprueba en su propia tabla.
- **Invitado:** cabecera `X-Permiso-Evidencias`. El permiso es un token aleatorio de 32 bytes en base64url, del que se guarda la huella HMAC con el secreto ya usado para los códigos de seguimiento, y se compara en tiempo constante. Se emite en el comprobante como `permisoEvidencias: { valor, venceEn }`, con vencimiento a recepción + 24 h. Un reintento idempotente lo reemite, como el código secreto. Se descarta el JWT del donante: añadiría un secreto, una dependencia y un mecanismo distinto del resto del destino.
- **Condiciones comunes:** la carga debe llegar antes de recepción + 24 h, y el estado del incidente, leído por `IncidentesPort` de Operaciones, no debe ser CERRADO. Cualquier fallo responde con el mismo 404. Una cookie institucional responde 403, igual que en el registro.
- **Límite:** el limitador persistente de Identidad se aplica a las cargas de invitado, con la clave `cargas_evidencia` y un valor inicial de 20 por hora y origen.

### 5. Idempotencia por foto

La cabecera `Idempotency-Key` (UUID) es obligatoria. En la transacción A se busca `(incidente_id, clave)`:
- con la misma `huella_carga`, se devuelve la fila existente: 200 si está `disponible`, y 503 reintentable si sigue `pendiente`. Una fila en `eliminacion_pendiente` o `eliminada` por fallo permite reintentar con la misma clave, creando una evidencia nueva que la reemplaza;
- con otra huella, se responde 409.

La huella se calcula sobre los bytes recibidos y no sobre la copia normalizada, para no depender del determinismo de la re-codificación.

### 6. Procesamiento de imagen

`multer` en memoria, con el campo `foto`, 1 archivo y un límite de 5 MB: al excederlo, 413 antes de procesar. Solo se acepta `multipart/form-data` (415 en otro caso). `sharp` se configura con `failOn: 'error'` y `limitInputPixels: 40e6`, y dimensiones de 1 a 10 000 px. El formato detectado debe ser jpeg, png o webp, aunque el tipo declarado diga otra cosa. Se aplica `rotate()` y se re-codifica en el mismo formato. sharp descarta los metadatos por defecto; no se llama a `withMetadata`. Si la salida supera 5 MB, se responde 413. Las pruebas verifican con `sharp(...).metadata()` que la salida no tiene `exif`, `icc` con GPS ni `xmp`.

### 7. Limpieza persistente

`LimpiezaEvidencias` (aplicación de Reportes) procesa lotes de hasta 20 filas con `FOR UPDATE SKIP LOCKED`:
- `pendiente` con `creada_en` de más de 15 minutos, que pasa a `eliminacion_pendiente` con motivo `huerfana`;
- `eliminacion_pendiente` con `proximo_intento_en <= now()`.

Llama a `eliminar(publicId)`. Con `eliminado` o `no_existe`, la fila pasa a `eliminada`. Si falla, incrementa los intentos y aplica un backoff exponencial con tope de 6 h. Se ejecuta al arrancar y cada 5 minutos con un temporizador `unref`, con un único proceso activo por instancia gracias a `SKIP LOCKED`.

Los 15 minutos son más estrictos que las 24 h del documento 11 para las cargas sin asociar: una fila `pendiente` no se ofrece a nadie, y retenerla 24 h solo ocuparía una ranura. No se usa la tabla de eventos asíncronos: la propia fila ya es la tarea, con su estado y sus reintentos.

### 8. Lectura autorizada

- **Operador.** `BandejaInstitucional` añade `evidencias(usuarioId, incidenteId)` y `contenidoEvidencia(usuarioId, incidenteId, evidenciaId)`, con el mismo patrón que `.evaluacion`: ámbito, participación y, si falla, `IncidenteNoDisponibleError`. Consultas obtiene los metadatos y el contenido mediante una fachada de Reportes (`LecturaEvidenciasPort`). Reportes registra el acceso en `accesos_evidencia` solo después de obtener los bytes.
- **Autor.** Las rutas de seguimiento llaman a la misma fachada filtrando por `autor_usuario_id`.
- **Rutas nuevas:**
  - `GET /operador/incidentes/{id}/evidencias/{evidenciaId}/contenido`;
  - `GET /ciudadano/incidentes/{referencia}/evidencias/{evidenciaId}/contenido`;
  - `POST /incidentes/{referencia}/evidencias` (multipart).

  Los metadatos viajan dentro del resumen del operador y del detalle del autor; no hay una ruta de listado aparte.
- **Respuesta:** `Content-Type` desde la BD, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` y `Content-Security-Policy: sandbox`.

Alternativa descartada: devolver al cliente una URL firmada del proveedor o redirigir a ella. La firma de entrega `s--…--` de Cloudinary no caduca, de modo que una URL filtrada daría acceso hasta borrar el objeto. Eso contradice el documento 11 («las URLs de acceso nunca deben durar más que el permiso»). La descarga privada con `expires_at` se evalúa en el spike solo como referencia.

### 9. Spike sobre la cuenta real

`apps/api/scripts/spike-cloudinary.ts` se ejecuta manualmente con `npm run evidencias:spike` y nunca en CI. Lee las credenciales del `.env` sin imprimirlas, usa el mismo adaptador y genera con sharp imágenes sintéticas que llevan un EXIF GPS ficticio. Guarda los `public_id` creados en un manifiesto local en `docs/validacion/p5/` (sin credenciales ni URLs firmadas) y elimina únicamente esos.

| # | Verificación | Criterio de aprobación |
|---|---|---|
| S1 | Subida `authenticated` con prefijo, carpeta y etiqueta | La respuesta trae el `public_id`, `type`, `asset_folder` y `tags` esperados. Se registra el modo de carpetas: fijo o dinámico. |
| S2 | Original sin firma, con firma alterada, de tipo `upload` y con firma válida | Solo la firma válida devuelve 200, con los bytes esperados. |
| S3 | Derivado sin firma (`w_64`) y derivado firmado | Sin firma no se sirve; firmado sí. El recurso lista el derivado. |
| S4 | EXIF | La imagen descargada no tiene EXIF ni GPS. |
| S5 | `destroy` con `invalidate` | El Admin API da 404 para el recurso. Se mide el tiempo hasta que el original y el derivado firmados dejan de servirse, sondeando con un tope de 10 min. |
| S6 | Aislamiento | El adaptador rechaza un `public_id` sin el prefijo `aynisafe/` sin llamar al proveedor. El conteo de recursos con la etiqueta `aynisafe` vuelve al valor inicial. No se llama a ninguna API de borrado masivo. |
| S7 | Cuota | `/usage` devuelve el rechazo esperado. Se registran los bytes y objetos propios, las cabeceras de límite del Admin API y los límites publicados del plan, con su fuente y fecha. |
| S8 | Descarga privada con `expires_at` (referencia) | Se registra si caduca. No cambia la decisión 8. |

Si S1–S6 pasan, el proveedor se declara validado en la evidencia y en ADR-006. Si falta S7, la cuota se declara **no observable** y queda protegida por el límite local. Cualquier fallo en S1–S6 mantiene `EVIDENCIAS_ADAPTADOR=deshabilitado` en el despliegue y deja el proveedor como pendiente.

### 10. Clientes

- **Flutter:**
  - `image_picker`, con `maxWidth`/`maxHeight` 2048 e `imageQuality` 80, para convertir y comprimir a JPEG;
  - la cola de cargas es parte del `ReporteControlador`: una clave por foto, guardada con la foto temporal hasta terminar;
  - el permiso del invitado se guarda en `flutter_secure_storage` junto al comprobante;
  - las fotos temporales se borran al completar o descartar la carga.

  La composición sigue la referencia del donante (`report.dart`: botones de cámara y galería, mensaje de pendientes en `home.dart`) con los componentes de DESIGN.md. El donante admitía una sola foto; aquí se amplía a tres sin crear estilos nuevos.
- **Panel:** en `paginas/incidentes`, la sección «Fotografías» descarga cada imagen con `fetch` y credenciales, crea un `URL.createObjectURL` y lo revoca al desmontar. Reproduce la composición de `Incidents.jsx` del donante y usa `Dialogo.tsx` para ampliar.

## Risks / Trade-offs

- **[Cuenta compartida sin `/usage`]** → Otro proyecto puede agotar la cuota. Mitigación: límite local, 503 con un código específico, envío sin fotos y cuota declarada como no observable si el spike no logra medirla.
- **[El modo de carpetas de la cuenta es desconocido]** → En modo fijo, la carpeta se deriva del `public_id`; en modo dinámico, de `asset_folder`. Se envían ambos y S1 registra el resultado; el aislamiento no depende de la carpeta, sino del prefijo y del registro.
- **[CDN tras `destroy`]** → Las copias en caché pueden servirse un tiempo. Mitigación: `invalidate: true` y el tiempo medido en S5; si se acerca al tope, se declara como limitación.
- **[Proxy de imágenes en Render]** → Consume ancho de banda y memoria (hasta 5 MB por lectura). Se acepta para el piloto; las pruebas de carga usan el doble y no las imágenes reales.
- **[`sharp` es nativo]** → Debe instalarse en CI y Render para linux-x64. Una tarea verifica `npm ci` y una prueba de humo en CI.
- **[Caída entre la subida y la confirmación]** → Puede quedar un objeto huérfano hasta 15 min más el backoff, siempre con su registro. Se acepta.
- **[Permiso de invitado interceptado]** → Solo permite subir hasta 3 fotos a ese incidente durante 24 h y no da lectura. Mitigación: límite por origen y vencimiento.
