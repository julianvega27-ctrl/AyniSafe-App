# Diseño interno de módulos

> **Proyecto:** AyniSafe · **Backend:** Node.js + Express + TypeScript · **Módulo de referencia:** Reportes
> **Estilo arquitectónico:** Monolito modular · **Enfoque interno:** Clean Architecture dentro de cada módulo del monolito modular
>  **Nivel C4:** 4 - codigo · **Versión:** 1.0 

## 1. Propósito y alcance

Este documento define cómo organizar el código de los módulos del backend de AyniSafe, qué responsabilidad corresponde a cada capa y cómo deben colaborar las funcionalidades del sistema. Se desarrolla el módulo **Reportes** como referencia para registrar incidentes con ubicación autorizada y evidencias privadas.

La estructura permite mantener las reglas de negocio independientes de Express, Prisma, PostgreSQL, Amazon S3 y los proveedores de inteligencia artificial y notificaciones. La aplicación móvil y el panel web consumen la misma API REST; no acceden directamente a la base de datos.

El diseño se basa en el [estilo de monolito modular](../../02-arquitectura/estilo-arquitectonico.md) y el [enfoque de Clean Architecture](../../02-arquitectura/enfoque-arquitectonico.md).
## 2. Módulos y responsabilidades

| Módulo | Responsabilidad | Elementos internos propuestos | Requisitos relacionados |
|---|---|---|---|
| **Identidad** | Gestionar cuentas, autenticación, perfiles y permisos por rol. | Usuario, Rol, RegistrarUsuario, IniciarSesion, RecuperarContrasena y AutorizarAccion. | RF01–RF05, RF22 |
| **Reportes** | Registrar y conservar reportes ciudadanos, sus ubicaciones autorizadas y las referencias a sus evidencias; permitir al autor consultar su seguimiento. Administrar las categorías admitidas. | Reporte, Ubicacion, ReferenciaEvidencia, Categoria, RegistrarReporte, ConsultarMisReportes y GestionarCategorias. | RF06–RF10, RF23 |
| **Análisis** | Generar sugerencias de categoría, prioridad y relaciones entre reportes mediante procesamiento asíncrono. | SugerenciaAnalisis, AnalizarReporte, BuscarReportesRelacionados y ProveedorIAPort. | RF11–RF13 |
| **Operaciones** | Revisar, validar, consolidar y descartar reportes; gestionar incidentes y registrar actuaciones y cambios de estado. | Incidente, Actuacion, RevisarReporte, ValidarReporte, ConsolidarReportes y CambiarEstadoIncidente. | RF14–RF17 |
| **Alertas** | Evaluar reglas de proximidad, distribuir alertas preventivas y notificar cambios relevantes. | ReglaAlerta, AlertaPreventiva, EvaluarDestinatarios, NotificarCambioEstado y NotificacionesPort. | RF18, RF19, RF24 |
| **Consultas** | Entregar vistas del mapa, estadísticas y consultas del panel, aplicando filtros de privacidad y permisos; gestionar el contenido informativo. | ConsultarMapa, ConsultarIndicadores, ConsultarPanel y GestionarContenidoInformativo. | RF20, RF21, RF25–RF27 |

Un **reporte** representa la comunicación original de un ciudadano. Un **incidente** representa el caso gestionado por Operaciones y puede vincular varios reportes. Consolidarlos no debe eliminar su autoría, evidencias ni historial. Reportes conserva el envío original; Operaciones es responsable del estado operativo del incidente, que los demás módulos consultan mediante contratos públicos.

### 2.1 Comunicación y propiedad de los datos

- Cada módulo controla las escrituras sobre sus propios datos, aunque comparta la misma instancia de PostgreSQL con los demás.
- Las llamadas dentro del monolito utilizan contratos públicos tipados y composición de dependencias. No requieren solicitudes HTTP entre módulos.
- Un módulo consumidor define el puerto que necesita; un adaptador conecta ese puerto con la API pública del módulo proveedor. No se importan entidades, repositorios concretos ni archivos internos de otro módulo.
- Los hechos que requieren procesamiento posterior, como `ReporteRegistrado` o `EstadoIncidenteCambiado`, se entregan mediante tareas o eventos persistentes con identificadores y versiones de contrato.
- Consultas puede mantener proyecciones de lectura alimentadas por esos contratos. Las proyecciones no conceden permiso para modificar datos de otros módulos y deben indicar su posible demora de actualización.

