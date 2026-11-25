# Tasks

Estado inicial: planificación de P2, **0 tareas implementadas**. Referencia: proposal.md, design.md y los cuatro deltas. No se ha cambiado UI ni ejecutado validación visual por crear estos artefactos. DESIGN.md conserva autoridad visual; rúbrica Sprint 2 actividades 1/2/3/6/7 y evidencia de usabilidad/accesibilidad pertinente, sin acreditar carga ni atributos operativos futuros.

## 1. Trazabilidad, recursos y documentación vigente

- [x] 1.1 Identificar el commit previo de estos artefactos y la revisión destino antes de portar código; verificar HEAD limpio/origen `efc1bce8c29b3c88487e36e10a324c71ae9c2029` y registrar ambos en `docs/validacion/p2-replica-visual.md`, enlazando evidencia P1 sin presentarla como pruebas P2.
- [x] 1.2 Crear manifiesto de recursos y fichas de referencia en `docs/validacion/p2/`: registrar hashes/rutas de logo e ilustración, familias/pesos, procedencia y adaptación de marca; capturar superficies origen incluidas y documentar cascada responsive efectiva. Verificar que las fichas identifican viewport/escala/estado y que ningún símbolo Flutter se declara marca oficial AyniSafe.
- [x] 1.3 Conciliar en DESIGN.md, PRODUCT.md y guía UI los resúmenes obsoletos identificados con los acuerdos existentes: variantes web/móvil, tipografía web, barra/Drawer y tabla de prioridad ya elegida. Verificar enlaces y ausencia de paletas paralelas o afirmaciones de funciones implementadas; documentar el alcance inicial y la matriz de pantallas P2.

## 2. P2.1 — Componentes y web pública

- [x] 2.1 Extraer estilos efectivos del origen a tokens/componentes centrales web y servir DM Sans/Manrope e ilustración desde recursos propios, con adaptación de nombre/lema. Actualizar pruebas de pares/recursos usados y verificar build, carga real de ambas familias y ausencia de fuentes/estilos remotos sin relajar CSP; actualizar manifiesto y DESIGN.md con lo realmente portado.
- [x] 2.2 Reproducir Portada con composición origen y contenido versionado destino, incluyendo pendientes, carga, fallo y reintento. Adaptar pruebas de portada y verificar que sin sesión sigue pública, con sesión no cambia de naturaleza, y no aparecen cifras, contactos o capacidades DEMO; añadir capturas y diferencias al informe del incremento.
- [x] 2.3 Reproducir Acceso y adaptar Activar con componentes del origen conservando Mostrar/Ocultar, pegado, validación, envío único, estados 400/401/403/429/red/servicio y token solo en memoria. Verificar pruebas de ambas páginas y ausencia de secretos en almacenamiento/URL/terceros; documentar las pantallas sin equivalente directo.
- [x] 2.4 Verificar P2.1 renderizado a 1440×900 y 390×844, teclado/foco y ampliación 200 %, contraste/axe, lint, tipos, build, verificar:dist y E2E públicos/activación existentes. Registrar comandos/resultados y capturas comparables con fuentes cargadas; resolver desviaciones y no marcar aceptación ante conflictos visuales/accesibles pendientes.

## 3. P2.2 — Panel por rol y metadatos

- [x] 3.1 Actualizar el catálogo de navegación API según la guía elegida (Inicio/Historial e Incidentes), manteniendo no disponibilidad y separación de roles. Actualizar ejemplos/contratos que enumeran secciones y sus pruebas Jest; verificar 401/403, contenido de cada rol, OpenAPI y ausencia de nuevos endpoints operativos, y documentar el cambio de metadatos.
- [x] 3.2 Reproducir lateral, cabecera y área de trabajo con navegación activa por rol, cuenta accesible y campana pendiente; conectar únicamente identidad/secciones reales. Verificar tests de panel/cuenta, ausencia de contadores ficticios y de llamadas a notificaciones/mapa/incidentes; documentar componentes y estados portados.
- [x] 3.3 Comprobar restauración, cierre, sesión vencida, rol ajeno y fallo/reintento con regresión web y E2E institucionales; verificar teclado/Escape/foco y marcos a 1440, 900, 600 y 390 px. Registrar capturas equivalentes para ambos roles, pruebas y diferencias funcionales sin afirmar dashboard o Historial operativos.

## 4. P2.3 — Tema y formularios Flutter

- [x] 4.1 Portar tema Material y widgets compartidos del origen a `presentacion/tema.dart` y componentes, sin introducir las familias web. Adaptar pruebas de componentes/contraste a los pares realmente usados y verificar controles, texto ampliado y semántica; registrar tokens implementados en DESIGN.md sin modificar la política de sesión.
- [x] 4.2 Adaptar acceso, registro, solicitud/código, nueva contraseña y activación a los componentes portados, conservando sus controladores y validaciones. Verificar tests de cada flujo, teclado/pegado/Mostrar-Ocultar, errores y ausencia de permisos o persistencia de secretos; documentar los equivalentes de origen y adaptaciones necesarias.
- [x] 4.3 Ejecutar analyze y regresión Flutter completa de P2.3, y comparar renderizado Android de formularios en estado normal/carga/error y texto 200 %. Verificar que el tema nuevo no rompe recuperación/App Links ni el acceso existente; registrar dispositivo, resolución lógica, escala y capturas sin declarar iOS probado.

