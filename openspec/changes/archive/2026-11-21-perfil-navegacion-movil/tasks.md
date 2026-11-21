# Tasks

Todas las tareas están pendientes. Este archivo planifica implementación futura; no autoriza despliegue ni acredita pruebas ejecutadas. Referencias: `design.md` y `specs/{identidad/perfil-ciudadano,consultas/contenido-publico,movil/navegacion-ciudadana}/spec.md`. Pruebas de API contra PostgreSQL aislado (`TEST_DATABASE_URL`); pruebas de app con widgets y API falsa.

## 1. Modelo de datos y dominio del perfil

- [x] 1.1 Añadir a `usuarios` las columnas `telefono` y `telefono_compartir_consentido_at` con los CHECK de consentimiento-implica-teléfono y de formato; actualizar `schema.prisma`. Verificar migración desde BD vacía y desde el esquema actual, que las cuentas existentes quedan sin teléfono ni autorización y que PostgreSQL rechaza consentimiento sin teléfono y teléfonos de 6 o 16 dígitos.
- [x] 1.2 Implementar en `dominio/validacion.ts` la validación de `PATCH /perfil` (lista cerrada de campos, al menos uno, nombre de Spec 01, normalización y validación del teléfono, `null`/vacío para borrar). Verificar con pruebas unitarias: 7, 9 y 15 dígitos válidos; 6 y 16 inválidos; separadores; `+` inicial; letras; `correo`, `id`, `rol`, `estado` y DNI rechazados; cuerpo vacío o no objeto.

## 2. API del perfil

- [x] 2.1 Extraer `tokenBearer` y la comprobación de sesión a un middleware `autenticarCiudadano` reutilizable y migrar `auth.routes.ts` a él. Verificar que las pruebas de sesión, login y revocación de Spec 01 y 02 siguen pasando sin cambios.
- [x] 2.2 Extender `CuentasPort` y `PrismaCuentasAdapter` con `obtenerPerfil` y `actualizarPerfil` (transacción con bloqueo de la fila, reglas de consentimiento de la Decisión 3, fecha de autorización, 503 sin cambios parciales). Verificar con BD real: otorgar y revocar conservan el número; borrar el teléfono revoca; cambiar el número revoca salvo otorgamiento en la misma solicitud; otorgar sin teléfono da 400.
- [x] 2.3 Implementar los casos de uso y las rutas `GET /perfil` y `PATCH /perfil` con `sinCache`, límite de cuerpo y errores existentes; `/auth/sesion` sigue sin teléfono. Verificar 200, 400 por campo, 401 con token ausente, inválido, vencido, revocado y de cuenta suspendida, y que `/perfil/{id}` no existe.
- [x] 2.4 Pruebas de aislamiento y privacidad: dos cuentas, cada una solo ve y edita lo suyo aunque envíe el ID ajeno en cuerpo o consulta; ningún log contiene teléfono ni nombre al editar; la respuesta no contiene hash. Verificar dos `PATCH` simultáneos sin estados inválidos y un fallo de escritura (tabla renombrada) con 503 y perfil intacto.
- [x] 2.5 Verificar que el correo no cambia: `PATCH` con `correo` da 400, el acceso y la recuperación siguen usando el correo original y no existe columna ni ruta de cambio de correo.

## 3. Contenido público (API)

- [x] 3.1 Crear el módulo `consultas` con el validador de la fuente, `contenido/contenido-publico.json` (app, desarrolladores con Julián Anthony Vega Salvatierra, privacidad redactada solo con hechos implementados, contactos pendientes y vacíos), carga y validación al arrancar y la ruta `GET /publico/contenido` con `Cache-Control: public, max-age=300`; montarla en `app.ts`. Verificar 200 sin sesión y con sesión idénticos, contactos vacíos, ausencia de números y de datos privados.
- [x] 3.2 Pruebas del esquema: contacto sin fuente o sin fecha de verificación invalida la fuente; sección pendiente sin texto; sección aprobada sin texto inválida; versión obligatoria; el arranque falla con una fuente inválida.

## 4. Contrato y alcance

- [x] 4.1 Actualizar `openapi.yaml` a 0.3.0 con las tres operaciones nuevas, esquemas, errores y la nota de que `correo` no se admite; ejecutar `npm run contrato:validar` y actualizar la prueba de contrato (11 operaciones). Verificar que el contrato es válido y coincide con las rutas reales.
- [x] 4.2 Actualizar `alcance.test.ts` para fijar las rutas nuevas y mantener las comprobaciones de que no hay rutas de operadores, sedes ni cambio de correo y de que no hay columnas de verificación de correo. Verificar que pasa y que falla si se añade una ruta no contratada.