## 3. Estructura de carpetas

La misma organización por capas se aplica a los seis módulos. El siguiente árbol detalla Reportes y muestra los límites de los demás.

```text
src/
├── app.ts                                      Composición general del backend
├── modules/
│   ├── identidad/
│   ├── reportes/
│   │   ├── dominio/
│   │   │   ├── reporte.ts                      Entidad y reglas del reporte
│   │   │   ├── estado-reporte.ts               Estado inicial del envío
│   │   │   ├── ubicacion.ts                    Coordenadas y autorización
│   │   │   └── referencia-evidencia.ts         Identificador de evidencia privada
│   │   ├── aplicacion/
│   │   │   ├── registrar-reporte.command.ts    Entrada independiente de HTTP
│   │   │   ├── registrar-reporte.use-case.ts   Coordinación del registro
│   │   │   ├── consultar-mis-reportes.use-case.ts
│   │   │   └── puertos/
│   │   │       ├── registro-reporte.port.ts    Persistencia atómica y tarea pendiente
│   │   │       ├── consulta-reportes.port.ts   Lectura de reportes propios
│   │   │       ├── categorias.port.ts         Consulta de categorías habilitadas
│   │   │       ├── evidencias.port.ts         Verificación y acceso a evidencias
│   │   │       ├── identidad.port.ts          Autorización del actor
│   │   │       └── seguimiento.port.ts        Seguimiento provisto por Operaciones
│   │   ├── infraestructura/
│   │   │   ├── prisma-registro-reporte.adapter.ts
│   │   │   ├── prisma-consulta-reportes.adapter.ts
│   │   │   ├── prisma-categorias.adapter.ts
│   │   │   ├── s3-evidencias.adapter.ts
│   │   │   ├── identidad-publica.adapter.ts
│   │   │   └── operaciones-seguimiento.adapter.ts
│   │   ├── presentacion/
│   │   │   ├── reporte.controller.ts          Traducción HTTP a casos de uso
│   │   │   ├── reporte.schema.ts              Validación de solicitudes
│   │   │   └── reportes.routes.ts             Rutas /api/v1/reportes
│   │   ├── reportes.module.ts                 Raíz de composición del módulo
│   │   └── index.ts                           Contratos y fachada públicos
│   ├── analisis/
│   ├── operaciones/
│   ├── alertas/
│   └── consultas/
└── shared/
    ├── aplicacion/                             Contratos técnicos mínimos
    └── infraestructura/                        Conexiones, outbox y observabilidad
```

`shared/` contiene utilidades y mecanismos comunes, no las reglas de Reportes, Operaciones o Alertas. El **outbox** propuesto es un registro de eventos pendientes guardado en la misma transacción que el cambio de negocio; permite recuperarlos aunque falle el proceso antes de entregarlos a un consumidor.

| Archivo o grupo | Capa | Responsabilidad | Importa de |
|---|---|---|---|
| `reporte.ts`, `ubicacion.ts`, `estado-reporte.ts`, `referencia-evidencia.ts` | Dominio | Expresar un reporte válido y proteger sus invariantes. | Solo Dominio |
| `registrar-reporte.command.ts` | Aplicación | Definir los datos de entrada sin objetos HTTP. | Tipos del dominio cuando corresponda. |
| `registrar-reporte.use-case.ts` | Aplicación | Autorizar, verificar referencias, crear el reporte y solicitar su persistencia. | Dominio y puertos de aplicación. |
| `aplicacion/puertos/` | Aplicación | Declarar las capacidades externas que necesitan los casos de uso. | Dominio y contratos de aplicación. |
| `prisma-*.adapter.ts` | Infraestructura | Traducir entidades y consultas a persistencia en PostgreSQL. | Puertos, dominio y Prisma. |
| `s3-evidencias.adapter.ts` | Infraestructura | Verificar evidencias y proporcionar acceso temporal autorizado. | Puertos, metadatos de evidencia y cliente de S3. |
| `identidad-publica.adapter.ts`, `operaciones-seguimiento.adapter.ts` | Infraestructura | Conectar puertos locales con contratos públicos de otros módulos. | Puertos propios y API pública del módulo proveedor. |
| `reporte.controller.ts`, `reporte.schema.ts`, `reportes.routes.ts` | Presentación | Validar el formato, obtener el actor autenticado y traducir entradas, resultados y errores HTTP. | Aplicación, Express y validador elegido. |
| `reportes.module.ts` | Composición | Instanciar adaptadores, inyectar dependencias y construir la fachada. | Todas las capas del módulo y contratos públicos necesarios. |
| `index.ts` | API pública | Exportar la fábrica, la fachada y los tipos públicos; ocultar implementaciones internas. | Contratos públicos y composición. |

