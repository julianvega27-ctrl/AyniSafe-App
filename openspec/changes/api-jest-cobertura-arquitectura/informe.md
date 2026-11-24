# Informe P1 — Jest, cobertura y arquitectura

Inicio: 23/11/2026. Cierre local inicial: 24/11/2026. Estado: implementación local validada; la primera ejecución remota falló y tiene correcciones en seguimiento al final de este informe.

## Especificación previa y línea base

Commit de especificación: `d4d800f` (registrado antes de editar código de P1). Punto de aplicación limpio. Se releyeron propuesta, tres specs, diseño y tareas con OpenSpec en estado ready y 0/16 tareas completas.

La captura nueva de Vitest sobre PostgreSQL local aislado confirmó **28 archivos, 429 casos, cero fallos** antes de migrar imports/aserciones. [Inventario](inventario-pruebas.json): rutas, hashes originales, nombres expandidos y aserciones extraídas con parser TypeScript para contrastar la migración. P0 no fue sobrescrito. El reporte bruto local se ignora en Git.

Dependencias consultadas en npm: Jest/@jest/globals 30.5.2, ts-jest 29.4.15 y @types/jest 30.0.0; los peers de ts-jest admiten Jest 30 y TypeScript 5.9.3. Se fijaron versiones y lockfile. La salida de instalación no equivale a compatibilidad ejecutada ni aceptación de las tareas posteriores.

## Incidencias del entorno

El clúster local ya estaba activo en 127.0.0.1:5433; `pg_ctl status` dentro del sandbox no lo identificaba correctamente. Se comprobó conexión solo a la URL local `_test` sin imprimirla. No se borró postmaster.pid ni se alteraron permisos/logs existentes. No detener el clúster al finalizar, porque no fue iniciado por P1.

La primera captura ejecutó la suite pero el reporter no pudo guardar su salida por una ruta relativa incorrecta. Se corrigió dentro del repositorio y se repitió correctamente para obtener el inventario. No se atribuye éxito al intento que terminó con error de reporte.

## Implementación y compatibilidad

### Compatibilidad ya comprobada durante la migración

`test:tipos`, tipos productivos, build y OpenAPI pasan. Los casos seleccionados de contenido/configuración/repositorio/Argon2 pasan (51); integración seleccionada con Prisma y BD real pasa (56). La compatibilidad ESM se resuelve con puente nativo cjs y VM modules; un entorno Jest conserva la identidad Error de Node para errores de fetch/AbortSignal. El timeout real del adaptador Gmail conserva su aserción TIEMPO_AGOTADO sin modificar el adaptador.

La configuración aislada inicial reveló const enums de @node-rs/argon2: se usa compilación CommonJS con programa completo y typecheck Node16 estricto separado, documentado en design.md. Ocho llamadas expect de dos argumentos conservan sus mensajes mediante expectConContexto, no eliminando las comprobaciones. La revisión AST conserva 1129/1130 expresiones anteriores tras normalizar wrappers y aserciones de tipos. La restante conserva la misma comprobación de no filtrar secreto en config-web, ahora sobre una variable mensaje; se añadió una aserción explícita de que hubo error para evitar que el propio fallo de expect.unreachable fuera capturado como supuesto error de configuración. También se completó un doble CuentasPort y se añadió una aserción no nula para passwordHash, sin debilitar escenarios.

Una primera ejecución completa de cobertura tuvo 460 casos aprobados, pero código de salida 1 por un consumidor de correo que seguía consultando tras el teardown de institucional.test.ts. No se registra ese intento como validación aprobada. El arnés de integración ahora detiene y espera todos los gestores creados antes de desconectar sus clientes, conservando los escenarios y sin forceExit. La repetición final terminó con salida 0, sin ese error posterior ni aviso de recursos pendientes.

Jest detectó además el timeout perdedor de Promise.race en el CLI de aprovisionamiento: el envío terminaba pero el temporizador mantenía el proceso vivo. Se cancela ese recurso en finally manteniendo el mismo límite, salida y operaciones de cuenta; no cambia una regla de negocio ni se añade forceExit. La suite original de CLI se usa para verificarlo. Esta es la única adaptación de código de ejecución prevista para limpieza de recursos, no para elevar cobertura.

