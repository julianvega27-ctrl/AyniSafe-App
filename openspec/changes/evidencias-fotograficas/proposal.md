# Proposal

## Why

HU03, RF08 y RF52 piden adjuntar hasta tres fotografías opcionales a un reporte, pero hoy el envío no admite ninguna: la spec móvil fija el formulario «sin fotos» y ADR-006 mantiene el proveedor privado pendiente de validación. P5.2 (`evidencias-fotograficas`, fila P5 del plan de integración) incorpora la carga, el almacenamiento privado en Cloudinary y la consulta autorizada. El proveedor es una cuenta compartida con otro proyecto (entorno de prueba del plan gratuito), así que el aislamiento y un spike sobre la cuenta real son condición para declarar validada la integración.

## What Changes

- **Carga posterior al registro.** El incidente se registra como en P4, sin esperar fotos. Después, la app sube cada foto con `POST` a un recurso de evidencias del incidente:
  - con cuenta, mediante la sesión del autor;
  - como invitado, mediante un **permiso de carga** de un solo propósito que el comprobante entrega una vez, válido 24 h desde la recepción. El servidor guarda solo su huella y un reintento idempotente del registro emite uno nuevo que invalida el anterior.

  Un fallo de carga nunca borra ni bloquea el reporte confirmado; la app ofrece seguir sin fotos.
- **Validación (RF52, EQ-15).** Máximo 3 fotos por incidente, de hasta 5 MB cada una, en JPEG, PNG o WebP. Se verifica el formato real por contenido, no por extensión ni MIME declarado. La API re-codifica la imagen y descarta EXIF/GPS antes de almacenarla; la copia no se presenta como original forense. Una cuarta foto, un archivo mayor de 5 MB o un documento renombrado se rechazan. Cada carga lleva `Idempotency-Key`, de modo que un reintento tras una respuesta perdida no duplica la foto.
- **Almacenamiento aislado en Cloudinary (ADR-006).**
  - Cada objeto se sube como `authenticated`, con `public_id` `aynisafe/<uuid>`, carpeta `aynisafe` y etiqueta `aynisafe`, sin presets ni carga desde el cliente.
  - El `public_id` se registra en PostgreSQL **antes** de subir el objeto. Así toda subida, incluso una cuya respuesta se perdió, tiene un registro que permite borrarla.
  - Se borra solo por `public_id` registrado en la base de datos, con invalidación de derivados. Nunca se borra por prefijo, carpeta ni etiqueta, y el adaptador rechaza cualquier `public_id` fuera de `aynisafe/`.
  - Un límite local de bytes y de objetos protege la cuota de la cuenta compartida, que no se puede consultar porque la key no tiene permiso para `/usage`.
- **Entrega autenticada.** La API obtiene la imagen con una URL firmada del lado del servidor y la entrega al cliente autorizado con `no-store`. La URL firmada nunca llega al cliente, porque las firmas de entrega de Cloudinary no caducan.
- **Acceso (EQ-04, decisión del responsable del 27/11/2026).**
  - Pueden ver las fotos los operadores de cualquier institución participante dentro de su ámbito vigente, y el ciudadano con cuenta solo las suyas.
  - El invitado (también con su código secreto), el administrador, el mapa, los eventos y los logs no reciben fotos ni referencias de almacenamiento.
  - Un acceso no autorizado recibe el mismo 404 que un identificador inexistente.
  - Cada lectura autorizada se audita sin contenido.
- **Huérfanas y eliminación.** Una carga que no llegó a confirmarse queda bloqueada de inmediato y se elimina en el proveedor mediante una tarea persistente con reintentos, que se ejecuta al arrancar y periódicamente. El registro de una foto eliminada se conserva como marca sin contenido.
- **Spike de validación del proveedor.** Un script ejecutado manualmente contra la cuenta real, con datos sintéticos, verifica:
  - la privacidad: sin firma no hay acceso al original ni a derivados;
  - el borrado del original y de sus derivados, y el tiempo hasta que dejan de servirse;
  - la eliminación de EXIF;
  - el aislamiento por prefijo y etiqueta;
  - el modo de carpetas;
  - lo observable de la cuota.

  Hasta que el spike pase, la integración figura como **pendiente** y la API puede funcionar con el proveedor deshabilitado (503 y envío sin fotos). Un doble en memoria sirve para las pruebas y nunca se presenta como validación externa.
