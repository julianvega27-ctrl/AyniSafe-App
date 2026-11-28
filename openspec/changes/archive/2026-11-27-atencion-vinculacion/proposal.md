# Proposal

## Why

Desde P4 cada envío crea un incidente que queda para siempre en REGISTRADO: el contrato publica que «no hay rutas para cambiar el estado», la bandeja solo es de lectura con prioridad fija «Sin evaluar» y el seguimiento ciudadano informa las actuaciones como pendientes. RF45, RF46, RF47, RF56 y RF16 (documento 11 §2–§3) exigen el ciclo operativo de cuatro estados con verificación separada, «Asumir caso» atómico por institución, cierre Atendido o Descartado con motivo y reasignación administrativa; RF15 y RF12 (§2 y §4) añaden duplicados vinculados y prioridad versionada con FIFO. Es la fila P6 del plan de integración y la base de P7 (publicación de verificados) y P8 (avisos de actuaciones).

## What Changes

Ordenado por prioridad de entrega. El grupo A es el núcleo obligatorio; B y C se implementan si alcanza el tiempo y, si no, quedan como pendientes explícitos en la evidencia.

**Grupo A — atención institucional (núcleo).**
- **Asumir caso (RF56, EQ-20).** Un operador cuya sede participa dentro de su ámbito vigente asume la participación de su institución. Una sola asignación activa por incidente e institución, garantizada por un índice único parcial en PostgreSQL; el segundo operador recibe 409 con la asignación vigente (sin nombre: «otro operador de tu institución») y repetir la solicitud del mismo responsable devuelve su asignación sin duplicarla. Los apoyos tienen sus propios responsables.
- **Principal y apoyos.** Solo el responsable de la institución principal cambia el estado, registra la verificación y cierra. La primera asunción de la principal inicia la revisión (REGISTRADO → EN_REVISION) en la misma transacción; asumir nunca pasa a EN_ATENCION. Si una aclaración médica cambia la principal (P5.1), los permisos de transición siguen a la nueva principal y el responsable anterior conserva su asignación como apoyo.
- **Transiciones (RF45/RF46, EQ-05).** EN_REVISION → EN_ATENCION («Iniciar atención», no acredita llegada). EN_ATENCION → CERRADO con resultado ATENDIDO; REGISTRADO o EN_REVISION → CERRADO con resultado DESCARTADO, sin pasar por EN_ATENCION. El cierre exige motivo interno y resumen ciudadano. Cada cambio guarda estado anterior y nuevo, actor, institución e instante en la misma transacción, con control optimista por estado esperado.
- **Verificación separada.** SIN_VERIFICAR → VERIFICADO o NO_VERIFICADO, con motivo y auditoría, solo por el responsable de la principal y corregible con motivo. No cambia el estado, no publica y no se exige para cerrar.
- **Reasignación administrativa.** El administrador lista las asignaciones activas y puede liberarlas o reasignarlas a otro operador activo de una sede habilitada de la misma institución que participe en el caso, siempre con motivo. No obtiene acceso al detalle del caso ni permisos de atención. Las asignaciones de operadores suspendidos se marcan como tarea de reasignación. El historial conserva responsables anteriores.
- **Actuaciones ciudadanas (RF47).** Cada transición crea un hito con texto ciudadano fijo («En revisión», «En atención por <institución>», «Cerrado: atendido/descartado» con resumen y, al descartar, motivo ciudadano). El autor con cuenta y el invitado con código ven los hitos; nunca operadores, notas internas ni motivo interno.
- **Clientes.** El panel ofrece «Asumir caso», responsable vigente, transiciones, verificación y cierre en el resumen del operador, y el bloque «Responsables activos» en el inicio del administrador. La app muestra estado, hitos y resultado de cierre en Mis reportes y en la consulta con código.

**Grupo B — duplicados vinculados (RF15).** El responsable de la principal de un incidente lo vincula como duplicado de otro incidente abierto que también ve, con motivo. Sin ciclos ni cadenas: el principal no puede ser duplicado y un duplicado no puede ser principal. Mientras está vinculado, el duplicado no admite transiciones propias; su seguimiento muestra el estado del principal y «Coordinado con otro reporte del mismo hecho», sin datos ajenos. Conserva originales, código, historial y asignaciones. Desvincular queda fuera.

**Grupo C — prioridad versionada (RF12, EQ-16).** Configuración ejecutable `prioridad-categoria-v1` con la tabla aprobada de 16 categorías. Al enrutar se propone la prioridad de la categoría con origen y versión; sin configuración válida queda SIN_EVALUAR. El responsable de la principal la confirma, eleva o reduce con motivo; cada cambio guarda valor anterior y nuevo. La bandeja sigue FIFO y muestra la etiqueta con texto, icono y color.

**Fuera de alcance:** reapertura de cerrados, transferencia de turno solicitada por el responsable, actuaciones libres de apoyos (movilización, llegada), desvincular duplicados, sugerencias automáticas de duplicados (Análisis, RF13), avisos por actuación (P8) y publicación (P7).

## Capabilities

### New Capabilities
- `operaciones/atencion-institucional`: asignación por institución, transiciones, verificación, cierre, reasignación administrativa e historial auditado con hitos ciudadanos.
- `operaciones/duplicados`: vinculación auditada de duplicados a un principal y estado coordinado (grupo B).
- `operaciones/prioridad`: configuración versionada, propuesta inicial y revisión humana sin alterar FIFO (grupo C).

### Modified Capabilities
- `operaciones/incidentes`: el estado deja de ser fijo; se exponen transiciones con control de concurrencia y resultado de cierre.
- `consultas/bandeja-institucional`: fila y resumen incluyen responsable de la institución del operador, verificación, resultado, vínculo y prioridad vigente.
- `consultas/seguimiento-ciudadano`: actuaciones como hitos ciudadanos, resultado y resumen de cierre; duplicado coordinado.
- `web/bandeja-incidentes`: el resumen ofrece las acciones de atención; el inicio del administrador añade «Responsables activos».
- `movil/seguimiento-incidentes`: Mis reportes y la consulta con código muestran hitos, resultado de cierre y coordinación.

## Impact

- API: migración aditiva (asignaciones, historial de estados, verificación, resultado, vínculo y prioridad), nuevos casos de uso en Operaciones, rutas `POST /operador/incidentes/{id}/...` y `/admin/asignaciones`, cambios en bandeja y seguimiento, OpenAPI y pruebas Jest unitarias, de integración y de contrato (EQ-05, EQ-20, EQ-16).
- Web: `Bandeja.tsx`, `Pendientes.tsx` y etiquetas compartidas, con los componentes y tokens actuales.
- Móvil: `seguimiento_pantallas.dart` y repositorio de incidentes.
- Sin dependencias nuevas.