## Resultados finales observados

Revisión implementada: diff local respecto del commit de especificación `d4d800ff65fd8a27abf8e9055337ff84ee4c8908`. No hay commit de implementación creado por el agente. Entorno local: Windows, Node 24.21, npm 11.19, PostgreSQL local de pruebas; Flutter 3.47.7 y Dart 3.13.5. CI mantiene Node 22: la compatibilidad declarada de dependencias lo admite, pero esta ejecución local no demuestra una ejecución sobre Node 22.

| Verificación | Resultado observado |
|---|---|
| `npm ci` en API | Instalación reproducible y generación Prisma 7.10.1 correctas |
| `npm run test:tipos` y `npm run typecheck` | Salida 0, tipos de pruebas y producto |
| `npm run build` y `npm run contrato:validar` | Salida 0; 16 operaciones OpenAPI válidas |
| `npm run arquitectura:verificar` | 68 fuentes, cero infracciones estáticas y cero destinos computados |
| `npm run test:unidad` | 12 archivos, 188 pruebas aprobadas |
| Integración focalizada tras corregir limpieza (`institucional` y `aprovisionamiento`, `--detectOpenHandles`) | 62 pruebas aprobadas, salida 0 |
| `npm run test:cobertura -- --json --outputFile=../../openspec/changes/api-jest-cobertura-arquitectura/.jest-final.local.json` | 30 archivos, **460 aprobadas**, cero omitidas/fallidas; salida 0; 134,083 s |
| Regresión web | 104 pruebas aprobadas; Vitest web conservado |
| Regresión Flutter | Análisis sin problemas y 237 pruebas aprobadas |
| OpenSpec `validate api-jest-cobertura-arquitectura --strict` | Cambio válido |
| Escáner de secretos sobre versionados y nuevos no ignorados | 354 archivos, cero hallazgos; sin imprimir valores |
| `git diff --check` | Salida 0 |

La ejecución completa de cobertura incluye todas las pruebas unitarias y de integración sobre la base aislada. [Correspondencia final](correspondencia-regresion.json): se conservan por archivo y nombre expandido los **429 casos originales**, y se agregan 31: 18 de arquitectura, 12 de modos/aislamiento y uno de artefactos CI. No se añadieron skip/todo/only ni forceExit. Vitest y su configuración fueron retirados únicamente de API.

Los controles negativos verifican salida no cero ante aserción fallida, selección vacía, selección completamente omitida e infracción arquitectónica. También comprueban rechazo de URL ausente/insegura antes de conectar y ausencia de fallback a DATABASE_URL. Los fixtures de arquitectura cubren imports de tipos, reexports, utilidades compartidas, proveedores, alias y composición válida. Los destinos calculados se declaran como límite del análisis; cero infracciones estáticas no demuestra todos los atributos EQ-06 ni el comportamiento de dependencias creadas en ejecución.

## Cobertura medida

| Métrica | Cubiertos / total | Porcentaje |
|---|---|---|
| Líneas | 4529 / 5278 | 85,80 % |
| Sentencias | 4529 / 5278 | 85,80 % |
| Funciones | 274 / 296 | 92,56 % |
| Ramas | 1195 / 1331 | 89,78 % |

Se verificaron archivos no vacíos en [HTML](../../../apps/api/coverage/index.html), [LCOV](../../../apps/api/coverage/lcov.info) y [JSON-summary](../../../apps/api/coverage/coverage-summary.json). Se generan localmente y están ignorados por Git; estos enlaces requieren ejecutar cobertura en el checkout. El resumen numérico reproducible se conserva en correspondencia-regresion.json. Se incluyen fuentes no ejercitadas, por ejemplo `src/main.ts` y varios comandos de `scripts/`. Alcance: `src/**/*.ts` y scripts API TS/CJS/MJS; exclusiones explícitas: generados, declaraciones, pruebas y spike desechable `scripts/spike-render/`. No se fijó umbral global arbitrario ni se modificaron reglas de negocio para elevar el resultado.

## CI, documentación y límites

