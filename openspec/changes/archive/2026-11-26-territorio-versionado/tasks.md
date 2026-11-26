# Tasks

Estado: aplicación P3.1 y validación local completadas el 25/11/2026; evidencia en `docs/validacion/p3-territorio.md`. CI aprobado en GitHub Actions sobre 0f2366a (PR #2, run 45729215123: API, Flutter, web y escaneo de secretos). Proposal y spec definen alcance; design documenta decisiones técnicas. P3.2 continúa después con organización. Las casillas corresponden a código y evidencia ejecutada, no a la mera existencia del plan.

## 1. Procedencia y datos territoriales

- [x] 1.1 Registrar revisión destino y donante, árbol de trabajo y rutas candidatas en `docs/validacion/p3-territorio.md`; crear manifiesto de recursos con SHA-256 del GeoJSON leído y metadatos originales. Verificar que no se modificó el donante ni se confunden hashes declarados con archivos contrastados.
- [x] 1.2 Contrastar el paquete INEI o su archivo oficial identificable, condiciones de uso, CRS y los cinco UBIGEO; documentar evidencia reproducible y fechas diferenciadas. Actualizar documento 10 únicamente para datos efectivamente verificados; si falta contraste, mantener activación real pendiente y explicar la limitación.
- [x] 1.3 Incorporar únicamente el paquete territorial autorizado para reutilización, manifiesto y documentación del comando de validación; añadir fixtures sintéticos identificados y casos de correspondencia de cinco distritos. Verificar hashes/códigos/CRS mediante Jest, sin presentar esos tests como contraste externo.

## 2. Núcleo territorial y contratos

- [x] 2.1 Añadir tipos de punto, catálogo, snapshot y resultado, validación estricta de coordenadas y contrato público de aplicación en Consultas; probar en Jest ausencias, tipos incorrectos, límites de rango, números no finitos y rechazo de campos desconocidos. Documentar DTO y versión en el informe.
- [x] 2.2 Implementar validación Polygon/MultiPolygon y bbox con pruebas Jest de anillos abiertos, degenerados, auto-intersecciones, huecos inválidos y geometrías admitidas; si se añade dependencia, verificar documentación primaria y registrar versión/decisión.
- [x] 2.3 Implementar punto-en-polígono puro con bbox y tolerancia definida en design; probar interiores, múltiples componentes, huecos, vértices/bordes, ambos lados de tolerancia, solapamientos entre distritos y orden de entrada. Documentar que la tolerancia no representa precisión GPS.
- [x] 2.4 Añadir casos de uso de catálogo, límites por versión y resolución con repositorio inyectado; verificar con Jest sustitución, versión ausente, falta de activa y error de repositorio. Ejecutar arquitectura para confirmar ausencia de tecnología en capas internas y exportación por fachada.

## 3. Persistencia e importación reproducible

- [x] 3.1 Añadir modelos/migración aditiva Distrito, VersionTerritorial, GeometriaDistrital y EstadoTerritorial con FK/unicidad/CHECK y cinco distritos sin códigos inventados; probar migración en BD vacía y aislada, y regresión de Identidad sin cartografía. Documentar estado inicial/rollback sin borrar datos.
- [x] 3.2 Implementar repositorio Prisma y lectura de snapshot consistente, inyectado desde composición sin importar internos de Identidad; probar en PostgreSQL catálogo pendiente, límites/versiones, restricciones y lecturas bajo activación concurrente. Documentar consulta y transacción utilizadas.
- [x] 3.3 Adaptar cargador del origen a validación/normalización, digest semántico y CLI con simulación; probar con Jest digest estable ante orden/fechas locales y rechazo de contenido/procedencia inválidos. Documentar opciones con ejemplos sin secretos.
- [x] 3.4 Implementar importación idempotente y activación explícita bajo transacción/bloqueo, más restauración a versión existente; verificar en PostgreSQL repetición, dos cargadores concurrentes, fallo antes de commit, ausencia de filas parciales y conservación de versiones previas. Documentar resultados reales.
- [x] 3.5 Ejecutar simulación e importación del paquete contrastado y verificar los cinco distritos mediante puntos de referencia independientes; registrar fuente de cada punto, versión/hash y resultados. Si no se obtuvo evidencia de 1.2, conservar esta tarea pendiente y no activar fixtures como datos reales.

## 4. REST y OpenAPI

- [x] 4.1 Añadir rutas públicas de catálogo y límites descritas en design, consulta opcional por versión, HEAD/405 y errores estables; actualizar OpenAPI en el mismo incremento. Verificar con Jest HTTP real contra PostgreSQL 200/404/405/503 y mismo cuerpo público sin sesión y con los tres roles; conservar contenido público existente.
- [x] 4.2 Añadir POST de resolución con body estricto, `no-store` y sin persistencia de coordenadas; actualizar esquemas/ejemplos OpenAPI. Verificar HTTP 200/400/404/405/422/503, versión explícita y omisión de ubicación en errores/logs/URL; GET no debe resolver puntos.
- [x] 4.3 Implementar máximo 4 KiB y limitador 60/IP/minuto por instancia con HMAC/caducidad/máximo de claves según design; probar Jest 413/429/Retry-After, expiración, saturación y uso de IP con proxy confiable. Documentar alcance por instancia y comprobar que no altera límites de acceso.
- [x] 4.4 Validar contrato OpenAPI y ejecutar pruebas que contrasten respuestas/esquemas de cada endpoint; documentar comandos reproducibles y errores. Confirmar que los métodos públicos no crean cuentas, incidentes ni asociaciones institucionales.

## 5. Aceptación integrada y preparación de P3.2

- [x] 5.1 Ejecutar en API typecheck, `test:tipos`, build, `arquitectura:verificar`, `contrato:validar` y `test:cobertura`; conservar reportes con comandos, versiones, BD aislada y SHA/estado local. Registrar fallos y resultados nuevos sin reutilizar P1/P2 como validación de este incremento.
- [x] 5.2 Medir consultas de snapshot con los cinco distritos y geometrías reales cargadas: volumen, EXPLAIN (ANALYZE, BUFFERS), latencia y entorno. Documentar política sin caché de aplicación y sus límites; no atribuir resultados a incidentes/carga 2.000 VU.
- [x] 5.3 Completar matriz spec/escenario → RF/HU/EQ → prueba → resultado en `docs/validacion/p3-territorio.md`; distinguir EQ-11 backend de formulario manual/GPS y mapas pendientes. Verificar que P3.2 conserva RF28/29/30, EQ-09/12 y alta atómica de sede/operador, sin presentarlos como cubiertos por P3.1.
- [x] 5.4 Ejecutar OpenSpec estricto y `git diff --check`, revisar compatibilidad de contenido/identidad y consistencia entre paquete/manifiesto/documento 10/OpenAPI. Si el responsable publica la revisión, comprobar CI y enlazar artefactos de esa revisión; en caso contrario registrar CI pendiente sin afirmar aprobación remota.

## Workflow follow-up

- La planificación no implementa estas tareas. Solicitar aplicación del cambio en una nueva petición según el flujo `openspec-propose`.
- El responsable decide cuándo registrar/publicar commits. No crear historia ficticia, modificar el donante ni reescribir cambios archivados.
- Una vez aceptada la capacidad, sincronizar/archivar solo por solicitud explícita. Preparar después el cambio P3.2 de instituciones/sedes/coberturas y operadores con invitación, reutilizando territorio e Identidad.