## 4. Capas del módulo y reglas de dependencia

Las dependencias del código apuntan hacia las políticas internas. Una llamada desde un caso de uso hacia un puerto puede terminar en PostgreSQL o S3 durante la ejecución, pero el caso de uso solo conoce la interfaz que declara su necesidad.

![Diagrama de paquetes del módulo Reportes de AyniSafe](../../../img/aynisafe-paquetes-modulo-reportes.svg)

[Abrir el diagrama interactivo](../../../img/fuentes-html/paquetes-modulo-reportes.html).

Cada paquete corresponde a una carpeta de `src/modules/reportes/`. El archivo `reportes.module.ts` se muestra por separado como raíz de composición. El diagrama representa el diseño propuesto; la versión interactiva incluye el detalle de los archivos de cada paquete.

Las flechas representan dependencias de código. La composición conecta las implementaciones concretas en el arranque.

La relación **«importa»** indica el uso de elementos del paquete de destino. La relación **«implementa»** muestra que los adaptadores de Infraestructura implementan los puertos definidos en Aplicación; por eso la dependencia apunta hacia Aplicación. Las relaciones **«crea»** parten de la raíz de composición, que construye el controlador, los casos de uso y los adaptadores e inyecta sus dependencias.

| Capa | Contiene | Puede depender de | No puede depender de |
|---|---|---|---|
| **Dominio** | Entidades, objetos de valor y reglas de negocio. | Elementos del propio dominio. | Aplicación, presentación, infraestructura, Express, Prisma y SDK externos. |
| **Aplicación** | Casos de uso, comandos, resultados y puertos de sus colaboradores. | Dominio y contratos internos de aplicación. | Controladores, adaptadores concretos, Express, Prisma y clientes de proveedores. |
| **Infraestructura** | Persistencia, acceso a archivos, integraciones y consumidores de tareas. | Dominio, puertos de aplicación, contratos públicos y librerías externas. | Presentación y detalles internos de otros módulos. |
| **Presentación** | Rutas, controladores, esquemas y traducción de errores. | Contratos y casos de uso de aplicación; librerías de transporte y validación. | Repositorios concretos, tablas y SDK de servicios externos. |
| **Composición** | Fábricas y configuración de dependencias. | Todas las capas necesarias para construir el módulo. | Reglas de negocio propias del caso de uso. |

En esta propuesta, los puertos de persistencia e integración se ubican en **Aplicación** porque expresan necesidades de los casos de uso. Infraestructura los implementa. El dominio no conoce el mecanismo de tareas pendientes ni los mensajes de transporte.

La revisión de los `import` debe comprobar estas reglas y que los accesos entre módulos pasen por su `index.ts`. Por ejemplo, `RegistrarReporteUseCase` no debe importar `PrismaClient`, y Análisis no debe importar el repositorio interno de Reportes.

## 5. Diagrama de clases

![Diagrama UML de clases del módulo Reportes de AyniSafe](../../../img/aynisafe-clases-modulo-reportes.svg)

[Explorar las relaciones en Archify](../../../img/fuentes-html/clases-modulo-reportes.html).

La imagen conserva los once tipos y las diez relaciones del diagrama original, con atributos, operaciones y notación UML. Los colores identifican las capas de Presentación, Aplicación, Dominio e Infraestructura. La vista interactiva de Archify representa las mismas relaciones mediante nodos y etiquetas, con el detalle de cada tipo en sus notas.

