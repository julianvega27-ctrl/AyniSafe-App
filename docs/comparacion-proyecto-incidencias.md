# Reutilización de Proyecto_incidencias_400par en AyniSafe

Actualizado: 23 de noviembre de 2026. Estado: comparación y plan de integración basado en decisiones confirmadas. El código no se ha importado ni se han ejecutado las pruebas del origen; todas las fases del plan están pendientes.

## Base inspeccionada

- Destino: este repositorio, AyniSafe-App. Conserva cambios locales previos y una entrega web en curso; no deben mezclarse con la integración sin separar su alcance.
- Origen: `D:\UNSCH\2026-II\Arquitectura de Software\Proyectos\Proyecto_incidencias_400par`.
- Commit del origen: `efc1bce8c29b3c88487e36e10a324c71ae9c2029`.
- El origen tiene historial Git y no mostró cambios locales en `git status --short` al inspeccionarlo.
- Se leyeron manifiestos, rutas de autenticación/reportes, migraciones iniciales, estructura del panel, estilos, SRS y SDD. La existencia de código y pruebas no acredita que todo funcione ni que cumpla las reglas de AyniSafe.
- No se leyeron archivos privados `.env`, no se copiaron secretos, no se iniciaron servicios y no se modificó la carpeta de origen.

## Recomendación

### Decisiones confirmadas el 23 de noviembre de 2026

1. Envío como invitado o con cuenta ciudadana. Invitado no es un rol; consulta estado y resumen ciudadano mediante código secreto, sin notas internas. No se incorpora vinculación posterior a cuenta. El teléfono es obligatorio para enviar como invitado, sin acreditación de identidad; con cuenta sigue opcional en perfil.
2. Se conservan ciudadano, administrador global y operador, separando administración de atención. No se adoptan roles institucionales adicionales.
3. Incidente único desde cada envío, conservando datos originales. Estados: REGISTRADO → EN_REVISION → EN_ATENCION → CERRADO; verificación separada. Cierre con resultado Atendido o Descartado y motivo, sin simular atención para descartar.
4. Prioridad inicial según tabla de 16 categorías aprobada el 23/11/2026 en documento 11, versión documental prioridad-categoria-v1, sin edición libre de tabla en panel. El operador puede confirmar, elevar o reducir cada caso con motivo/historial; sin configuración válida queda Sin evaluar y se mantiene FIFO. Pendiente de implementación, sin nueva aprobación de esos valores.
5. El operador asume inicialmente el caso; el administrador solo libera/reasigna con motivo como excepción, sin atender. Ajuste del 27/11/2026: con un único operador activo en la única sede de la principal, la asignación es automática (documento 11 §2).
6. Duplicados vinculados a un principal para coordinar atención; conservar cada envío, identificador, historial y seguimiento sin exponer información de otros informantes. La vinculación no es descarte.
7. Punto obligatorio mediante GPS autorizado o selección manual confirmada; no se envía sin coordenadas. Puede quedar pendiente el distrito por ambigüedad geométrica o falta de cobertura.
8. Se conserva PostgreSQL; se adapta la persistencia MySQL del origen. Docker no implica cambiar de motor ni se configura por esta decisión.
9. Leaflet/react-leaflet en web; Flutter conserva su propuesta vigente. Verificar proveedor de teselas y política de recursos. El motor no decide permisos ni distrito del negocio.
10. Panel con inicio/resumen por rol, historial de auditoría autorizado y campana, además de gestión. No se inventan métricas ni se amplían permisos para llenar el resumen.
11. Sin recepción telefónica: ingresos solo desde la app, como invitado o con cuenta. Excluir routers/formularios `PHONE` del origen.
12. Evaluación sanitaria de una persona principal, conservando cantidad total de heridos y datos desconocidos. Sin fichas múltiples; mantener permisos y privacidad de AyniSafe. Confirmado como 17B; el responsable aclaró que la última respuesta era 16B y 17B.
13. Dirección visual elegida: réplica de la UI web y móvil del origen, sin mejoras gráficas durante esta integración. Inventario y referencia por commit en DESIGN.md. No hay otra selección visual pendiente; falta implementar y comprobar fidelidad, conservando las reglas funcionales elegidas.

