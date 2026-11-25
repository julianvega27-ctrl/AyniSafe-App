# Proposal

## Why

P1 dejó una base de pruebas y CI aprobada; las interfaces aún usan la apariencia anterior y algunas specs contradicen la dirección elegida el 23/11/2026. P2 reproduce la UI web y Flutter de `Proyecto_incidencias_400par`, sin rediseñarla ni presentar módulos futuros como operativos.

## What Changes

- Reproducir portada, acceso, marco institucional, navegación y componentes de cuenta web; adaptar activación y estados existentes con el lenguaje del origen.
- Reproducir tema, componentes, Inicio, AppBar, Drawer, barra inferior y pantallas ciudadanas existentes en Flutter. Abrir navegación pública sin cuenta, conservando autenticación para perfil e historial privado.
- **BREAKING (navegación visual):** barra móvil Inicio/Reportar/Mapa/Contactos; Mis reportes y Alertas pasan al Drawer. La entrada sin sesión muestra Inicio público y ofrece ingreso a cuenta. No cambian tokens, endpoints de autenticación ni permisos.
- Centralizar la extracción en los estilos/componentes de cada tecnología. DESIGN.md continúa como única autoridad visual; DM Sans/Manrope se sirven localmente en web y Flutter conserva su tema de referencia.
- Ajustar únicamente metadatos de navegación del panel si son necesarios para Inicio/Historial pendientes y terminología Incidentes; sin habilitar capacidades de atención o administración futuras.
- Conservar nombre AyniSafe, lema, contenido versionado, estados honestos y reglas 03/09/11; sin datos DEMO, cifras, contactos o logotipo oficial inventados.
- Comparar capturas equivalentes origen/destino y comprobar accesibilidad, recursos propios, estados y regresión. Registrar diferencias funcionales justificadas por separado de desviaciones visuales.

## Capabilities

### New Capabilities

- `plataforma/fidelidad-visual`: contrato de fidelidad a la referencia aprobada, recursos locales y evidencia visual de las superficies entregadas, sin duplicar los tokens de DESIGN.md.

### Modified Capabilities

- `web/portada-publica`: sustituir la exigencia tipográfica anterior por la dirección elegida, conservando accesibilidad y contenido público real.
- `web/panel-institucional`: marco y navegación del origen por rol, cuenta y campana con disponibilidad honesta, conservando guards y autorización de API.
- `movil/navegacion-ciudadana`: nueva distribución de destinos, shell público sin cuenta, protección de destinos privados y salida hacia Inicio público.

## Impact

Destino: `apps/web/src` y recursos públicos; `apps/mobile/lib/presentacion`, composición de `app.dart` y recursos declarados; sus pruebas y E2E; metadatos `apps/api/src/modules/identidad/dominio/paneles.ts` y sus contratos/pruebas si cambian. Documentación visual y de navegación se actualiza durante implementación, sin otra guía global de estilo.

Origen de solo lectura: commit `efc1bce8c29b3c88487e36e10a324c71ae9c2029`, principalmente `apps/admin/src/{App.jsx,style.css,ui.jsx,pages,AccountMenu.jsx,Notifications.jsx}`, `apps/admin/public` y `apps/mobile/lib/{app.dart,screens}`. No se importan su cliente API, sesiones, MySQL, roles extra ni datos de prueba.

P3–P9 conservan territorio/sedes, incidentes, evaluación, atención, mapas, alertas, conservación y carga. P2 deja destinos pendientes y componentes reutilizables; no incorpora sus pantallas operativas desconectadas. Solo esta planificación está autorizada en esta entrega: commit documental antes del código y posterior solicitud de aplicación.