En coherencia con el código de la sección 7.1, `Reporte` contiene `datos: Readonly<DatosReporte>` y su estado inicial. Las relaciones con `Ubicacion` y `ReferenciaEvidencia` se muestran de forma resumida a través de `DatosReporte`. Las firmas de operaciones están abreviadas; `Resultado` representa la salida `{ reporteId, estado }` del registro y `{static}` identifica una operación de clase.

La composición une el reporte con sus referencias, no con el ciclo de vida físico del archivo en S3. Una flecha continua indica una referencia a un colaborador; una discontinua con triángulo indica implementación de interfaz; el rombo relleno indica composición. Los puertos y la entidad son independientes de los adaptadores concretos.

## 6. Flujo de ejecución: registrar un reporte

Las evidencias se cargan previamente mediante un flujo autorizado. La solicitud de registro incluye sus identificadores, no archivos ni URLs de acceso público.

![Diagrama de secuencia del registro de un reporte en AyniSafe](../../../img/aynisafe-secuencia-registrar-reporte.svg)

[Abrir la secuencia interactiva en Archify](../../../img/fuentes-html/registrar-reporte.html).

El diagrama conserva los ocho participantes del modelo original y organiza el flujo exitoso en tres fases: autorización y validación, persistencia y confirmación, y análisis asíncrono. Presenta catorce intercambios entre participantes; las tres acciones internas —verificar la sesión y el formato, crear el reporte y su evento, y obtener datos autorizados para generar y persistir sugerencias— se conservan como notas en sus pasos correspondientes.

Las barras de activación indican cuándo interviene cada participante. `API Reportes` corresponde a `ReporteController`; `Caso de uso`, a `RegistrarReporteUseCase`; `Validación` agrupa los puertos de autorización, categorías y evidencias; y `Registro` representa `RegistroReportePort` junto con su adaptador. El registro se confirma con `201 Created` únicamente después de persistir el reporte y el evento pendiente en la misma transacción.

El despachador puede procesar el evento inmediatamente después de la confirmación de la transacción; la secuencia muestra su independencia respecto de la respuesta HTTP. Si se incorpora Amazon SQS, el despachador publica en la cola y el consumidor confirma el mensaje después de persistir su resultado. No se necesita crear servicios de negocio independientes para utilizar trabajos en segundo plano.

| Paso | Origen → destino | Acción | Capa |
|---|---|---|---|
| 1 | Aplicación móvil → API | Enviar descripción, categoría, fecha de ocurrencia, ubicación autorizada opcional e identificadores de evidencias. | Cliente → Presentación |
| 2 | Controlador → Caso de uso | Construir un comando validado y pasar el autor derivado de la sesión. | Presentación → Aplicación |
| 3 | Caso de uso → Puertos | Comprobar permisos, categoría y propiedad de las evidencias. | Aplicación → Adaptadores por interfaz |
| 4 | Caso de uso → Reporte | Crear una entidad válida con identificador y estado inicial. | Aplicación → Dominio |
| 5 | Caso de uso → Registro | Persistir reporte, referencias y evento pendiente en una única transacción local. | Aplicación → Infraestructura |
| 6 | Controlador → Aplicación móvil | Responder `201 Created` con identificador y estado, sin sugerencias de IA todavía. | Presentación → Cliente |
| 7 | Despachador → Análisis | Entregar el evento y generar sugerencias recuperables ante fallas. | Infraestructura → Aplicación de Análisis |
| 8 | Operador → Operaciones | Revisar las sugerencias y registrar decisiones con actor, acción y momento. | Presentación → Aplicación de Operaciones |
| 9 | Operaciones → Alertas y Consultas | Publicar los cambios confirmados para evaluar notificaciones y actualizar vistas autorizadas. | Colaboración mediante contratos y eventos |

### 6.1 Errores y recuperación

| Situación | Comportamiento esperado |
|---|---|
| Datos mal formados o reglas del registro incumplidas | Responder con un error de validación controlado (`400`), sin persistir un reporte parcial. |
| Sesión ausente o inválida | Responder `401`; no ejecutar el caso de uso. |
| Actor sin permiso o evidencia ajena | Rechazar la operación (`403`) sin revelar información de recursos ajenos. |
| Fallo de la transacción | Revertir el reporte y su evento pendiente; responder con un error controlado, sin confirmar el registro. |
| IA o notificaciones no disponibles | Mantener el reporte registrado, conservar la tarea pendiente y aplicar la política de reintentos. |
| Entrega repetida de un evento | Reconocer su identificador y evitar repetir los efectos ya completados por ese consumidor. |
| Corte de conexión después del registro | Conservar los datos del formulario y permitir consultar o reintentar con la misma clave de idempotencia, sin generar otro reporte. |