## 5. P2.4 — Navegación pública y privada móvil

- [x] 5.1 Introducir shell público y variante autenticada en la composición de app.dart, respetando restauración y limpieza segura. Añadir pruebas para primera apertura sin cuenta, acceso/registro desde el shell, sesión no verificable y 401/expiración; verificar que no se crea sesión de invitado ni se consulta perfil privado sin sesión y documentar el flujo cambiado.
- [x] 5.2 Portar AppBar, Drawer y barra Inicio/Reportar/Mapa/Contactos; trasladar Mis reportes/Alertas y gestionar selección, preservación de destino y retroceso. Verificar pruebas de navegación/semántica, cierre del Drawer antes de retroceso, acceso al perfil y estados pendientes sin permisos ni endpoints futuros; actualizar guía y capturas de la navegación.
- [x] 5.3 Reproducir Inicio, Contactos, información, perfil y edición con contenido/repositorios destino, conservando teléfono opcional de cuenta y contactos aprobados. Verificar pruebas de datos, pendientes, errores y marcador explícito; comprobar que Reportar sigue sin envío y no aparece historial ajeno ni números/textos del donante como contenido aprobado; documentar superficies entregadas.
- [x] 5.4 Verificar cierre/revocación/cambio de persona, pila privada descartada y enlaces entrantes desde shell público/autenticado con suite Flutter completa; comparar Android a escala 1,0 y 200 %. Registrar por separado revisión TalkBack ejecutada o pendiente y toda diferencia observada; no declarar completada una revisión manual no realizada.

## 6. P2.5 — Aceptación integrada del incremento

- [x] 6.1 Ejecutar validación integrada API (tipos de producto/tests, build, OpenAPI, arquitectura, Jest/cobertura), web (lint/tipos/build/verificar:dist/Vitest/E2E) y Flutter (analyze/tests) sobre la revisión final. Verificar que las adaptaciones intencionales de UI no suprimen aserciones de seguridad ni fallos y registrar conteos/alcance sin reutilizar P1 como ejecución nueva.
- [x] 6.2 Completar la matriz visual para todas las superficies P2 y revisar enlaces/manifiesto/recursos/capturas; comprobar que diferencias funcionales autorizadas y desviaciones visuales están separadas y que no quedan conflictos de aceptación encubiertos. Verificar OpenSpec estricto para este cambio y diff sin errores; mantener cualquier superficie no verificada como pendiente, sin afirmar réplica completa.
- [x] 6.3 Cuando el responsable publique la revisión, comprobar CI, artefacto de cobertura y relación spec → tareas → commits de incrementos → pruebas/capturas; registrar SHA/enlace/resultados remotos reales en el informe. Verificar que la revisión aprobada contiene el alcance final; no marcar ejecución remota aprobada por inspección local ni publicar una rama por cuenta propia.

## Commits previstos

Los siguientes son límites de incrementos coherentes, no instrucciones para crear commits automáticamente. El responsable registra la spec antes del código y cada incremento incluye sus pruebas y documentación.

| Orden | Mensaje sugerido | Archivos/alcance a revisar antes de stage |
|---|---|---|
| 0 | `docs(openspec): especificar replica visual web y movil` | Solo `openspec/changes/replica-visual-web-movil/` |
| 1 | `feat(web): reproducir portada acceso y componentes del origen` | Recursos, estilos, componentes, Portada/Acceso/Activar, pruebas/E2E web; documentación y evidencia de grupos 1/2 |
| 2 | `feat(web): reproducir panel institucional por rol` | Panel/router/cuenta/campana web, catálogo API/OpenAPI si corresponde y sus pruebas; evidencia de grupo 3 |
| 3 | `feat(movil): reproducir tema y formularios de cuenta` | Tema/componentes y formularios Flutter, recursos/pubspec si aplica y sus pruebas; evidencia de grupo 4 |
| 4 | `feat(movil): integrar navegacion publica y privada de referencia` | Composición/shell/Inicio/contactos/perfil y pruebas Flutter; guía y evidencia de grupo 5 |
| 5 | `docs(p2): registrar fidelidad visual y validacion integrada` | Evidencia integrada y tareas cumplidas; correcciones funcionales van con sus pruebas en el incremento pertinente |

## Workflow follow-up

- El primer commit documental debe existir antes de implementar. Aplicación solo tras una nueva petición; no se autoriza por crear esta planificación.
- El responsable decide cuándo commitear/publicar; no alterar fechas ni construir una historia de módulos que todavía no se implementaron.
- Sincronizar specs y archivar después de revisar aceptación, evidencias y CI, mediante solicitud explícita. Conservar P0/P1 y su archivo histórico.
