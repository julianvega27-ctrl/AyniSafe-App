# Proposal

## Why

P3.1 dejó el catálogo territorial versionado (PR #2, CI aprobado en `0f2366a`), pero AyniSafe aún no tiene instituciones, sedes ni operadores: el panel del administrador muestra todo «Aún no disponible» y ninguna ruta permite crear cuentas de operador. Sin esa organización, P4 no puede enrutar incidentes ni P6 limitar la atención por ámbito (RF28/29/30, HU14/HU15).

## What Changes

- Catálogo institucional cerrado: cuatro instituciones precargadas (PNP, Bomberos, SAMU, Serenazgo), editables en nombre/contacto/estado. No existe ruta para crear otros tipos y la BD rechaza cualquier otro valor.
- Catálogo fijo de las 16 categorías del documento 09 con identificadores estables, solo lectura y público, para configurar competencias ahora y reutilizarlo en P4.
- Alta atómica de sede con operador inicial: sede, pertenencia, cuenta `pendiente_activacion` e invitación se confirman en una transacción o no queda nada (EQ-12). La invitación reutiliza la capacidad existente y el correo sale después del commit.
- Sedes con verificación documental separada de la habilitación para atención. Toda sede nace deshabilitada; habilitarla exige al menos un distrito de cobertura, una competencia y un operador activo.
- Coberturas por distrito (catálogo de P3.1) y competencias por categoría por sede, explícitas y muchos-a-muchos. La ubicación de la sede no define su jurisdicción.
- Operadores adicionales por sede con invitación, suspensión con revocación de sesiones y reactivación, sin borrar historial. Sigue sin existir alta de administradores por API.
- Contrato interno de ámbito del operador (institución, sede, distritos, categorías) y lectura de su propio ámbito, para que P4/P6 apliquen EQ-09 en cada recurso.
- Panel web del administrador: «Instituciones y sedes», «Operadores» y «Coberturas» pasan a disponibles, reproduciendo la página Organización del origen sobre el marco de P2. El resto de secciones sigue pendiente.
- Se adapta comportamiento del donante `efc1bce8c29b3c88487e36e10a324c71ae9c2029` (`institutions/*`, `Organization.jsx`), sin sus roles extra, contraseñas en formulario, zonas poligonales de cobertura ni recursos/unidades.

Fuera de alcance: las 13 sedes candidatas del documento 10 no se precargan (quedan como referencia documental); reglas de enrutamiento y prioridades (P4/P6); reasignación de operador entre sedes y el historial de auditoría consultable (P8); gestión/desactivación de categorías desde el panel; personal y unidades del origen; mapas; Flutter.

## Capabilities

### New Capabilities

- `identidad/organizacion-institucional`: instituciones cerradas, sedes, alta atómica con operador inicial, operadores por sede, coberturas, competencias, habilitación para atención y ámbito del operador.
- `reportes/categorias`: catálogo fijo y público de las 16 categorías con identificadores estables.
- `web/administracion-organizacion`: secciones del panel del administrador para instituciones, sedes, operadores y coberturas.

### Modified Capabilities

- `identidad/acceso-institucional`: los paneles declaran disponibles las secciones construidas, y el administrador autenticado puede crear operadores solo mediante el flujo de sede. Siguen prohibidas las altas privilegiadas públicas y las de administradores.
- `identidad/recuperacion-activacion-cuenta`: la invitación pasa a tener un consumidor autorizado (el alta de operadores). Se elimina la prohibición limitada a la entrega anterior.
- `web/panel-institucional`: el shell muestra como disponibles las secciones de administración implementadas y mantiene «Aún no disponible» en las demás.

## Impact

API: módulo Identidad (dominio, aplicación, presentación e infraestructura Prisma), nuevo módulo Reportes con solo el catálogo de categorías, composición en `main.ts`, migración aditiva, OpenAPI y Jest con PostgreSQL. Consultas solo se consume por su fachada (catálogo de distritos). Web: rutas del panel del administrador, cliente API y pruebas Vitest/a11y. Flutter no cambia.

Trazabilidad: RF28/29/30 y componente de sedes de RF54 → HU14/HU15 → EQ-12 completo y EQ-09 en su parte organizativa (rechazo de rutas administrativas a operadores y ámbito propio). EQ-09 sobre reportes se valida en P4/P6. La integración se rige por `docs/comparacion-proyecto-incidencias.md` y la matriz Sprint 2. Estado: propuesta, cero tareas implementadas; no implica commit, despliegue ni archivo automático.
