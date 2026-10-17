# Nivel 4 · Diagrama de código

> **Proyecto:** AyniSafe · **Módulo detallado:** Reportes  
> **Modelo:** C4 · Nivel 4 de 4 · **Notación:** UML · **Versión:** 1.0

## 1. Objetivo

Detallar las clases, interfaces y colaboraciones del módulo **Reportes** de la API AyniSafe. Se desarrolla el flujo **Registrar reporte**, desde la solicitud del ciudadano hasta la persistencia del reporte y su evento pendiente, con análisis posterior en segundo plano.

| Aspecto | Descripción |
|---|---|
| Pregunta que responde | ¿Qué tipos forman el módulo y cómo colaboran para registrar un reporte? |
| Audiencia | Desarrolladores. |
| Notación | UML de clases y secuencia, acompañado de contratos TypeScript. |
| Por qué Reportes | Reúne validación, permisos, ubicación autorizada, evidencias privadas y persistencia transaccional. |
| Nivel anterior | [Nivel 3: componentes](Nivel3-DiagramadeComponentes.md). |
| Alcance | Diseño propuesto; las firmas y carpetas se basan en el [diseño interno de módulos](../03-diseño-de-software/diseño-interno/diseño-interno-de-modulos.md). |

## 2. Diagrama de clases

![Diagrama UML de clases del módulo Reportes de AyniSafe](../../img/aynisafe-clases-modulo-reportes.svg)

[Explorar las relaciones y el detalle de los tipos](../../img/fuentes-html/clases-modulo-reportes.html).


### 2.1 Capas de Clean Architecture

| Capa | Contiene | Regla |
|---|---|---|
| **Presentación** | Rutas, controladores y esquemas de entrada. | Traduce HTTP a comandos y resultados; obtiene al autor de la sesión verificada. |
| **Aplicación** | Casos de uso, comandos y puertos. | Coordina permisos, validaciones y persistencia mediante interfaces; depende del dominio. |
| **Dominio** | Entidades, objetos de valor y tipos del negocio. | Protege las invariantes del reporte sin depender de Express, Prisma ni servicios externos. |
| **Infraestructura** | Adaptadores de persistencia, evidencias y colaboración entre módulos. | Implementa los puertos de Aplicación con tecnologías y contratos concretos. |

En este diseño, **los puertos están en Aplicación**. Infraestructura depende de esos contratos; el caso de uso no importa sus implementaciones. `reportes.module.ts` construye e inyecta los colaboradores en la raíz de composición.

### 2.2 Clases e interfaces del registro

| Tipo | Naturaleza | Capa | Responsabilidad |
|---|---|---|---|
| `ReporteController` | Controlador | Presentación | Recibe `POST /api/v1/reportes`, valida la entrada, ejecuta el caso de uso y traduce el resultado a HTTP. |
| `RegistrarReporteUseCase` | Caso de uso | Aplicación | Comprueba permisos, categoría y evidencias; crea el reporte y solicita guardarlo con su evento. |
| `Reporte` | Entidad | Dominio | Valida los datos del envío y establece su estado inicial `REGISTRADO`. |
| `Ubicacion` | Objeto de valor | Dominio | Valida latitud, longitud y autorización al construir una ubicación. |
| `ReferenciaEvidencia` | Interfaz de datos | Dominio | Identifica una evidencia privada asociada al reporte. |
| `IdentidadPort` | Puerto | Aplicación | Exige el permiso `reportes:registrar` para el actor autenticado. |
| `CategoriasPort` | Puerto | Aplicación | Comprueba que la categoría esté activa. |
| `EvidenciasPort` | Puerto | Aplicación | Verifica existencia, propiedad y cumplimiento de la política de las referencias de evidencia. |
| `RegistroReportePort` | Puerto de persistencia | Aplicación | Define `guardarConEvento(reporte, evento)` con garantía de guardar todo o nada. |
| `PrismaRegistroReporteAdapter` | Adaptador de persistencia | Infraestructura | Implementa el registro atómico del reporte, sus referencias y el evento pendiente en PostgreSQL. |
| `S3EvidenciasAdapter` | Adaptador de evidencias del ejemplo técnico | Infraestructura | Implementa `EvidenciasPort` para verificar las evidencias del autor. |

**Storage** es la capacidad de almacenamiento identificada en las vistas anteriores. El nombre `S3EvidenciasAdapter` se conserva del ejemplo técnico del diseño interno; el contrato del módulo es `EvidenciasPort`, que permite sustituir la implementación sin cambiar el caso de uso.

### 2.3 Tipos de apoyo y composición

| Elemento | Ubicación | Contenido o función |
|---|---|---|
| `DatosReporte` | Dominio | Identificador, autor, categoría, descripción, fechas, ubicación opcional y referencias de evidencia. |
| `EstadoReporte` | Dominio | Define `REGISTRADO` como estado inicial del envío; el estado operativo del incidente corresponde a Operaciones. |
| `RegistrarReporteCommand` | Aplicación | Categoría, descripción, fecha de ocurrencia, ubicación autorizada opcional e identificadores de evidencias; no recibe el autor desde el cuerpo HTTP. |
| `ReporteRegistrado` | Aplicación | Evento con identificador, tipo, versión, identificador del reporte y momento del evento; no transporta descripción, ubicación ni archivos. |
| `crearModuloReportes(...)` | Composición | Conecta puertos y adaptadores e inyecta el reloj y el generador de identificadores. Se exporta desde `index.ts`. |

Estos elementos complementan los tipos dibujados. La consulta interna autorizada para Análisis y Operaciones se expondrá mediante la API pública de Reportes, sin exportar su repositorio.

