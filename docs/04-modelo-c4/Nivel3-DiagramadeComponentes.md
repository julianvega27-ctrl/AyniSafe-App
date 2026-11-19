# Nivel 3 · Diagrama de componentes

> **Proyecto:** AyniSafe · **Contenedor detallado:** API AyniSafe  
> **Modelo:** C4 · Nivel 3 de 4 · **Versión:** 1.1 · Actualización: 19/11/2026

## 1. Objetivo

Abrir el contenedor **API AyniSafe** del nivel 2 y mostrar los componentes del monolito modular, sus responsabilidades y sus relaciones con otros módulos, almacenes de datos y servicios externos.

| Aspecto | Descripción |
|---|---|
| Pregunta que responde | ¿Cómo se organiza el backend y cómo colaboran sus componentes? |
| Audiencia | Arquitectos y desarrolladores. |
| Qué es un componente | Un conjunto de funcionalidades con una responsabilidad y una interfaz definidas. En AyniSafe, cada módulo de negocio es un componente del backend. |
| Nivel anterior | [Nivel 2: contenedores](Nivel2-DiagramadeContenedores.md). |
| Siguiente nivel | Nivel 4: clases, interfaces y código; véase el [diseño interno de módulos](../03-diseño-de-software/diseño-interno/diseño-interno-de-modulos.md). |

## 2. Diagrama

![Diagrama de componentes de la API AyniSafe · Modelo C4, nivel 3](../../img/aynisafe-nivel3-componentes.svg)

[Abrir el diagrama interactivo](../../img/diagramas-interactivos/nivel3-componentes-aynisafe.html).

El borde delimita la **API AyniSafe**, desarrollada con Node.js, Express y TypeScript. Sus componentes se despliegan juntos; los clientes, PostgreSQL, Redis y los servicios externos quedan fuera del contenedor detallado.

El diagrama destaca las colaboraciones del registro y la gestión de incidentes. La entrada HTTP a Reportes y su acceso a PostgreSQL se muestran como ejemplos; las tablas resumen las entradas de todos los módulos y sus accesos a datos. Las líneas discontinuas representan entrega lógica de **eventos persistentes**, mediante el outbox y sus consumidores dentro del backend.

## 3. Componentes

| Componente | Responsabilidad | Funcionalidades principales | Ubicación propuesta |
|---|---|---|---|
| **Entrada HTTP** | Recibir solicitudes y traducirlas a casos de uso. | Rutas `/api/v1`, comprobación de sesión, validación de entradas y traducción de resultados y errores HTTP. | `src/app.ts` y `src/modules/*/presentacion/`. |
| **Identidad** | Gestionar identidad, organización y permisos. | Cuentas, perfiles, tres roles, cuatro instituciones, sedes, cobertura y competencias. | `src/modules/identidad/`. |
| **Reportes** | Conservar los envíos originales y sus referencias de evidencia. | Categoría original, ubicación consentida, distrito, evaluación rápida inicial SAMU, evidencias y seguimiento del autor. | `src/modules/reportes/`. |
| **Análisis** | Detectar posibles relaciones para revisión humana. | Correlación por categoría, distancia y tiempo; prioridad automática fuera del alcance inicial. | `src/modules/analisis/`. |
| **Operaciones** | Gestionar decisiones y asignaciones institucionales. | Enrutamiento provisional, revisión de categoría/prioridad, validación, consolidación, descarte, actuaciones y aclaraciones SAMU. | `src/modules/operaciones/`. |
| **Alertas** | Mantener bandejas y distribuir notificaciones. | Avisos institucionales según destinatarios resueltos, lectura individual y alertas ciudadanas según elegibilidad y publicación. | `src/modules/alertas/`. |
| **Consultas** | Entregar vistas autorizadas de información. | Mapa, indicadores, consultas del panel y contenido informativo; proyecciones y caché prevista. | `src/modules/consultas/`. |

La entrada HTTP agrupa las rutas y los controladores de los módulos; cada uno conserva su propia capa de Presentación. Los mecanismos de conexión, outbox y observabilidad se ubican en `src/shared/infraestructura/`, sin trasladar allí reglas de negocio. Las carpetas corresponden al diseño propuesto.

