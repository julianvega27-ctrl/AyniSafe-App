# Nivel 2 · Diagrama de contenedores

> **Proyecto:** AyniSafe  
> **Modelo:** C4 · Nivel 2 de 4 · **Versión:** 1.0

## 1. Objetivo

Abrir la caja **AyniSafe** del nivel 1 y mostrar las aplicaciones y almacenes de datos que la componen, sus responsabilidades, tecnologías y comunicaciones.

| Aspecto | Descripción |
|---|---|
| Pregunta que responde | ¿Qué aplicaciones y almacenes forman AyniSafe y cómo se comunican? |
| Audiencia | Arquitectos, desarrolladores y responsables de operación. |
| Qué es un contenedor | Una aplicación o almacén de datos que se ejecuta o despliega por separado; no equivale necesariamente a un contenedor Docker. |
| Nivel anterior | [Nivel 1: contexto del sistema](Nivel1-DiagramadeContextodelSistema.md). |
| Siguiente nivel | Nivel 3: componentes internos del backend. |

## 2. Diagrama

![Diagrama de contenedores de AyniSafe · Modelo C4, nivel 2](../../img/aynisafe-nivel2-contenedores.svg)

[Abrir el diagrama interactivo](../../img/fuentes-html/nivel2-contenedores-aynisafe.html).

El límite de AyniSafe agrupa la aplicación móvil, el panel web, la API y los almacenes de datos propios. Las personas y los servicios externos permanecen fuera. Es una **vista del diseño propuesto**, no de servidores o réplicas desplegadas.

La API incluye el despachador y los consumidores de tareas en segundo plano. El reporte y su evento pendiente se guardan juntos en PostgreSQL antes de responder `201 Created`, sin esperar a la IA ni a las notificaciones. Una cola o un proceso de trabajo independiente se incorporaría si resulta necesario; no se presenta como un contenedor ya definido.

## 3. Contenedores

| Contenedor | Tecnología | Responsabilidad | Datos que maneja |
|---|---|---|---|
| **Aplicación móvil** | React Native + Expo + TypeScript; prioridad inicial Android. | Permite al ciudadano registrar reportes, adjuntar evidencias, autorizar su ubicación y consultar seguimiento, mapa y alertas. | Formulario, referencias de evidencias y estado local de la interfaz. |
| **Panel web** | React + TypeScript. | Permite a operadores revisar y gestionar incidentes, y a administradores configurar usuarios, roles, categorías y reglas. | Estado de pantalla y resultados autorizados obtenidos de la API. |
| **API AyniSafe** | Node.js + Express + TypeScript; Prisma para persistencia. | Expone la API REST, aplica permisos y reglas de negocio, coordina integraciones y ejecuta tareas asíncronas. Es un **monolito modular**. | Procesa datos del negocio; persiste en PostgreSQL y utiliza caché y servicios externos. |
| **Base de datos** | PostgreSQL. | Conserva la información del negocio, el historial y los eventos pendientes del outbox. | Usuarios, roles, reportes, incidentes, actuaciones, alertas, auditoría y metadatos de evidencias. |
| **Caché** | Redis; incorporación prevista. | Reduce consultas repetitivas sobre información consultada frecuentemente. | Copias temporales de consultas; no constituye la fuente persistente del negocio. |

**Identidad, Reportes, Análisis, Operaciones, Alertas y Consultas** son módulos internos de la API y se detallan en niveles posteriores. **Storage** se mantiene como servicio externo para archivos de evidencia, sin especificar proveedor en esta vista.

## 4. Relaciones

