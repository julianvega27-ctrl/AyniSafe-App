# P5.2 — Evidencias fotográficas

- **Fecha de inicio:** 27/11/2026.
- **Cambio:** `evidencias-fotograficas`, en la rama `feat/p5-evidencias`.
- **Base destino:** `ecbaea7`. Es `main` con P5.1 (`evaluacion-rapida-samu`) fusionada y archivada (PR #12).

Este informe se completa por grupo de tareas. Lo que no figura aquí como ejecutado no está validado. En particular, **la integración con Cloudinary no está validada** hasta que el spike del grupo 5 apruebe sobre la cuenta real.

## Procedencia

El donante se leyó sin modificarlo:
- **Ruta:** `../Proyecto_incidencias_400par`.
- **HEAD:** `efc1bce8c29b3c88487e36e10a324c71ae9c2029`.
- **Estado:** `git status --porcelain` vacío el 27/11/2026.

| Archivo del donante | SHA-256 |
|---|---|
| `apps/api/src/incidents/evidence.js` | `47beeb5d51f40631410769870c7c8646a8abacf94651bff0afc92edc522848d5` |
| `apps/api/src/incidents/evidence-storage.js` | `54a965bf0e068cc3d1eca3feebbc02ec2396f2195f34b3d4bff982747405193c` |
| `apps/api/src/incidents/evidence-store.js` | `3ff715af38f74c79f2fff94e23ec67d590844f217d6dc86c24d16725736b5a8c` |
| `apps/api/src/incidents/guest-evidence.js` | `1c471253eea630a82b9d00b006b39fda37efd1b7655a2a89def42ae466a86ac0` |
| `apps/api/src/incidents/cloudinary-store.js` | `1eabcfcd6d3dee83c295c293ae81be39ad4de8989df1cbe87877acbf9eb4f6e8` |
| `apps/mobile/lib/screens/report.dart` | `a16021b97e6292fd4181bea220d3f80a71a4e173bd13b77d624b2acf90ba8c0a` |
| `apps/admin/src/pages/Incidents.jsx` | `8f6244aae98eee8c62bd570b17babde8f30316afdc23fca79f93e495906d6b5e` |

**Se adapta:**
- De `evidence.js`, la configuración de `sharp`: `failOn: 'error'`, `limitInputPixels`, comprobación del formato detectado frente al declarado, dimensiones máximas, `rotate()` y re-codificación en el mismo formato.
- De `cloudinary-store.js`:
  - la subida `authenticated` con `overwrite: false`;
  - la lectura con una URL firmada generada en el servidor, `redirect: 'error'` y un tope de bytes;
  - `destroy` con `invalidate: true`.
- De `report.dart`, los botones de cámara y galería. De `Incidents.jsx`, el visor de fotos obtenidas con la sesión.

**Se descarta**, por contradecir reglas o decisiones de AyniSafe:
- **La subida dentro de la transacción de BD y sin registro previo del identificador.** Una respuesta perdida deja objetos sin registro, y el aislamiento exige borrar solo por `public_id` registrado.
- **El prefijo `incidencias/`, sin carpeta ni etiqueta.** La cuenta es compartida; se usan prefijo `aynisafe/`, carpeta `aynisafe` y etiqueta `aynisafe`.
- **Guardar `secure_url`.** Las firmas de entrega de Cloudinary no caducan, y el documento 11 exige que ninguna URL de acceso dure más que el permiso.
- **El JWT de invitado (`guest-evidence.js`).** Añadiría un secreto y una dependencia ajenos al destino. Se usa un token aleatorio con huella HMAC, como el código secreto.
- **El almacén local.** No sirve en Render.
- **El conteo de fotos sobre la tabla del incidente.** Cruza el límite del módulo de Operaciones; se usan ranuras 1–3 con un índice único parcial en Reportes.
- **Una sola foto por reporte** (`report.dart`). RF52 admite tres.

## Decisiones del responsable (27/11/2026)

- **Acceso.** Ven las fotos los operadores de cualquier institución participante dentro de su ámbito vigente, y el ciudadano con cuenta solo las suyas. El invitado (también con su código) y el administrador no las ven.
- **Momento.** Las fotos se suben después del registro. El invitado usa un permiso de carga de 24 h emitido en el comprobante.
- **Alcance.** API, Flutter y panel en este cambio.
- **Proveedor.** Cloudinary real, en una cuenta compartida con otro proyecto (entorno de prueba del plan gratuito). Las credenciales están solo en `apps/api/.env`, y la key no tiene permiso para `/usage`.

## Grupo 1 — Dependencias

Versiones exactas:
- **API:** `cloudinary` 2.11.0, `sharp` 0.35.5 (libvips 8.18.7), `multer` 2.5.0 y `@types/multer` 2.3.0.
- **Flutter:** `image_picker` 1.2.1.

Comprobaciones el 27/11/2026: `npm run typecheck` sin errores; `npm run arquitectura:verificar` con 123 archivos y 0 infracciones; `flutter analyze` sin problemas.

`npm audit --omit=dev` informa tres vulnerabilidades altas que ya existían: la cadena `prisma` → `@prisma/config` → `effect`. Ninguna procede de las dependencias nuevas.

## Grupo 2 — Dominio y procesamiento de imagen

- **`modules/reportes/dominio/evidencia.ts`.** `test/unidad/evidencia.test.ts` (60 aprobadas) cubre:
  - el `public_id` bajo `aynisafe/` con un uuid v4 en minúsculas, rechazando otro prefijo, `../`, subcarpetas, extensión, mayúsculas, uuid v1 y una variante inválida;
  - la tabla completa de transiciones de estado (4 × 4);
  - el plazo de 24 h (24 h exactas aún dentro, 1 ms después fuera);
  - las ranuras 1–3;
  - la cuota local en sus límites exactos;
  - el backoff, con tope de 6 h;
  - las huérfanas a partir de 15 min.
- **`SharpProcesadorAdapter`.** `test/unidad/procesador-imagen.test.ts` (12 aprobadas), con imágenes sintéticas de `test/fixtures/imagenes.ts`:
  - un JPEG con EXIF GPS (el control confirma que la entrada lo trae) sale sin `exif`, `xmp`, `iptc` ni `orientation`, y sin la marca del fabricante en los bytes;
  - la orientación 6 se aplica (64×32 → 32×64);
  - PNG y WebP conservan su formato;
  - se rechazan un PDF renombrado, un JPEG truncado, contenido JPEG declarado como PNG, el tipo HEIC y una imagen de 10 001 px;
  - una entrada mayor de 5 MB se rechaza sin decodificarla;
  - una salida que crece al re-codificar por encima del límite se rechaza.

## Grupo 3 — Esquema

- **Migración `20261129100000_evidencias_fotograficas`:** crea `evidencias_incidente`, `permisos_evidencia` y `accesos_evidencia`.
- **`test/integracion/esquema-evidencias.test.ts` (25 aprobadas):**
  - 23514 para: un `public_id` sin `aynisafe/`, con subcarpeta o en mayúsculas; un tipo no admitido; más de 5 MB; 0 bytes; las ranuras 0 y 4; un estado o un proveedor desconocidos; una modalidad incoherente; `disponible` sin confirmar; una eliminación sin motivo; una fila `eliminada` con `sha256` o sin instante; un motivo desconocido; una huella de permiso mal formada; un vencimiento no posterior; un acceso con rol de administrador;
  - 23505 para una ranura activa repetida, un `public_id` repetido y una clave repetida en el mismo incidente;
  - 23503 para una evidencia sin envío;
  - se admiten la misma clave en otro incidente y la reutilización de una ranura liberada por una fila `eliminada`.
- **`scripts/verificar-migracion-evidencias.mjs`:**
  - aplica las migraciones anteriores en un esquema temporal de la BD `*_test` e inserta un envío;
  - aplica la migración y compara las introspecciones: solo crea las tres tablas nuevas, sin `DROP` ni alteraciones de tablas previas, y el envío sigue intacto.

  El diff queda en [p5/migracion-evidencias-diff.sql](p5/migracion-evidencias-diff.sql).

## Grupo 4 — Almacén de evidencias

- **`AlmacenEvidenciasPort`** (`aplicacion/puertos/evidencias.port.ts`). Tiene tres operaciones: `subir`, `obtener` (que devuelve bytes, nunca una URL) y `eliminar`. Sus errores son tipados: proveedor no disponible, cuota y respuesta inválida.
- **`MemoriaEvidenciasAdapter`.** Es un doble con fallos inyectables, incluida una «respuesta perdida» en la que el objeto queda creado.
- **`CloudinaryEvidenciasAdapter`:**
  - pasa las credenciales por llamada, sin `cloudinary.config` global;
  - sube con `type: authenticated`, `asset_folder` y `tags` `aynisafe`, `overwrite: false` y sin `eager`, transformaciones ni preset;
  - descarga con una URL firmada solo dentro del adaptador y `redirect: 'error'`;
  - borra con `destroy` usando `invalidate: true`.
- **Configuración (`cargarConfigEvidencias`).**
  - `EVIDENCIAS_ADAPTADOR` vale `deshabilitado` por defecto. Con `cloudinary` exige las tres variables `CLOUDINARY_*`.
  - Añade `EVIDENCIAS_CUOTA_BYTES` (500 MB por defecto) y `EVIDENCIAS_CUOTA_OBJETOS` (1 000).
  - `.env.example` documenta solo los nombres.
  - **Desviación respecto de la tarea 4.1:** `memoria` se admite en `test` y en `development`, no solo en pruebas. El recorrido local (13.1) lo necesita sin tocar la cuenta compartida. En producción se rechaza.
- **`test/unidad/almacen-evidencias.test.ts` (29 aprobadas):**
  - la configuración: valor por defecto; `memoria` rechazada en producción; un valor desconocido; cada variable `CLOUDINARY_*` faltante, nombrada en el error sin mostrar ningún valor; la cuota fuera de rango;
  - las opciones exactas de subida;
  - `subir`, `obtener` y `eliminar` con un `public_id` ajeno, rechazados sin llamar al cliente ni a `fetch`;
  - las respuestas inválidas: otro `public_id`, tipo `upload`, otro formato y bytes ausentes;
  - un error del SDK con la URL y la key en su mensaje se traduce a `http_500` sin filtrarlas;
  - el código 420 se reconoce como cuota;
  - `obtener` sin redirecciones y con el tope de 5 MB (por cabecera y por cuerpo);
  - `destroy` con `invalidate`, y `not found` como `no_existe`;
  - el fuente del adaptador no contiene `delete_resources_by_prefix`, `delete_resources_by_tag`, `delete_folder`, `delete_resources` ni `delete_derived`.
- **Verificaciones:** `typecheck` y `test:tipos` sin errores; arquitectura con 128 archivos y 0 infracciones (el import de `cloudinary` queda en la infraestructura).

## Grupo 5 — Spike sobre la cuenta real de Cloudinary

- **5.1 Script.** `scripts/spike-cloudinary.ts` se ejecuta con `npm run evidencias:spike`, solo a mano y fuera de CI.
  - Implementa S1–S8 del design (decisión 9) con el mismo adaptador de la API.
  - Registra cada `public_id` en `p5/spike-cloudinary-manifiesto.json` antes de subirlo y, en un bloque `finally`, borra solo esos.
  - El informe (`p5/spike-cloudinary.json`) guarda únicamente estados, códigos HTTP y tiempos.

  La prueba en seco, `test/unidad/spike-cloudinary.test.ts` (5 aprobadas), usa un proveedor simulado y comprueba:
  - con un proveedor que cumple, S1–S6 aprueban y la etiqueta vuelve a su valor inicial;
  - ni la salida ni los archivos guardados contienen el nombre de la cuenta, la key, el secret, URLs ni firmas;
  - un proveedor que sirve sin firma hace fallar S2;
  - un `destroy` que no borra hace fallar S5, respetando el tope de sondeo;
  - en ambos casos el proveedor no se valida.
- **5.2 Ejecución real (27/11/2026, rama `feat/p5-evidencias` sin commit).** **Resultado: no validado. S1 falló con 403; S2–S8 no se ejecutaron.**
  - **Etiqueta `aynisafe` al inicio:** 0 recursos. La lectura del Admin API (`resources_by_tag`) funciona con esta key.
  - **Causa:** se reprodujo la misma subida firmada con `fetch` para leer la respuesta, que el SDK no interpreta en un 403. Cloudinary respondió `Request forbidden due to missing permissions (actions=["create"])`. **La key no tiene permiso de creación** en ese entorno. No es un fallo del adaptador ni de los parámetros.
  - **Borrado:** en la limpieza, `destroy` sobre el `public_id` registrado respondió `not found`, sin 403. Indica que la key puede borrar, pero no se ha comprobado sobre un objeto real.
  - **Recursos creados:** ninguno. El manifiesto registra el único `public_id` intentado, con estado `no_existe`.
  - **Pendiente del responsable:** conceder a la key el permiso de creación de recursos en el entorno de prueba, o facilitar otra key con ese permiso en `apps/api/.env`, y volver a ejecutar `npm run evidencias:spike`. Hasta entonces el proveedor sigue **pendiente** y el despliegue mantiene `EVIDENCIAS_ADAPTADOR=deshabilitado`.
- **Segunda ejecución (27/11/2026), tras asignar al responsable el rol Media Library User con permiso sobre una carpeta.** Mismo resultado: S1 falló con 403 `missing permissions (actions=["create"])`.
  - Con esta key, `root_folders` del Admin API devuelve 0 carpetas visibles, y ninguna se llama `aynisafe` ni contiene «ayni».
  - El permiso de carpeta todavía no es efectivo para la key que usa la API. Puede estar asignado a otra identidad o a otra carpeta, o no haberse propagado.
  - No se creó ningún recurso. El proveedor sigue pendiente.
- **Tercera ejecución (27/11/2026, 17:09 UTC), tras conceder a la key todos los permisos. Resultado: S1–S6 aprobados; integración validada con las limitaciones indicadas.**

  | Punto | Resultado observado |
  |---|---|
  | S1 | Estado **aprobado**. `type` `authenticated`, `public_id` con prefijo `aynisafe/`, `asset_folder` `aynisafe` y etiqueta `aynisafe`. **Modo de carpetas: dinámico** (`folder` ausente). La subida creó la carpeta; no hizo falta crearla a mano. |
  | S2 | Estado **aprobado**. Sin firma: 401. Firma alterada: 401. Tipo `upload`: 404. Firma válida: 200, con bytes idénticos a la copia subida. |
  | S3 | Estado **aprobado**. Derivado `w_64` sin firma: 401. Firmado: 200. El Admin API lista 1 derivado. |
  | S4 | Estado **aprobado**. La imagen entregada no tiene EXIF, XMP, IPTC ni la marca del fabricante sintético. |
  | S5 | Estado **aprobado**. `destroy` con `invalidate` devolvió `ok` y el Admin API, 404. El original y el derivado firmados, ya en la caché de la CDN, dejaron de servirse (404) en el sondeo de los **10,9 s** (intervalo de 10 s). |
  | S6 | Estado **aprobado**. Etiqueta `aynisafe`: 0 → 0. El `public_id` ajeno se rechazó sin llamar al proveedor. Hubo una sola llamada a `destroy`, sobre el `public_id` registrado. |
  | S7 | Informativo. `/usage` ahora **responde** por los permisos ampliados. Plan `Free`, con límite de 25 créditos mensuales y 0,72 % usado en toda la cuenta compartida (dato del 26/11/2026), 82 objetos y tamaño máximo de imagen 10 MB. Consumo propio del spike: 1 objeto de 659 bytes, ya eliminado. Admin API: 500 solicitudes por hora. |
  | S8 | Informativo. La descarga privada con `expires_at` vencido da 401; vigente, 200. No cambia la decisión 8 del design. |

  Fuentes: `p5/spike-cloudinary.json` y `p5/spike-cloudinary-manifiesto.json`. El único `public_id` creado figura como `eliminado`. Los archivos no contienen credenciales, URLs ni firmas.

  **Limitaciones:**
  - **La key tiene todos los permisos sobre el entorno compartido.** El aislamiento depende del código: validación del prefijo, borrado solo por `public_id` registrado y ningún borrado masivo. Si la key se filtra, el daño alcanza también al otro proyecto. Recomendación: guardarla solo en el `.env` local y en las variables de Render, no compartirla con el otro proyecto y rotarla después del piloto.
  - **Cuota.** Los créditos son de toda la cuenta. El límite local de bytes y de objetos sigue siendo la protección propia.
  - **CDN.** El tiempo observado tras `destroy` fue de unos 11 s en una sola medición.

## Grupo 6 — Permiso de carga del invitado

- **Emisión.** El comprobante de invitado incluye `permisoEvidencias { valor, venceEn }`: 32 bytes aleatorios en base64url, con vencimiento a recepción + 24 h. La huella HMAC (prefijo `permiso-evidencias`, secreto de seguimiento) se guarda en `permisos_evidencia` dentro de la transacción del registro.
- **Reintento idempotente.** Emite un permiso nuevo, que reemplaza la huella, solo si el plazo sigue vigente.
- **Contrato.** `openapi.yaml` documenta `permisoEvidencias` en `ComprobanteIncidente`.
- **`test/integracion/permiso-evidencias.test.ts` (7 aprobadas):**
  - emisión con vencimiento exacto a 24 h; la BD guarda solo la huella;
  - el permiso no aparece en eventos ni logs;
  - un reintento emite otro que reemplaza al anterior;
  - un reintento pasadas las 24 h no emite permiso;
  - con cuenta no hay permiso;
  - el permiso no sirve como código de seguimiento;
  - un trigger que hace fallar el `INSERT` en `permisos_evidencia` da 503 sin incidente, clave, envío ni evento, y el reintento posterior da 201.
- **Suites previas** (`registro-incidentes`, `contrato`): 39 aprobadas junto con la anterior.

## Grupo 7 — Carga de evidencias

- **Ajuste del esquema.** El índice único `(incidente_id, clave_idempotencia)` pasa a ser parcial, solo sobre `pendiente` y `disponible`. Así una foto fallida puede reintentarse con la misma clave (design, decisión 5). Lo verifica una prueba adicional del esquema (26 aprobadas) y el script de diff sigue confirmando una migración solo aditiva.
- **`AdjuntarEvidenciaUseCase`.** `autorizar` se ejecuta antes de leer el cuerpo y comprueba autoría, plazo, estado, el límite de invitado (`carga_evidencia_ip`, 20 por hora) y la huella del permiso. Después `adjuntar` sigue tres pasos:
  - transacción A: `FOR UPDATE` sobre el envío, idempotencia, ranura, cuota local y fila `pendiente`;
  - subida, fuera de toda transacción;
  - transacción B: confirmación.

  `test/unidad/adjuntar-evidencia.test.ts` (10 aprobadas) comprueba el orden A → subida → B y estos casos:
  - un fallo de la subida y una respuesta perdida dejan la fila en `eliminacion_pendiente`, con el objeto registrado;
  - un fallo en B deja la fila `pendiente`;
  - una respuesta inválida va a eliminación;
  - con la cuota local agotada se responde 503 sin llamar al almacén;
  - con el proveedor deshabilitado se responde 503;
  - se aplica el límite de 3;
  - la idempotencia funciona;
  - un autor ajeno no queda autorizado.
- **Ruta.** `POST /incidentes/{referencia}/evidencias` (multipart, campo `foto`, `multer` en memoria con 5 MB).
- **`test/integracion/evidencias-carga.test.ts` (14 aprobadas):**
  - EQ-15: tres fotos aceptadas y la cuarta 409 `EVIDENCE_LIMIT`; dos cargas concurrentes sobre la tercera ranura dan 201/409 y quedan exactamente 3; más de 5 MB da 413 y un PDF renombrado 422, ambos sin almacenar nada; JSON da 415 y una carga sin archivo 400; la copia almacenada no tiene EXIF;
  - idempotencia: la misma clave y archivo da 200 con la misma evidencia, otro archivo 409 y sin clave 400;
  - autorización: invitado con su permiso 201; otro permiso, un incidente inexistente y un permiso vencido o reemplazado dan el mismo 404; un autor ajeno y un incidente fuera de plazo dan 404; un operador con cookie institucional 403; sin credenciales 401; superar el límite de invitado da 429 con `Retry-After`;
  - un proveedor caído da 503 `EVIDENCE_STORAGE_UNAVAILABLE`, el incidente sigue registrado y la fila queda en `eliminacion_pendiente` con motivo `fallo_carga`;
  - los logs no contienen el permiso, el nombre del archivo, EXIF ni `public_id`.
- **Doble.** Estas pruebas usan el almacén en memoria. La integración real con Cloudinary está cubierta solo por el spike del grupo 5.

## Grupo 8 — Limpieza de huérfanas

- **`LimpiezaEvidencias`.** La fila de la evidencia es la propia tarea y la limpieza no mantiene una transacción abierta mientras llama al proveedor (las transacciones interactivas de Prisma expiran a los 5 s). En su lugar usa un **arriendo**:
  - una transacción corta, con `FOR UPDATE SKIP LOCKED`, pasa las pendientes de más de 15 min a `eliminacion_pendiente` con motivo `huerfana`;
  - en la misma transacción toma hasta 20 tareas vencidas y adelanta su `proximo_intento_en` 5 min;
  - el borrado se hace fuera de la transacción;
  - después la fila se marca `eliminada` (se borran `sha256` y las dimensiones) o se reprograma con backoff exponencial hasta 6 h.

  **Desviación del design (decisión 7):** el design preveía mantener `SKIP LOCKED` durante todo el lote; el arriendo da la misma exclusión sin una transacción larga. Se ejecuta al arrancar y cada 5 min con un temporizador `unref` (`main.ts`). Sin almacén configurado, las tareas se conservan.
- **`test/integracion/limpieza-evidencias.test.ts` (7 aprobadas):**
  - una huérfana de 16 min queda `eliminada` sin contenido y su objeto se borra; una reciente sigue `pendiente`;
  - si el proveedor responde `no_existe`, la fila se marca eliminada;
  - un fallo del almacén suma un intento, reprograma más de 50 s después y la foto sigue sin ofrecerse;
  - una instancia nueva procesa las tareas pendientes, como tras un reinicio;
  - **dos procesos concurrentes** eliminan las 3 tareas con 3 llamadas, sin repetir ningún `public_id`;
  - el almacén solo recibe `public_id` leídos de la tabla;
  - sin almacén, las tareas se conservan.

## Grupo 9 — Lectura autorizada

- **Reportes (`LecturaEvidencias`).** Devuelve los metadatos de las fotos disponibles y su contenido. El acceso se registra **después** de obtener los bytes.
- **Consultas:**
  - `BandejaInstitucional.contenidoEvidencia` autoriza por ámbito y participación, igual que `.evaluacion`, y el resumen incluye `evidencias`;
  - `SeguimientoCiudadano.contenidoEvidenciaAutor` exige autoría, y el detalle del autor incluye `evidencias`.
- **Rutas:**
  - `GET /operador/incidentes/{id}/evidencias/{evidenciaId}/contenido`;
  - `GET /ciudadano/incidentes/{referencia}/evidencias/{evidenciaId}/contenido`.

  Responden con el tipo real, `Content-Length`, `inline`, `no-store`, `nosniff` y `Content-Security-Policy: sandbox; default-src 'none'`, sin redirigir al proveedor.
- **`test/integracion/evidencias-lectura.test.ts` (8 aprobadas):**
  - en un accidente con heridos, PNP (simultánea) y SAMU (principal) obtienen bytes idénticos con todas las cabeceras, ninguna con URL ni `public_id`, y quedan 2 accesos con rol `operador`;
  - el resumen lista solo las disponibles, y una en eliminación da 404;
  - Bomberos sin participación, una foto de otro incidente, un id malformado o inexistente, una foto `pendiente` y otro incidente dan el **mismo 404**, sin registrar acceso;
  - un administrador recibe 403;
  - un fallo del almacén da 503 sin registrar acceso;
  - el autor ve sus metadatos y obtiene su foto; otro ciudadano recibe 404;
  - el permiso de carga no da lectura (401) y la vista con código no tiene `evidencias`.
- **9.2 Exclusiones (EQ-04).** La bandeja, los pendientes del administrador, los eventos y los logs no contienen `public_id`, «cloudinary», `aynisafe/` ni los identificadores de las fotos.

## Grupo 10 — Contrato

- **`openapi.yaml`:**
  - `POST /incidentes/{referencia}/evidencias` (multipart, esquema de seguridad `permisoEvidencias` en la cabecera `X-Permiso-Evidencias`), con 200/201/400/401/403/404/409/413/415/422/429/503;
  - las dos rutas de contenido, con 200 (`image/jpeg|png|webp`), 400/401/403/404/503;
  - el esquema `EvidenciaVista`, incluido en `ResumenIncidenteOperador` y en `DetalleIncidenteAutor`;
  - los códigos `EVIDENCE_LIMIT`, `INVALID_IMAGE` y `EVIDENCE_STORAGE_UNAVAILABLE`.
- **Validación.** `npm run contrato:validar` es válido. `test/integracion/contrato.test.ts` (14 aprobadas) añade el bloque P5.2, que ejercita cada estado documentado de las tres rutas. La comprobación global «todos los estados documentados fueron ejercitados y ninguna respuesta quedó sin documentar» sigue aprobada. `verificar` ahora acepta respuestas binarias si su tipo está documentado.
- **Suite completa de la API (`npm test`, 27/11/2026).** 75 suites y 1407 pruebas. Tres fallaron solo por listas cerradas que no incluían las novedades: el campo `evidencias` en el resumen del operador y en el detalle del autor, y las tres tablas nuevas en la migración desde cero. Se actualizaron y ahora aprueban; no hubo otras regresiones.

## Grupo 11 — Flutter

- **Datos:**
  - `datos/evidencias.dart`: tipo real de la imagen por su firma (JPEG, PNG o WebP), `EvidenciaVista`, `PermisoCarga` y los resultados de la carga, además de `PermisosCarga` sobre `flutter_secure_storage`, con un doble en memoria;
  - `ClienteHttp.enviarArchivo` (multipart con `http_parser` 4.1.2, ahora dependencia directa) y `obtenerBytes`;
  - `IncidentesRepositorio.adjuntarFoto` y `fotoPropia`;
  - el comprobante lee `permisoEvidencias` y el detalle lee `evidencias`.
- **Selección.** `SelectorFotosSistema` usa `image_picker` con lado máximo de 2048 px, calidad 80 y `requestFullMetadata: false`. Borra el archivo temporal del plugin tras leer los bytes, de modo que la foto solo queda en memoria. Un permiso denegado se distingue de una cancelación.
- **Controlador (`ReporteControlador`).**
  - Gestiona hasta 3 fotos con una clave por foto y valida localmente el formato y los 5 MB. Las fotos no forman parte del cuerpo del registro, así que no cambian su clave de idempotencia.
  - Tras el comprobante sube las fotos una a una:
    - con cuenta, con la sesión;
    - como invitado, con el permiso, que se guarda en el almacén seguro solo si hay fotos y se borra al terminar o al continuar sin ellas.
  - Un 503 o un fallo de red deja la foto `fallida` (reintento con la misma clave o «Continuar sin esta foto»). Un 413 o 422 la deja `rechazada`, sin reintento automático. Un 404 o un permiso vencido la dejan `noAdmitida`, sin llamar a la API.
- **Interfaz.** La sección «Fotos (opcional)» va tras la evaluación y antes del teléfono. Sigue la composición de `report.dart` del origen: el botón «Adjuntar foto opcional», una hoja con «Elegir de galería» y «Tomar foto», y el texto de ayuda. Admite hasta 3 miniaturas con «Quitar». El comprobante muestra el estado de cada foto con «Reintentar fotos» y «Continuar sin esta foto». El detalle de Mis reportes muestra «Tus fotos», que se amplían en un diálogo, y «No disponible» ante un 404 o 503.
- **`test/fotos_reporte_test.dart` (17 aprobadas):**
  - el orden en el formulario (descripción → fotos → teléfono) y la sección vacía al abrir;
  - un permiso de cámara denegado muestra la explicación y el reporte se envía sin fotos;
  - con tres fotos la acción queda deshabilitada y se anuncian «Foto N de 3» y «Quitar foto N»;
  - se rechazan localmente una foto de más de 5 MB y un PDF, y se puede quitar una foto;
  - con cuenta, 3 cargas multipart con 3 claves distintas y Bearer;
  - un 503 seguido de un reintento usa la misma clave;
  - sin conexión, se puede continuar sin la foto;
  - un 413 o 422 no se reintenta;
  - un invitado sube con `X-Permiso-Evidencias` y el permiso se borra al terminar o se conserva mientras haya fallidas; sin fotos, no se guarda;
  - un permiso vencido no llama a la API y un 404 deja la foto fuera de plazo;
  - un reporte nuevo descarta las fotos;
  - el comprobante muestra el estado de cada foto.
- **`test/fotos_mis_reportes_test.dart` (5 aprobadas):** dos fotos pedidas con Bearer y ampliables; una foto que responde 404 o 503 aparece «no disponible» sin ocultar el detalle; sin fotos, no hay sección; la consulta con código no muestra fotos ni pide `/evidencias`.
- **Doble de pruebas.** `test/dobles.dart` registra los cuerpos multipart en latin1, porque son binarios.
- **Suite completa:** `flutter analyze lib` sin problemas; `flutter test`, 356 aprobadas.
- **11.4 (aprobado por el responsable el 27/11/2026, verificación manual).** Recorrido en Android real con la API local: fotos con cámara y galería, envío como invitado y con cuenta, reintento y Mis reportes. El responsable lo dio por aprobado. Durante la prueba aparecieron dos problemas de entorno, no de código:
  - **Reportes inaccesibles.** La base `ayni_safe_dev` no tenía la migración `20261129100000_evidencias_fotograficas`, de modo que el resumen, el detalle y el registro de invitado respondían 503. Se resolvió con `npx prisma migrate deploy`. El despliegue debe aplicar la migración antes de arrancar esta versión.
  - **Fotos que no se adjuntaban.** El `.env` local no definía `EVIDENCIAS_ADAPTADOR`, así que el almacén quedaba deshabilitado por diseño (503 en cada carga). Se configuró `EVIDENCIAS_ADAPTADOR=cloudinary` y se reinició la API.

## Grupo 12 — Panel web

- **Sección «Fotografías»** (`paginas/incidentes/Fotografias.tsx`) en el resumen del operador.
  - Cada imagen se pide a `GET /operador/incidentes/{id}/evidencias/{evidenciaId}/contenido` con la cookie institucional y sin caché (`api.contenidoEvidencia`). Se muestra con una URL de objeto que se revoca al salir; nada se guarda en el navegador.
  - Sin fotos, indica «El ciudadano no adjuntó fotografías.». Una foto que responde 404 o 503 aparece «no disponible» sin ocultar el resumen.
  - La ampliación usa `Dialogo.tsx`.
- **Composición del origen** (`Incidents.jsx`, `.evidence-grid` y `.evidence-card` de `style.css`), portada a `referencia-institucional.css` con los mismos valores. Adaptaciones de AyniSafe, marcadas en el CSS:
  - la miniatura es un botón de al menos 48 px para ampliarla con teclado;
  - el pie usa `--color-texto-suave`, por contraste AA.

  No se añadieron tokens ni colores nuevos fuera de los valores del origen.
- **`test/fotografias.test.tsx` (6 aprobadas):**
  - las imágenes tienen el texto alternativo «Fotografía N enviada por el ciudadano» y su instante, y se piden con `credentials: same-origin` y `cache: no-store`;
  - sin fotos no se piden contenidos;
  - un 404 o 503 deja «no disponible» sin ocultar el resumen;
  - Enter amplía la foto y Escape cierra con el foco devuelto a la miniatura;
  - las URL de objeto se revocan al desmontar y no se escribe en el almacenamiento del navegador.
- **Suite web.** 177 pruebas aprobadas; `eslint` y `tsc` sin errores. Se añadió `evidencias: []` a los fixtures `ResumenIncidente` de P4/P5.1.
- **12.2 Resultado renderizado.** [5 capturas](p5/capturas-evidencias/) del recorrido local: resumen a 1440, 360 y 1280 px con texto al 200 %, y la ampliación a 1440 y 360 px.
  - En cada captura no hay desplazamiento horizontal de la página y axe no informa infracciones.
  - **Revisión visual:** a 1440 px las tarjetas forman 3 columnas y a 360 px una sola, con la imagen recortada en `cover` y el pie con el instante, como en el origen. El diálogo muestra el título y la imagen completa.
  - En la captura de página completa de la ampliación, el fondo del diálogo no cubre la parte inferior. Es un efecto de capturar la página entera con un fondo fijo del alto de la ventana, no un defecto de la interfaz.
  - **Limitación:** la comparación con el origen es estructural (mismas reglas y composición) y no captura a captura, porque el panel del origen no se ejecutó.

## Grupo 13 — Integración

- **13.1 Recorrido local con Cloudinary real.** `node e2e/evidencias-local.mjs` usa la API real (`main.ts`), PostgreSQL `*_test`, Vite, Chrome 158 e imágenes sintéticas con un EXIF GPS ficticio. **35 comprobaciones aprobadas** ([ficha](p5/recorrido-evidencias-local.json)):
  - con cuenta se adjuntan 3 fotos y la cuarta da 409; como invitado, 3 fotos con el permiso del comprobante;
  - quedan 6 evidencias disponibles bajo `aynisafe/` en Cloudinary;
  - el autor obtiene su foto con `no-store`, sin EXIF y sin URLs del proveedor;
  - Bomberos sin participación recibe 404 por URL directa;
  - PNP ve las 3 fotografías y el HTML del panel no contiene identificadores del proveedor ni otras URL que las `blob:`;
  - Escape devuelve el foco, el navegador no guarda las fotos y las lecturas del operador quedan auditadas;
  - una huérfana provocada (pendiente de 20 min) y las 6 fotos del recorrido, marcadas para eliminación, quedan **eliminadas por la limpieza real al reiniciar la API**, solo por su `public_id` registrado. La foto deja de entregarse (404).

  Al terminar, Cloudinary tiene **0** recursos con la etiqueta `aynisafe` (comprobado con el Admin API).

  **Incidencias durante la ejecución:**
  - La primera corrida se interrumpió por un falso positivo del propio script: la URL `blob:http://…` coincidía con el patrón de URLs. Dejó 6 objetos registrados, que se retiraron con la limpieza (`--limpiar`), y se confirmó que la etiqueta volvía a 0.
  - La segunda falló al insertar la huérfana en un incidente con las 3 ranuras ocupadas: la restricción única la rechazó, como debía. La limpieza de emergencia que añade el script retiró sus objetos.
  - Desde entonces el script retira los objetos del proveedor también cuando el recorrido falla.
- **13.2 Verificación global (27/11/2026, estado local sin commit sobre `ecbaea7`):**
  - **API.** `npm run test:cobertura`: 75 suites y 1407 pruebas aprobadas. Cobertura global: líneas 87,54 %, ramas 90,69 % y funciones 92,58 %. `typecheck` y `test:tipos` sin errores; arquitectura con 133 archivos y 0 infracciones; `contrato:validar` válido.
  - **Cobertura de los archivos nuevos (líneas / ramas):**

    | Archivo | Líneas | Ramas |
    |---|---|---|
    | `dominio/evidencia.ts` | 100 % | 100 % |
    | `adjuntar-evidencia.use-case.ts` | 100 % | 94,6 % |
    | `lectura-evidencias.ts` | 100 % | 89,5 % |
    | `limpieza-evidencias.ts` | 89,0 % | 100 % |
    | `prisma-evidencias.adapter.ts` | 100 % | 90,9 % |
    | `sharp-procesador.adapter.ts` | 100 % | 81,5 % |
    | `cloudinary-evidencias.adapter.ts` | 95,0 % | 77,8 % |
    | `evidencias.routes.ts` | 89,1 % | 83,9 % |
    | `scripts/spike-cloudinary.ts` | 75,2 % | 69,1 % |

    Las ramas sin cubrir del adaptador de Cloudinary y del spike corresponden a respuestas reales del SDK, cubiertas por el spike y el recorrido. `verificar-migracion-evidencias.mjs` se ejecuta aparte (grupo 3).
  - **Flutter.** `flutter analyze lib` sin problemas; `flutter test`, 356 aprobadas.
  - **Web.** `npm test`, 177 aprobadas; `eslint` y `tsc` sin errores.

## Estado de los escenarios de calidad

| Escenario | Estado tras P5.2 | Evidencia y límites |
|---|---|---|
| EQ-15 | **Cubierto** (API, Flutter y panel). | Tres fotos aceptadas; la cuarta, un archivo de más de 5 MB y un documento renombrado se rechazan; el formulario se conserva y se puede enviar sin adjuntos (grupos 7 y 11, recorrido 13.1, Android real aprobado por el responsable en 11.4). |
| EQ-04 (evidencias) | **Cubierto** en su parte de fotos. | Los no participantes, el administrador, el invitado (con código o permiso), los identificadores ajenos y los malformados no acceden; las respuestas públicas, los eventos y los logs no contienen fotos ni referencias (grupo 9, recorrido 13.1). El mapa y las alertas siguen para P7 y P8. |
| EQ-17 | **Parcial.** | La eliminación del original y sus derivados por `public_id` registrado está validada contra Cloudinary (spike S5 y recorrido 13.1), con la marca sin contenido. Los vencimientos por cierre (90 días) y la restauración de backups llegan en P6 y P9. |

## PR, CI y fusión

- **PR [#13](https://github.com/julianvega27-ctrl/AyniSafe-App/pull/13)** desde `feat/p5-evidencias`, con estos commits:
  - especificación: `dd062fc`;
  - API: `bc5c7b7`;
  - Flutter: `ca5a238`;
  - panel: `753a790`;
  - evidencia: `6e3af4e`.

  Antes del push se comprobó que ningún archivo confirmado contiene los valores de las credenciales del `.env` local.

**GitHub Actions, ejecución [46064611286](https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/46064611286)** (`pull_request`, 27/11/2026): aprobada.

| Job | Resultado | Duración |
|---|---|---|
| API (tipos, arquitectura, contrato y Jest con cobertura) | Aprobado | 3 min 57 s |
| Flutter (análisis y pruebas) | Aprobado | 1 min 34 s |
| Web (lint, tipos, compilación y pruebas) | Aprobado | 38 s |
| Escaneo de secretos del repositorio | Aprobado | 13 s |

**Fusión:** el PR #13 se fusionó en `main` el 27/11/2026 como `45ba709f69f9cca8dafa3dc1183e59bf43115044`. La ejecución [46066262535](https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/46066262535) (`push` a `main`) aprobó los cuatro trabajos: API 5 min 18 s, Flutter 1 min 24 s, web 37 s y secretos 13 s. Artefacto de cobertura: `api-cobertura-45ba709f69f9cca8dafa3dc1183e59bf43115044`, que vence el 11/12/2026. Los porcentajes de la validación local no se atribuyen a esta ejecución sin consultar su reporte.

## Cierre OpenSpec (rama `docs/p5.2-cierre`)

- **Specs sincronizadas** con `openspec archive` (+29 requisitos, ~2 modificados):
  - 2 capacidades nuevas: `reportes/evidencias-fotograficas` (12 requisitos) y `consultas/acceso-evidencias` (6);
  - deltas en 6 capacidades existentes: `consultas/bandeja-institucional` (~1 +1), `consultas/seguimiento-ciudadano` (+1), `movil/reporte-incidente` (~1 +4), `movil/seguimiento-incidentes` (+1), `reportes/registro-incidentes` (+2) y `web/bandeja-incidentes` (+2).
- **Verificación:**
  - los 31 bloques de requisitos de los deltas aparecen una sola vez en las specs principales;
  - las specs nuevas tienen título y propósito;
  - no quedan cabeceras de delta;
  - los requisitos no afectados se conservan tal cual.
- **Archivo:** `openspec/changes/archive/2026-11-27-evidencias-fotograficas`. `openspec list` ya no muestra cambios activos.
- **`openspec validate --specs`:** 30 specs aprobadas, 0 fallidas. Las 4 advertencias de requisitos de más de 500 caracteres corresponden a specs de Identidad y del panel que ya existían, no a este cambio.
- **Migración.** `20261129100000_evidencias_fotograficas` conserva en su comentario la ruta del cambio sin archivar. No se edita porque Prisma valida su checksum.
- **Alcance del cierre.** Este cierre contiene solo documentación y OpenSpec: no modifica código de producto ni se desplegó.
- **Despliegue pendiente** (fuera de este cierre): aplicar `npx prisma migrate deploy` y configurar `EVIDENCIAS_ADAPTADOR=cloudinary` con las variables `CLOUDINARY_*` en Render.
