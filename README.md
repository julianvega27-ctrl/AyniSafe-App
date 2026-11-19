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

La revisión de la documentación, los vacíos detectados y la propuesta de despliegue gratuito se encuentran en [Revisión de consistencia y costos](docs/revision-consistencia-y-costos.md).

El proyecto se desarrollará utilizando **Scrum**, mediante iteraciones que permitan planificar, implementar, evaluar y entregar incrementos funcionales del sistema.

## Equipo de desarrollo

- **Julián Anthony Vega Salvatierra** — Desarrollador

## Reglas y catálogos del piloto

- [Cinco distritos y sedes candidatas](docs/01-analisis-del-sistema/10-catalogo-territorial-y-sedes.md): catálogo documental, sin asumir funcionamiento ni cobertura real.
- [Operación, publicación y conservación](docs/01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md): estados, seguimiento, FIFO/etiquetas, privacidad del mapa, alertas, cuentas, fotografías y plazos de eliminación.