El workflow ejecuta tipos de producto/pruebas, build, OpenAPI, verificación arquitectónica y Jest con cobertura sobre PostgreSQL efímero. YAML válido y pruebas de configuración aprobadas; se preservan jobs web, Flutter y escaneo de secretos. La acción de artefactos está fijada a SHA y selecciona únicamente `apps/api/coverage/`, con retención de 14 días. Usa `always()` junto con existencia de reportes para conservar evidencia disponible aunque falle la suite; sin reportes informa su ausencia y no convierte el fallo previo en éxito. Una vez ejecutado GitHub Actions, el artefacto se obtiene desde la ejecución del workflow, sección Artifacts, nombre `api-cobertura-<sha>`.

En el cierre local original todavía no se había ejecutado GitHub Actions: configuración y comprobación local no acreditaban subida o descarga remota. El seguimiento posterior registra la primera ejecución y sus fallos. Los comandos, preparación segura, reglas y limitaciones se documentan en el [README API](../../../apps/api/README.md).

La instalación informó 21 vulnerabilidades de dependencias (18 moderadas y 3 altas). La revisión de producción identificó tres altas en la cadena Prisma/@prisma/config/effect; sus versiones ya existían en el lockfile del commit de especificación. No se aplicó la propuesta automática de downgrade mayor de Prisma, que requiere un cambio y validación propios. Este resultado permanece como deuda y no se declara resuelto por P1.

P1 aporta evidencia local para la rúbrica de Jest/cobertura y límites arquitectónicos actuales. No implementa módulos del donante, no modifica UI, no acredita carga de 2000 usuarios ni completa los demás atributos de calidad del Sprint 2. P0 y specs archivadas permanecen intactos. El agente no creó commits, publicó ramas ni archivó este cambio.

## Seguimiento de la primera ejecución remota (24/11/2026)

El responsable registró la implementación en `b729fd4` y su evidencia en `d85d507`. La [ejecución 45464892595](https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/45464892595), sobre `d85d507a0a994048410fc3c2ed63a14ba7040b2a`, terminó con API y Flutter fallidos; web y secretos aprobados. Se leyeron los logs completos mediante GitHub CLI. Este resultado no se considera aceptación de P1 en CI.

| Fallo observado | Corrección aplicada |
|---|---|
| API: `Must use import to load ES Module` en Swagger Parser; Jest sobre Node 22 no carga su dependencia ESM mediante require | Desreferenciación con el mismo parser en `test/leer-contrato.mjs`, ejecutado con Node nativo. Las siete pruebas de contrato conservan sus aserciones HTTP. No se cambia CI a Node 24 para ocultar la incompatibilidad. |
| API: el caso del límite de recuperación por IP esperaba que el conteo de tokens no cambiara, pero había correo anterior todavía en curso (1 → 2) | Sincronizar cada solicitud permitida con el reposo de su cola antes de la fotografía de referencia; esperar también tras el rechazo. Conservar 429, Retry-After y la comprobación de que no hay nuevos envíos/tokens. No se amplía el umbral ni se elimina la aserción. |
| Flutter: falta `android/app/src/main/AndroidManifest.xml`, también usado al cargar enlaces_cuenta_test.dart | El patrón global `android/` provenía de Expo y excluía toda la plataforma Flutter. Limitarlo a `/android/` permite versionar las fuentes Android existentes, con sus permisos/App Links/Gradle. Propiedades locales, firmas y compilaciones permanecen ignoradas. Se agrega un control de regresión para esa distinción. |

La API remota informó 452 pruebas aprobadas y una fallida; una suite completa no pudo cargar. Flutter informó 225 aprobadas y dos fallos (uno de carga, que impidió descubrir sus demás casos). Los avisos de paquetes Flutter con versiones nuevas no fueron la causa del fallo.

Se comprobó mediante la API de GitHub que el artefacto `api-cobertura-d85d507a0a994048410fc3c2ed63a14ba7040b2a` se publicó aun con la suite fallida: 285662 bytes, no vencido al consultar. Esto acredita publicación de evidencia de una ejecución fallida, no cobertura de todas las pruebas ni aceptación. No se descargó ni se auditó su contenido.