## 4. Relaciones entre componentes

| Origen | Destino | Descripción | Tipo de comunicación |
|---|---|---|---|
| Aplicación móvil y panel web | Entrada HTTP | Envían operaciones y consultas con la identidad del usuario. | API REST mediante HTTPS/JSON. |
| Entrada HTTP | Identidad | Comprueba la sesión y obtiene la identidad y los permisos aplicables. | Llamada interna a contratos de Identidad. |
| Entrada HTTP | Módulo correspondiente | Invoca los casos de uso de Identidad, Reportes, Operaciones, Alertas o Consultas según la ruta y los permisos. | Llamada en memoria; los consumidores activan el análisis asíncrono. |
| Reportes | Identidad | Comprueba que el actor puede registrar o consultar los recursos solicitados. | Puerto local y adaptador hacia la API pública del módulo. |
| Reportes | Operaciones | Consulta el seguimiento de los incidentes vinculados a los reportes del autor. | Contrato público de seguimiento. |
| Reportes | Análisis | Entrega `ReporteRegistrado` después de confirmar la transacción del reporte y su evento. | Evento persistente, despachado en segundo plano. |
| Reportes | Operaciones | Entrega ReporteRegistrado para resolver destinatarios y crear avisos institucionales provisionales. | Consumidor persistente independiente de Análisis. |
| Análisis | Reportes | Obtiene los datos autorizados necesarios para generar sugerencias. | API pública de Reportes; sin acceso a sus tablas. |
| Operaciones | Reportes y Análisis | Consulta los reportes originales y las sugerencias para la revisión del operador. | Contratos públicos de ambos módulos. |
| Operaciones | Alertas | Publica cambios confirmados para evaluar avisos según las reglas y los destinatarios elegibles. | Evento persistente con reintentos y control de duplicados. |
| Operaciones | Consultas | Publica cambios confirmados para actualizar las vistas del mapa, indicadores y panel. | Evento persistente; proyecciones con posible demora. |

El registro responde `201 Created` después de guardar el reporte y su evento en una transacción local. El análisis de reglas y las notificaciones no bloquean esa respuesta. El despachador y los consumidores permanecen dentro del backend en esta propuesta; una cola o un proceso independiente sería una evolución posterior.

## 5. Relaciones con contenedores y servicios externos

| Componente | Destino | Descripción | Protocolo o mecanismo | Patrón aplicado |
|---|---|---|---|---|
| Todos los módulos | PostgreSQL | Cada módulo persiste sus datos mediante repositorios propios; los cambios y sus eventos pendientes se guardan juntos cuando corresponde. | SQL sobre TCP mediante Prisma. | Repository y adaptadores de persistencia. |
| Consultas | Redis | Consulta y actualiza copias temporales de vistas autorizadas al incorporar la caché. | Protocolo de Redis sobre TCP. | Decorator previsto. |
| Reportes | Storage | Gestiona carga, verificación de propiedad y acceso autorizado a archivos privados; guarda sus referencias y metadatos en PostgreSQL. | API del servicio mediante HTTPS. | Adapter. |
| Alertas | Servicio de notificaciones push | Solicita la entrega de alertas y cambios relevantes a los dispositivos elegibles. | API HTTPS de FCM o SDK del servidor; APNs configurado para iOS. | Adapter. |

**Storage** conserva su nombre genérico. La cartografía se consume desde móvil y panel web; la ubicación del dispositivo corresponde al móvil, como se muestra en el nivel 2; Consultas proporciona los incidentes y filtros autorizados que se presentan sobre el mapa.

## 6. Reglas del monolito modular

