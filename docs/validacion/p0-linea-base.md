# P0 — Línea base y preparación de commits

Fecha: 23 de noviembre de 2026 (America/Lima).

Estado: **inventario, revisión y validación local completados**. No se hicieron commits, push, despliegues, importación de módulos ni archivado de OpenSpec. El cambio web existente sigue abierto; esta línea base no acredita aceptación global de sus tareas pendientes.

## Punto de partida

- Repositorio destino: AyniSafe-App; rama `main`.
- HEAD: `73d22edce985236b137d9beb47c839de4667a80a` (`docs(openspec): archivar perfil-navegacion-movil y sincronizar specs`).
- Índice Git vacío antes y al finalizar la preparación; no se seleccionaron archivos del usuario para commit.
- Inventario previo: **114 archivos**, 41 modificados y 73 nuevos. Hay API, contenido público v2, compatibilidad móvil, web, CI, artefactos OpenSpec y documentación de acuerdos. No son 114 archivos importados del origen.
- [Inventario de rutas, grupos y SHA-256](p0-inventario.json): captura de esos archivos tras la conciliación documental P0; excluye este informe y el propio inventario para evitar referencias circulares. Las huellas permiten reconocer la revisión local inspeccionada, no prueban una secuencia histórica de autoría.
- Las dependencias de API/web y la configuración Flutter ya estaban presentes. No se reinstalaron paquetes ni se modificaron dependencias para preparar P0.
- Entorno local: Windows, Node `v24.21.0`, npm `11.19.0`, Flutter `3.47.7`, Dart `3.13.5`. CI declara Node 22; la ejecución remota con ese entorno sigue pendiente.

## Verificaciones ejecutadas nuevamente

| Área | Comandos o procedimiento | Resultado de P0 |
|---|---|---|
| API: tipos | `npm run typecheck` en `apps/api` | Correcto |
| API: compilación | `npm run build` | Correcto |
| API: contrato | `npm run contrato:validar` | OpenAPI 3.1.0 válido; 16 operaciones, contrato de aplicación 0.4.0 |
| API: unidad | `npm run test:unidad`, desactivando `TEST_DATABASE_URL` solo para ese proceso | 10 archivos, 157 pruebas correctas; subconjunto de la suite completa, no sumar dos veces |
| API: unidad/integración | `npm test` con PostgreSQL local aislado y base `*_test` | 28 archivos, 429 pruebas correctas |
| Web | `npm run lint`, `typecheck`, `build`, `verificar:dist`, `test` en `apps/web` | Todo correcto; 9 archivos, **104 pruebas** |
| Flutter | `flutter --version`, `flutter analyze`, `flutter test --reporter expanded` en `apps/mobile` | Análisis sin problemas y **237 pruebas correctas** |
| E2E local | `node e2e/local.mjs` en `apps/web`, Chrome sin interfaz, API real, PostgreSQL de pruebas y proxy Vite | **31/31 comprobaciones correctas** |
| Secretos | `escanearRepositorio()` del script existente, recibiendo explícitamente `git ls-files --cached --others --exclude-standard` | Sin hallazgos en 325 archivos candidatos antes de añadir los dos artefactos P0; escaneo final posterior registrado abajo |
| Formato del diff | `git -c core.safecrlf=false diff --check` | Sin errores de whitespace |

Las suites API/web siguen usando Vitest: estos resultados no cumplen por equivalencia el requisito explícito de Jest/cobertura. Su adaptación es P1. No se generó cobertura ni se ejecutó carga de 2.000 VU en P0. Tampoco se ejecutó `integration_test` Flutter en dispositivo, TalkBack, pruebas de proveedores reales o validación visual de la réplica del origen.

### Condiciones de ejecución

Se comprobó sin imprimir credenciales que la URL de pruebas apunta a un host local y a una base cuyo nombre termina en `_test`. El clúster propio `apps/api/.pgdata` en `127.0.0.1:5433` estaba apagado. Su arranque desde el sandbox falló al crear el proceso; con la ejecución autorizada fuera del sandbox se inició correctamente. Las suites y el e2e operaron exclusivamente sobre la base de pruebas desechable; no se ejecutaron contra el proyecto de origen o un servicio publicado.

Flutter no podía abrir el lockfile del SDK dentro del sandbox. Se canceló únicamente el lanzador propio de esta verificación que quedó esperando; no se borró la caché ni se detuvieron procesos Flutter del usuario. La ejecución autorizada con acceso a la caché completó análisis y pruebas.

El primer e2e dentro del sandbox terminó con API no disponible y 0/1 comprobaciones; no se contabiliza como éxito. La repetición fuera del sandbox terminó con 31/31. Los procesos API/Vite/Chrome propios del e2e se cerraron mediante su limpieza. El clúster PostgreSQL iniciado para estas pruebas se devuelve al estado apagado al cerrar P0; la comprobación final se registra abajo.

No se volcaron archivos `.env`, tokens, claves ni cadenas de conexión. El escáner no sustituye una revisión de seguridad completa; su alcance son patrones reconocibles y archivos candidatos a versionar.

## Revisión de la entrega existente

Cambio activo: `openspec/changes/web-publica-acceso-institucional/`; creado según su metadata el 21/11/2026. El informe anterior conserva resultados del 21–22/11; la presente ejecución no cambia sus fechas.

Pendientes que impiden declarar completo el cambio:

