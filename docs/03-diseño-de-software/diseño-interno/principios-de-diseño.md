# Principios de diseño (SOLID)

## Objetivo

Documentar cómo se aplican los principios SOLID en el backend de **AyniSafe** para organizar los módulos y mantener las reglas de negocio independientes de la tecnología.

## Contexto

- **Estilo:** monolito modular (Node.js + Express + TypeScript).
- **Enfoque interno:** Clean Architecture: Presentación, Aplicación, Dominio e Infraestructura.
- **Módulo de referencia:** Reportes, por su coordinación con Identidad, PostgreSQL y el almacenamiento de evidencias.
- **Base:** Diseño interno de módulos

Los ejemplos y archivos corresponden al diseño propuesto del sistema.

## SOLID en AyniSafe

| Principio | Dónde se aplica (capa) | Cómo se aplica en AyniSafe | Archivos |
|---|---|---|---|
| **S** · Responsabilidad única | Todas las capas | El controlador atiende HTTP, el caso de uso coordina el registro, la entidad valida las reglas del reporte y el adaptador realiza la persistencia. | `reporte.controller.ts`, `registrar-reporte.use-case.ts`, `reporte.ts`, `prisma-registro-reporte.adapter.ts` |
| **O** · Abierto/cerrado | Aplicación e Infraestructura | Para incorporar otro proveedor de almacenamiento se crea un adaptador de `EvidenciasPort` y se cambia su configuración, conservando el caso de uso y el contrato. | `evidencias.port.ts`, `s3-evidencias.adapter.ts`, `reportes.module.ts` |
| **L** · Sustitución de Liskov | Implementaciones de los puertos | Un adaptador de pruebas y el de PostgreSQL deben respetar el mismo contrato: `guardarConEvento(...)` guarda reporte y evento juntos, o no guarda ninguno. | `registro-reporte.port.ts`, `prisma-registro-reporte.adapter.ts` |
| **I** · Segregación de interfaces | Aplicación | Cada puerto ofrece las operaciones que requiere su responsabilidad: verificar permisos, validar categorías, comprobar evidencias o persistir el registro. | `identidad.port.ts`, `categorias.port.ts`, `evidencias.port.ts`, `registro-reporte.port.ts` |
| **D** · Inversión de dependencias | Aplicación y composición | `RegistrarReporteUseCase` recibe interfaces por constructor; las implementaciones concretas se conectan en `reportes.module.ts`, sin introducir Prisma ni S3 en el caso de uso. | `registrar-reporte.use-case.ts`, `reportes.module.ts` |

## Qué pasaría sin SOLID en AyniSafe

| Situación | Sin SOLID | Con SOLID |
|---|---|---|
| Cambia el almacenamiento de evidencias | Se modifican los casos de uso que llaman directamente a S3. | Se reemplaza el adaptador manteniendo `EvidenciasPort`. |
| Cambia el proveedor de IA | El análisis depende del formato y del SDK del proveedor. | Un nuevo adaptador conserva el contrato de `ProveedorIAPort`. |
| Se quiere probar el registro de un reporte | Se necesitan PostgreSQL, S3 y los servicios reales. | El caso de uso se prueba con implementaciones de prueba de sus puertos. |
| Cambia una regla de creación del reporte | La regla está repetida en controladores y servicios. | La regla se modifica en `Reporte` o `Ubicacion`, según corresponda. |
| Se sustituye el adaptador de persistencia | El reemplazo podría guardar el reporte sin su evento. | Se exige conservar la atomicidad definida por `RegistroReportePort`. |

## Relación con Clean Architecture y los patrones

| Principio | Cómo lo favorece el diseño |
|---|---|
| Responsabilidad única | Las capas separan transporte, coordinación, reglas de negocio y acceso a servicios externos. |
| Abierto/cerrado y Liskov | Adapter permite sustituir proveedores respetando el contrato y su comportamiento esperado. |
| Segregación de interfaces | Los puertos de Aplicación delimitan las necesidades de cada colaborador. |
| Inversión de dependencias | Los casos de uso dependen de puertos; Repository y los adaptadores concretos implementan esas abstracciones desde Infraestructura. |
