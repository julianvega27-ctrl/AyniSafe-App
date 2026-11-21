# Informe de aceptación: perfil-navegacion-movil

Fecha de las ejecuciones: 21/11/2026. Resultados reales de esta sesión. Este informe **no declara cerrada** la verificación manual en Android ni la revisión del texto de privacidad: ambas están en «Pendiente».

## Resumen

| Área | Estado |
|---|---|
| API (perfil, contenido público, contrato, alcance) | Implementada y probada contra PostgreSQL real aislado. |
| App Flutter (shell, Inicio, destinos pendientes, perfil, edición, páginas informativas, marcador) | Implementada y probada con widgets y API falsa. |
| Documentación (RF04, guía UI, revisión de consistencia) | Actualizada. |
| Recorrido manual en Android con la API local (tarea 8.2) | **Ejecutado por el usuario en un SM A346M: todo correcto** (confirmado por el usuario; sin capturas ni registro detallado). |
| Prueba manual con lector de pantalla (TalkBack) y texto al 200 % (parte de 6.6) | **No ejecutada.** |
| `integration_test` (con API real) | Actualizados para el nuevo flujo, **no ejecutados** (requieren dispositivo y API). |

## Comandos y resultados

| Comando (directorio) | Resultado |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` (`apps/api`) | Sin errores. |
| `npm run build` (`apps/api`) | Compila y copia `contenido-publico.json` a `dist`. |
| `npm run contrato:validar` (`apps/api`) | Contrato OpenAPI 3.1.0 válido, 11 operaciones. |
| `npx vitest run` (`apps/api`, `TEST_DATABASE_URL` aislada) | **23 archivos, 320 pruebas, todas pasan.** Antes de esta entrega: 18 archivos, 247 pruebas (más las ampliaciones de Spec 02). |
| `flutter analyze` (`apps/mobile`) | Sin problemas. |
| `flutter test` (`apps/mobile`) | **235 pruebas, todas pasan.** Antes: 178. |
| `flutter build apk --debug` (`apps/mobile`) | Compila. Manifiesto fusionado: permiso `INTERNET` (más el permiso interno que AndroidX genera para receptores dinámicos, ya presente antes), consulta `tel`/`DIAL`, sin `CALL_PHONE`, ubicación ni notificaciones. |
| `openspec validate perfil-navegacion-movil --strict` | Válido. |

Nota de entorno: con el proyecto en `D:` y la caché de pub en `C:`, la compilación Kotlin incremental de `url_launcher_android` falla en esta máquina («Could not close incremental caches»). Se compiló con `GRADLE_OPTS="-Dorg.gradle.project.kotlin.incremental=false"` solo para esa ejecución; no se cambió ningún archivo del proyecto. Quien compile en Windows con rutas en discos distintos puede necesitar lo mismo.

Spec 01 y 02 siguen pasando: sus pruebas de registro, acceso, sesión, recuperación y contrato continúan en verde. Dos pruebas se ajustaron a propósito: `esquema.test.ts` ya no prohíbe la columna `telefono` (ahora es opcional y exclusiva del perfil; el DNI sigue prohibido) y las pruebas de la app del destino autenticado pasaron del destino mínimo al shell (el cierre de sesión vive en el perfil).

## Cobertura por escenario de las specs

| Escenario | Dónde se comprueba | Resultado |
|---|---|---|
| Consulta del propio perfil; sin hash ni datos ajenos | `perfil.test.ts` | 200 con `no-store`, solo el titular. |
| Perfil ajeno: ruta `/perfil/{id}`, `?id=` y `id` en el cuerpo | `perfil.test.ts`, `navegacion_perfil_test.dart` | 404 en la ruta; 400 con campos no admitidos; la app nunca pide un perfil por identificador. |
| Sin sesión válida (ausente, desconocido, revocado, suspendido, vencido) | `perfil.test.ts` | 401 `UNAUTHENTICATED` en GET y PATCH. |
| Edición persistente (nombre y teléfono normalizado) | `perfil.test.ts`, `navegacion_perfil_test.dart` | Persiste y se consulta de nuevo. |
| Teléfono vacío o borrado | `perfil.test.ts`, `perfil_datos_test.dart` | Válido; se guarda como nulo. |
| Datos inválidos y campos no admitidos (`correo`, `rol`, `estado`, `dni`, `id`) | `perfil-validacion.test.ts`, `perfil.test.ts` | 400 por campo; el correo y el acceso no cambian. |
| Correo de solo lectura | `perfil.test.ts`, `alcance.test.ts`, `navegacion_perfil_test.dart` | Sin ruta ni control de edición; sin la palabra «verificado». |
| Autorización revocable (otorgar, revocar, sin teléfono, borrar, cambiar número) | `perfil.test.ts`, `esquema.test.ts`, `navegacion_perfil_test.dart` | Se respeta cada regla; el CHECK de la base es la última defensa. |
| Aviso honesto del consentimiento | `navegacion_perfil_test.dart` | «Por ahora no se comparte con ninguna institución». |
| Privacidad: sin teléfono ni nombre en logs; `/auth/sesion` sin teléfono | `perfil.test.ts` | Ningún registro contiene los valores. |
| Ediciones simultáneas; 503 sin cambios parciales; envío único | `perfil.test.ts`, `perfil_datos_test.dart`, `navegacion_perfil_test.dart` | Estado consistente; 503 con perfil intacto; una sola solicitud. |
| Identidad de sesión actualizada y salida | `perfil_datos_test.dart`, `navegacion_perfil_test.dart` | El saludo cambia; tras salir no queda historial ni datos. |
| Contenido público sin sesión, idéntico con y sin sesión, sin datos privados | `contenido-publico.test.ts` | 200 con versión, fecha y cuatro secciones. |
| Contactos sin aprobar | `contenido-publico.test.ts` (API y unidad), `navegacion_perfil_test.dart` | `contactos.items` vacío, sin números. |
| Sección pendiente y contacto incompleto | `test/unidad/contenido-publico.test.ts` | La fuente se invalida; el arranque falla sin volcar el contenido. |
| Fuente versionada y cache pública breve | `contenido-publico.test.ts` | `public, max-age=300`; un cambio de contenido sin subir la versión falla por huella. |
| Solo lectura | `contenido-publico.test.ts` | POST, PUT, PATCH y DELETE responden 405 con `Allow`. |
| Contenido en la app sin sesión, error con «Reintentar», marcador | `acceso_pantalla_test.dart`, `perfil_datos_test.dart`, `navegacion_perfil_test.dart` | Sin Bearer; carga, error y reintento; «Llamar» abre `tel:` sin llamar. |
| Navegación principal, retroceso a Inicio, sin sesión | `navegacion_perfil_test.dart` | Cuatro destinos, estado conservado, retroceso a Inicio. |
| Inicio honesto y destinos pendientes | `navegacion_perfil_test.dart` | Botón deshabilitado con «Disponible próximamente»; Mapa, Mis reportes y Alertas sin datos, sin solicitudes ni permisos. |
| Accesibilidad (texto al 200 %, objetivos de 48, semántica) | `navegacion_perfil_test.dart` | Sin desbordes y objetivos de al menos 48. |
| Permisos | `enlaces_cuenta_test.dart`, `flutter build apk` | Solo `INTERNET` y la consulta `tel`. |

## Pendiente (no ejecutado o por decidir)

| Elemento | Motivo |
|---|---|
| Tarea 6.6, parte manual: lector de pantalla (TalkBack) y texto al 200 % en un teléfono Android | No ejecutada. Las pruebas de widgets cubren semántica y escalado, pero no sustituyen TalkBack. |
| `integration_test/*` | Adaptados al nuevo flujo pero no ejecutados. |
| Texto de privacidad, finalidad y funcionamiento | Redactados solo con lo que la app trata hoy y publicados como aprobados por autorización del usuario; **requieren revisión del equipo** antes de darlos por definitivos. |
| Contactos de emergencia (incluido el 105) | Ninguno aprobado: la lista está vacía. Falta aprobarlos y decidir la caché persistente antes de publicar contactos reales (hoy sin red no se verían). |
| Cambio de correo | Fuera de alcance por decisión: requiere una entrega independiente con verificación. |
| Compartir el teléfono con instituciones | Solo se guarda la preferencia; lo consumirá el registro de reportes (Spec 08). |
