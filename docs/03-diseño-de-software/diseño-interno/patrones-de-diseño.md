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
| Adapter | Análisis → proveedor de IA | El proveedor tiene su propia API y formato de respuesta. | API HTTPS o SDK del proveedor. | `proveedor-ia.port.ts`, `proveedor-ia.adapter.ts` |
| Adapter | Alertas → notificaciones push | El envío depende de un servicio externo. | API o SDK del servicio push. | `notificaciones.port.ts`, `notificaciones-push.adapter.ts` |
| Adapter | Reportes → evidencias | El acceso a archivos privados depende de S3. | Cliente de Amazon S3. | `evidencias.port.ts`, `s3-evidencias.adapter.ts` |
| Repository | Módulos → PostgreSQL | Los casos de uso no deben conocer SQL ni Prisma. | PostgreSQL y Prisma. | `consulta-reportes.port.ts`, `prisma-consulta-reportes.adapter.ts` |

## Cómo funciona cada patrón

| Patrón | En pocas palabras |
|---|---|
| Adapter | Traduce las solicitudes del sistema a las operaciones de IA, notificaciones o S3, y convierte sus respuestas al contrato interno. |
| Repository | El caso de uso solicita guardar o consultar datos; la implementación de persistencia realiza las operaciones con Prisma. |
| Decorator | Consulta primero Redis; si no hay un valor vigente, obtiene los datos de PostgreSQL y los guarda temporalmente en caché. |

## Beneficios

- Cambiar el proveedor de IA o notificaciones concentra los cambios en su adaptador y configuración.
- Cambiar la persistencia no exige modificar los casos de uso si se conserva su contrato.
- La caché prevista puede incorporarse sin cambiar las reglas de negocio y debe respetar los permisos de consulta.

## Patrones previstos para siguientes iteraciones

| Patrón | Dónde se aplicaría | Cuándo |
|---|---|---|
| Decorator | Consultas → caché del mapa e indicadores. | Al incorporar Redis para consultas frecuentes. |
| Observer | Eventos de Reportes y Operaciones → Análisis, Alertas y Consultas. | Al implementar consumidores con eventos persistentes, reintentos y control de duplicados. |
| Factory | Construcción de reportes o selección de adaptadores. | Si aparecen variantes que no se resuelven con `Reporte.crear(...)` y la composición actual. |
| Facade | Comunicación entre módulos. | Al concretar una API pública de operaciones, expuesta mediante `index.ts`. |