## 5. App: datos y estado

- [x] 5.1 Crear `PerfilRepositorio` (GET/PATCH con Bearer, resultados tipados: éxito, campos inválidos, sesión inválida, sin conexión, servicio no disponible, inesperado) y `PerfilControlador` con envío único y conservación del formulario; agregar `SesionControlador.actualizarUsuario`. Verificar con pruebas: éxito actualiza el nombre en la sesión, 401 vuelve al acceso, errores conservan lo escrito y varios toques emiten una sola solicitud.
- [x] 5.2 Crear `ContenidoRepositorio` (GET sin sesión, memoria de la última respuesta, estados cargando, disponible, error) y los modelos del contenido, incluida la sección pendiente. Verificar con respuestas falsas: contenido completo, contactos vacíos, sección pendiente, fallos de red y 503.

## 6. App: navegación y pantallas

- [x] 6.1 Implementar `ShellCiudadano` (cabecera con perfil, `NavigationBar` de cuatro destinos con destino activo reconocible, `IndexedStack`, retroceso a Inicio) y sustituir `SesionIniciadaPantalla` en `app.dart`. Verificar con pruebas de widgets: estructura, conservación de estado entre pestañas, retroceso desde Mapa a Inicio, y que sin sesión verificada no se muestra el shell.
- [x] 6.2 Implementar Inicio (saludo con nombre, «Reportar un incidente» deshabilitado con «Disponible próximamente», últimos reportes y contactos pendientes) y el componente `DestinoPendiente` para Mapa, Mis reportes y Alertas. Verificar que no hay datos de ejemplo, que la acción principal no navega ni envía y que no se solicita ningún permiso.
- [x] 6.3 Implementar el perfil (nombre editable, correo de solo lectura, teléfono, autorización con el aviso honesto, preferencias no disponibles, accesos a privacidad, acerca de y desarrolladores, cierre de sesión) y el formulario de edición con errores por campo. Verificar: persistencia tras guardar y reabrir, teléfono vacío, autorización revocable, errores de servidor y de red sin afirmar que se guardó.
- [x] 6.4 Generalizar `ContenidoPublicoPantalla` (privacidad, contactos, acerca de, desarrolladores) con carga, error con «Reintentar», vacío y sección pendiente; reutilizarla desde `EnlacesPublicos` del acceso sin sesión. Verificar el acceso sin sesión, la ausencia de números inventados y el mensaje de «no hay contactos aprobados».
- [x] 6.5 Añadir `url_launcher` (versión fijada) y la consulta `tel` al manifiesto; implementar `ContactoEmergencia` que abre el marcador. Verificar con un contacto de prueba inyectado que se abre `tel:` sin llamar, que el manifiesto fusionado solo tiene `INTERNET` y la consulta `tel` (`flutter build apk --debug`) y que ese contacto no está en la fuente real.
- [ ] 6.6 Verificar salida y accesibilidad: cerrar sesión desde el perfil vuelve al acceso sin historial y descarta el perfil de la memoria (incluido el retroceso del sistema); recorrido con lector de pantalla y texto al 200 % (pruebas de widgets de semántica y escalado, más prueba manual en Android); contraste de los nuevos colores y estados con `contraste_test.dart`.

## 7. Documentación

- [x] 7.1 Actualizar RF04 (nombre y teléfono; correo de solo lectura), la guía UI (vistas de perfil, navegación y contenido público, y el cambio de correo como pendiente con sus requisitos mínimos) y `revision-consistencia-y-costos.md` si corresponde. Verificar que ninguna doc afirma verificado, aprobado o implementado lo que no lo está.
- [x] 7.2 Redactar `informe-aceptacion.md` del cambio con comandos y resultados reales, qué no se ejecutó (por ejemplo, prueba manual en dispositivo) y la nota de que el texto de privacidad queda para revisión del equipo.

## 8. Aceptación

- [x] 8.1 Ejecutar `npx tsc --noEmit`, `npm run build`, `npm run contrato:validar` y `npx vitest run` en `apps/api`, y `flutter analyze` y `flutter test` en `apps/mobile`; ejecutar `openspec validate perfil-navegacion-movil --strict`. Verificar que Spec 01 y 02 siguen pasando.
- [x] 8.2 Recorrido en Android con la API local: registrar, ingresar, ver Inicio y pestañas pendientes, editar nombre y teléfono, otorgar y revocar autorización, ver privacidad y desarrolladores, ver contactos sin aprobar, cerrar sesión y comprobar el retroceso. Registrar el resultado o marcarlo como no ejecutado si no hay dispositivo.
