# Nivel 1 · Diagrama de contexto del sistema

> **Proyecto:** AyniSafe  
> **Modelo:** C4 · Nivel 1 de 4 · **Versión:** 1.1 · Actualización: 19/11/2026

## 1. Objetivo

Mostrar **AyniSafe como un solo sistema**: quiénes lo utilizan y con qué servicios externos se comunica para registrar incidentes y apoyar la seguridad ciudadana en Ayacucho.

| Aspecto | Descripción |
|---|---|
| Pregunta que responde | ¿Qué es AyniSafe, quién lo usa y con qué sistemas se relaciona? |
| Audiencia | Ciudadanos, responsables de operación y equipo de desarrollo. |
| Qué no muestra | Módulos internos, bases de datos, servidores ni tecnologías de implementación. |
| Siguiente nivel | Nivel 2: contenedores de software que conforman AyniSafe. |

## 2. Diagrama

![Diagrama de contexto de AyniSafe · Modelo C4, nivel 1](../../img/aynisafe-nivel1-contexto.svg)

[Abrir el diagrama interactivo](../../img/diagramas-interactivos/nivel1-contexto-aynisafe.html).

La leyenda distingue personas, sistema en alcance y sistemas o servicios externos. Las flechas indican quién utiliza AyniSafe y qué solicita a cada servicio; no representan una secuencia temporal.

El bloque AyniSafe incluye la aplicación móvil, el panel de operaciones y sus servicios propios. **Mapas y geolocalización** se agrupan como una capacidad externa en esta vista: la cartografía procede del proveedor de mapas y la ubicación del servicio del dispositivo, con autorización del ciudadano. La agrupación no implica un único proveedor ni una única API. **Storage** se muestra como el servicio externo de almacenamiento de evidencias.

## 3. Personas (usuarios)

| Persona | Descripción | Qué hace en el sistema |
|---|---|---|
| **Ciudadano registrado** | Usuario de la app Flutter en Ayacucho. | Reporta y sigue sus reportes; consulta mapa por distrito, alertas, contactos, perfil e información de la app. |
| **Operador autorizado** | Personal autorizado de una sede e institución. | Recibe avisos de su ámbito y revisa, clasifica y atiende casos; registra decisiones, actuaciones y coordinación con otras entidades. |
| **Administrador** | Responsable de la organización y configuración. | Crea instituciones y sedes con su operador inicial; configura cobertura, competencias, reglas y contenido; recibe avisos de su ámbito de supervisión. |

## 4. Sistemas y servicios

| Sistema o servicio | Tipo | Responsabilidad | Quién lo construye o provee |
|---|---|---|---|
| **AyniSafe** | Sistema en alcance | Permite reportar, revisar y seguir incidentes, consultar el mapa y recibir alertas preventivas. | El equipo del proyecto. |
| **Servicio de notificaciones push** | Sistema externo | Entrega alertas preventivas y notificaciones de cambios de estado a los dispositivos. | FCM, con APNs para la versión iOS. |
| **Mapas y geolocalización** | Servicios externos agrupados | Proporcionan cartografía para visualizar incidentes y coordenadas cuando el ciudadano concede permiso. | OpenFreeMap como cartografía candidata según ADR-009; ubicación mediante la plataforma del dispositivo. |
| **Storage** | Sistema externo | Almacena las evidencias privadas y permite su carga y consulta autorizadas. | Proveedor de almacenamiento; no especificado en esta vista. |

## 5. Relaciones

| Origen | Destino | Descripción | Mecanismo de comunicación |
|---|---|---|---|
| Ciudadano registrado | AyniSafe | Reporta incidentes y consulta su estado, el mapa y las alertas. | Interacción de usuario. |
| Operador autorizado | AyniSafe | Revisa y valida reportes, gestiona incidentes y registra actuaciones. | Interacción de usuario. |
| Administrador | AyniSafe | Administra usuarios, permisos, categorías, reglas y contenido. | Interacción de usuario. |
| AyniSafe | Servicio de notificaciones push | Solicita la entrega de alertas y cambios relevantes a destinatarios elegibles. | API HTTPS de FCM. |
| AyniSafe | Mapas y geolocalización | Obtiene cartografía y solicita coordenadas únicamente con autorización del usuario. | API o SDK de mapas y API de ubicación de la plataforma móvil. |
| AyniSafe | Storage | Solicita almacenar y consultar evidencias, manteniendo los archivos privados y controlando el acceso. | API del servicio de almacenamiento mediante HTTPS. |

Las relaciones entre personas y AyniSafe expresan sus usos principales. Los canales y protocolos de los clientes se detallan en el nivel 2.

## 6. Decisiones y supuestos

| # | Decisión o supuesto | Motivo |
|---|---|---|
| 1 | AyniSafe se representa como una sola caja. | Delimitar el sistema y sus relaciones externas en el nivel 1. |
| 2 | El ciudadano selecciona categoría; el operador revisa y decide. | Mantener la supervisión humana establecida en RC05. |
| 3 | La ubicación se incorpora solo con autorización y la información pública se limita a datos permitidos. | Proteger la privacidad de ciudadanos, reportes y evidencias. |
| 4 | Las integraciones se adaptan a los contratos de los proveedores. | Los servicios externos se administran fuera del proyecto. |
| 5 | Las integraciones directas con la Policía Nacional del Perú o Serenazgo quedan fuera del alcance actual. | Requieren convenios, autorizaciones e interfaces disponibles, conforme a RC06. |
| 6 | Storage se representa como un servicio externo de almacenamiento; AyniSafe conserva las referencias y los metadatos de las evidencias. | Mostrar su responsabilidad sin especificar proveedor ni tecnología en esta vista de contexto. |

### Pendientes por definir

| Tema | Detalle |
|---|---|
| Proveedores externos | Concretar contratos de almacenamiento; validar MapLibre/OpenFreeMap y FCM para Flutter. |
| Datos compartidos | Precisar qué información autorizada recibe cada proveedor y qué campos se permiten en mapas y alertas públicas. |
| Ubicación denegada | El flujo está definido: punto manual consentido, distrito declarado o ubicación pendiente; falta comprobarlo en la app. |
| Evidencias en Storage | Concretar formatos, tamaños, retención y permisos de carga y consulta de los archivos privados. |

## 7. Alcance institucional actualizado

Solo existen ciudadano, administrador y operador; «personal autorizado» significa operador. El administrador crea registros institucionales y sedes con su operador inicial, dentro del catálogo exclusivo de PNP, Bomberos, SAMU y Serenazgo. Las cuatro instituciones participan mediante sus operadores en AyniSafe; no se presupone integración con sus centrales externas. El ciudadano usa la app Flutter y el visitante puede consultar la portada web informativa sin constituir un rol nuevo. El panel ofrece bandejas por ámbito.

FCM sustituye Expo en la propuesta móvil, con APNs para iOS; el panel obtiene sus notificaciones desde la API. La cartografía base es externa y la ubicación procede del dispositivo; los distritos y reglas territoriales pertenecen a AyniSafe. Véase [especificación](../01-analisis-del-sistema/09-alcance-territorial-e-institucional.md).

Acuerdos de operación: [catálogo de cinco distritos y sedes candidatas](../01-analisis-del-sistema/10-catalogo-territorial-y-sedes.md) y [política de estados, FIFO, publicación, alertas y conservación](../01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md). La etiqueta de prioridad se asigna manualmente en el MVP; las correlaciones siguen en Análisis. Las sedes documentadas no se consideran integraciones institucionales activas.