Reglas responsables en los documentos 03, 09 y 11 del análisis, ADR, `PRODUCT.md` y guía UI. Esta comparación enlaza esas reglas; no las sustituye. Las specs sincronizadas describen capacidades entregadas: los nuevos acuerdos necesitan deltas de adaptación y no se presentan como implementados. No modificar archivos archivados para simular que estos acuerdos ya existían.

Conservar AyniSafe como destino normativo y técnico. Reutilizar componentes, recorridos, algoritmos y pruebas pertinentes del origen mediante adaptaciones verticales por capacidad. Evitar reemplazar `apps/` completo o incorporar las migraciones MySQL directamente.

El origen ofrece más superficies implementadas, pero usa otro modelo de acceso, permisos y ciclo de incidentes. La cantidad reutilizable se concreta por capacidad. Su apariencia ya fue elegida: reproducir las superficies web/móvil conforme a DESIGN.md y comprobarlas renderizadas, sin reabrir estilos alternativos.

## Diferencias verificadas

| Área | Origen observado | AyniSafe vigente | Tratamiento recomendado |
|---|---|---|---|
| Backend | Express, JavaScript CommonJS, módulos funcionales; hay SQL directo en rutas y servicios | Express, TypeScript, capas de dominio/aplicación/presentación/infraestructura | Trasladar reglas a los módulos destino y SQL a adaptadores; no copiar routers como implementación final. |
| Persistencia | `mysql2`, migraciones SQL MySQL, claves numéricas y de texto, geometría `POINT` SRID 4326 | PostgreSQL, Prisma y SQL complementario | Rediseñar migraciones para el modelo destino, incluyendo índices, restricciones, geometría y transacciones; no basta reemplazar el driver. |
| Docker y despliegue | Compose para MySQL local; README/SDD describen Aiven MySQL con TLS en el perfil publicado | PostgreSQL/Neon documentado, desarrollo local existente | Docker es independiente del motor. Mantener PostgreSQL como decisión vigente; incorporar contenedor PostgreSQL solo si aporta al entorno local. No modificar despliegue por esta comparación. |
| Sesión | JWT de acceso de 15 minutos y refresh token | Token opaco de 24 h sin renovación; cookie institucional y Bearer ciudadano | Conservar Identidad de AyniSafe y adaptar consumidores. No importar la sesión del origen. |
| Contraseñas | Dependencia bcrypt | Argon2id en la implementación destino | No trasladar autenticación ni hashes sin un plan específico de migración de cuentas. No se ha pedido migrar datos. |
| Roles | `SuperAdministrador`, `AdministradorInstitucional`, `Operador`, `Ciudadano`; relación usuario/roles | Exclusivamente ciudadano, administrador y operador | Redefinir permisos por acción y ámbito. No fusionar roles por un simple cambio de nombre. |
| Reporte ciudadano | `POST /incidents` admite invitado; ubicación requerida en esa ruta | Invitado o cuenta; punto obligatorio y teléfono obligatorio para invitado | Adaptar identidad, contacto, permisos y código secreto; conservar formulario si falta punto o falla envío. |
| Modelo del caso | Tabla `incidents` con estado operativo y verificación; vínculo de duplicados | Incidente desde el envío; cuatro estados y cierre Atendido/Descartado; duplicados vinculados | Adaptar el modelo a las reglas del documento 11; no importar el flujo completo por elegir la entidad única. |
| Prioridades | La migración inicial contiene `low`, `normal`, `high`, `critical`; hay migraciones posteriores de prioridad por categoría | Propuesta por categoría, revisable por operador; Sin evaluar, Normal, Alta y Urgente; FIFO | Definir la tabla destino, distinguir origen automático/revisión humana y conservar trazabilidad; no importar valores por defecto sin elección. |
| Panel | React JSX, Vite, React Router; marco con barra lateral, cabecera y área principal; páginas de incidentes, instituciones, mapa, directorio, perfil e historial | React TypeScript y panel mínimo por rol | Adaptar primero el marco y componentes a la sesión, rutas y disponibilidad reales de AyniSafe; incorporar páginas al integrar sus capacidades. |
| Estilos web/móvil | CSS/componentes y ThemeData/pantallas del origen | Réplica visual explícitamente elegida; reglas funcionales destino | Extraer y reproducir estilos efectivos, fuentes, recursos, componentes y responsive; adaptar la carga de recursos y datos sin rediseñar. |
| Mapas | Leaflet/react-leaflet en web | Decisión 23/11: Leaflet web; Flutter conserva MapLibre/OpenFreeMap como propuesta | Reutilizar mapa web adaptando contratos, permisos, proyecciones y proveedor de teselas; ADR-009 actualizada. |
| App móvil | Flutter con pantallas de reporte, mapa, alertas, directorio y perfil; documentación vigente orientada a invitado | Flutter con acceso, perfil, contenido público y cuatro destinos acordados | Conservar navegación e Identidad destino y portar capacidades individuales. Una pantalla antigua de historial no demuestra que el recorrido vigente lo ofrezca. |
| Evidencias y notificaciones | Código para Cloudinary y Firebase Admin, carga de imágenes con límite de 5 MB | Puertos sustituibles, privacidad, hasta tres fotos y conservación documentadas | Usar como candidatos, revisar acceso y eliminación de originales/derivados. No trasladar configuración privada ni dar por validado el proveedor. |

