# Tasks

Base de planificación: `main` `ecbaea7` (27/11/2026), con P5.1 fusionado y archivado.

- `proposal.md` y las specs definen el alcance; `design.md` documenta las decisiones técnicas.
- La evidencia va en `docs/validacion/p5-evidencias.md`. Se crea en 1.1 y se completa en cada grupo.
- Una casilla se marca solo cuando existen el código y la evidencia ejecutada.
- Las pruebas que consuman demasiado tiempo o intentos quedan para verificación manual del responsable, indicándolo en la evidencia.
- Las credenciales `CLOUDINARY_*` se leen solo del `.env` local. Nunca se piden en el chat, nunca se imprimen y nunca se copian a la evidencia.

## 1. Procedencia y dependencias

- [x] 1.1 Crear `docs/validacion/p5-evidencias.md` con:
  - la base destino;
  - el HEAD del donante `efc1bce` con árbol limpio;
  - el SHA-256 de `apps/api/src/incidents/evidence.js`, `evidence-storage.js`, `evidence-store.js`, `guest-evidence.js` y `cloudinary-store.js`, y de `apps/mobile/lib/screens/report.dart` y `apps/admin/src/pages/Incidents.jsx`;
  - qué se adapta: la configuración de `sharp`, la subida `authenticated` con URL firmada en el servidor, `destroy` con `invalidate` y la composición de cámara/galería y del visor;
  - qué se descarta, con su motivo (design, Context): la subida dentro de la transacción, el prefijo `incidencias/`, `secure_url`, el JWT de invitado, el almacén local y el conteo sobre la tabla del incidente;
  - las decisiones del responsable del 27/11/2026: acceso de participantes + autor, carga posterior al registro y alcance API + Flutter + panel.

  Verificar con `git status --porcelain` que el donante no se modificó.
- [x] 1.2 Añadir a `apps/api` `cloudinary`, `sharp` y `multer` (y `@types/multer`) con versiones exactas, y a `apps/mobile` `image_picker`. Verificar `npm ci`, `npm run typecheck`, `flutter pub get` y que `npm run arquitectura:verificar` sigue aprobando.

## 2. Dominio y procesamiento de imagen (Reportes)

- [x] 2.1 Implementar `modules/reportes/dominio/evidencia.ts`, puro, con:
  - los estados y sus transiciones válidas;
  - la validación del `public_id` con la misma expresión del CHECK;
  - la generación de `aynisafe/<uuid v4>`;
  - el plazo de carga (recepción + 24 h) y el máximo de 3;
  - la cuota local;
  - el backoff de la limpieza.

  Verificar con Jest de tabla: transiciones prohibidas, `public_id` con otro prefijo, con `../`, en mayúsculas o con un uuid no v4; los límites de plazo (24 h exactas y 1 ms después); la cuota exacta y superada; el backoff con tope de 6 h.
- [x] 2.2 Definir `ProcesadorImagenPort` e implementar `SharpProcesadorAdapter` (design, decisión 6). Verificar con fixtures sintéticos generados en la prueba:
  - JPEG con EXIF GPS → la salida no tiene `exif` ni `xmp` y conserva la orientación aplicada;
  - PNG y WebP válidos;
  - un PDF renombrado `.jpg`;
  - un JPEG truncado;
  - una imagen de 10 001 px;
  - un tipo declarado `image/png` con contenido JPEG, que se rechaza;
  - una salida mayor de 5 MB, que da 413.

## 3. Esquema

- [x] 3.1 Crear la migración aditiva con `evidencias_incidente`, `permisos_evidencia` y `accesos_evidencia` (design, decisión 2). Verificar en `test/integracion/esquema-evidencias.test.ts`:
  - 23514 para un `public_id` sin `aynisafe/`, un tipo no admitido, más de 5 MB, la ranura 0 o 4 y un estado desconocido;
  - 23505 para una cuarta ranura activa, un `public_id` repetido y una clave repetida en el mismo incidente;
  - que una ranura liberada por una fila `eliminada` se puede reutilizar.
