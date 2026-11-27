# P6 — Atención y vinculación

- **Fecha:** 27/11/2026.
- **Cambio:** `atencion-vinculacion`, en la rama `feat/p6-atencion`.
- **Base:** `main` en `0308893`, con P5 fusionada y archivada.
- **Ambiente local:** Windows 11, Node 24.21.0, PostgreSQL 18.1 en una base aislada `*_test`, Flutter 3.

Este informe registra lo ejecutado. Lo que no figura como ejecutado no está validado.

## Decisiones de diseño del responsable (27/11/2026)

1. La verificación tiene tres valores: SIN_VERIFICAR, VERIFICADO y NO_VERIFICADO. Solo la registra el responsable de la principal, con motivo, y se puede corregir.
2. La primera asunción de la principal pasa el incidente de REGISTRADO a EN_REVISION en la misma transacción.
3. Las actuaciones ciudadanas son hitos con texto fijo y el resumen del cierre. Las actuaciones libres de los apoyos quedan pendientes.
4. Un duplicado vinculado sigue al principal: no tiene transiciones propias y muestra el estado del principal. Desvincular queda pendiente.

## Procedencia

La implementación se hizo sobre el modelo destino de AyniSafe (Operaciones, PostgreSQL). No se copió código de `Proyecto_incidencias_400par` en este cambio.

Las insignias de prioridad del panel usan los colores del `PriorityBadge` del origen que ya registra `DESIGN.md` (azul, ámbar, rojo y gris). Se incorporaron como tokens centrales en `colores.ts` y `estilos.css`, con prueba de contraste AA.

## Implementado

| Grupo | Alcance | Commits |
|---|---|---|
| A. Núcleo | Asumir caso con una asignación activa por institución (índice único parcial), principal y apoyos, transiciones con estado esperado, cierre Atendido/Descartado con motivo interno y resumen ciudadano, verificación separada, historial atómico, reasignación y liberación administrativas, hitos en el seguimiento | `aa6094f` API, `1db34b5` web, `f85617e` móvil |
| B. Duplicados | Vinculación auditada a un principal, sin cadenas ni ciclos (bloqueo ordenado de ambos incidentes), estado e hitos coordinados, privacidad entre informantes | `fb89066` API, `4723371` web |
| C. Prioridad | Configuración `prioridad-categoria-v1` validada en código (sin configuración válida queda Sin evaluar), propuesta al enrutar con origen y versión, revisión con motivo auditado, FIFO sin cambios | `fc8cd9c` API, `2d5c348` web |

Especificación previa a la implementación: `ad21442`.

## Verificación ejecutada (revisión `2d5c348` más la corrección de `esquema.test.ts`)

| Comprobación | Comando | Resultado |
|---|---|---|
| API Jest con cobertura | `npm run test:cobertura` (apps/api) | **80 suites, 1441 pruebas, 0 fallos.** Cobertura total: líneas 88,49 %, ramas 90,62 %, funciones 92,71 %. |
| Cobertura de P6 (líneas / ramas) | mismo informe | `aplicacion/atencion.ts` 100 / 89,3; `dominio/atencion.ts` 99,0 / 97,0; `dominio/prioridad.ts` 100 / 100; `prisma-atencion.adapter.ts` 100 / 93,9; `atencion.routes.ts` 99,0 / 85,6 |
| OpenAPI | `npm run contrato:validar` | Válido (OpenAPI 3.1.0), 58 operaciones, versión 0.8.0 |
| Contrato y respuesta real | `contrato.test.ts` | Cada estado documentado de las 9 rutas nuevas se ejercita y valida contra su esquema, incluido el 503 |
| Arquitectura | `npm run arquitectura:verificar` | 138 archivos, 0 infracciones |
| Tipos | `npm run typecheck`, `npm run test:tipos` | Sin errores |
| Web | `npm test`, `npm run lint`, `npm run build` (apps/web) | 14 archivos y 187 pruebas aprobadas; lint y build sin errores |
| Flutter | `flutter test`, `flutter analyze` (apps/mobile) | 362 pruebas aprobadas; sin problemas de análisis |

La primera ejecución completa con cobertura falló en 2 pruebas de `esquema.test.ts`:
- la lista cerrada de tablas no incluía `asignaciones_incidente` ni `historial_incidente`;
- una prueba ponía un incidente en CERRADO por SQL sin resultado.

La migración ahora rechaza ese cierre, como exige la spec. Se corrigieron ambas pruebas, que no ocultan ningún comportamiento, y la segunda ejecución completa aprobó.

## Escenarios de calidad

| EQ | Prueba | Resultado |
|---|---|---|
| EQ-05 Trazabilidad | `atencion.test.ts`: historial con estados anterior y nuevo, actor, institución e instante; reversión total si falla el registro del historial | Aprobado (BD real) |
| EQ-20 Carrera de asignación | Dos operadores asumen simultáneamente: uno 201 y otro 409; repetir no duplica; un apoyo tiene su propio responsable | Aprobado (BD real) |
| EQ-16 Prioridad y FIFO | `prioridad.test.ts`: elevar el incidente más reciente no cambia el orden; etiqueta con texto, icono y color en el panel | Aprobado |
| EQ-21 Cambio de principal | Precisar heridos hace a SAMU principal: el PNP conserva su asignación como apoyo, recibe 403 `NO_PRINCIPAL` y SAMU puede actuar | Aprobado |
| EQ-04/09 Privacidad | Los hitos y la vista del invitado no incluyen operadores, motivo interno ni verificación. La lista del administrador no incluye datos del caso. El duplicado no revela el principal | Aprobado |

## Pendiente, sin presentarlo como hecho

- **Recorrido en Android real.** Lo verifica el responsable de forma manual; no se ejecutó aquí.
- **Fusión del PR.** El PR #15 tiene CI en verde en la ejecución `46075468404`, con 4 jobs: API (tipos, arquitectura, contrato y Jest con cobertura), Web, Flutter y escaneo de secretos.
- **Fuera del alcance de P6:**
  - reapertura de cerrados;
  - transferencia de turno solicitada por el operador;
  - actuaciones libres de los apoyos (movilización, llegada);
  - desvincular duplicados;
  - sugerencias automáticas de duplicados (Análisis, RF13);
  - avisos por actuación (P8);
  - publicación de verificados (P7).
- **Medición de BD bajo carga.** No hay medición de las consultas de bandeja con prioridad y vínculo; queda para el informe de BD/caché y la carga de P9.
