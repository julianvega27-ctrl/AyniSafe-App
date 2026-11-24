# AyniSafe

**Cuidarnos es tarea de todos.**

## Descripción

AyniSafe es un proyecto de aplicación móvil orientado a fortalecer la seguridad ciudadana y atención de emergencias en el área metropolitana de Ayacucho mediante el reporte georreferenciado de incidentes, la difusión de alertas preventivas y la participación colaborativa de la comunidad.

La plataforma permitirá a los ciudadanos reportar situaciones como robos, acoso, agresiones y otros incidentes, adjuntando información sobre su ubicación y evidencias. Asimismo, contará con un panel de gestión para operadores autorizados, quienes podrán verificar los reportes y dar seguimiento a los incidentes registrados.

El ciudadano seleccionará una categoría y el operador la confirmará o corregirá. El operador asignará etiquetas de prioridad sin alterar el orden de llegada; el sistema aplicará reglas explícitas para detectar posibles relaciones por ubicación, tiempo y categoría, conservando la revisión humana y la trazabilidad.

## Alcance actualizado

La app ciudadana se desarrollará en **Flutter y Dart**, con entrega inicial Android y versión para iPhone prevista. El panel React incluye portada informativa pública y acceso protegido para administradores y operadores. Se contemplan distritos metropolitanos, 16 categorías, sedes de PNP, Bomberos, SAMU y Serenazgo, atención multiinstitucional y notificaciones por ámbito. La evaluación rápida para SAMU utiliza botones y admite información desconocida.

La fuente de estas reglas es [Alcance territorial e institucional](docs/01-analisis-del-sistema/09-alcance-territorial-e-institucional.md). Los roles son exclusivamente ciudadano, administrador y operador.

## Objetivo

Desarrollar una plataforma móvil modular y escalable que facilite el reporte, la gestión y la prevención colaborativa de incidentes de seguridad ciudadana en Ayacucho, mediante información georreferenciada, alertas oportunas y clasificación revisada por operadores y análisis mediante reglas explícitas.

## Metodología

Los criterios de revisión y las brechas de preparación del entregable se encuentran en la [matriz del Sprint 2](docs/criterios-entrega-sprint-2.md).

Para trabajar en interfaces, comienza por [AGENTS.md](AGENTS.md). El contexto del producto está en [PRODUCT.md](PRODUCT.md), el sistema visual compartido en [DESIGN.md](DESIGN.md) y los flujos y navegación en la [guía UI](docs/05-diseno-ui/guia-ui.md). La dirección elegida es reproducir la UI del proyecto de origen; falta implementarla y validar su fidelidad. Las exploraciones anteriores no son diseños aprobados.

La revisión de la documentación, los vacíos detectados y la propuesta de despliegue gratuito se encuentran en [Revisión de consistencia y costos](docs/revision-consistencia-y-costos.md).

El proyecto se desarrollará utilizando **Scrum**, mediante iteraciones que permitan planificar, implementar, evaluar y entregar incrementos funcionales del sistema.

## Equipo de desarrollo

- **Julián Anthony Vega Salvatierra** — Desarrollador

## Reglas y catálogos del piloto

- [Cinco distritos y sedes candidatas](docs/01-analisis-del-sistema/10-catalogo-territorial-y-sedes.md): catálogo documental, sin asumir funcionamiento ni cobertura real.
- [Operación, publicación y conservación](docs/01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md): estados, seguimiento, FIFO/etiquetas, privacidad del mapa, alertas, cuentas, fotografías y plazos de eliminación.

## Ejecutar y verificar

| Parte | Carpeta | Comandos | Más información |
|---|---|---|---|
| API | `apps/api` | `npm run dev`, `npm test` (con `TEST_DATABASE_URL`), `npm run typecheck`, `npm run contrato:validar` | [README de la API](apps/api/README.md) |
| App ciudadana | `apps/mobile` | `flutter run`, `flutter analyze`, `flutter test` | [README de la app](apps/mobile/README.md) |
| Web | `apps/web` | `npm run dev`, `npm run lint`, `npm test`, `npm run build` | [README de la web](apps/web/README.md) |
| Administrador inicial | `apps/api` | `npm run admin:bootstrap -- --correo ... --nombre ...` | [procedimiento](apps/api/README.md#administrador-inicial) |

**Integración continua** (`.github/workflows/ci.yml`, GitHub Actions): en cada empuje a `main` y en cada solicitud de
cambios verifica la API (tipos, compilación, contrato y pruebas con PostgreSQL efímero), la app (`flutter analyze` y
`flutter test`, sin `integration_test`, que necesita un dispositivo), la web (lint, tipos, compilación, artefacto y
pruebas) y busca credenciales versionadas (`scripts/escanear-secretos.mjs`). No usa ningún secreto del repositorio,
solo permisos de lectura y acciones fijadas por SHA. Su ejecución real en GitHub aún no se ha comprobado.

Las cuentas de administrador se crean con el procedimiento controlado anterior (sin contraseñas en Git); las de
operador llegarán con la gestión de cuentas. Ninguna ruta pública crea cuentas privilegiadas.