- [x] 3.2 Verificar con un script análogo a `verificar-migracion-evaluacion.mjs` que la migración solo crea las tres tablas, sin DROP ni alteraciones de tablas previas. Guardar el diff en `docs/validacion/p5/migracion-evidencias-diff.sql`.

## 4. Almacén de evidencias

- [x] 4.1 Definir `AlmacenEvidenciasPort` e implementar `MemoriaEvidenciasAdapter`, rechazado fuera de `NODE_ENV=test` y del arnés de carga. Verificar con pruebas de configuración que `EVIDENCIAS_ADAPTADOR=memoria` en producción falla al arrancar, y que el valor por defecto es `deshabilitado`.
- [x] 4.2 Implementar `CloudinaryEvidenciasAdapter` con un cliente por instancia (design, decisión 3). Verificar con Jest y un cliente simulado:
  - las opciones exactas de subida: `type`, `public_id`, `asset_folder`, `tags`, `overwrite: false` y sin `eager`;
  - el rechazo de un `public_id` fuera del prefijo sin llamar al cliente;
  - una respuesta con otro `public_id` o tipo `upload` → `RespuestaInvalida`;
  - `destroy` con `invalidate: true` y `type: authenticated`, con `not found` → `no_existe`;
  - la descarga con `redirect: 'error'` y el tope de 5 MB;
  - que ningún error, log ni valor devuelto contiene la URL firmada, la key ni el secret;
  - que el módulo no referencia `delete_resources_by_prefix`, `delete_resources_by_tag` ni `delete_folder` (comprobado con grep en la prueba).
- [x] 4.3 Añadir `EVIDENCIAS_ADAPTADOR`, `EVIDENCIAS_CUOTA_BYTES` y `EVIDENCIAS_CUOTA_OBJETOS` a `config/entorno.ts`, y sus nombres (sin valores) a `.env.example`. Verificar que con `cloudinary` y una variable faltante el error nombra la variable sin mostrar ningún valor.

## 5. Spike sobre la cuenta real de Cloudinary

- [x] 5.1 Implementar `scripts/spike-cloudinary.ts` y `npm run evidencias:spike` (design, decisión 9), excluidos de CI, con imágenes sintéticas, un manifiesto local de los `public_id` creados y borrado solo de esos. Verificar en seco, con el cliente simulado, que el script nunca imprime las variables `CLOUDINARY_*`.
- [x] 5.2 Ejecutar el spike contra la cuenta real (S1–S8) y registrar en `docs/validacion/p5-evidencias.md`: la fecha, el commit, el resultado de cada punto con el código HTTP observado, el modo de carpetas, el tiempo medido tras `destroy`, el rechazo de `/usage`, el consumo propio y los límites del plan gratuito con su fuente y fecha. Guardar el informe sin credenciales ni URLs firmadas en `docs/validacion/p5/spike-cloudinary.json`. Si un punto se demora o requiere muchos intentos, dejarlo para la verificación manual del responsable e indicarlo. Verificar que el conteo de recursos con la etiqueta `aynisafe` vuelve al valor inicial.
- [x] 5.3 Según el resultado:
  - si S1–S6 aprobaron, actualizar ADR-006 y el documento 11 §8 con el proveedor validado y sus limitaciones (cuota no observable, tiempo de CDN);
  - si alguno falló, registrar el proveedor como pendiente y mantener `deshabilitado` en el despliegue.

  Verificar que el texto no declara nada que el informe del spike no muestre.

## 6. Permiso de carga del invitado (Reportes)

- [x] 6.1 Emitir `permisoEvidencias { valor, venceEn }` en el comprobante del invitado, con la huella HMAC en `permisos_evidencia` dentro de la transacción del registro y reemisión en el reintento idempotente. Verificar en `test/integracion/permiso-evidencias.test.ts`:
  - la emisión y que la BD guarda solo la huella;
  - que un reintento invalida el permiso anterior;
  - que con cuenta no hay permiso;
  - que el permiso no sirve para el seguimiento con código;
  - que los logs y eventos no contienen el permiso;
  - que un fallo al guardar el permiso revierte el registro.