| Origen | Destino | Descripción | Protocolo o mecanismo |
|---|---|---|---|
| Ciudadano registrado | Aplicación móvil | Registra reportes y consulta seguimiento, mapa y alertas. | Interacción local en el dispositivo. |
| Operador autorizado | Panel web | Revisa sugerencias, valida reportes y gestiona incidentes. | Navegador; acceso al panel mediante HTTPS. |
| Administrador | Panel web | Gestiona cuentas, permisos, categorías y reglas. | Navegador; acceso al panel mediante HTTPS. |
| Aplicación móvil | API AyniSafe | Envía reportes y consulta información según la identidad y los permisos del ciudadano. | API REST mediante HTTPS/JSON. |
| Panel web | API AyniSafe | Ejecuta operaciones y consultas autorizadas por rol. | API REST mediante HTTPS/JSON. |
| API AyniSafe | Base de datos | Lee y escribe datos; registra cambios y eventos pendientes de forma atómica. | SQL sobre TCP, mediante Prisma. |
| API AyniSafe | Caché | Consulta y actualiza datos temporales cuando se incorpore la caché. | Protocolo de Redis sobre TCP. |
| API AyniSafe | Servicio de IA | Solicita análisis en segundo plano y conserva sugerencias para revisión humana. | API mediante HTTPS; contrato por definir. |
| API AyniSafe | Servicio de notificaciones push | Solicita en segundo plano la entrega de alertas y cambios relevantes a los dispositivos. | API o SDK del proveedor; contrato por definir. |
| Aplicación móvil | Mapas y geolocalización | Obtiene cartografía y solicita coordenadas solo con permiso del ciudadano. | API/SDK de mapas y API de ubicación del dispositivo. |
| API AyniSafe | Storage | Gestiona cargas y consultas autorizadas de evidencias privadas. | API del servicio de almacenamiento mediante HTTPS. |

Mapas y geolocalización agrupa dos capacidades y no presupone un único proveedor. Las coordenadas autorizadas se envían a la API con el reporte. El proveedor push entrega las notificaciones al dispositivo; el diagrama resume esa integración mediante la solicitud del backend.

## 5. Decisiones arquitectónicas reflejadas

| Decisión | Referencia | Motivo |
|---|---|---|
| Dos clientes independientes con una API compartida. | RC01–RC03 y ADR-003. | Atender el registro ciudadano desde el móvil y la operación desde el panel, con reglas comunes en el backend. |
| Un backend organizado como monolito modular. | ADR-001 y ADR-002. | Separar responsabilidades y dependencias internas manteniendo una unidad principal de despliegue. |
| Registro inmediato y procesamiento posterior recuperable. | ADR-004 y diseño interno, sección 6. | Confirmar el reporte persistido sin esperar servicios externos, y recuperar tareas pendientes ante fallos. |
| PostgreSQL para datos y Storage para evidencias. | ADR-006. | Separar los archivos privados de sus referencias y metadatos transaccionales. |
| Redis como caché prevista. | ADR-005. | Reducir consultas repetitivas; las claves, expiración e invalidación se concretarán en el diseño técnico. |
| La validación de incidentes permanece en personal autorizado. | RC05. | La IA aporta sugerencias y no sustituye la decisión humana. |

## 6. Seguridad entre contenedores

| Comunicación o recurso | Medida prevista |
|---|---|
| Clientes → API | HTTPS, autenticación y autorización por rol, propiedad del recurso y operación; el mecanismo de sesión se concretará en el diseño de seguridad. |
| API → PostgreSQL y Redis | Acceso restringido al backend, credenciales protegidas y permisos mínimos; sin acceso directo desde los clientes. |
| API → IA y notificaciones | Credenciales del proveedor protegidas en el servidor y envío limitado a datos autorizados. |
| API → Storage | Archivos privados, comprobación de propiedad y permisos, y acceso temporal autorizado a evidencias. |
| Móvil → Ubicación | Solicitud explícita de permiso y tratamiento de su denegación. |
| Consultas del mapa, panel y alertas | Aplicación de filtros de privacidad y permisos antes de entregar información. |
| Revisiones y cambios de estado | Registro del actor autorizado, la acción y su momento en la auditoría. |