- **Clientes.**
  - Flutter añade «Fotos (opcional)» al formulario, con cámara y galería, compresión en el dispositivo y hasta tres miniaturas. Sube las fotos tras el comprobante e informa el resultado de cada una.
  - Mis reportes muestra las fotos propias.
  - El panel añade la sección «Fotografías» al resumen del incidente.

**Fuera de alcance:**
- **P6:** cierre del caso. El plazo de 90 días tras el cierre depende de él.
- **P9:** purga por plazos, backups y restauración. Este cambio deja el mecanismo de eliminación por `public_id` que P9 reutilizará.
- Fotos públicas o en el mapa (P7 las excluye).
- Videos y documentos.
- Agregar fotos a un incidente pasadas las 24 h de su recepción.
- Pruebas de carga con evidencias reales: la carga usa el doble.

## Capabilities

### New Capabilities
- `reportes/evidencias-fotograficas`: carga posterior al registro con sesión o permiso de invitado; validación de cantidad, tamaño, formato real y EXIF; idempotencia; almacenamiento privado aislado por prefijo, carpeta y etiqueta; registro previo del `public_id`; eliminación solo por `public_id` registrado; huérfanas; límite local de cuota; estado del proveedor y criterio de validación mediante spike.
- `consultas/acceso-evidencias`: listado y entrega autenticada de las fotos a operadores participantes dentro de su ámbito y al autor con cuenta; rechazo uniforme; exclusión de invitado, administrador y vistas públicas; auditoría de lecturas sin contenido.

### Modified Capabilities
- `reportes/registro-incidentes`: el comprobante del invitado incluye el permiso de carga de 24 h, con huella y reemisión en reintentos; el registro sigue sin depender de evidencias.
- `consultas/bandeja-institucional`: el resumen del operador deja de excluir las evidencias e incluye sus metadatos (cantidad, tipo, tamaño e instante), sin URLs ni referencias del proveedor.
- `consultas/seguimiento-ciudadano`: el detalle del autor incluye sus propias fotos disponibles; la vista del invitado sigue sin evidencias.
- `movil/reporte-incidente`: el formulario incorpora fotos opcionales, carga tras el comprobante, reintento y continuación sin fotos.
- `movil/seguimiento-incidentes`: el detalle de Mis reportes muestra las fotos propias.
- `web/bandeja-incidentes`: sección «Fotografías» en el resumen del incidente.

## Impact

- **API:**
  - Reportes: dominio de evidencias, puertos de almacenamiento y de procesamiento de imagen, adaptadores Cloudinary, sharp y memoria, rutas de carga y tarea de limpieza.
  - Consultas: autorización por ámbito para operadores y autor.
  - El verificador de arquitectura ya prohíbe `cloudinary` fuera de la infraestructura.
- **Dependencias nuevas:**
  - API: `cloudinary`, `sharp` y un parser multipart (`multer`).
  - Flutter: `image_picker`.
  - Todas se fijan a versiones exactas.
- **Esquema:** migración aditiva:
  - `evidencias_incidente`, con ranura 1–3, `public_id` único con CHECK de prefijo, estado y metadatos;
  - `permisos_evidencia`, solo con la huella del permiso;
  - `accesos_evidencia`.
- **Configuración:** `EVIDENCIAS_ADAPTADOR` (`cloudinary` | `deshabilitado`, y `memoria` solo en pruebas), las variables `CLOUDINARY_*` ya presentes en `apps/api/.env` (nunca se imprimen ni se registran) y los límites locales. `.env.example` documenta solo los nombres.
- **Contrato:** `openapi.yaml` amplía el comprobante de `POST /incidentes` y los resúmenes del operador y del autor. Añade la carga de evidencias y la entrega de contenido para el operador y para el autor.
- **Calidad:** EQ-15 completo; EQ-04 en su parte de evidencias. EQ-17 queda parcial: la eliminación se hace por `public_id`, pero los vencimientos llegan en P9. La evidencia irá en `docs/validacion/p5-evidencias.md`, incluido el informe del spike. ADR-006 y el documento 11 §8 se actualizan solo con el resultado observado.