Evidencia principal del origen: `apps/api/package.json`, `apps/admin/package.json`, `apps/api/src/auth/tokens.js`, `apps/api/src/auth/router.js`, `apps/api/src/incidents/router.js`, `apps/api/migrations/001_identity.sql`, `004_incidents.sql`, `apps/admin/src/App.jsx`, `apps/admin/src/style.css`, `docs/01-entrega/SRS.md` y `SDD.md`. Las migraciones iniciales describen la base; deben leerse con las posteriores al implementar.

Reglas destino: `docs/01-analisis-del-sistema/03-requisitos-funcionales.md`, `07-desiciones-aquitectonicas.md`, `09-alcance-territorial-e-institucional.md`, `11-operacion-publicacion-y-conservacion.md`, specs pertinentes y `DESIGN.md`.

## Plan de integración por módulos

P0 cuenta con [informe de línea base y grupos de commits](validacion/p0-linea-base.md). Sus verificaciones no cierran automáticamente `web-publica-acceso-institucional`: siguen pendientes los ensayos de despliegue, CI remoto y la conciliación del criterio sobre pruebas previas. No se han creado commits ni se ha iniciado P1 por preparar P0.

La evaluación se rige además por la [matriz de entrega del Sprint 2](criterios-entrega-sprint-2.md): Jest con cobertura, validación de arquitectura, OpenAPI, análisis de BD/caché y evidencias EQ/carga. Antes de portar nuevas capacidades, preparar esa base de verificación. La suite del proyecto de origen no sustituye la validación en AyniSafe.

Este plan reemplaza la secuencia de importación preliminar de este documento. `guia_codex.md` conserva la hoja de ruta original como referencia; sus prompts deben adecuarse a estas decisiones antes de usarse. Las fases siguientes no son cambios OpenSpec ya creados ni casillas cumplidas. Revisar los cambios existentes antes de crear otro; planificar una entrega vertical verificable por capacidad, no una copia masiva de backend seguida de todos los clientes.

