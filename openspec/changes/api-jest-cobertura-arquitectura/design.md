# Design

## Context

Motivación en proposal.md. Base Git limpia inspeccionada: `a9b6242`. P0 registra 28 archivos/429 pruebas de API con Vitest, 104 web y 237 Flutter; solo las de API cambian de runner. Backend TypeScript estricto, módulo Node16/CommonJS, Prisma generado en TypeScript con referencias `.js`, setup que recrea esquema `_test` y aplica migraciones. La integración comparte BD y ya se ejecuta sin paralelismo entre archivos.

`repositorio.test.ts` importa un escáner `.mjs` que usa import.meta; otros tests usan __dirname. Dos archivos usan spies de Vitest sobre console. No convertir el backend completo a ESM para adaptar esas pruebas. Consultas tiene composición en index.ts y dominio; no exigir carpetas de capas vacías para pasar un detector.

## Goals / Non-Goals

**Goals:** comandos multiplataforma, migración trazable de escenarios, cobertura de archivos propios y detección de dependencias con resultados reproducibles. Aislar la configuración de tests de la compilación productiva y no relajar strict.

**Non-Goals:** cambiar las reglas de negocio, refactorizar funcionalidades para elevar métricas, cubrir código generado o exigir 100 %, migrar pruebas web/Flutter, publicar o crear recursos externos. El chequeo arquitectónico no prueba por sí solo todo EQ-06 ni SOLID semántico.

## Decisions

### 1. Jest y transformación TypeScript aislada del build

Configurar Jest en CommonJS y usar ts-jest con programa TypeScript completo para transformar, dejando package.json/tsconfig productivos en su modo actual. Fijar versiones en manifiesto/lockfile; no ejecutar versiones flotantes mediante npx en CI. Ajuste comprobado durante apply: la transformación aislada no puede resolver el const enum ambiental Algorithm.Argon2id de @node-rs/argon2, por lo que se utiliza transformación CommonJS/Node con isolatedModules desactivado; `test:tipos` comprueba por separado los tipos con Node16 y strict, sin rebajar el build productivo.

Preservar import dinámico nativo del escáner ESM mediante `test/cargar-escaner.cjs`, un puente sin transpilar inicializado antes de sus casos, y habilitar soporte VM modules con un lanzador Node multiplataforma. Así la transformación CommonJS completa no convierte ese import en require. No convertir el escáner, copiar su implementación ni modificar producto por conveniencia del runner. Mantener __dirname en tests CommonJS y resolver referencias `.js` de Prisma a fuentes generados `.ts`, sin editar generados.

Alternativas descartadas: conservar Vitest como supuesto equivalente a Jest (no cumple rúbrica); convertir todo el producto a ESM (amplía alcance); ocultar problemas con transformaciones que eliminen aserciones o con imports simulados. La instalación y el ensayo de compatibilidad deben preceder a la migración completa.

Corrección tras CI del 24/11/2026: Swagger Parser carga una dependencia ESM mediante require, que el runtime de Jest solo admite desde Node 24.9. Para conservar Node 22, `test/leer-contrato.mjs` desreferencia el contrato en un proceso Node nativo y devuelve JSON a las mismas pruebas HTTP. No se altera el contrato, el parser ni el módulo productivo. El ensayo local original con Node 24 no demostraba esta compatibilidad; el seguimiento registra las ejecuciones nuevas por separado.

