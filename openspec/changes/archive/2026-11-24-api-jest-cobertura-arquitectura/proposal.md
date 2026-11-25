# Proposal

## Why

La API tiene una línea base local de 429 pruebas con Vitest, pero el entregable del Sprint 2 exige Jest y reporte de cobertura. Antes de integrar más módulos necesitamos conservar esos escenarios, producir evidencia reproducible y detectar dependencias que vulneren Clean Architecture sin cambiar comportamiento de negocio.

## What Changes

- Migrar únicamente las pruebas de API de Vitest a Jest, incluidos spies, setup, TypeScript/Prisma y consumo del escáner ESM. Conservar contratos y casos de regresión.
- Añadir cobertura del código fuente propio de API con reportes HTML, LCOV y JSON resumido, sin imponer un porcentaje inventado por la rúbrica.
- Validar automáticamente dependencias entre capas y accesos a detalles internos de otros módulos, con casos de control que prueben que el verificador detecta infracciones.
- Mantener PostgreSQL de pruebas aislado y ejecución secuencial; comandos de unidad sin requerir BD y de integración/cobertura que no omitan pruebas silenciosamente.
- Ampliar CI para ejecutar Jest/cobertura y conservar sus artefactos, manteniendo verificaciones de tipos, build, OpenAPI, Flutter/web y seguridad.
- Documentar comandos, comparación con P0, resultados y limitaciones; distinguir CI configurada de ejecución real en GitHub.

## Capabilities

### New Capabilities

- `plataforma/pruebas-api`: ejecución Jest, regresión, aislamiento de pruebas y reportes de cobertura de la API.
- `plataforma/limites-arquitectonicos`: comprobación automatizada de dependencias de las capas y límites de módulos del backend.

### Modified Capabilities

- `plataforma/integracion-continua`: exigir la ejecución de Jest/cobertura y comprobación arquitectónica en la verificación de API y conservar reportes como artefactos, sin ampliar permisos.

## Impact

API: `package.json`, lockfile, configuración de pruebas/TypeScript, setup, suite `test/`, scripts de verificación y README. CI: `.github/workflows/ci.yml`, pruebas que verifican ese workflow y documentación de comandos/evidencia. Rúbrica: actividades 1/2/6/7 y evidencia de mantenibilidad EQ-06; el chequeo estático no sustituye los ensayos completos de sustitución de adaptadores de EQ-06.

Sin cambios a endpoints, autenticación, esquema de negocio, diseño visual ni código de funcionalidades para elevar cobertura. La web conserva Vitest y Flutter sus herramientas. No incluye importación del origen, carga de 2.000 VU, despliegue, push, commit ni archivo automático del cambio. Base inspeccionada: `a9b6242` y la evidencia P0 del 23/11/2026.