| Tarea | Estado y motivo |
|---|---|
| 1.1 | Sin ejecutar el ensayo real de rewrite Vercel→Render, arranque en frío y cabeceras. |
| 1.2 | Sin verificar IP y confianza de proxies en esa infraestructura. |
| 9.3 | Sin ejecución real de CI en GitHub ni pruebas deliberadas de sus fallos; requiere publicación de rama/PR, no realizada en P0. |
| 10.2 | Suites locales correctas, pero no se cumple literalmente que ninguna prueba anterior haya cambiado. El informe enumera cambios de fixtures/configuración/contenido/rutas. Se desmarcó la tarea hasta conciliar ese criterio y su evidencia. No se elimina cobertura ni se altera historial para aparentar cumplimiento. |

Otros límites documentados: revisión manual con lector de pantalla, envío de correo desde Render, contenido del piloto y gestión de operadores. `vercel.json` conserva el marcador no válido `api-render-pendiente.invalid`; no está listo para publicar directamente. No se reemplazó ese marcador ni se fijó `TRUST_PROXY_HOPS` sin ensayo.

Las specs archivadas no fueron modificadas en P0. La propuesta y los specs del cambio activo describen el incremento anterior, no la nueva UI elegida ni el futuro registro de incidentes. Esas adaptaciones necesitan nuevos deltas; no se reescribe el historial para afirmar que ya estaban implementadas.

## Grupos concretos de commits

Las rutas exactas se encuentran en el campo `grupo` del inventario. Orden propuesto; aún no hay commits y cada selección se revisa antes de registrarse.

| Grupo | Archivos del inventario | Contenido y mensaje orientativo | Dependencias |
|---|---|---|---|
| G1 | 10 | Metadata, proposal, design y specs existentes del cambio web. `docs(openspec): registrar especificación del acceso institucional existente` | Es conciliación de trabajo ya realizado, no prueba de especificación escrita antes de su implementación. No incluye tasks completadas ni informe de resultados. |
| G2 | 42 | API institucional, seguridad, bootstrap/reinicio, configuración, contrato, contenido v2 y sus pruebas; fixtures y pruebas de tolerancia móvil. `feat(identidad): integrar acceso institucional y contenido público v2` | Después de G1. Mantiene pruebas con código y contrato. Excluye `repositorio.test.ts` porque depende de CI/escáner. |
| G3 | 38 | `apps/web/` completo: código, lockfile, configuración, pruebas, e2e y README. `feat(web): incorporar portada y panel institucional mínimo` | Depende de G2. Es la UI anterior de AyniSafe; no afirmar que ya replica el origen. |
| G4 | 4 | `.github/workflows/ci.yml`, `scripts/escanear-secretos.mjs`, `apps/api/test/unidad/repositorio.test.ts`, README móvil sobre CI. `ci: verificar API web y Flutter y escanear secretos` | Después de G2/G3. La prueba de repositorio lee el workflow y el escáner al importarse: los tres van juntos. El workflow necesita que la web ya esté presente. |
| G5 | 4 | Tasks/informe del cambio, README de API y revisión de consistencia. `docs(validacion): conciliar evidencia y pendientes de acceso institucional` | Después de código/CI; refleja los pendientes reales. No archiva ni marca completado lo que requiere recursos externos. |
| G6 | 16 + 2 artefactos P0 | Acuerdos de producto, arquitectura/flujo, DESIGN/PRODUCT/AGENTS, rúbrica, plan, README raíz y guía de ejecución; informe e inventario P0. `docs: fijar acuerdos y plan de integración incremental` | Después de G5 para que las referencias de README estén disponibles. Explica el producto futuro elegido sin atribuírselo al código actual. |

Los 114 archivos previos pertenecen exactamente a un grupo. README raíz y guía UI mezclan referencias de la entrega anterior con acuerdos nuevos: se conservan completos en G6, no se vuelven a copiar a otro commit. El inventario no incluye dependencias, build/dist, `.pgdata`, correos o secretos ignorados.

La revisión de dependencias anterior se hizo sobre el árbol local completo. No se ha ejecutado cada grupo como un commit aislado en un checkout limpio: al preparar los commits, verificar cada estado intermedio con sus comprobaciones pertinentes. Si un contrato exige juntar cambios, ajustar el límite del commit antes de registrarlo, sin generar estados deliberadamente rotos.

Usar rutas explícitas o selección de hunks, revisar `git diff --cached` y evitar `git add .`. Se propone registrar estos grupos con fechas reales; no reconstruir una historia anterior ni presentar código reutilizado como creación desde cero. Para incrementos nuevos de P1 en adelante, el commit de especificación debe preceder a la implementación de ese incremento.

## Correcciones documentales de P0

- README raíz: la dirección gráfica ya está elegida; falta reproducir/verificar, no volver a elegir estilo.
- Tasks del cambio: se elimina la afirmación falsa «todas pendientes» y se corrige el estado de 10.2, conservando el criterio original y su discrepancia visible.
- Informe del cambio: se añade referencia fechada a esta verificación sin borrar la evidencia histórica.
- Plan: enlaza esta línea base y distingue preparación local de aceptación/publicación.

No se cambió código de aplicación ni pruebas para hacer pasar la línea base.

## Cierre local

- Suites: 429 API + 104 web + 237 Flutter = **770 pruebas correctas**; e2e local adicional 31/31. Las 157 unitarias API ya están dentro de las 429.
- Escaneo final de candidatos a versionar: **327 archivos, sin hallazgos**, incluyendo los dos artefactos P0 nuevos.
- Estado final del clúster iniciado por P0: **detenido**, comprobado con `pg_ctl status` («no server running»); estado apagado original restaurado.
- Selección de archivos, commits y push: no realizados.
- Siguiente acción: revisar y registrar los grupos G1–G6 cuando se solicite; después crear la especificación de P1 (Jest/cobertura) antes de implementarla. La aceptación del cambio anterior conserva los cuatro pendientes enumerados.
