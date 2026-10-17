# Nivel 3 · Diagrama de componentes

> **Proyecto:** AyniSafe · **Contenedor detallado:** API AyniSafe  
> **Modelo:** C4 · Nivel 3 de 4 · **Versión:** 1.0

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

[Abrir el diagrama interactivo](../../img/fuentes-html/nivel3-componentes-aynisafe.html).

El borde delimita la **API AyniSafe**, desarrollada con Node.js, Express y TypeScript. Sus componentes se despliegan juntos; los clientes, PostgreSQL, Redis y los servicios externos quedan fuera del contenedor detallado.

El diagrama destaca las colaboraciones del registro y la gestión de incidentes. La entrada HTTP a Reportes y su acceso a PostgreSQL se muestran como ejemplos; las tablas resumen las entradas de todos los módulos y sus accesos a datos. Las líneas discontinuas representan entrega lógica de **eventos persistentes**, mediante el outbox y sus consumidores dentro del backend.

## 3. Componentes

| Componente | Responsabilidad | Funcionalidades principales | Ubicación propuesta |
|---|---|---|---|
| **Entrada HTTP** | Recibir solicitudes y traducirlas a casos de uso. | Rutas `/api/v1`, comprobación de sesión, validación de entradas y traducción de resultados y errores HTTP. | `src/app.ts` y `src/modules/*/presentacion/`. |
| **Identidad** | Gestionar identidad y permisos. | Registro, inicio de sesión, recuperación de contraseña, perfiles, usuarios y roles. | `src/modules/identidad/`. |
| **Reportes** | Conservar los reportes originales y sus referencias de evidencia. | Registro con ubicación autorizada, categorías, evidencias privadas y consulta del seguimiento por el autor. | `src/modules/reportes/`. |
| **Análisis** | Generar sugerencias para revisión humana. | Clasificación, prioridad orientativa y correlación de reportes mediante tareas asíncronas. | `src/modules/analisis/`. |
| **Operaciones** | Gestionar incidentes y decisiones del personal autorizado. | Revisión, validación, consolidación, descarte, derivación, actuaciones y cambios de estado con trazabilidad. | `src/modules/operaciones/`. |
| **Alertas** | Evaluar reglas y distribuir notificaciones. | Elegibilidad por proximidad, alertas preventivas, cambios relevantes y configuración de reglas. | `src/modules/alertas/`. |
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
| Análisis | Reportes | Obtiene los datos autorizados necesarios para generar sugerencias. | API pública de Reportes; sin acceso a sus tablas. |
| Operaciones | Reportes y Análisis | Consulta los reportes originales y las sugerencias para la revisión del operador. | Contratos públicos de ambos módulos. |
| Operaciones | Alertas | Publica cambios confirmados para evaluar avisos según las reglas y los destinatarios elegibles. | Evento persistente con reintentos y control de duplicados. |
| Operaciones | Consultas | Publica cambios confirmados para actualizar las vistas del mapa, indicadores y panel. | Evento persistente; proyecciones con posible demora. |

El registro responde `201 Created` después de guardar el reporte y su evento en una transacción local. La IA y las notificaciones no bloquean esa respuesta. El despachador y los consumidores permanecen dentro del backend en esta propuesta; una cola o un proceso independiente sería una evolución posterior.

## 5. Relaciones con contenedores y servicios externos

| Componente | Destino | Descripción | Protocolo o mecanismo | Patrón aplicado |
|---|---|---|---|---|
| Todos los módulos | PostgreSQL | Cada módulo persiste sus datos mediante repositorios propios; los cambios y sus eventos pendientes se guardan juntos cuando corresponde. | SQL sobre TCP mediante Prisma. | Repository y adaptadores de persistencia. |
| Consultas | Redis | Consulta y actualiza copias temporales de vistas autorizadas al incorporar la caché. | Protocolo de Redis sobre TCP. | Decorator previsto. |
| Reportes | Storage | Gestiona carga, verificación de propiedad y acceso autorizado a archivos privados; guarda sus referencias y metadatos en PostgreSQL. | API del servicio mediante HTTPS. | Adapter. |
| Análisis | Servicio de IA | Solicita sugerencias de categoría, prioridad y similitud con datos autorizados. | API mediante HTTPS; contrato por definir. | Adapter. |
| Alertas | Servicio de notificaciones push | Solicita la entrega de alertas y cambios relevantes a los dispositivos elegibles. | API o SDK del proveedor; contrato por definir. | Adapter. |

**Storage** conserva su nombre genérico. Mapas y geolocalización se utiliza desde el cliente móvil, como se muestra en el nivel 2; Consultas proporciona los incidentes y filtros autorizados que se presentan sobre el mapa.

## 6. Reglas del monolito modular

| # | Regla | Motivo |
|---|---|---|
| 1 | Todos los componentes internos pertenecen al contenedor API AyniSafe y se despliegan juntos. | Conservar el monolito modular definido en ADR-001. |
| 2 | Los módulos colaboran mediante contratos públicos expuestos desde `index.ts`, sin importar archivos internos de otro módulo. | Permitir cambios internos sin romper a los consumidores. |
| 3 | Cada módulo controla sus datos; las consultas entre módulos usan contratos públicos o proyecciones autorizadas. | Evitar accesos directos a tablas o repositorios ajenos. |
| 4 | Reportes conserva el envío original; Operaciones conserva el estado operativo del incidente y sus actuaciones. | Consolidar reportes sin perder autoría, evidencias ni historial. |
| 5 | Los eventos pendientes se persisten con el cambio de negocio y se procesan con reintentos e idempotencia por consumidor. | Recuperar tareas ante fallos y evitar efectos duplicados. |
| 6 | Los casos de uso dependen de puertos; los adaptadores de Infraestructura integran persistencia, Storage, IA y notificaciones. | Mantener las reglas de negocio independientes de proveedores y tecnologías. |
| 7 | Cada módulo aplica Clean Architecture: Presentación, Aplicación, Dominio e Infraestructura. | Orientar las dependencias del código hacia las políticas internas. |
| 8 | La IA sugiere; el personal autorizado valida y registra las decisiones con actor, acción y momento. | Cumplir la revisión humana y la trazabilidad del sistema. |

