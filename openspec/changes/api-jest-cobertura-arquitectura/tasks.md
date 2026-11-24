# Tasks

Estado: implementación y validación local de P1 completas; resultados y límites en informe.md. El cambio se creó con **0 tareas implementadas**, antes del código, en el commit `d4d800f`. Referencias: proposal.md, design.md y los tres deltas de specs. La línea base P0 no es una ejecución Jest. Trazabilidad: rúbrica Sprint 2 actividades 1/2/6/7, ADR-001/002, EQ-06 en el alcance limitado del verificador; sin cambios de RF de negocio.

## 1. Línea base y compatibilidad del runner

- [x] 1.1 Comprobar que estos artefactos están registrados antes del código nuevo e identificar su commit; inventariar los 28 archivos y escenarios de la línea base API (429 casos), sus hashes y spies/setup especiales. Verificar contra Git/P0 y registrar la correspondencia inicial en informe.md, sin alterar P0.
- [x] 1.2 Incorporar Jest, ts-jest y tipos compatibles con Node 22/TypeScript del proyecto, fijando versiones y lockfile; crear configuración de tests y tipos independiente sin cambiar el módulo productivo. Verificar instalación reproducible, carga de un caso existente y `test:tipos`, documentando los comandos junto con la configuración.
- [x] 1.3 Resolver en Jest el cliente Prisma TypeScript generado y el escáner .mjs mediante imports dinámicos/runtime VM, sin editar generados ni reescribir el escáner. Verificar casos existentes de configuración/contenido/repositorio y que los imports de spies no debiliten aserciones; documentar necesidad del lanzador multiplataforma.

## 2. Migración y aislamiento de pruebas

- [x] 2.1 Adaptar imports, hooks, spies y utilidades de los 28 archivos API a Jest conservando aserciones/parametrización. Verificar diff y correspondencia con los escenarios inventariados; no introducir skip/todo/only ni retirar casos para lograr éxito.
- [x] 2.2 Implementar modos completo, unidad e integración en los comandos documentados; conservar ejecución serial y cierre de recursos. Verificar con pruebas de los modos que unidad no invoca preparación de BD aun si existe .env, y que integración sin URL explícita o con sufijo inseguro falla antes de conectar, sin valores sensibles ni fallback a DATABASE_URL.
- [x] 2.3 Adaptar el setup para preparar una vez la BD aislada y aplicar migraciones; ejecutar unidad e integración completas con PostgreSQL de pruebas. Verificar los 429 escenarios previos, sus pruebas nuevas de control y que un fallo de aserción/selección sin pruebas devuelva código no cero sin forceExit; registrar resultados y diferencias de conteo justificadas.
- [x] 2.4 Retirar Vitest/configuración anterior únicamente de API cuando los comandos Jest estén validados, conservando el runner web y los contratos vigentes. Verificar manifiesto/lockfile, tipos/build/OpenAPI y documentación API actualizada, sin referencias ejecutables al runner anterior en esa suite.

## 3. Cobertura reproducible

- [x] 3.1 Configurar cobertura V8 de fuentes propios, incluidos los no ejercitados, excluyendo generados/dependencias/pruebas y declarando alcance de scripts API. Verificar con un caso aislado que un archivo propio no importado permanece en el reporte; documentar exclusiones sin añadir umbral global arbitrario.
- [x] 3.2 Añadir `test:cobertura` con suite completa y reportes HTML/LCOV/JSON-summary en coverage ignorado por Git. Verificar estructura y existencia de formatos, métricas de líneas/sentencias/funciones/ramas y ausencia de configuración privada; registrar métricas reales en el informe sin versionar todo coverage.

## 4. Límites arquitectónicos

- [x] 4.1 Implementar analizador con parser/resolución TypeScript para imports/exports de valores/tipos, require e import dinámico literal, incluidas rutas de utilidades compartidas. Verificar fixtures válidos, inválidos y comentarios; declarar las limitaciones de destinos computados sin equipararlas a cumplimiento demostrado.
- [x] 4.2 Aplicar reglas de dirección de capas, clientes/proveedores prohibidos y acceso intermodular por interfaz pública con excepciones de composición explícitas. Verificar casos que intenten eludirlas mediante tipos, reexports o utilidades compartidas y confirmar que composición legítima y módulos sin capas vacías no generan falsos positivos.
- [x] 4.3 Publicar `arquitectura:verificar` con diagnóstico archivo/import/regla y código no cero ante infracción. Verificar CLI contra fixtures temporales válidos/inválidos y contra fuentes reales; documentar comando, reglas y alcance limitado respecto de EQ-06 sin insertar infracciones en producto.

## 5. Integración continua y artefactos

- [x] 5.1 Actualizar job API para tipos productivos/de tests, build, OpenAPI, arquitectura y Jest/cobertura con PostgreSQL efímero. Verificar pruebas de configuración del workflow, YAML válido y preservación de jobs web/Flutter/secretos, permisos mínimos, SHA de acciones y ausencia de secretos requeridos.
- [x] 5.2 Añadir publicación de reportes con acción fijada a SHA, retención 14 días y condición que conserve archivos disponibles aun al fallar pruebas. Verificar selección exacta, comportamiento sin reportes y que no se cambie el estado fallido ni se suban .env/logs/BD/dependencias; documentar obtención del artefacto y el estado no verificado de GitHub si no se ejecutó allí.

## 6. Verificación integrada y evidencia del incremento

- [x] 6.1 Ejecutar tipos, build, contrato, arquitectura, unidad, integración y cobertura final; comprobar regresión web/Flutter pertinente a los cambios de CI y secretos. Verificar que los archivos fuente de negocio no cambian para elevar cobertura y que no hay pruebas omitidas respecto de P0; repetir solo ante cambios/fallos nuevos que lo justifiquen.
- [x] 6.2 Completar informe.md con commit de especificación, revisión implementada o diff local, versiones, comandos, correspondencia de escenarios, resultados, métricas, ejemplos negativos y límites local/remoto. Verificar enlaces/artefactos, diff limpio y tareas realmente cumplidas; mantener el cambio abierto si falta un criterio, sin declarar ejecución remota o cobertura que no se haya observado.

## Workflow follow-up

- Registrar primero el commit documental de estos artefactos antes de la implementación; los commits posteriores incluyen código y pruebas del mismo incremento. No se ejecutan commits por crear esta planificación.
- Publicación de rama/PR y ejecución real de GitHub Actions cuando el responsable la solicite; conservar su evidencia sin confundirla con inspección local del workflow.
- Revisar aceptación, sincronizar specs y archivar solo cuando se solicite y se cumplan los criterios; no reescribir el archivo de la entrega web anterior.