Verificaciones de la corrección: tipos de tests y 23 controles de repositorio aprobados con Node 22.23.5; Flutter analyze sin problemas y 237 pruebas aprobadas en copia limpia de los archivos versionables (incluyendo Android y `apps/shared/vectores-validacion.json`). Una primera copia omitía ese fixture compartido; se completó y repitió la suite, sin alterar la prueba ni contar ese intento fallido como éxito.

Suite completa de API ejecutada mediante `node scripts/ejecutar-pruebas.cjs cobertura` con Node 22.23.5 y PostgreSQL aislado: **30 archivos, 461 aprobadas, cero fallidas/omitidas, salida 0**, en 153,941 s. Conserva por archivo y nombre los 429 casos de la línea base; añade un control de archivos Android respecto de las 460 de P1. Resultado y métricas separados de la validación original en [resultado de corrección](resultado-correccion-ci.json): líneas/sentencias 4524/5278 (85,71 %), ramas 1192/1329 (89,69 %), funciones 278/300 (92,66 %). Estos valores corresponden a Node 22; no sustituyen retroactivamente las mediciones anteriores con Node 24.

El verificador sigue informando 68 fuentes y cero infracciones estáticas/destinos calculados. Escaneo final de 374 archivos candidatos sin hallazgos, diff sin errores de espacios y validación estricta OpenSpec aprobada. No se modificó código productivo en esta corrección. El clúster local estaba detenido, se inició para estas pruebas y se detuvo al terminar. La corrección permanece sin commit/push del agente: **falta una nueva ejecución remota sobre el commit corregido** antes de dar CI por aprobado.

## Seguimiento del fallo concurrente de aprovisionamiento (24/11/2026)

La [segunda ejecución remota 45470888975](https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/45470888975), sobre `221e914df658a3aef7d353f3eb94d0025e8f0723`, aprobó Flutter, web y secretos; API terminó con 460 pruebas aprobadas y una fallida: dos altas simultáneas del mismo correo. Los errores anteriores de Swagger y archivos Android ya no aparecen. Las validaciones locales anteriores no demostraban ausencia de esta carrera: la colisión dependía de cuándo la segunda transacción leía la cuenta.

Se fortaleció el caso existente mediante una barrera: ambas transacciones realizan el SELECT real y observan ausencia antes de permitir sus INSERT reales. No se sustituyen respuestas SQL ni se serializan las altas. Con esta barrera se reprodujo el fallo local antes de corregir producto: SQLSTATE `23505` de la restricción de correo único.

La inspección de códigos (sin datos de cuenta) confirmó `P2010`, `meta.code` ausente y `meta.driverAdapterError.cause.originalCode = 23505`. El detector existente solo reconocía P2002 o meta.code; por eso no ejecutaba el reintento ya previsto. Ahora reconoce también esa forma exacta de Prisma 7/adapter-pg. Se conserva el máximo de un reintento de la transacción completa; no se ignoran errores ni se reintenta cualquier P2010. La segunda transacción vuelve a leer/bloquear la cuenta confirmada y devuelve reencolada. No cambian roles, permisos, esquema, invitación única ni rutas.

Tras la corrección, tipos de pruebas y las 32 pruebas completas de aprovisionamiento pasaron con Node 22.23.5, incluida la colisión forzada. Tipos productivos, build, 16 operaciones OpenAPI y verificación arquitectónica (68 fuentes, cero infracciones estáticas/destinos calculados) también pasaron.

La suite completa con cobertura terminó con **30 archivos, 461 pruebas aprobadas, cero fallidas/omitidas y salida 0**, en 107,074 s. Se conservan los 429 nombres de casos de la línea base. Cobertura de esta revisión: líneas/sentencias 4541/5287 (85,88 %), ramas 1204/1339 (89,91 %) y funciones 278/300 (92,66 %). [Resultado de concurrencia](resultado-concurrencia-ci.json) conserva el resumen sin sobrescribir las evidencias previas. No se repitieron web/Flutter: sus jobs remotos aprobaron y esta corrección solo modifica la API y su evidencia. La nueva validación remota requiere otro commit/push del responsable.
