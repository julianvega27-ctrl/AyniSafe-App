# Nivel 1 · Diagrama de contexto del sistema

> **Proyecto:** AyniSafe  
> **Modelo:** C4 · Nivel 1 de 4 · **Versión:** 1.0

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

[Abrir el diagrama interactivo](../../img/fuentes-html/nivel1-contexto-aynisafe.html).

La leyenda distingue personas, sistema en alcance y sistemas o servicios externos. Las flechas indican quién utiliza AyniSafe y qué solicita a cada servicio; no representan una secuencia temporal.

El bloque AyniSafe incluye la aplicación móvil, el panel de operaciones y sus servicios propios. **Mapas y geolocalización** se agrupan como una capacidad externa en esta vista: la cartografía procede del proveedor de mapas y la ubicación del servicio del dispositivo, con autorización del ciudadano. La agrupación no implica un único proveedor ni una única API. **Storage** se muestra como el servicio externo de almacenamiento de evidencias.

## 3. Personas (usuarios)

| Persona | Descripción | Qué hace en el sistema |
|---|---|---|
| **Ciudadano registrado** | Persona que utiliza AyniSafe en Ayacucho. | Registra incidentes, autoriza su ubicación, adjunta evidencias y consulta seguimiento, mapa y alertas. |
| **Operador autorizado** | Personal responsable de revisar y gestionar los incidentes. | Revisa sugerencias de IA, valida, consolida, descarta, deriva y actualiza incidentes; registra actuaciones y responsables. |
| **Administrador** | Responsable de la configuración y administración de la plataforma. | Gestiona cuentas, roles, categorías, reglas de alertas, parámetros y contenido informativo. |

## 4. Sistemas y servicios

| Sistema o servicio | Tipo | Responsabilidad | Quién lo construye o provee |
|---|---|---|---|
| **AyniSafe** | Sistema en alcance | Permite reportar, revisar y seguir incidentes, consultar el mapa y recibir alertas preventivas. | El equipo del proyecto. |
| **Servicio de IA** | Sistema externo | Genera sugerencias de categoría, prioridad orientativa y similitud entre reportes. | Proveedor de IA por seleccionar. |
| **Servicio de notificaciones push** | Sistema externo | Entrega alertas preventivas y notificaciones de cambios de estado a los dispositivos. | Proveedor de notificaciones por seleccionar. |
| **Mapas y geolocalización** | Servicios externos agrupados | Proporcionan cartografía para visualizar incidentes y coordenadas cuando el ciudadano concede permiso. | Proveedor de mapas por seleccionar y plataforma del dispositivo móvil. |
| **Storage** | Sistema externo | Almacena las evidencias privadas y permite su carga y consulta autorizadas. | Proveedor de almacenamiento; no especificado en esta vista. |

## 5. Relaciones

| Origen | Destino | Descripción | Mecanismo de comunicación |
|---|---|---|---|
| Ciudadano registrado | AyniSafe | Reporta incidentes y consulta su estado, el mapa y las alertas. | Interacción de usuario. |
| Operador autorizado | AyniSafe | Revisa y valida reportes, gestiona incidentes y registra actuaciones. | Interacción de usuario. |
| Administrador | AyniSafe | Administra usuarios, permisos, categorías, reglas y contenido. | Interacción de usuario. |
| AyniSafe | Servicio de IA | Solicita análisis de datos autorizados y recibe sugerencias para revisión humana. | API mediante HTTPS; contrato por definir. |
| AyniSafe | Servicio de notificaciones push | Solicita la entrega de alertas y cambios relevantes a destinatarios elegibles. | API o SDK del proveedor por seleccionar. |
| AyniSafe | Mapas y geolocalización | Obtiene cartografía y solicita coordenadas únicamente con autorización del usuario. | API o SDK de mapas y API de ubicación de la plataforma móvil. |
| AyniSafe | Storage | Solicita almacenar y consultar evidencias, manteniendo los archivos privados y controlando el acceso. | API del servicio de almacenamiento mediante HTTPS. |

Las relaciones entre personas y AyniSafe expresan sus usos principales. Los canales y protocolos de los clientes se detallan en el nivel 2.

## 6. Decisiones y supuestos

| # | Decisión o supuesto | Motivo |
|---|---|---|
| 1 | AyniSafe se representa como una sola caja. | Delimitar el sistema y sus relaciones externas en el nivel 1. |
| 2 | La IA sugiere; el personal autorizado valida y decide. | Mantener la supervisión humana establecida en RC05. |
| 3 | La ubicación se incorpora solo con autorización y la información pública se limita a datos permitidos. | Proteger la privacidad de ciudadanos, reportes y evidencias. |
| 4 | Las integraciones se adaptan a los contratos de los proveedores. | Los servicios externos se administran fuera del proyecto. |
| 5 | Las integraciones directas con la Policía Nacional del Perú o Serenazgo quedan fuera del alcance actual. | Requieren convenios, autorizaciones e interfaces disponibles, conforme a RC06. |
| 6 | Storage se representa como un servicio externo de almacenamiento; AyniSafe conserva las referencias y los metadatos de las evidencias. | Mostrar su responsabilidad sin especificar proveedor ni tecnología en esta vista de contexto. |

### Pendientes por definir

| Tema | Detalle |
|---|---|
| Proveedores externos | Seleccionar los servicios de IA, mapas y notificaciones, y concretar sus contratos y condiciones de uso. |
| Datos compartidos | Precisar qué información autorizada recibe cada proveedor y qué campos se permiten en mapas y alertas públicas. |
| Ubicación denegada | Definir cómo continúa el ciudadano cuando no concede el permiso de ubicación. |
| Evidencias en Storage | Concretar formatos, tamaños, retención y permisos de carga y consulta de los archivos privados. |