La **idempotencia del registro HTTP** requiere una clave por intento lógico, asociada al autor, una restricción única y el resultado persistido en la misma transacción del registro. La **idempotencia de consumidores** requiere registrar el evento procesado por consumidor junto con sus efectos. Estos mecanismos deben implementarse además del ejemplo abreviado de la siguiente sección. Una marca global de entrega no sustituye el seguimiento individual si un evento tiene varios consumidores.

## 7. Código de referencia

Los siguientes fragmentos muestran la inversión de dependencias y la persistencia del registro con su evento. Se omiten rutas completas, consulta del seguimiento, esquemas de validación, configuración, idempotencia y detalles de reintentos. Los modelos Prisma se presentan como nombres propuestos y requieren un esquema y migraciones propios.

### 7.1 Dominio: entidad y objetos de valor

```ts
// dominio/estado-reporte.ts
export enum EstadoReporte {
  REGISTRADO = 'REGISTRADO',
}

// dominio/ubicacion.ts
export class Ubicacion {
  private constructor(
    readonly latitud: number,
    readonly longitud: number,
  ) {}

  static crear(latitud: number, longitud: number, autorizada: boolean): Ubicacion {
    if (!autorizada) throw new Error('Ubicación sin autorización');
    if (!Number.isFinite(latitud) || latitud < -90 || latitud > 90) {
      throw new Error('Latitud inválida');
    }
    if (!Number.isFinite(longitud) || longitud < -180 || longitud > 180) {
      throw new Error('Longitud inválida');
    }
    return new Ubicacion(latitud, longitud);
  }
}

// dominio/referencia-evidencia.ts
export interface ReferenciaEvidencia {
  readonly id: string;
}

// dominio/reporte.ts
import { EstadoReporte } from './estado-reporte';
import { Ubicacion } from './ubicacion';
import type { ReferenciaEvidencia } from './referencia-evidencia';

export interface DatosReporte {
  id: string;
  autorId: string;
  categoriaId: string;
  descripcion: string;
  ocurridoEn: string; // ISO 8601 con zona horaria, validado en la entrada.
  registradoEn: string;
  ubicacion?: Ubicacion;
  evidencias: readonly ReferenciaEvidencia[];
}

export class Reporte {
  readonly estado = EstadoReporte.REGISTRADO;

  private constructor(readonly datos: Readonly<DatosReporte>) {}

  static crear(datos: DatosReporte): Reporte {
    if (!datos.id || !datos.autorId || !datos.categoriaId) {
      throw new Error('Identificación del reporte incompleta');
    }
    if (!datos.descripcion.trim()) throw new Error('Descripción obligatoria');
    if (!Number.isFinite(Date.parse(datos.ocurridoEn))) {
      throw new Error('Fecha de ocurrencia inválida');
    }
    return new Reporte({ ...datos, descripcion: datos.descripcion.trim() });
  }
}
```

Las comprobaciones de permiso, existencia de categoría y propiedad de evidencias requieren colaboradores y se coordinan en Aplicación. Las invariantes locales permanecen en el dominio. En la implementación, los errores genéricos del ejemplo deben sustituirse por errores tipados que Presentación pueda traducir sin exponer detalles internos.

### 7.2 Aplicación: comando y puertos