| # | Regla | Motivo |
|---|---|---|
| 1 | Todos los componentes internos pertenecen al contenedor API AyniSafe y se despliegan juntos. | Conservar el monolito modular definido en ADR-001. |
| 2 | Los módulos colaboran mediante contratos públicos expuestos desde `index.ts`, sin importar archivos internos de otro módulo. | Permitir cambios internos sin romper a los consumidores. |
| 3 | Cada módulo controla sus datos; las consultas entre módulos usan contratos públicos o proyecciones autorizadas. | Evitar accesos directos a tablas o repositorios ajenos. |
| 4 | Reportes conserva el envío original; Operaciones conserva el estado operativo del incidente y sus actuaciones. | Consolidar reportes sin perder autoría, evidencias ni historial. |
| 5 | Los eventos pendientes se persisten con el cambio de negocio y se procesan con reintentos e idempotencia por consumidor. | Recuperar tareas ante fallos y evitar efectos duplicados. |
| 6 | Los casos de uso dependen de puertos; los adaptadores de Infraestructura integran persistencia, Storage y notificaciones. | Mantener las reglas de negocio independientes de proveedores y tecnologías. |
| 7 | Cada módulo aplica Clean Architecture: Presentación, Aplicación, Dominio e Infraestructura. | Orientar las dependencias del código hacia las políticas internas. |
| 8 | El operador valida y registra las decisiones con actor, acción y momento. | Cumplir la revisión humana y la trazabilidad del sistema. |

## 7. Responsabilidades territoriales e institucionales

RF41–RF44: Reportes captura la evaluación rápida para SAMU por persona; Operaciones conserva aclaraciones del operador SAMU; Consultas entrega el detalle con permisos sanitarios específicos; Alertas notifica mediante referencias protegidas sin datos individuales en el payload. La falta de respuestas no bloquea el registro ni la entrega. No requiere nuevo contenedor ni servicio externo. Campos y aceptación en la especificación territorial e institucional.

| Componente existente | Alcance añadido | Requisitos |
|---|---|---|
| Identidad | Instituciones, sedes, operadores, tres roles, coberturas distritales y competencias. | RF28–RF30 |
| Reportes | Catálogo de 16 categorías, distrito calculado/declarado, versión territorial y evaluación rápida inicial. | RF06, RF23, RF31, RF41–RF42 |
| Operaciones | Enrutamiento provisional, principal/apoyos y aclaraciones SAMU, con clasificación y actuaciones auditadas. | RF11–RF12, RF32–RF33, RF35, RF39–RF40, RF43 |
| Alertas | Bandejas por usuario, contador, lectura independiente, deduplicación y entrega móvil FCM. | RF34 |
| Consultas | Límites/filtros, contactos y portada pública; consulta sanitaria con contratos y permisos específicos. | RF20, RF31, RF36–RF38, RF43 |

Operaciones consulta los contratos públicos de Identidad para determinar destinatarios competentes. Alertas consume decisiones persistidas y la entrada HTTP expone bandejas autorizadas para el panel. Los avisos internos de revisión nacen tras registrar un reporte; las alertas públicas exigen validación y permiso de publicación. No se crean componentes externos por cada institución. [Reglas y criterios](../01-analisis-del-sistema/09-alcance-territorial-e-institucional.md).

Las flechas del SVG resumen algunas colaboraciones: no se debe inferir que la entrega a Operaciones espera a Análisis. La tabla de relaciones define explícitamente el consumidor institucional. Consultas accede a la evaluación sanitaria por contratos autorizados, sin replicarla en el mapa público ni habilitarla para cualquier operador.

Las flechas del SVG resumen algunas colaboraciones: no se debe inferir que la entrega a Operaciones espera a Análisis. La tabla de relaciones define explícitamente el consumidor institucional. Consultas accede a la evaluación sanitaria por contratos autorizados, sin replicarla en el mapa público ni habilitarla para cualquier operador.

Acuerdos de operación: [catálogo de cinco distritos y sedes candidatas](../01-analisis-del-sistema/10-catalogo-territorial-y-sedes.md) y [política de estados, FIFO, publicación, alertas y conservación](../01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md). La etiqueta de prioridad se asigna manualmente en el MVP; las correlaciones siguen en Análisis. Las sedes documentadas no se consideran integraciones institucionales activas.

RF56–RF57: Operaciones es propietario de la asignación única por caso/institución y del cambio de principal en accidentes según heridos/necesidad médica. Identidad verifica competencia, sede y estado del operador; Reportes conserva las respuestas ciudadanas originales. Alertas recibe los destinatarios resueltos y Consultas muestra el responsable a operadores autorizados, sin exponer su identidad al ciudadano. El botón «Asumir caso» requiere adquisición transaccional en la API, no solo un cambio visual.
