# Tasks

Grupos verticales por prioridad. Durante la implementación se ejecutan solo las suites afectadas; la suite completa con cobertura, OpenAPI y arquitectura se ejecuta una vez al final (grupo Z). Lo que no se complete de B o C queda como pendiente explícito en `docs/validacion/p6-atencion.md`.

## A. Núcleo obligatorio: atención institucional

### A1. Persistencia y dominio
- [x] A1.1 Migración `20261130100000_atencion_institucional`: columnas de verificación, resultado y resumen en `incidentes` con CHECK; `asignaciones_incidente` con índice único parcial; `historial_incidente` con CHECK por acción. Actualizar `schema.prisma`.
- [x] A1.2 Dominio `operaciones/dominio/atencion.ts`: transiciones permitidas, `accionesPermitidas`, validación de cuerpos (motivo 10–500, resumen 10–300, estado esperado) y errores tipados.
- [x] A1.3 Pruebas unitarias del dominio: matriz de transiciones, acciones por papel/asignación y validaciones.

### A2. Casos de uso y adaptador
- [x] A2.1 `ServicioAtencion` con asumir (inicio de revisión de la principal), transición, verificación, liberar, reasignar, lista de asignaciones y vista del operador; puertos de repositorio y de operadores.
- [x] A2.2 `PrismaAtencionAdapter`: bloqueo del incidente, asignación activa, inserciones del historial y lecturas, con traducción de 23505 a conflicto.
- [x] A2.3 Identidad: `OperadoresAtencion` (`describir`, `deSedes`) en puerto, adaptador y fachada.
- [x] A2.4 Pruebas de integración contra PostgreSQL: asunción concurrente (EQ-20), repetición idempotente, apoyo con responsable propio, transiciones válidas e inválidas, estado esperado, verificación sin cambio de estado, historial atómico (EQ-05) y reversión, cambio de principal por condición médica, reasignación válida/no válida, liberar.

### A3. API y contrato
- [x] A3.1 `atencion.routes.ts` (operador y administrador) y cableado en `composicion.ts`.
- [x] A3.2 Bandeja: fila con verificación, resultado y responsable; resumen con atención (responsable, acciones e historial).
- [x] A3.3 Seguimiento: resultado, resumen ciudadano e hitos en el detalle del autor y en la vista del invitado.
- [x] A3.4 OpenAPI: rutas nuevas, esquemas y ejemplos; retirar la afirmación de «sin transiciones».
- [x] A3.5 Pruebas HTTP y de contrato: 401/403/404/409/400, CSRF, privacidad de hitos (sin operadores ni motivo interno) y del listado del administrador.

### A4. Clientes
- [x] A4.1 Web: bloque «Atención» en el resumen (asumir, iniciar atención, verificación, cerrar, descartar) con diálogos, estados y 409; prioridad y responsable en la fila.
- [x] A4.2 Web: bloque «Responsables activos» del administrador con liberar y reasignar.
- [x] A4.3 Pruebas web afectadas.
- [x] A4.4 Flutter: hitos, resultado de cierre y resumen en Mis reportes y consulta con código; pruebas de widget.

## B. Si alcanza: duplicados vinculados
- [x] B1 Migración `_duplicados` y dominio de vinculación (sin ciclos ni cadenas).
- [x] B2 Caso de uso y ruta `POST /operador/incidentes/{id}/vinculo`; bloqueo de transiciones del duplicado; estado efectivo en bandeja y seguimiento.
- [x] B3 Pruebas: cadena, vinculación cruzada simultánea, privacidad entre informantes, seguimiento coordinado; OpenAPI.
- [x] B4 Clientes: acción «Vincular como duplicado» en el panel e indicación de coordinación en la app.

## C. Si alcanza: prioridad versionada con FIFO
- [x] C1 Migración `_prioridad`, configuración `prioridad-categoria-v1` y validación.
- [x] C2 Propuesta al enrutar y revisión con motivo (`POST /operador/incidentes/{id}/prioridad`).
- [x] C3 Pruebas: valores de la tabla, configuración inválida → SIN_EVALUAR, revisión auditada, FIFO sin cambios (EQ-16); OpenAPI.
- [x] C4 Panel: etiqueta con texto/icono/color y acción de revisión.

## Z. Cierre
- [x] Z1 Suite completa con cobertura, validación OpenAPI y verificador de arquitectura, una vez.
- [x] Z2 Evidencia breve en `docs/validacion/p6-atencion.md` (comandos, resultados, pendientes) y estado P6 en `docs/comparacion-proyecto-incidencias.md`.
- [ ] Z3 Recorrido en Android real (manual, responsable del proyecto).
- [x] Z4 Commits por capa, push, PR y CI.

## D. Ajuste tras la prueba manual (decisión del responsable, 27/11/2026)
- [x] D1 Documento 11 §2, RF56, guía UI y plan de integración: asignación automática al operador único.
- [x] D2 Migración y `autoAsignarPrincipal` en enrutar, designar, reevaluar y condición médica; pruebas de integración (uno/varios operadores, SAMU a principal).
- [x] D3 Filtro `responsable` en la bandeja (API, OpenAPI y pruebas).
- [ ] D4 Web: bloque «Atención» guiado (recorrido de estados, acción principal, control plegable, historial plegado, vista previa del ciudadano al cerrar) y filtros segmentados; pruebas.
- [ ] D5 Suite completa, migración de `ayni_safe_dev`, evidencia y CI.