## 7. Carga de evidencias (Reportes)

- [x] 7.1 Implementar `AdjuntarEvidenciaUseCase` con las dos fases (design, decisiones 1, 4 y 5). Verificar en unidad, con dobles, el orden de las operaciones:
  - transacción A → subida → transacción B;
  - fallo de la subida → `eliminacion_pendiente` y 503;
  - fallo de la transacción B → la fila queda `pendiente`;
  - respuesta inválida → `eliminacion_pendiente`;
  - cuota local alcanzada → 503 sin llamar al almacén;
  - proveedor deshabilitado → 503.
- [x] 7.2 Añadir la ruta `POST /incidentes/{referencia}/evidencias` (multipart, campo `foto`) con no-store y nosniff. Verificar en `test/integracion/evidencias-carga.test.ts`, con PostgreSQL real y el adaptador en memoria:
  - EQ-15: tres fotos aceptadas; la cuarta da 409; más de 5 MB da 413; un PDF renombrado da 422; JSON da 415;
  - dos cargas concurrentes sobre la tercera ranura dejan exactamente 3;
  - la idempotencia: misma clave y archivo → 200 con la misma evidencia; otro archivo → 409; sin clave → 400;
  - la autorización: un autor ajeno, un permiso de otro incidente, un permiso vencido o reemplazado y un incidente fuera de plazo dan el mismo 404; una cookie institucional da 403;
  - el límite de invitado da 429 con Retry-After;
  - los logs no contienen el permiso, el nombre del archivo ni EXIF;
  - el incidente sigue registrado tras todas las cargas fallidas.

## 8. Limpieza de huérfanas (Reportes)

- [x] 8.1 Implementar `LimpiezaEvidencias` (design, decisión 7), con ejecución al arrancar y periódica. Verificar en integración:
  - una fila `pendiente` de más de 15 min pasa a `eliminada` con motivo `huerfana`;
  - `no_existe` se marca eliminada;
  - un fallo del almacén incrementa los intentos y programa el reintento;
  - un reinicio procesa los pendientes;
  - dos procesos concurrentes no eliminan dos veces el mismo `public_id` (`SKIP LOCKED`);
  - una fila `eliminada` conserva solo la marca, sin `sha256` ni dimensiones;
  - el almacén solo recibe `public_id` leídos de la tabla.

## 9. Lectura autorizada (Consultas y Reportes)

- [x] 9.1 Añadir `LecturaEvidenciasPort` (fachada de Reportes) y los métodos `evidencias`/`contenidoEvidencia` en `BandejaInstitucional`. Incluir los metadatos en el resumen del operador y en el detalle del autor. Verificar en `test/integracion/evidencias-lectura.test.ts`:
  - un operador PNP de apoyo y un SAMU principal obtienen el contenido;
  - Bomberos sin participación, una evidencia de otro incidente, un identificador malformado y una evidencia pendiente o eliminada dan el mismo 404;
  - un administrador da 403;
  - el autor obtiene las suyas y otro ciudadano recibe 404;
  - el código del invitado y el permiso de carga no dan acceso;
  - las cabeceras `no-store`, `nosniff`, `inline` y `sandbox` están presentes;
  - el acceso se registra solo tras entregar los bytes, y un fallo del almacén da 503 sin registro.
- [x] 9.2 Verificar las exclusiones (EQ-04): recorrer la bandeja, la consulta del invitado, los pendientes del administrador, los eventos y los logs de un incidente con fotos, y comprobar que no aparecen el contenido, `public_id`, URL ni `cloudinary`. Registrar el resultado en la evidencia.

## 10. Contrato

