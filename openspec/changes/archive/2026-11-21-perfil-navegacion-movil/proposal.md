## Why

Tras iniciar sesión, la app solo muestra una pantalla mínima (nombre, correo y «Cerrar sesión»). Faltan la estructura de navegación acordada en la guía UI, la edición del perfil (RF04), las páginas informativas de la app (RF37) y los contactos públicos (RF36), además del teléfono opcional con autorización de compartir (RF51). Esta entrega crea esa base sin simular funciones que aún no existen (mapa, reportes, alertas) y deja la información pública en una fuente versionada que la web podrá reutilizar.

## What Changes

- **Navegación móvil** (solo con sesión): Inicio, Mapa, Mis reportes y Alertas en una barra inferior; el perfil se abre desde la cabecera. Inicio muestra «Reportar un incidente» en estado «Disponible próximamente», los últimos reportes como pendientes y los contactos públicos aprobados. Mapa, Mis reportes y Alertas declaran que aún no están disponibles, con texto e icono.
- **Perfil ciudadano**: nuevo `GET /perfil` y `PATCH /perfil` (propio, sin identificador en la ruta). Se edita el nombre y el teléfono opcional, y se puede conceder o revocar la autorización para compartir el teléfono. El correo se muestra **solo lectura**: un correo editable sin verificación permitiría tomar una cuenta con una sesión robada y recibir el enlace de recuperación en un buzón ajeno, así que `PATCH /perfil` rechaza `correo`. El cambio de correo queda como entrega futura con verificación.
- **Autorización del teléfono**: se guarda con fecha; borrar o cambiar el número la revoca. En esta entrega **nadie recibe** el teléfono: solo se registra la preferencia que consumirá el registro de reportes (Spec 08).
- **Contenido público**: nuevo `GET /publico/contenido` sin sesión, con versión, finalidad y funcionamiento, desarrolladores, privacidad y contactos de emergencia. Sale de un archivo versionado en el repositorio; los contactos van vacíos porque ninguno está aprobado (el 105 sigue «por verificar»).
- **Páginas de la app**: «Acerca de AyniSafe», «Desarrolladores», «Privacidad» y «Contactos de emergencia» consumen esa fuente, con estados de carga, error con reintento y «no disponible» cuando una sección no está aprobada. Se reutilizan desde el acceso sin sesión (Privacidad y Contactos).
- **Marcador**: el componente de contacto abre el marcador (`tel:`) sin llamar automáticamente y sin permiso de llamada; se prueba con datos de prueba que no forman parte del contenido real.
- **Documentación**: aclarar RF04 (nombre y teléfono), añadir a la guía UI las vistas de perfil y navegación y registrar el cambio de correo como pendiente.
- Sin DNI, sin permisos de ubicación ni notificaciones, sin mapas, reportes ni avisos ficticios.

## Capabilities

### New Capabilities

- `identidad/perfil-ciudadano`: consulta y edición del perfil propio (nombre, teléfono opcional, autorización de compartirlo), correo de solo lectura y protección del dato personal.
- `consultas/contenido-publico`: contenido público versionado (app, desarrolladores, privacidad, contactos) servido sin sesión, con estado de aprobación por sección.
- `movil/navegacion-ciudadana`: estructura de navegación autenticada de la app, perfil desde cabecera, páginas informativas y estados honestos de los destinos no construidos.

### Modified Capabilities

<!-- Ninguna: el correo permanece inmutable, por lo que no cambian los requisitos de `identidad/acceso-ciudadano` ni de `identidad/recuperacion-activacion-cuenta`. -->

## Impact

- **API** (`apps/api`): migración aditiva en `usuarios` (teléfono y fecha de consentimiento con CHECK); extracción del lector de sesión Bearer a un middleware reutilizable; casos de uso de perfil; nuevo módulo `consultas` con el contenido versionado; `openapi.yaml` pasa a 0.3.0 y la prueba de alcance que fija las rutas debe actualizarse.
- **App** (`apps/mobile`): nuevo shell autenticado que reemplaza `SesionIniciadaPantalla`; repositorios de perfil y contenido; actualización de la identidad en `SesionControlador` tras editar; dependencia `url_launcher` y consulta `tel:` en el manifiesto Android.
- **Docs**: RF04, guía UI (sección 2 y pendientes) y revisión de consistencia.
- **Dependencias**: Specs 01 y 02 archivadas. Desbloquea Spec 04 (contenido para la web), 08 (consentimiento del teléfono), 17 (preferencias) y 20 (que reemplaza la fuente por administración).
- **Fuera de alcance**: cambiar el correo, verificar correo, compartir el teléfono con instituciones, preferencias de alertas, mapas, reportes, avisos, administración de contenido, caché persistente del contenido en el dispositivo.
