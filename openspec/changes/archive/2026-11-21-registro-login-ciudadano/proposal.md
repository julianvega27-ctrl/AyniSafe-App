# Proposal

## Why

AyniSafe necesita identificar al ciudadano para que pueda registrar reportes y consultar su seguimiento privado, según HU01 y RF01–RF02. El repositorio describe el producto y su UI, pero todavía no contiene implementación Flutter, API ni persistencia de cuentas.

## What Changes

- Incorporar registro ciudadano en una pantalla Flutter con nombre, correo y contraseña, e inicio de sesión con correo y contraseña, siguiendo `docs/05-diseno-ui/guia-ui.md`.
- Aplicar las decisiones confirmadas: contraseñas de 15 a 128 caracteres, sin reglas de composición, admitiendo espacios y pegado; acceso sin verificación previa de correo.
- Proponer contratos REST, casos de uso de Identidad y persistencia PostgreSQL/Prisma para cuentas y sesiones, con unicidad de correo y protección de credenciales.
- Incluir validación, credenciales incorrectas, correo duplicado, solicitudes concurrentes, límites de intentos, sesión vencida y fallos de conexión o persistencia, con criterios de aceptación verificables.
- Cubrir restauración y cierre de la sesión ciudadana como soporte mínimo del acceso; no construir las funcionalidades posteriores de Inicio, Reportes, Mapa o Alertas.
- Mantener acceso público a información y contactos, sin pedir DNI, teléfono, rol, ubicación o notificaciones durante el registro.

Fuera de alcance: recuperación de contraseña (RF03), verificación de correo, proveedor de correo, edición de perfil/teléfono, altas privilegiadas, panel React y funciones de reporte o atención institucional. El enlace de recuperación previsto en la guía se mostrará como texto informativo no interactivo «Recuperación de contraseña: próximamente», sin ruta ni promesa de envío; una entrega posterior habilitará el flujo.

## Capabilities

### New Capabilities

- `identidad/acceso-ciudadano`: registro, autenticación y ciclo mínimo de sesión ciudadana, validaciones de UI/API y persistencia segura.

### Modified Capabilities

Ninguna. No existen especificaciones principales en `openspec/specs/`.

## Impact

- Planificar las bases mínimas de una app Flutter y una API Node.js/Express/TypeScript, inexistentes actualmente; rutas de carpetas propuestas, no observadas.
- Identidad será propietaria de cuentas, hashes y sesiones. Prisma y PostgreSQL aplicarán restricciones y transacciones; la app nunca accederá a la base de datos.
- Requerir adaptadores de hash de contraseña, generación de tokens, almacenamiento seguro del dispositivo, reloj y limitación de intentos; no añadir Redis ni servicios de correo.
- La guía de UI se concilia en la tarea 6.6 (recuperación diferida a RF03, política de contraseña y verificación de correo como decisiones confirmadas); el resto de la documentación funcional no se modifica. Hasta entonces, estos artefactos prevalecen sobre los pendientes de la guía.