```ts
// aplicacion/registrar-reporte.command.ts
export interface RegistrarReporteCommand {
  categoriaId: string;
  descripcion: string;
  ocurridoEn: string;
  ubicacion?: {
    latitud: number;
    longitud: number;
    autorizada: boolean;
  };
  evidenciaIds: string[];
}

// aplicacion/puertos/registro-reporte.port.ts
import type { Reporte } from '../../dominio/reporte';

export interface ReporteRegistrado {
  id: string;
  tipo: 'ReporteRegistrado';
  version: 1;
  reporteId: string;
  ocurridoEn: string; // Momento del evento, distinto de la ocurrencia del incidente.
}

export interface RegistroReportePort {
  // El adaptador garantiza todo o nada: reporte, referencias y evento pendiente.
  guardarConEvento(reporte: Reporte, evento: ReporteRegistrado): Promise<void>;
}

// aplicacion/puertos/identidad.port.ts
export interface IdentidadPort {
  exigirPermiso(actorId: string, permiso: 'reportes:registrar'): Promise<void>;
}

// aplicacion/puertos/categorias.port.ts
export interface CategoriasPort {
  exigirActiva(categoriaId: string): Promise<void>;
}

// aplicacion/puertos/evidencias.port.ts
export interface EvidenciasPort {
  // Rechaza referencias inexistentes, ajenas o que incumplan la política de archivos.
  verificarReferencias(autorId: string, ids: readonly string[]): Promise<void>;
}
```

El evento transporta el identificador del reporte, no su descripción, ubicación ni evidencias. Análisis obtiene los datos necesarios mediante una consulta interna autorizada de la fachada de Reportes. El acceso a los archivos sigue sujeto a permisos y no se habilita por conocer su identificador.

### 7.3 Aplicación: caso de uso

```ts
// aplicacion/registrar-reporte.use-case.ts
import { Reporte } from '../dominio/reporte';
import { Ubicacion } from '../dominio/ubicacion';
import type { RegistrarReporteCommand } from './registrar-reporte.command';
import type { RegistroReportePort } from './puertos/registro-reporte.port';
import type { IdentidadPort } from './puertos/identidad.port';
import type { CategoriasPort } from './puertos/categorias.port';
import type { EvidenciasPort } from './puertos/evidencias.port';

export class RegistrarReporteUseCase {
  constructor(
    private readonly registro: RegistroReportePort,
    private readonly identidad: IdentidadPort,
    private readonly categorias: CategoriasPort,
    private readonly evidencias: EvidenciasPort,
    private readonly generarId: () => string,
    private readonly ahora: () => string,
  ) {}

  async ejecutar(autorId: string, cmd: RegistrarReporteCommand) {
    await this.identidad.exigirPermiso(autorId, 'reportes:registrar');
    await this.categorias.exigirActiva(cmd.categoriaId);
    const evidenciaIds = [...new Set(cmd.evidenciaIds)];
    await this.evidencias.verificarReferencias(autorId, evidenciaIds);

    const registradoEn = this.ahora();
    const reporte = Reporte.crear({
      id: this.generarId(),
      autorId,
      categoriaId: cmd.categoriaId,
      descripcion: cmd.descripcion,
      ocurridoEn: cmd.ocurridoEn,
      registradoEn,
      ubicacion: cmd.ubicacion
        ? Ubicacion.crear(
            cmd.ubicacion.latitud,
            cmd.ubicacion.longitud,
            cmd.ubicacion.autorizada,
          )
        : undefined,
      evidencias: evidenciaIds.map((id) => ({ id })),
    });

    await this.registro.guardarConEvento(reporte, {
      id: this.generarId(),
      tipo: 'ReporteRegistrado',
      version: 1,
      reporteId: reporte.datos.id,
      ocurridoEn: registradoEn,
    });

    return { reporteId: reporte.datos.id, estado: reporte.estado };
  }
}
```

El caso de uso recibe funciones para el reloj y los identificadores; así puede probarse sin depender del tiempo real. No invoca la IA, el proveedor push ni un SDK de colas. Las comprobaciones que puedan cambiar concurrentemente deben respaldarse con restricciones o verificaciones transaccionales al guardar, especialmente la asociación de evidencias a su propietario.

### 7.4 Infraestructura: persistencia transaccional