- [x] 10.1 Actualizar `openapi.yaml`: `permisoEvidencias` en el comprobante; las evidencias en el resumen del operador y en el detalle del autor; la carga multipart con los estados 200/201/400/401/403/404/409/413/415/422/429/503; y la entrega de contenido con 200/401/403/404/503. Verificar `npm run contrato:validar` y las pruebas de contrato de cada estado.

## 11. Flutter

- [x] 11.1 Añadir la sección «Fotos (opcional)» al formulario, con cámara, galería, compresión y conversión a JPEG, hasta 3 miniaturas, quitar y el rechazo local de más de 5 MB, siguiendo la composición del donante con los componentes de DESIGN.md. Verificar con `flutter test` de widgets:
  - el orden del formulario;
  - el permiso denegado;
  - tres fotos que deshabilitan las acciones;
  - la foto grande rechazada;
  - las etiquetas «Foto N de M».
- [x] 11.2 Implementar la cola de cargas tras el comprobante, con una clave por foto, el permiso del invitado en `flutter_secure_storage` y su borrado al terminar. Verificar con pruebas del controlador y un cliente HTTP simulado:
  - éxito de las tres;
  - un 503 con reintento con la misma clave;
  - 413/422 sin reintento automático;
  - permiso vencido;
  - el comprobante se conserva en todos los casos;
  - las fotos temporales se borran.
- [x] 11.3 Mostrar las fotos propias en el detalle de Mis reportes y ninguna en la consulta con código. Verificar con `flutter test`: fotos visibles, foto no disponible (404/503) y consulta con código sin fotos.
- [x] 11.4 Recorrido manual en Android real: elegir tres fotos (cámara y galería), enviar como invitado y con cuenta, cortar la red durante una carga y reintentar, y ver las fotos en Mis reportes, con TalkBack y texto al 200 %. Si no es posible en esta sesión, dejarlo para la verificación manual del responsable e indicarlo en la evidencia.

## 12. Panel web

- [x] 12.1 Añadir la sección «Fotografías» al resumen del incidente, con `fetch` con credenciales, `createObjectURL` y su revocación, la ampliación con `Dialogo.tsx` y los estados sin fotos y no disponible. Verificar con las pruebas web:
  - imágenes con su texto alternativo;
  - ampliar con Enter y cerrar con Escape, devolviendo el foco;
  - 404/503 por foto sin ocultar el resumen;
  - que no se escribe nada en `localStorage`/`sessionStorage`.
- [x] 12.2 Comprobar el resultado renderizado contra la composición del donante (`Incidents.jsx`), en ancho de escritorio y estrecho, con teclado. Guardar las capturas en `docs/validacion/p5/` y verificar que no hay estilos locales nuevos (grep de colores y radios en el diff).

## 13. Integración y documentación

- [x] 13.1 Recorrido local completo: API con `EVIDENCIAS_ADAPTADOR=cloudinary` (solo si el spike aprobó) o `memoria`, registro de invitado y de cuenta con tres fotos, lectura por un operador participante, rechazo a un no participante y limpieza de una huérfana provocada. Guardar en `docs/validacion/p5/` un recorrido sin datos sensibles e indicar qué adaptador se usó. Verificar que el doble no se presenta como integración externa.
- [x] 13.2 Ejecutar `npm run test:cobertura`, `npm run typecheck`, `npm run test:tipos`, `npm run arquitectura:verificar`, `npm run contrato:validar`, `flutter test` y las pruebas web. Registrar los totales y la cobertura de los archivos nuevos en la evidencia.
- [x] 13.3 Actualizar la guía UI (fotos en el formulario, Mis reportes y panel), la fila P5 de `docs/comparacion-proyecto-incidencias.md` con su estado real, y el estado de EQ-04, EQ-15 y EQ-17 (este último parcial) en la evidencia. Verificar que ningún documento declara la integración validada sin el resultado aprobado del grupo 5.

## Workflow follow-up

- Abrir el PR desde `feat/p5-evidencias` cuando el responsable lo pida, y comprobar la CI.
- Sincronizar las specs y archivar el cambio después de la revisión del responsable.