Referencias técnicas primarias: [módulos híbridos de ts-jest](https://kulshekhar.github.io/ts-jest/docs/guides/hybrid-node-module), [compatibilidad ESM](https://kulshekhar.github.io/ts-jest/docs/guides/esm-support) y [runtime ESM de Jest](https://jestjs.io/docs/ecmascript-modules). La compatibilidad efectiva se verifica con las versiones fijadas durante apply, no se declara probada en este diseño.

### 2. Comandos y preparación segura

Proponer `npm test`, `test:unidad`, `test:integracion`, `test:cobertura`, `test:tipos` y `arquitectura:verificar`. El lanzador configura el modo unidad o integración antes de cargar entorno y Jest. Unidad no invoca setup BD ni se conecta aunque exista una URL en .env. Integración y cobertura completa requieren TEST_DATABASE_URL explícita, validan sufijo `_test` antes de conectar y nunca recurren a DATABASE_URL; los mensajes omiten sus valores. El setup se ejecuta una sola vez antes de la suite de integración. Conservar ejecución serial para la BD compartida y timeout actual de 30 segundos.

No omitir pruebas por falta de configuración ni usar passWithNoTests o forceExit para encubrir problemas. Cerrar clientes/servidores como en los fixtures actuales. Probar validación de URL y modos con dobles en un entorno que no pueda borrar una BD real; los ensayos contra datos se realizan únicamente en la BD local aislada o efímera de CI.

### 3. Regresión y cobertura

Antes de reemplazar imports/spies, guardar un inventario de archivos y escenarios de las pruebas de P0 y comparar el diff al finalizar. Conservar las aserciones y parametrizaciones. El conteo de Jest debe conservar los 429 casos previos; si la herramienta cuenta distinto, justificar correspondencia de escenarios sin aceptar su desaparición. Identificar por separado las nuevas pruebas de aislamiento, arquitectura y reportes.

Recoger cobertura con provider V8 sobre `src/**/*.ts`, incluyendo archivos no importados; excluir únicamente `src/generated/**`, declaraciones y tests. No excluir automáticamente arranque, composición o adaptadores difíciles: su baja cobertura se informa. Añadir `scripts/**` de API al alcance si contienen lógica propia ejecutada por comandos, declarando la selección exacta. Reportes en `apps/api/coverage/`: HTML, lcov.info y coverage-summary.json. La carpeta sigue ignorada por Git; el informe versionado resume métricas y enlaza evidencia sin copiar reportes masivos. No fijar umbral global no acordado.

### 4. Límites arquitectónicos verificables

Usar el parser y resolución de módulos de TypeScript ya disponible, no coincidencias de texto sobre comentarios. Recorrer fuentes propios de `src/modules/`, analizar import/export, import de tipos, require e import dinámico con destino literal. Resolver extensiones y aliases de tsconfig. Declarar que destinos computados no pueden acreditarse mediante este análisis estático; identificarlos como límite para revisión en lugar de afirmar cobertura total.

Reglas: dominio no depende de otras capas, frameworks HTTP, ORM, driver o cliente generado; aplicación no depende de presentación, infraestructura ni SDK de proveedor. Las capas internas pueden depender de tipos y utilidades compartidas puras. Validar dependencias transitivas de esas utilidades cuando un import interno las utiliza para evitar ocultar una dependencia prohibida tras un reexport. Otro módulo se consume por su index.ts público, sin permitir que ese camino eluda las restricciones de capas. Composición explícita en main.ts, app.ts, módulos index.ts y archivo `<modulo>.module.ts` puede conectar implementaciones; esa excepción no aplica dentro de dominio/aplicación ni a cualquier archivo que solo coincida parcialmente en el nombre.

Crear verificador reutilizable y CLI con salida no cero y diagnóstico archivo/import/regla. Probar ejemplos temporales válidos e inválidos, imports de tipos, reexports, comentarios y composición. No insertar infracciones en fuentes de producto ni presentar una prueba que solo comprueba nombres de carpetas como validación de arquitectura.

### 5. CI y evidencia

Job API con Node 22/PostgreSQL efímero mantiene tipos, build y validación OpenAPI; añade tipos de pruebas, verificador arquitectónico y Jest con cobertura. Las pruebas de configuración del workflow siguen comprobando restricciones previas y añaden reportes/publicación. Mantener jobs web/Flutter/secretos y permisos de solo lectura.

Publicar solo `apps/api/coverage/` con acción de artifacts fijada a SHA inmutable, retención de 14 días y ejecución aunque falle un paso anterior cuando existan reportes. Si no se generaron, informar su ausencia sin fabricar éxito ni requerirlos en una ejecución que falló antes de preparar tests. No subir .env, logs completos, correos, node_modules ni BD. Revisar metadatos/informes para no incluir valores de credenciales de fixtures. La comprobación local del workflow no acredita una ejecución real de GitHub; esta última se informa por separado y no se inicia un push por este cambio.

## Risks / Trade-offs

- Transformación mixta TypeScript/CommonJS/ESM y Prisma → ensayo temprano de los módulos conflictivos y typecheck independiente; no modificar el producto o eliminar tests para resolverlo.
- V8 y Vitest/Jest pueden contar o mapear cobertura de forma distinta → comparar escenarios y alcance, no asumir igualdad de porcentajes entre runners.
- Setup destructivo de integración → validación previa de la URL, ausencia de fallback, pruebas de rechazo sin conexión y uso de BD aislada.
- Verificador con falsos positivos o huecos → parser/resolución y ejemplos negativos, reglas explícitas de composición, límites de análisis declarados.
- Artefactos remotos aún no ejecutados → validar selección/condiciones localmente y reportar publicación remota como pendiente, sin afirmar éxito por inspeccionar YAML.

## Migration Plan

1. Registrar primero este cambio de especificación en Git, antes de editar implementación.
2. Incorporar configuración/dependencias del runner y probar compatibilidad de setup, Prisma y escáner ESM; migrar los escenarios existentes sin cambios de negocio.
3. Añadir cobertura, comprobación de tipos de test y verificador arquitectónico con sus controles; integrar CI y documentación.
4. Ejecutar unidad/integración/cobertura contra BD aislada, tipos/build/OpenAPI, controles negativos y regresión web/Flutter pertinente. Registrar versiones, resultados y métricas en informe.md, citando P0 sin sobrescribirlo.
5. Si la migración falla, conservar diagnóstico y resolverla antes de retirar la configuración anterior; el punto de retorno es el commit previo de código, sin rollback de datos de negocio porque no hay migraciones productivas. No archivar ni sincronizar como completado hasta validar las tareas.