### 2.4 Notación UML utilizada

| Símbolo | Significado | Ejemplo |
|---|---|---|
| Línea continua con flecha abierta | Asociación con un colaborador. | `RegistrarReporteUseCase` → `RegistroReportePort`. |
| Línea discontinua con flecha abierta | Dependencia de uso o creación. | El caso de uso «crea» `Reporte`. |
| Línea discontinua con triángulo hueco | Realización de una interfaz. | `PrismaRegistroReporteAdapter` implementa `RegistroReportePort`. |
| Rombo relleno | Composición de los datos del reporte. | `Reporte` contiene ubicación `0..1` y referencias `0..*` mediante `DatosReporte`. |
| «interface» | Contrato o interfaz de datos. | `EvidenciasPort` y `ReferenciaEvidencia`. |
| `-`, `+` y `{static}` | Miembro privado, público y operación de clase. | `- registro`, `+ ejecutar(...)` y `Reporte.crear(...)`. |

La composición se refiere a los valores y referencias asociados al reporte; el archivo físico en Storage tiene su propio ciclo de vida.

## 3. Diagrama de secuencia: registrar reporte

![Diagrama de secuencia del registro de un reporte en AyniSafe](../../img/aynisafe-secuencia-registrar-reporte.svg)

[Abrir la secuencia interactiva](../../img/fuentes-html/registrar-reporte.html).

Las evidencias se cargan previamente mediante un flujo autorizado. La solicitud envía sus identificadores y la ubicación solo cuando existe autorización. El autor se obtiene de la sesión verificada.

| Paso del diagrama | Origen → destino | Acción |
|---|---|---|
| 1–2 | Aplicación móvil → `ReporteController` → `RegistrarReporteUseCase` | Envía `POST /api/v1/reportes`; el controlador verifica sesión y formato, y ejecuta `ejecutar(autorId, command)`. |
| 3–4 | Caso de uso → puertos de validación | Comprueba permisos, categoría activa y referencias de evidencia. |
| 5 | Caso de uso → `RegistroReportePort` | Tras crear `Reporte` y `ReporteRegistrado`, solicita `guardarConEvento(...)`. |
| 6–7 | Adaptador de registro ↔ PostgreSQL | Guarda el reporte, sus referencias y el evento pendiente en una transacción local; confirma el `COMMIT`. |
| 8–9 | Registro → caso de uso → controlador | Confirma la persistencia y devuelve `{ reporteId, estado: REGISTRADO }`. |
| 10 | Controlador → aplicación móvil | Responde `201 Created` sin esperar a la IA ni a las notificaciones. |
| 11–12 | Despachador → PostgreSQL y Análisis | Lee los eventos pendientes confirmados y entrega `ReporteRegistrado`. |
| 13–14 | Análisis → despachador → PostgreSQL | Análisis obtiene datos autorizados, genera y persiste sugerencias; después se registra la entrega completada. |

`Validación` agrupa `IdentidadPort`, `CategoriasPort` y `EvidenciasPort`; `Registro` representa `RegistroReportePort` y su adaptador. La creación de la entidad y del evento se resume en una nota del caso de uso. El procesamiento del outbox puede comenzar tras el `COMMIT`, independientemente de cuándo llegue la respuesta HTTP al cliente.

### 3.1 Alternativas y recuperación

| Situación | Comportamiento esperado |
|---|---|
| Sesión ausente o inválida | Responder `401` sin ejecutar el registro. |
| Datos inválidos | Responder `400` sin persistir un reporte parcial. |
| Permisos insuficientes o evidencia ajena | Responder `403` sin revelar información de recursos ajenos. |
| Fallo de la transacción | Revertir reporte y evento; devolver un error controlado sin confirmar el registro. |
| IA no disponible | Conservar el reporte registrado y la tarea pendiente para aplicar reintentos. |
| Solicitud o evento repetido | Usar una clave de idempotencia por registro y seguimiento de eventos procesados por consumidor para evitar efectos duplicados. |

El diagrama muestra el flujo exitoso; las alternativas se resumen en la tabla. La confirmación de un consumidor no sustituye el seguimiento de otros consumidores. Las sugerencias de IA quedan sujetas a revisión humana en Operaciones.

## 4. Patrones y principios visibles

| Elemento del diseño | Patrón o principio aplicado |
|---|---|
| `EvidenciasPort` y su adaptador | **Adapter:** separa el contrato de evidencias de la API del proveedor de Storage. |
| `RegistroReportePort` y `PrismaRegistroReporteAdapter` | **Repository y adaptador de persistencia:** aíslan el registro transaccional de Prisma y SQL. |
| Reporte y evento guardados en una transacción | **Transactional Outbox:** conserva trabajo pendiente recuperable después del registro. |
| Colaboradores recibidos por constructor | **Inversión de dependencias:** el caso de uso utiliza puertos, reloj e identificadores inyectados. |
| Controlador, caso de uso, entidad y adaptadores separados | **Responsabilidad única:** cada tipo concentra una responsabilidad. |
| Contratos para permisos, categorías, evidencias y registro | **Segregación de interfaces:** cada puerto expresa una necesidad concreta. |
| Colaboración por contratos públicos y eventos persistentes | **Monolito modular:** no se accede a tablas ni clases internas de otro módulo. |

Detalle en [patrones de diseño](../03-diseño-de-software/diseño-interno/patrones-de-diseño.md), [principios de diseño](../03-diseño-de-software/diseño-interno/principios-de-diseño.md) y los [fragmentos de código del módulo Reportes](../03-diseño-de-software/diseño-interno/diseño-interno-de-modulos.md#7-código-de-referencia).
