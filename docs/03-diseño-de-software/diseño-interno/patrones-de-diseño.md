# Patrones de diseño

## Objetivo

Documentar los patrones de diseño del backend de **AyniSafe**, indicando dónde se usan, qué problema resuelven y con qué tecnología se implementan.

## Contexto

- **Estilo:** monolito modular (Node.js + Express + TypeScript).
- **Enfoque interno:** Clean Architecture.
- **Base:** [Diseño interno de módulos](diseño-interno-de-modulos.md).

Los patrones y archivos corresponden al diseño propuesto del sistema.

## Patrones seleccionados

| Patrón | Dónde se usa | Problema que resuelve | Se implementa con | Archivos del diseño |
|---|---|---|---|---|
| Adapter | Alertas → notificaciones push | El envío depende de un servicio externo. | API o SDK del servicio push. | `notificaciones.port.ts`, `notificaciones-push.adapter.ts` |
| Adapter | Reportes → evidencias | El acceso a archivos privados depende del proveedor elegido. | SDK del proveedor; S3 solo ilustra una alternativa. | `evidencias.port.ts`, `s3-evidencias.adapter.ts` |
| Repository | Módulos → PostgreSQL | Los casos de uso no deben conocer SQL ni Prisma. | PostgreSQL y Prisma. | `consulta-reportes.port.ts`, `prisma-consulta-reportes.adapter.ts` |

## Cómo funciona cada patrón

| Patrón | En pocas palabras |
|---|---|
| Adapter | Traduce las solicitudes del sistema a las operaciones de notificaciones o S3, y convierte sus respuestas al contrato interno. |
| Repository | El caso de uso solicita guardar o consultar datos; la implementación de persistencia realiza las operaciones con Prisma. |
| Decorator | Si se incorpora caché en una evolución: consulta primero la copia vigente y recurre a PostgreSQL. No forma parte del MVP. |

## Beneficios

- Cambiar el proveedor de notificaciones o almacenamiento concentra los cambios en su adaptador y configuración.
- Cambiar la persistencia no exige modificar los casos de uso si se conserva su contrato.
- La caché prevista puede incorporarse sin cambiar las reglas de negocio y debe respetar los permisos de consulta.

## Patrones previstos para siguientes iteraciones

| Patrón | Dónde se aplicaría | Cuándo |
|---|---|---|
| Decorator | Consultas → caché del mapa e indicadores. | Al incorporar Redis para consultas frecuentes. |
| Observer en memoria | Notificación local opcional. | No sustituye las entregas persistentes del outbox. |
| Factory | Construcción de reportes o selección de adaptadores. | Si aparecen variantes que no se resuelven con `Reporte.crear(...)` y la composición actual. |

## Aplicación al alcance ampliado

Las reglas versionadas de destinatarios se evalúan en Operaciones mediante contratos de organización y territorio. Transactional Outbox conserva eventos de registro y cambios; cada consumidor registra sus entregas. Alertas persiste la bandeja por usuario y deduplica, separando lectura de recepción operativa. El adaptador FCM sustituye la propuesta Expo; S3 es un ejemplo sustituible. Las reglas no se delegan a un proveedor de mapas ni al cliente Flutter.

## Patrones ya incluidos en el diseño propuesto

| Patrón | Responsabilidad | Estado |
|---|---|---|
| Transactional Outbox | Persistir cambios y eventos juntos; procesar entregas por consumidor con recuperación. | Diseñado, pendiente de implementación. |
| Facade | Publicar operaciones tipadas de cada módulo desde index.ts, ocultando tablas y repositorios. | Diseñado, contratos completos pendientes. |

Observer en memoria y Decorator no son condiciones para cumplir el diseño inicial. La composición actual usa fábricas sencillas; no se necesita introducir otro patrón Factory sin variantes que lo justifiquen.