```ts
// infraestructura/prisma-registro-reporte.adapter.ts
import type { PrismaClient } from '@prisma/client';
import type { Reporte } from '../dominio/reporte';
import type {
  RegistroReportePort,
  ReporteRegistrado,
} from '../aplicacion/puertos/registro-reporte.port';

export class PrismaRegistroReporteAdapter implements RegistroReportePort {
  constructor(private readonly db: PrismaClient) {}

  async guardarConEvento(reporte: Reporte, evento: ReporteRegistrado): Promise<void> {
    const datos = reporte.datos;
    await this.db.$transaction(async (tx) => {
      await tx.reporte.create({
        data: {
          id: datos.id,
          autorId: datos.autorId,
          categoriaId: datos.categoriaId,
          descripcion: datos.descripcion,
          ocurridoEn: new Date(datos.ocurridoEn),
          registradoEn: new Date(datos.registradoEn),
          estado: reporte.estado,
          latitud: datos.ubicacion?.latitud ?? null,
          longitud: datos.ubicacion?.longitud ?? null,
          ubicacionAutorizada: datos.ubicacion !== undefined,
          evidencias: {
            create: datos.evidencias.map((e) => ({ evidenciaId: e.id })),
          },
        },
      });

      await tx.eventoPendiente.create({
        data: {
          id: evento.id,
          tipo: evento.tipo,
          version: evento.version,
          agregadoId: evento.reporteId,
          ocurridoEn: new Date(evento.ocurridoEn),
          payload: { reporteId: evento.reporteId },
          estado: 'PENDIENTE',
        },
      });
    });
  }
}
```

Los nombres `reporte`, `eventoPendiente` y la relación `evidencias` dependen del esquema Prisma que se defina. El adaptador no publica directamente a una cola dentro de la transacción: primero confirma los datos locales; después el despachador entrega el evento. Los archivos de S3 no participan en esta transacción, por lo que deben definirse la confirmación de cargas y la limpieza de archivos huérfanos.

### 7.5 Presentación: controlador

```ts
// presentacion/reporte.controller.ts
import type { Request, Response, NextFunction } from 'express';
import type { RegistrarReporteUseCase } from '../aplicacion/registrar-reporte.use-case';
import { registrarReporteSchema } from './reporte.schema';

// El middleware de autenticación establece este contexto tras verificar la sesión.
export type SolicitudAutenticada = Request & { actor?: { id: string } };

export class ReporteController {
  constructor(private readonly registrarReporte: RegistrarReporteUseCase) {}

  registrar = async (
    req: SolicitudAutenticada,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.actor) {
        res.status(401).json({ codigo: 'SESION_REQUERIDA' });
        return;
      }
      const command = registrarReporteSchema.parse(req.body);
      const resultado = await this.registrarReporte.ejecutar(req.actor.id, command);
      res.status(201).json(resultado);
    } catch (error) {
      next(error);
    }
  };
}
```

`reporte.schema.ts` debe validar tipos, campos obligatorios, fechas con zona horaria, longitud máxima de la descripción y cantidad y formato de identificadores de evidencia. El esquema no admite un `autorId` proporcionado por el cliente. El middleware común de errores traduce errores tipados y registra un identificador de correlación, sin devolver trazas ni datos sensibles.

### 7.6 Raíz de composición y API pública

```ts
// reportes.module.ts
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { PrismaRegistroReporteAdapter } from './infraestructura/prisma-registro-reporte.adapter';
import { RegistrarReporteUseCase } from './aplicacion/registrar-reporte.use-case';
import type { IdentidadPort } from './aplicacion/puertos/identidad.port';
import type { CategoriasPort } from './aplicacion/puertos/categorias.port';
import type { EvidenciasPort } from './aplicacion/puertos/evidencias.port';
import { ReporteController } from './presentacion/reporte.controller';

export interface DependenciasReportes {
  db: PrismaClient;
  identidad: IdentidadPort;
  categorias: CategoriasPort;
  evidencias: EvidenciasPort;
}

export function crearModuloReportes(deps: DependenciasReportes) {
  const registrar = new RegistrarReporteUseCase(
    new PrismaRegistroReporteAdapter(deps.db),
    deps.identidad,
    deps.categorias,
    deps.evidencias,
    randomUUID,
    () => new Date().toISOString(),
  );
  return { controller: new ReporteController(registrar) };
}

// index.ts
export { crearModuloReportes } from './reportes.module';
export type { DependenciasReportes } from './reportes.module';
```

La composición general suministra adaptadores para Identidad, categorías y evidencias; registra las rutas protegidas y el middleware de errores. El controlador retornado se usa para montar la API HTTP. La fachada de consultas internas autorizadas se añadirá como contrato público para Análisis y Operaciones, sin exportar el repositorio ni las entidades persistidas.