| Fase y dependencias | Módulos y reutilización candidata | Entrega y criterio de salida | Commit orientativo |
|---|---|---|---|
| P0 · Punto de partida | Trabajo local de API, web, móvil y documentación | Inventario de cambios previos y de integración; revisar aceptación del cambio web existente, anotar baseline y comandos. No recrear Identidad ni archivar trabajo automáticamente. | `docs: fijar acuerdos y alcance de integración` |
| P1 · Verificación; requiere P0 | Suite API actual; revisar casos útiles del origen | Adaptar API a Jest y cobertura sin perder escenarios, CI con artefactos; comprobar dependencias Clean Architecture, contrato OpenAPI y BD de prueba aislada. Flutter conserva flutter_test; las pruebas web pueden conservar su runner. | `test(api): integrar Jest y reportes de cobertura` |
| P2 · Réplica visual; requiere P0 | UI completa del origen: App.jsx/style.css, páginas/componentes web, app.dart y screens Flutter | Dirección ya elegida: reproducir apariencia web/móvil, portada y acceso. Extraer estilos sin rediseñar y adaptar recursos para la carga destino. Comparar capturas origen/destino por viewport/estado; conservar nombre y reglas AyniSafe. No presentar capacidades futuras como funcionales. | `feat(ui): reproducir interfaces del proyecto de origen` |
| P3 · Territorio y organización; requiere P1 | Consultas/Identidad; `territory`, `institutions`, `resources` y formularios del origen | PostgreSQL: catálogo verificado, geometrías, instituciones/sedes/coberturas y operadores con invitación. Alta atómica y permisos de tres roles; EQ-09/11/12, migraciones reproducibles y consulta de distrito en backend. UI usa P2. | Separar `feat(consultas): integrar territorio` y `feat(identidad): gestionar sedes y operadores` |
| P4 · Registro y seguimiento inicial; requiere P1/P3 y P2 para panel | Reportes/Operaciones/Consultas; `incidents/report.js`, formulario Flutter y consultas del origen | Cerrar diseño de propiedad/contratos del incidente único antes del esquema. Envío invitado/cuenta, punto y teléfono exigidos según modalidad, idempotencia, originales, REGISTRADO, persistencia de evento/entregas y comprobante. Código secreto solo para vista limitada; cuenta consulta solo lo propio. API + Flutter + lectura inicial del panel probadas. | `feat(reportes): integrar incidentes de invitado y cuenta` |
| P5 · Evaluación y evidencias; requiere P4 | Reportes/Operaciones; evaluación, `evidence*`, adaptador Cloudinary candidato | Una persona principal, cantidad total independiente y desconocidos; permisos SAMU, versiones y adjuntos privados. Hasta tres fotos, formato real, 5 MB, EXIF y limpieza de huérfanas. Si proveedor real no está validado, dejarlo pendiente y no declarar integración externa por un doble. EQ-04/13/15. **Estado (27/11/2026):** P5.1 fusionada y archivada ([evidencia](validacion/p5-evaluacion.md)). P5.2 fusionada (PR #13) y archivada, con Cloudinary validado por el spike sobre la cuenta real y sus límites ([evidencia](validacion/p5-evidencias.md)). Recorrido en Android real aprobado por el responsable. | Separar evaluación y evidencias con sus pruebas |
| P6 · Atención y vinculación; requiere P4; permisos sanitarios dependen de P5 | Operaciones/Análisis; listados, detalle, asignación y auditoría del origen | Cuatro estados, verificación separada, Asumir caso atómico por institución, principal/apoyos, cierre Atendido/Descartado y reasignación administrativa. Duplicados vinculados sin pérdida de originales ni acceso ajeno. Prioridad versionada y FIFO; valores de tabla revisados antes de activar. EQ-05/16/19/20/21. **Estado (28/11/2026):** fusionado en `main` (PR #15) y archivado (cambio `atencion-vinculacion`). Incluye los grupos A (atención), B (duplicados), C (prioridad) y D (asignación automática al operador único y atención guiada), con CI en verde, y el recorrido en Android y el panel aprobados por el responsable ([evidencia](validacion/p6-atencion.md)). Fuera de alcance: reapertura, transferencia solicitada por el operador, actuaciones libres y sugerencias de Análisis. | `feat(operaciones): integrar revisión y atención institucional` y luego duplicados/Análisis |
| P7 · Publicación y mapas; requiere P6 | Consultas y autorización de Operaciones; Leaflet web, mapa Flutter y filtros del origen | Publicación expresa de verificados, generalización y reserva sensible; filtros por distrito/categoría/período y consultas autorizadas. Proveedor de teselas revisado y fallo de mapa no impide consultar el resto del caso. Retiro al cierre/retiro y sin evidencias públicas. | `feat(consultas): integrar mapas y publicación controlada` |
| P8 · Avisos y panel completo; requiere P4/P6; preventivas requieren P7 | Alertas/Consultas; `notifications`, `alerts`, historial y resumen del origen | Outbox/entregas recuperables, lectura por usuario, campana, preferencias y push cuando esté validado; resumen y auditoría por ámbito, sin datos ficticios. Seguimiento refleja actuaciones y caso principal sin filtraciones. EQ-07/10/14/18. | Separar `feat(alertas)` y `feat(web): integrar resumen e historial` |
| P9 · Conservación y validación final; requiere capacidades correspondientes | Contratos de todos los módulos, infraestructura y scripts de calidad | Bloqueo al vencer, limpieza y restauración verificadas; análisis BD/caché, escenarios EQ, carga progresiva hasta 2.000 VU y límites reales. Jest/cobertura, OpenAPI y evidencia ligada al commit. Demostración completa Android → API → panel → seguimiento de cuenta/invitado. | Separar conservación, pruebas de carga y documentación de resultados |

Los ejemplos de commit son etiquetas de alcance, no instrucciones para commitear ahora. Si una fase necesita varios incrementos, cada uno conserva contratos coherentes y sus pruebas; no separar pruebas del código que verifican.

### Límites de módulos y diseño previo a P4

Se conservan los seis módulos del monolito. Reportes gestiona el ingreso y originales; Operaciones, ciclo operativo y participación institucional; Identidad, cuentas/organización; Consultas, proyecciones autorizadas; Alertas, avisos/preferencias/entregas; Análisis, sugerencias de relación revisables. No crear un segundo caso al verificar ni permitir que dos módulos mantengan estados operativos contradictorios.

En el cambio de P4 concretar propietario de cada dato, transacción de creación del único incidente y contratos de registro/consulta. Un contrato puede coordinar la transacción sin autorizar escrituras directas a tablas ajenas. Las migraciones de MySQL son referencia, no scripts ejecutables en destino. No se solicita migrar datos, hashes o cuentas productivas.

### Documentación que acompaña a cada fase

1. Leer reglas vigentes y encontrar el cambio/spec existente; no obedecer un prompt histórico incompatible.
2. Especificar aceptación, errores, permisos, concurrencia y trazabilidad RF/HU/EQ, junto con diseño técnico, migración, tareas y verificación.
3. Adaptar código del origen citando procedencia y commit, conservando los contratos destino. Actualizar OpenAPI y clientes del mismo incremento.
4. Ejecutar comprobaciones pertinentes; registrar resultados, ambiente y pendientes en el informe del cambio. Sin pruebas ejecutadas no hay aceptación demostrada.
5. Solo tras implementación/aceptación, sincronizar y archivar mediante el flujo correspondiente si se solicita. No reescribir historial archivado ni specs implementadas para presentar una propuesta como terminada.

### Pendientes acotados y condiciones de activación

- Tabla inicial de prioridad aprobada en documento 11, versión documental prioridad-categoria-v1. En P6 implementar y probar sus valores, origen/versionado y modificación individual hacia arriba/abajo con motivo; no requiere otra aprobación. Si falta configuración ejecutable válida, usar Sin evaluar.
- Dirección visual cerrada: UI del origen, sin mejoras. En P2 verificar fidelidad renderizada y luego reproducirla en cada capacidad; no pedir otra elección de estilo.
- Proveedores de teselas, evidencias y push: validar servicio real, privacidad, cuotas y recuperación al integrar su capacidad; no modificar a conveniencia las reglas funcionales.
- Detalles técnicos del código secreto (generación, huella, almacenamiento, vigencia y límites), transacciones, estados de verificación y correlación: concretar criterios en los cambios pertinentes, manteniendo los límites elegidos. No requieren reabrir las modalidades, roles ni estados operativos ya confirmados.
- Carga académica y entorno: acordar perfil/umbrales antes de ejecutar; reportar límites y fallos sin prometer capacidad del alojamiento gratuito. No correr pruebas de carga contra el origen publicado.

## Historial de commits

### Ejecución incremental con SDD y OpenSpec

SDD se aplica aquí como desarrollo guiado por especificaciones, usando el esquema `spec-driven` ya configurado en OpenSpec. Cada incremento debe resolver una capacidad o mejora técnica verificable. No crear una única spec para importar todo el proyecto ni confundir un módulo con un solo commit gigante.

Estado revisado el 23/11/2026: `web-publica-acceso-institucional` es el cambio activo; tiene pendiente la verificación real de CI en GitHub (tarea 9.3), además del seguimiento de aceptación indicado en sus artefactos. Revisar y separar sus cambios locales antes de iniciar otra integración. No marcarlo completo ni archivarlo por tener la mayoría de tareas hechas. La documentación preparada después de código existente es conciliación retrospectiva, no evidencia de que se escribió antes.

Secuencia para cada incremento nuevo:

1. **Especificar:** revisar reglas responsables y crear/revisar el cambio con proposal, specs por capacidad, design técnico y tasks. Incluir RF/HU/EQ, aceptación positiva y negativa, permisos, concurrencia, contratos y verificación. Registrar este estado en un commit antes de implementar ese nuevo incremento.
2. **Implementar:** seguir tareas del mismo cambio, reutilizando código identificado del origen. Incluir migración, contrato, clientes y pruebas pertinentes con el código que verifican. Puede haber varios commits coherentes; el repositorio debe compilar y no depender de un contrato todavía inexistente.
3. **Verificar:** ejecutar comprobaciones y recorridos; completar tasks solo con evidencia y conservar comandos, ambiente, resultados y limitaciones en el informe del cambio. La CI ejecutada y sus artefactos complementan, no sustituyen, los recorridos que necesitan dispositivo o servicios reales.
4. **Aceptar y cerrar:** revisar criterios y pendientes; sincronizar/archivar únicamente con alcance y validación completos y mediante el flujo autorizado. Conservar la evidencia y el historial real. Commit de cierre y despliegue son acciones separadas.

Ejemplo para un incremento futuro, con nombres sujetos al estado real de OpenSpec:

```text
docs(openspec): especificar registro de incidentes de invitado y cuenta
feat(reportes): registrar incidente con idempotencia y pruebas
feat(mobile): integrar envío invitado y autenticado con pruebas
docs(validacion): registrar aceptación del registro de incidentes
docs(openspec): sincronizar y archivar registro de incidentes
```

El último commit solo corresponde cuando el cambio está aceptado y archivado. No crear commits vacíos o dividir artificialmente trabajo para aumentar el número; cada mensaje describe su diff real. Si una implementación atraviesa API y móvil de forma inseparable, un commit vertical es preferible a dejar clientes rotos. Las pruebas no se aplazan a un commit final separado.

Evidencia para el docente: mostrar el diff de la especificación previa, el diff de implementación que la cumple y el informe de aceptación de una misma capacidad. Trazar RF/HU → escenario de spec → tarea → código/prueba → resultado → commits. Identificar una revisión de cada entrega que pueda ejecutarse; tags o releases son opcionales y solo se crean cuando se soliciten. Mantener procedencia del código adaptado, sin presentar reutilización como creación desde cero.

Para seleccionar archivos, revisar `git diff`/`git diff --cached` y usar rutas explícitas o selección de hunks. No usar `git add .` para mezclar el trabajo local anterior, documentación de acuerdos y una integración nueva. Antes del primer commit acordar el alcance concreto que se va a registrar; este plan no ejecuta commits ni push.

Registrar el trabajo real de adaptación desde la fecha de integración. No reescribir el historial existente para simular una secuencia anterior. La revisión inicial muestra que ambos repositorios ya tienen commits por área; no es necesario inventar esa estructura.

Para cada capacidad: revisar la spec existente, adaptar el dominio y persistencia, integrar API y clientes, ejecutar comprobaciones pertinentes y actualizar evidencia. Separar commits por cambios coherentes cuando cada estado tenga sentido; no forzar una división que deje contratos rotos. Las pruebas viajan con el código que verifican.

Ejemplos de mensajes futuros, sujetos al contenido real:

- `feat(web): adaptar el marco institucional a AyniSafe`
- `feat(consultas): integrar catálogo territorial metropolitano`
- `feat(identidad): adaptar gestión de sedes y operadores`
- `feat(reportes): integrar incidentes de invitado y cuenta`
- `feat(operaciones): incorporar revisión y asignación por institución`

Cuando se reutilice código, identificar en el cuerpo del commit el proyecto de procedencia, el commit base inspeccionado y los archivos/capacidad adaptados. Revisar atribución y condiciones de reutilización aplicables antes de distribuir. No trasladar `.git`, documentación normativa ajena, `.env`, cuentas, datos reales, binarios, dependencias o carpetas de compilación.

No se han creado commits por este diagnóstico. La integración de código, el cambio de motor de BD y la migración de datos no se han ejecutado. No hace falta cambiar MySQL/PostgreSQL ni instalar dependencias para completar esta comparación inicial.
