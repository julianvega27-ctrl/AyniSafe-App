# Informe de implementación: web-publica-acceso-institucional

Fecha de ejecución: 21–22 de noviembre de 2026 (máquina de desarrollo local, Windows 11). Este informe registra lo
que **se ejecutó y su resultado real**; no acredita el despliegue ni lo que figura como pendiente.

## Resultados

| Verificación | Comando | Resultado |
|---|---|---|
| API: tipos | `npm run typecheck` (`apps/api`) | Correcto |
| API: compilación | `npm run build` | Correcto |
| API: contrato OpenAPI 0.4.0 | `npm run contrato:validar` | Válido; 16 operaciones |
| API: pruebas (unidad + integración, PostgreSQL aislado `*_test`) | `npx vitest run` | **28 archivos, 429 pruebas, todas correctas** (línea base previa: 23 archivos, 320) |
| Flutter: análisis | `flutter analyze` (`apps/mobile`) | Sin problemas |
| Flutter: pruebas de unidad y widgets | `flutter test` | **237 correctas** (`integration_test` no se ejecuta: necesita dispositivo) |
| Web: lint, tipos, compilación | `npm run lint`, `typecheck`, `build` (`apps/web`) | Correctos |
| Web: artefacto compilado | `npm run verificar:dist` | Sin URLs de la API, almacenamiento ni cookies |
| Web: pruebas | `npm test` | **9 archivos, 100 pruebas, todas correctas** (incluye axe-core y contraste WCAG AA) |
| Web: instalación limpia | `npm ci` + los comandos anteriores | Correcto (lockfile reproducible) |
| Secretos en archivos versionados | `node scripts/escanear-secretos.mjs` | Sin hallazgos (318 archivos, incluidos los nuevos); `.env` ignorado por Git |
| Flujo de CI | `actionlint` 1.7.12 sobre `.github/workflows/ci.yml` | Sin avisos |
| Extremo a extremo local (API real + BD de pruebas + proxy de Vite + Chrome) | `node e2e/local.mjs` | **31/31 comprobaciones correctas** |

El e2e cubre: bootstrap del administrador → correo de activación con enlace a la web → activación (el fragmento
`#t=` desaparece de la dirección y no se inicia sesión) → acceso → cookie `HttpOnly`, `SameSite=Strict`, `Path=/`, sin
`Domain` y no legible por JavaScript → almacenamiento del navegador vacío → refrescar restaura la sesión → panel del
administrador → 403 en el panel del operador → ninguna cabecera `Access-Control-*` y todas las solicitudes al mismo
origen → un `Origin` ajeno recibe 403 sin cookie → cierre de sesión revoca en el servidor y «Atrás» no reabre contenido
→ un ciudadano recibe el mismo mensaje general → operador (fixture) en su panel y 403 en el ajeno → cuenta suspendida
pierde el acceso → `admin:reiniciar` invalida la contraseña anterior → texto al 200 % en 360 px sin desplazamiento
horizontal y botón principal de al menos 48 px.

## Hallazgos corregidos durante la implementación

- **Cierre de sesión (API):** el `DELETE` del navegador llega con `Content-Length: 0` y el middleware lo trataba como
  contenido (415). Corregido y con prueba (`institucional.test.ts`). Lo detectó el e2e, no las pruebas con supertest.
- **Cierre de sesión (web):** el guard redirigía al acceso antes de llegar a la portada (carrera con la transición del
  router). Ahora un cierre voluntario deja el estado `anonimo` con causa `cierre` y el guard lo envía a la portada.
- **Desbordamiento al 200 %:** el campo de correo no ocupaba el ancho disponible. Corregido con CSS.
- **CORS del servidor de desarrollo de Vite:** emite `Access-Control-*` abierto por defecto; se desactivó (`cors: false`)
  para que local se comporte como producción. La API nunca los emitió (prueba propia).
- El propio script e2e salía con éxito ante un error imprevisto; corregido para que cuente como fallo.

## Pruebas preexistentes que hubo que ajustar (consecuencia directa de los specs de este cambio)

Las pruebas de las Specs 01–03 pasan; estas son las únicas modificaciones a archivos anteriores y su motivo:

| Archivo | Cambio | Motivo |
|---|---|---|
| `test/unidad/config-correo.test.ts` | El fixture de producción añade `WEB_ORIGIN` y `WEB_PUBLIC_URL` | En producción esas variables pasan a ser obligatorias |
| `test/integracion/arnes.ts` | Límites institucionales, dependencia `web`, redactor con base web y helpers nuevos | Nueva configuración del módulo |
| `test/integracion/alcance.test.ts` | Lista de rutas con las 5 nuevas | La prueba fija las rutas del contrato; mantiene las comprobaciones negativas |
| `test/integracion/cola-correo.test.ts` | `pendiente()` acepta rol (por defecto ciudadano) y se añaden pruebas del enlace institucional | El enlace de activación de un operador ahora es el de la web |
| `test/integracion/recuperacion-http.test.ts` | Asunto esperado del correo de un operador invitado | Mismo motivo |
| `test/integracion/contenido-publico.test.ts`, `test/unidad/contenido-publico.test.ts` | Sección `piloto`, versión 2 y su huella | Contenido v2 |
| `test/integracion/contrato.test.ts` | Prueba nueva de las rutas institucionales | Contrato 0.4.0 |
| `apps/mobile/test/dobles.dart` | El contenido de prueba pasa a v2 con `piloto` | Comprobar que la app tolera la sección |

## Pendiente (no completado, por requerir recursos externos o una acción de publicación)

Revisión P0 del 23/11/2026: ver [línea base actual](../../../docs/validacion/p0-linea-base.md). Los resultados anteriores conservan su fecha y no se sustituyen por metas nuevas. En esta revisión, web tiene 104 pruebas, API 429 y Flutter 237; las tres suites pasan. La tarea 10.2 se vuelve a marcar pendiente porque el requisito literal de no modificar pruebas anteriores contradice los ajustes que este mismo informe enumera. Esto no implica fallo de las suites; requiere conciliación del criterio y de su trazabilidad antes de aceptación total.

- **1.1 y 1.2 (spikes Vercel→Render):** necesitan cuentas reales de Vercel y Render. Sin ellos `vercel.json` apunta al
  marcador no válido `api-render-pendiente.invalid` y `TRUST_PROXY_HOPS` no está fijado.
- **9.3 (ejecución real del CI en GitHub):** exige empujar una rama; no se hizo sin autorización. El flujo se verificó
  con `actionlint`, ejecutando localmente los mismos comandos y con pruebas de sus reglas (permisos, SHA, sin secretos).
- Revisión manual con lector de pantalla; envío de correo desde Render; texto del alcance del piloto (pendiente de
  aprobación); creación de operadores (Spec 06).
- El escáner de secretos es propio (sin dependencias); no sustituye a un escáner con reglas más amplias.
