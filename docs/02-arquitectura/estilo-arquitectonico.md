
# Estilo arquitectónico

## 1. Descripción

AyniSafe utilizará un **monolito modular** como estilo arquitectónico principal del backend.

Este estilo permite organizar las funcionalidades del sistema en módulos con responsabilidades definidas, manteniéndolos dentro de una misma aplicación backend y una unidad de despliegue.

La aplicación móvil y el panel web funcionarán como clientes independientes que se comunicarán con el backend mediante una API REST.

## 2. Estilo arquitectónico seleccionado

| Elemento | Descripción |
|---|---|
| Estilo arquitectónico | Monolito modular |
| Objetivo | Organizar las funcionalidades del backend en módulos con responsabilidades delimitadas, manteniendo una unidad principal de despliegue. |
| ¿Qué problema resuelve? | Reduce el acoplamiento entre funcionalidades y evita la complejidad de administrar múltiples servicios independientes desde las primeras etapas del proyecto. |
| Organización | Módulos de Identidad, Reportes, Análisis, Operaciones, Alertas y Consultas. |
| Comunicación externa | API REST mediante HTTPS y JSON. |
| Persistencia | PostgreSQL como base de datos principal, con acceso controlado desde los módulos correspondientes. |
| Integraciones | Servicios externos de mapas, notificaciones y almacenamiento de evidencias. |
| Beneficios | Facilita el mantenimiento, las pruebas, el despliegue y la evolución progresiva del sistema. |

![Estilo Arquitectónico](../../img/aynisafe-estilo-arquitectonico.svg)

## Responsabilidades ampliadas

Se mantienen los seis módulos; no se crean microservicios para instituciones. Identidad es propietaria de instituciones/sedes/operadores/coberturas; Reportes de categorías y distrito del envío; Operaciones del enrutamiento y la atención multiinstitucional; Alertas de bandejas individuales; Consultas de polígonos, filtros y contenido público. Reglas en [alcance territorial e institucional](../01-analisis-del-sistema/09-alcance-territorial-e-institucional.md).

El SVG de estilo es una vista lógica simplificada con nombres Controller/Service/Repository; las cuatro capas de Clean Architecture se detallan en el enfoque y diseño interno. S3 es un adaptador ilustrativo y el proveedor real sigue pendiente según ADR-006. La cartografía base se consume en los clientes; Consultas calcula los indicadores del negocio a partir de los datos propios.

La etiqueta de prioridad es manual en el MVP y no reordena la bandeja FIFO. Análisis conserva la correlación por categoría, distancia y tiempo. La política operativa y de conservación se define en [documento 11](../01-analisis-del-sistema/11-operacion-publicacion-y-conservacion.md).
