# Instrucciones del repositorio

## Entregable académico

Para planificación, integración y validación del Sprint 2, consulta `docs/criterios-entrega-sprint-2.md`. La rúbrica exige respetar la arquitectura de Sprint 1, pruebas con Jest y cobertura, API OpenAPI y evidencia de atributos de calidad, incluido el ensayo progresivo de carga descrito allí. No declares equivalentes las herramientas existentes ni presentes metas como resultados medidos. Esta matriz organiza evidencia; no reemplaza las reglas del producto.

## Antes de trabajar en interfaces

1. Lee `PRODUCT.md` para entender usuarios, alcance y límites del producto.
2. Lee `DESIGN.md`: es la única autoridad documental para identidad, tokens, composición y componentes compartidos de web y móvil. Respeta la distinción entre acuerdos, propuesta y evidencia de implementación.
3. Consulta `docs/05-diseno-ui/guia-ui.md` para navegación, flujos y estados funcionales; consulta la spec de la capacidad o el cambio pertinente para su comportamiento.

## Responsabilidades y conflictos

- Para integrar código de `Proyecto_incidencias_400par`, sigue las fases y condiciones de `docs/comparacion-proyecto-incidencias.md`. Los acuerdos del 23/11/2026 se mantienen en requisitos, alcance y operación; la comparación organiza su ejecución. No ejecutes prompts históricos de `guia_codex.md` que contradigan esos acuerdos ni reescribas specs archivadas para fingir una implementación nueva.

- `docs/01-analisis-del-sistema/` define las reglas de negocio; `PRODUCT.md` las resume para diseñar. Una mejora visual no cambia roles, permisos, privacidad ni capacidades disponibles.
- `DESIGN.md` define el sistema visual. La guía UI y los `design.md` de OpenSpec no crean paletas, escalas ni variantes globales alternativas. En OpenSpec, `design.md` documenta decisiones técnicas del cambio.
- Dirección elegida el 23/11/2026: reproducir la UI web y móvil de `Proyecto_incidencias_400par`, según la referencia de DESIGN.md, sin mejoras gráficas durante la integración. No pedir otra selección de estilo ni sustituir fuentes/colores/composición por preferencias del agente. Mantener reglas funcionales y textos de negocio de AyniSafe.
- El código demuestra qué está implementado; no convierte una desviación visual en un acuerdo aprobado. Las propuestas no sustituyen los acuerdos vigentes hasta su elección explícita.
- Los HTML en `.impeccable/mocks/` son exploraciones. Un archivo abierto, su nombre o su existencia no prueban que se haya elegido.
- Si hay contradicción entre reglas funcionales, identifica el conflicto y resuélvelo dentro del alcance autorizado; no elijas por la fecha del archivo ni cambies el negocio para adaptar una maqueta.

## Al modificar UI

- Reutiliza componentes y tokens centrales. No introduzcas colores, radios o tipografías locales para resolver una sola pantalla.
- Web y Flutter comparten roles visuales y contratos de interacción, con componentes propios de cada tecnología y comportamientos de plataforma accesibles.
- Para cambiar la identidad, presenta una dirección concreta y registra su elección en `DESIGN.md` antes de extenderla a las demás pantallas. No rediseñes el sistema en cada entrega.
- Verifica el resultado renderizado, los estados relevantes, teclado, escalado y pantallas estrechas. Las pruebas de contraste no equivalen a aprobación visual.
- Declara qué se implementó y qué se verificó. Nunca presentes una propuesta, una captura o un test con dobles como una capacidad operativa.
- Conserva los cambios existentes del usuario. No hagas commit, despliegue ni archivado de OpenSpec por una petición de diseño.
