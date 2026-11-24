# Guía de implementación progresiva de AyniSafe con OpenSpec

> **Actualización 23/11/2026:** esta hoja de ruta y sus prompts reflejan el plan anterior a la integración. Para el orden vigente consultar [plan por módulos](docs/comparacion-proyecto-incidencias.md#plan-de-integración-por-módulos), las reglas actualizadas en los documentos 03/09/11 y la [rúbrica Sprint 2](docs/criterios-entrega-sprint-2.md). No ejecutar literalmente prompts que exijan cuenta para reportar, permitan envío sin punto, separen Reporte/Incidente, impongan prioridad exclusivamente manual o evaluación de varias personas. Antes de crear cambios revisar los ya implementados/archivados. Esta referencia no vuelve a abrir decisiones confirmadas.

Fecha: 20 de noviembre de 2026. Este es un **plan propuesto de ejecución**, no un conjunto de cambios ya creados ni una declaración de funcionalidades implementadas. El alcance es el MVP Android y una entrega separada de iPhone.

## Iniciar servidores
|servidor|directorio|comando|
|---|---|---|
|mobile|apps\mobile\..|flutter run -d RFCW60MHE2E --dart-define=API_BASE_URL=http://127.0.0.1:3000|
|api|apps\api\..|npm run dev|
|DB|en bash|npm rund db:local:start|
Cada vez que desconectes el cable o reinicies el teléfono, repite ```adb reverse tcp:3000 tcp:3000```
Cada vez que cambies la dirección de la API, vuelve a lanzar con ```flutter run -d RFCW60MHE2E --dart-define=API_BASE_URL=http://127.0.0.1:3000```. Un hot reload no basta, porque la dirección se fija al compilar.

## 1. Punto de partida

Ya existe [registro-login-ciudadano](openspec/changes/registro-login-ciudadano/proposal.md), con [diseño](openspec/changes/registro-login-ciudadano/design.md), [especificación](openspec/changes/registro-login-ciudadano/specs/identidad/acceso-ciudadano/spec.md) y [tareas pendientes](openspec/changes/registro-login-ciudadano/tasks.md). **Será Spec 01: no la recrees ni abras una propuesta duplicada.** La guía UI ya existe: [guia-ui.md](docs/05-diseno-ui/guia-ui.md).

Aquí «Spec 01», «Spec 02», etc. identifican incrementos de trabajo. Cada incremento se materializa como un change de OpenSpec y puede afectar varias capacidades; no equivale a un módulo, a un requisito RF aislado ni a una copia de todos los documentos.

Los cambios posteriores al primero todavía no existen: sus nombres y límites son propuestas de esta hoja de ruta. Antes de cada uno, consulta el estado real del repositorio; si ya fue implementado/archivado, compruébalo y no lo recrees.

## 2. Cómo usar las skills

Escribe los prompts en el **chat del asistente dentro del repositorio**, no en PowerShell. Sustituye los corchetes por decisiones reales. Envía cada paso en un mensaje independiente y revisa el resultado antes de continuar.

| Skill | Para qué sirve | Límite |
|---|---|---|
| $openspec-explore | Investigar contexto, aclarar alcance y comparar alternativas. | No implementa; por defecto conserva decisiones en conversación. |
| $openspec-propose | Crear el cambio y sus artefactos de planificación. | No implementa. En Spec 01 se revisa el cambio existente. |
| $openspec-update-change | Corregir propuesta, specs, diseño y tareas del mismo cambio. | No modifica código. Es opcional si no hay correcciones. |
| $openspec-apply-change | Implementar las tareas y comprobar el comportamiento especificado. | Una casilla solo se completa cuando el comportamiento está implementado. |
| $openspec-archive-change | Cerrar un cambio y sincronizar sus deltas con las capacidades principales. | En este plan se archiva solo después de aceptación, sin fallos ni tareas requeridas pendientes. |
| $openspec-sync-specs | Sincronizar deltas sin archivar cuando existe una necesidad concreta. | No es un paso obligatorio entre apply y archive. |

No confundas la skill de revisión del cambio con el comando de terminal openspec update: este último actualiza archivos generados/integraciones. La forma de invocación concreta depende del asistente; los nombres con $ corresponden a las skills disponibles en esta sesión.

### Regla común para todos los prompts

Usa los documentos funcionales actuales, la guía UI y las capacidades ya archivadas. Conserva trazabilidad HU/RF/AC/EQ. No reintroduzcas clasificación externa ni nuevos roles/instituciones; no cambies acuerdos para hacer pasar las pruebas. Si una decisión necesaria sigue abierta, aclárala antes de implementar. No conviertas seeds, simulaciones o escenarios de papel en evidencia de operación real.

### Preparación previa, sin otra spec obligatoria

1. Guarda un punto de control Git de tu trabajo actual antes de comenzar a implementar.
2. Comprueba instalación de CLI/skills y que el proyecto OpenSpec se resuelve correctamente; no vuelvas a inicializar ni crees carpetas de cambios manualmente por un error de PATH.
3. Revisa coherencia de la guía UI con el cambio 01: contraseña y verificación ya fueron resueltas en sus artefactos; recuperación sigue excluida solo de esa primera entrega. Documenta esas diferencias cuando corresponda, no las sustituyas silenciosamente.
4. Mantén entorno local y BD de prueba aislados. Versiona migraciones y contratos, nunca credenciales. La primera spec ya incluye las bases técnicas: no hace falta anteponer otro bootstrap incompatible.
5. Mantén docs/ como alcance, políticas y arquitectura; openspec/specs como capacidades implementadas/sincronizadas y openspec/changes como trabajo propuesto o en curso. Una intención futura permanece en changes/documentación, no se presenta como capacidad terminada.

## 3. Orden y dependencias

Se recomienda ejecutar en el orden indicado. Una dependencia es una capacidad ya aceptada y disponible, no solo una propuesta redactada. La existencia de un componente futuro se puede representar con un doble en pruebas, pero no cuenta como integración completa.

| Fase | Spec | Cambio propuesto | Módulos/superficies |
|---|---|---|---|
| A | 01 | registro-login-ciudadano | Identidad; Flutter; API; PostgreSQL |
| A | 02 | correo-recuperacion-activacion | Identidad; adaptador de correo; Flutter |
| A | 03 | perfil-navegacion-movil | Identidad; Consultas; Flutter |
| A | 04 | web-publica-acceso-institucional | React; Identidad; API |
| B | 05 | catalogo-territorial | Consultas; Reportes; contratos territoriales |
| B | 06 | instituciones-sedes-operadores | Identidad; panel administrador; correo |
| B | 07 | categorias-reglas-atencion | Reportes; Operaciones; Identidad; panel administrador |
| C | 08 | registro-reporte-ciudadano | Reportes; Flutter; API; PostgreSQL |
| C | 09 | evaluacion-rapida-samu | Reportes; Operaciones; Flutter; permisos sanitarios |
| C | 10 | fotografias-privadas | Reportes; Storage; Flutter |
| D | 11 | enrutamiento-bandejas-institucionales | Operaciones; Alertas; Identidad; Consultas; React |
| D | 12 | revision-asignacion-casos | Operaciones; Reportes; Identidad; panel operador |
| D | 13 | atencion-multiinstitucional | Operaciones; Alertas; Reportes; React |
| D | 14 | seguimiento-ciudadano | Reportes; Consultas; Flutter; Alertas |
| E | 15 | publicacion-mapas | Operaciones; Consultas; Flutter; React; MapLibre |
| E | 16 | correlacion-consolidacion | Análisis; Operaciones; Reportes; panel |
| E | 17 | preferencias-alertas-preventivas | Alertas; Consultas; Identidad; Flutter |
| E | 18 | push-movil-fcm | Alertas; Flutter; adaptador FCM |
| E | 19 | indicadores-por-ambito | Consultas; React; proyecciones |
| E | 20 | contenido-contactos-admin | Consultas; React administrador; Flutter y web pública |
| F | 21 | conservacion-eliminacion | Todos los módulos mediante contratos; infraestructura |
| F | 22 | despliegue-validacion-piloto | Infraestructura; API; web; Flutter; observabilidad |
| G | 23 | compatibilidad-validacion-ios | Flutter; APNs/FCM; permisos; distribución |

## 4. Ciclo de revisión y pruebas por incremento

- **Explore:** comprueba código/docs/specs existentes, dependencias y decisiones pendientes. No repetir preguntas ya resueltas por el producto.
- **Propose:** especifica comportamiento observable, escenarios satisfactorios, errores, permisos y concurrencia. Define UI/estados, contratos, migraciones y rollback cuando aplique; incluye verificación concreta dentro de tasks.md.
- **Update:** revisa y corrige antes de implementar; si surge un problema durante apply, actualiza los artefactos y vuelve a apply. No uses update para introducir código.
- **Apply:** implementa una entrega vertical que se pueda ejecutar y probar; usa unitarias para reglas, integración con PostgreSQL para atomicidad/consultas, API para autorización y UI/end-to-end para el recorrido. No crear tests que solo repitan la implementación.
- **Aceptación:** ejecuta las pruebas relevantes y conserva comandos/resultados en el informe del cambio. Un test con dobles no demuestra conexión real a Storage, correo o FCM; cuando la salida lo exige, verifica ambos niveles.
- **Archive:** confirma tareas completas y comportamiento comprobado, sincroniza deltas, valida specs principales y archiva conservando historial. Git commit/deploy es una acción separada. No archives una promesa de soporte o una prueba que no se pudo ejecutar.

No necesitas otra skill llamada «verify» para pedir pruebas: apply debe ejecutarlas y puedes solicitar una revisión de aceptación antes de archive. Si el perfil instalado ofrece un verificador adicional, úsalo como apoyo, no como sustituto de ejecutar el sistema.

## 5. Prompts por spec

Los siguientes bloques son copiables. En los prompts update, reemplaza [AJUSTE] por el hallazgo real; si no existe ningún ajuste, omite ese paso. Para Spec 01 usa el cambio ya presente. Para los demás, conserva el nombre exacto del cambio seleccionado por la herramienta.

### Spec 01 — Registro y acceso ciudadano

**Cambio:** `registro-login-ciudadano` · **Fase A:** Acceso y bases del producto.

**Módulos/superficies:** Identidad; Flutter; API; PostgreSQL.

**Trazabilidad principal:** RF01–RF02; RF05 y RF51 en su alcance ciudadano. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Cambio existente; sus propias tareas crean las bases mínimas.

**Qué se resolverá:** Continuar el cambio existente: bases mínimas apps/mobile y apps/api, PostgreSQL/Prisma, registro, login, consulta/restauración y cierre de sesión. Componentes de acceso según la guía UI. Mantener contraseña 15–128 puntos de código, espacios/pegado, correo sin verificar y sesión opaca de 24 horas conforme a sus artefactos.

**Fuera de alcance y límites:** Recuperación, panel, roles privilegiados, reportes, mapas y despliegue están excluidos.

**Decisiones a revisar en explore:** Revisar coherencia de la excepción temporal de recuperación con la guía UI y conservar las decisiones de contraseña/sesión ya confirmadas.

**Pruebas de aceptación:** Registro seguido de login Android contra PostgreSQL; correo duplicado y carrera concurrente; credenciales inválidas; revocación/vencimiento; caída de BD/red y respuesta perdida; almacenamiento seguro; lector de pantalla y texto al 200 %.

**Condición de salida:** El ciudadano puede crear cuenta, ingresar, restaurar sesión y salir. API compilable, migración reproducible y pruebas con BD real aislada. No declarar módulos de negocio disponibles.

**1. Explore**

```text
$openspec-explore
Explora registro-login-ciudadano para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Continuar el cambio existente: bases mínimas apps/mobile y apps/api, PostgreSQL/Prisma, registro, login, consulta/restauración y cierre de sesión. Componentes de acceso según la guía UI. Mantener contraseña 15–128 puntos de código, espacios/pegado, correo sin verificar y sesión opaca de 24 horas conforme a sus artefactos.
Antes de planificar, resuelve esto: Revisar coherencia de la excepción temporal de recuperación con la guía UI y conservar las decisiones de contraseña/sesión ya confirmadas.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Revisar la propuesta existente**

```text
$openspec-update-change
Revisa el cambio existente registro-login-ciudadano usando las decisiones acordadas en explore y el código disponible. No crees otro cambio ni reemplaces decisiones confirmadas de autenticación. Cubre RF01–RF02; RF05 y RF51 en su alcance ciudadano. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Recuperación, panel, roles privilegiados, reportes, mapas y despliegue están excluidos.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza registro-login-ciudadano con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Registro seguido de login Android contra PostgreSQL; correo duplicado y carrera concurrente; credenciales inválidas; revocación/vencimiento; caída de BD/red y respuesta perdida; almacenamiento seguro; lector de pantalla y texto al 200 %.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa registro-login-ciudadano según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Registro seguido de login Android contra PostgreSQL; correo duplicado y carrera concurrente; credenciales inválidas; revocación/vencimiento; caída de BD/red y respuesta perdida; almacenamiento seguro; lector de pantalla y texto al 200 %.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva registro-login-ciudadano únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: El ciudadano puede crear cuenta, ingresar, restaurar sesión y salir. API compilable, migración reproducible y pruebas con BD real aislada. No declarar módulos de negocio disponibles.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 02 — Correo, recuperación y activación

**Cambio:** `correo-recuperacion-activacion` · **Fase A:** Acceso y bases del producto.

**Módulos/superficies:** Identidad; adaptador de correo; Flutter.

**Trazabilidad principal:** RF03; soporte para RF29. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–01 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Elegir y verificar proveedor/remitente compatible con el presupuesto; recuperación por correo con token de un solo uso, vencimiento y cambio de contraseña. Preparar la capacidad reutilizable de invitación/activación de operadores, que será consumida por Spec 06; no crear operadores aquí.

**Fuera de alcance y límites:** No exigir verificación de correo para el login ciudadano ni agregar OAuth/MFA. El servidor de correo de pruebas no cuenta como envío real validado.

**Decisiones a revisar en explore:** Resolver proveedor y remitente antes de apply; decidir invalidación de sesiones tras cambiar contraseña y comprobar que no contradiga el contrato de Spec 01.

**Pruebas de aceptación:** Cuenta existente/inexistente con respuesta de solicitud uniforme; token vencido/usado/alterado; dos consumos simultáneos; envío fallido y reintento sin filtrar secretos; contraseña nueva y política documentada de revocación de sesiones.

**Condición de salida:** Recuperación funciona con adaptador de pruebas y envío controlado real del proveedor seleccionado; pantallas de enlace usado/vencido funcionan. Habilitar el enlace de recuperación, reemplazando el texto temporal de Spec 01.

**1. Explore**

```text
$openspec-explore
Explora correo-recuperacion-activacion para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Elegir y verificar proveedor/remitente compatible con el presupuesto; recuperación por correo con token de un solo uso, vencimiento y cambio de contraseña. Preparar la capacidad reutilizable de invitación/activación de operadores, que será consumida por Spec 06; no crear operadores aquí.
Antes de planificar, resuelve esto: Resolver proveedor y remitente antes de apply; decidir invalidación de sesiones tras cambiar contraseña y comprobar que no contradiga el contrato de Spec 01.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio correo-recuperacion-activacion usando las decisiones acordadas en explore y el código disponible. Cubre RF03; soporte para RF29. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No exigir verificación de correo para el login ciudadano ni agregar OAuth/MFA. El servidor de correo de pruebas no cuenta como envío real validado.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza correo-recuperacion-activacion con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Cuenta existente/inexistente con respuesta de solicitud uniforme; token vencido/usado/alterado; dos consumos simultáneos; envío fallido y reintento sin filtrar secretos; contraseña nueva y política documentada de revocación de sesiones.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa correo-recuperacion-activacion según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Cuenta existente/inexistente con respuesta de solicitud uniforme; token vencido/usado/alterado; dos consumos simultáneos; envío fallido y reintento sin filtrar secretos; contraseña nueva y política documentada de revocación de sesiones.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva correo-recuperacion-activacion únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Recuperación funciona con adaptador de pruebas y envío controlado real del proveedor seleccionado; pantallas de enlace usado/vencido funcionan. Habilitar el enlace de recuperación, reemplazando el texto temporal de Spec 01.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 03 — Perfil y navegación ciudadana

**Cambio:** `perfil-navegacion-movil` · **Fase A:** Acceso y bases del producto.

**Módulos/superficies:** Identidad; Consultas; Flutter.

**Trazabilidad principal:** RF04; RF36–RF37; RF51. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–02 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Inicio orientado a acciones, navegación Inicio/Mapa/Mis reportes/Alertas y perfil desde cabecera. Editar nombre y teléfono opcional con autorización de compartir; mostrar páginas sobre app/desarrolladores, privacidad y contactos públicos aprobados. Los destinos aún no construidos muestran honestamente su estado pendiente.

**Fuera de alcance y límites:** No construir mapas, reportes o avisos ficticios como si fueran servicios terminados. Sin números de emergencia inventados ni recolección de DNI.

**Decisiones a revisar en explore:** Definir comportamiento al cambiar correo: no tratar un correo editado como identidad ya verificada; si cambia el alcance de Identidad, ajustar sus contratos antes de implementar.

**Pruebas de aceptación:** Perfil propio frente a ID ajeno; persistencia de edición; teléfono vacío y consentimiento revocable; contenido público sin sesión; navegación atrás tras logout; ausencia explícita de contenido no aprobado.

**Condición de salida:** Se puede editar perfil y navegar sin exponer datos privados; la información pública ya tiene una fuente versionada mínima reutilizable por web. Los módulos pendientes quedan identificados.

**1. Explore**

```text
$openspec-explore
Explora perfil-navegacion-movil para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Inicio orientado a acciones, navegación Inicio/Mapa/Mis reportes/Alertas y perfil desde cabecera. Editar nombre y teléfono opcional con autorización de compartir; mostrar páginas sobre app/desarrolladores, privacidad y contactos públicos aprobados. Los destinos aún no construidos muestran honestamente su estado pendiente.
Antes de planificar, resuelve esto: Definir comportamiento al cambiar correo: no tratar un correo editado como identidad ya verificada; si cambia el alcance de Identidad, ajustar sus contratos antes de implementar.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio perfil-navegacion-movil usando las decisiones acordadas en explore y el código disponible. Cubre RF04; RF36–RF37; RF51. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No construir mapas, reportes o avisos ficticios como si fueran servicios terminados. Sin números de emergencia inventados ni recolección de DNI.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza perfil-navegacion-movil con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Perfil propio frente a ID ajeno; persistencia de edición; teléfono vacío y consentimiento revocable; contenido público sin sesión; navegación atrás tras logout; ausencia explícita de contenido no aprobado.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa perfil-navegacion-movil según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Perfil propio frente a ID ajeno; persistencia de edición; teléfono vacío y consentimiento revocable; contenido público sin sesión; navegación atrás tras logout; ausencia explícita de contenido no aprobado.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva perfil-navegacion-movil únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Se puede editar perfil y navegar sin exponer datos privados; la información pública ya tiene una fuente versionada mínima reutilizable por web. Los módulos pendientes quedan identificados.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 04 — Portada web y acceso institucional

**Cambio:** `web-publica-acceso-institucional` · **Fase A:** Acceso y bases del producto.

**Módulos/superficies:** React; Identidad; API.

**Trazabilidad principal:** RF02; RF05; RF38; base de RF22. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–03 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Agregar CI de lint, compilación y pruebas existentes de API/Flutter/web sin secretos en logs. Crear apps/web con portada pública, finalidad, funcionamiento, desarrolladores y login institucional. Aprovisionar administrador inicial mediante procedimiento controlado y sin contraseña compartida en Git. Diseñar sesiones/seguridad del navegador y shell por rol; la creación real de operadores queda para Spec 06.

**Fuera de alcance y límites:** Sin autorregistro administrativo ni ciudadano completo en navegador. No reutilizar almacenamiento móvil en web sin evaluar cookies/tokens y su modelo de amenazas.

**Decisiones a revisar en explore:** Acordar sesión del navegador, CORS/CSRF según mecanismo elegido, bootstrap y recuperación del administrador sin debilitar la autenticación ciudadana.

**Pruebas de aceptación:** Portada sin sesión; login y logout; ciudadano no entra al panel; rutas y API rechazan rol ajeno; administrador suspendido; refrescar navegador; ausencia de secreto en logs/repositorio.

**Condición de salida:** Administrador entra a un panel mínimo real y las rutas están protegidas en servidor. Pruebas de operador con fixtures controlados no se presentan como alta institucional completa.

**1. Explore**

```text
$openspec-explore
Explora web-publica-acceso-institucional para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Agregar CI de lint, compilación y pruebas existentes de API/Flutter/web sin secretos en logs. Crear apps/web con portada pública, finalidad, funcionamiento, desarrolladores y login institucional. Aprovisionar administrador inicial mediante procedimiento controlado y sin contraseña compartida en Git. Diseñar sesiones/seguridad del navegador y shell por rol; la creación real de operadores queda para Spec 06.
Antes de planificar, resuelve esto: Acordar sesión del navegador, CORS/CSRF según mecanismo elegido, bootstrap y recuperación del administrador sin debilitar la autenticación ciudadana.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio web-publica-acceso-institucional usando las decisiones acordadas en explore y el código disponible. Cubre RF02; RF05; RF38; base de RF22. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Sin autorregistro administrativo ni ciudadano completo en navegador. No reutilizar almacenamiento móvil en web sin evaluar cookies/tokens y su modelo de amenazas.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza web-publica-acceso-institucional con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Portada sin sesión; login y logout; ciudadano no entra al panel; rutas y API rechazan rol ajeno; administrador suspendido; refrescar navegador; ausencia de secreto en logs/repositorio.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa web-publica-acceso-institucional según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Portada sin sesión; login y logout; ciudadano no entra al panel; rutas y API rechazan rol ajeno; administrador suspendido; refrescar navegador; ausencia de secreto en logs/repositorio.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva web-publica-acceso-institucional únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Administrador entra a un panel mínimo real y las rutas están protegidas en servidor. Pruebas de operador con fixtures controlados no se presentan como alta institucional completa.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 05 — Distritos y resolución territorial

**Cambio:** `catalogo-territorial` · **Fase B:** Organización y configuración institucional.

**Módulos/superficies:** Consultas; Reportes; contratos territoriales.

**Trazabilidad principal:** RF07; RF31; componente territorial de RF54. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–04 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Catálogo de los cinco distritos, ID/UBIGEO verificado, geometrías con fuente/versión y contrato de resolución punto-en-polígono; rutas de lectura para clientes. Conservar estados calculado, declarado y pendiente.

**Fuera de alcance y límites:** No inferir límites de un mapa base ni confundir municipalidad provincial con distrito. No desplegar geometrías ficticias como oficiales.

**Decisiones a revisar en explore:** Resolver procedencia/licencia y ambigüedad de polígonos antes de afirmar que la jurisdicción está implementada.

**Pruebas de aceptación:** Punto interior de cada distrito, borde, superposición, punto fuera de cobertura, coordenadas inválidas, distrito declarado sin GPS y cambio de versión geométrica.

**Condición de salida:** La misma coordenada se resuelve en backend de forma reproducible y sus resultados llegan a clientes. Geometrías y fuentes están documentadas; sin geometría aprobada, mantener pruebas sintéticas y declarar el bloqueo del uso territorial real.

**1. Explore**

```text
$openspec-explore
Explora catalogo-territorial para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Catálogo de los cinco distritos, ID/UBIGEO verificado, geometrías con fuente/versión y contrato de resolución punto-en-polígono; rutas de lectura para clientes. Conservar estados calculado, declarado y pendiente.
Antes de planificar, resuelve esto: Resolver procedencia/licencia y ambigüedad de polígonos antes de afirmar que la jurisdicción está implementada.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio catalogo-territorial usando las decisiones acordadas en explore y el código disponible. Cubre RF07; RF31; componente territorial de RF54. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No inferir límites de un mapa base ni confundir municipalidad provincial con distrito. No desplegar geometrías ficticias como oficiales.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza catalogo-territorial con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Punto interior de cada distrito, borde, superposición, punto fuera de cobertura, coordenadas inválidas, distrito declarado sin GPS y cambio de versión geométrica.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa catalogo-territorial según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Punto interior de cada distrito, borde, superposición, punto fuera de cobertura, coordenadas inválidas, distrito declarado sin GPS y cambio de versión geométrica.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva catalogo-territorial únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: La misma coordenada se resuelve en backend de forma reproducible y sus resultados llegan a clientes. Geometrías y fuentes están documentadas; sin geometría aprobada, mantener pruebas sintéticas y declarar el bloqueo del uso territorial real.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 06 — Organización, cobertura y operadores

**Cambio:** `instituciones-sedes-operadores` · **Fase B:** Organización y configuración institucional.

**Módulos/superficies:** Identidad; panel administrador; correo.

**Trazabilidad principal:** RF05; RF22; RF28–RF30; RF54. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–05 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Administrar PNP/Bomberos/SAMU/Serenazgo, sedes, cobertura por varios distritos, competencias y operadores. Importar las trece sedes candidatas como no operativas y la referencia municipal por separado. Alta habilitada crea sede y operador inicial atómicamente; invitación mediante Spec 02 después del commit. Suspender y reasignar pertenencias con auditoría.

**Fuera de alcance y límites:** No activar atención real por la existencia de un nombre, dirección histórica o fixture. No agregar una quinta institución ni un cuarto rol.

**Decisiones a revisar en explore:** Distinguir borrador de catálogo del alta operativa; no inventar contactos, autorización ni operación de sedes no verificadas.

**Pruebas de aceptación:** Rollback al fallar alta del operador; usuario no administrador rechazado; institución no permitida; cobertura distinta de ubicación; invitación usada/vencida; suspensión y acceso directo a recursos ajenos.

**Condición de salida:** Administrador puede dar de alta sede y operador, configurar competencia/cobertura y activar una cuenta de prueba. Matriz de permisos institucionales probada en API, no solo menú.

**1. Explore**

```text
$openspec-explore
Explora instituciones-sedes-operadores para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Administrar PNP/Bomberos/SAMU/Serenazgo, sedes, cobertura por varios distritos, competencias y operadores. Importar las trece sedes candidatas como no operativas y la referencia municipal por separado. Alta habilitada crea sede y operador inicial atómicamente; invitación mediante Spec 02 después del commit. Suspender y reasignar pertenencias con auditoría.
Antes de planificar, resuelve esto: Distinguir borrador de catálogo del alta operativa; no inventar contactos, autorización ni operación de sedes no verificadas.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio instituciones-sedes-operadores usando las decisiones acordadas en explore y el código disponible. Cubre RF05; RF22; RF28–RF30; RF54. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No activar atención real por la existencia de un nombre, dirección histórica o fixture. No agregar una quinta institución ni un cuarto rol.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza instituciones-sedes-operadores con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Rollback al fallar alta del operador; usuario no administrador rechazado; institución no permitida; cobertura distinta de ubicación; invitación usada/vencida; suspensión y acceso directo a recursos ajenos.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa instituciones-sedes-operadores según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Rollback al fallar alta del operador; usuario no administrador rechazado; institución no permitida; cobertura distinta de ubicación; invitación usada/vencida; suspensión y acceso directo a recursos ajenos.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva instituciones-sedes-operadores únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Administrador puede dar de alta sede y operador, configurar competencia/cobertura y activar una cuenta de prueba. Matriz de permisos institucionales probada en API, no solo menú.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 07 — Categorías y reglas de destinatarios

**Cambio:** `categorias-reglas-atencion` · **Fase B:** Organización y configuración institucional.

**Módulos/superficies:** Reportes; Operaciones; Identidad; panel administrador.

**Trazabilidad principal:** RF23–RF24; reglas de RF32–RF33; RF55; RF57. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–06 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Sembrar las 16 categorías con ID estable y configurar reglas versionadas de principal/apoyos/condiciones. Accidente con heridos o necesidad médica: SAMU principal y PNP apoyo; sin condición médica: PNP sin aviso SAMU; desconocido pendiente. Otra emergencia corresponde a Serenazgo. Construir evaluador de reglas aislado y configuración administrativa, todavía sin avisos de casos reales.

**Fuera de alcance y límites:** No emitir diagnósticos, prioridad clínica automática ni avisos externos en esta etapa. No borrar categorías históricas.

**Decisiones a revisar en explore:** Separar reglas de enrutamiento de etiquetas manuales de prioridad y de reglas de alertas preventivas.

**Pruebas de aceptación:** Tabla completa de 16 categorías; las combinaciones Sí/No/Desconocido; PNP indisponible declarada y apoyo Serenazgo; cambio de versión sin modificar el resultado histórico de un caso.

**Condición de salida:** Pruebas de tabla demuestran todos los resultados previstos y quedan contratos listos para el enrutamiento de Spec 11.

**1. Explore**

```text
$openspec-explore
Explora categorias-reglas-atencion para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Sembrar las 16 categorías con ID estable y configurar reglas versionadas de principal/apoyos/condiciones. Accidente con heridos o necesidad médica: SAMU principal y PNP apoyo; sin condición médica: PNP sin aviso SAMU; desconocido pendiente. Otra emergencia corresponde a Serenazgo. Construir evaluador de reglas aislado y configuración administrativa, todavía sin avisos de casos reales.
Antes de planificar, resuelve esto: Separar reglas de enrutamiento de etiquetas manuales de prioridad y de reglas de alertas preventivas.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio categorias-reglas-atencion usando las decisiones acordadas en explore y el código disponible. Cubre RF23–RF24; reglas de RF32–RF33; RF55; RF57. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No emitir diagnósticos, prioridad clínica automática ni avisos externos en esta etapa. No borrar categorías históricas.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza categorias-reglas-atencion con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Tabla completa de 16 categorías; las combinaciones Sí/No/Desconocido; PNP indisponible declarada y apoyo Serenazgo; cambio de versión sin modificar el resultado histórico de un caso.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa categorias-reglas-atencion según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Tabla completa de 16 categorías; las combinaciones Sí/No/Desconocido; PNP indisponible declarada y apoyo Serenazgo; cambio de versión sin modificar el resultado histórico de un caso.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva categorias-reglas-atencion únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Pruebas de tabla demuestran todos los resultados previstos y quedan contratos listos para el enrutamiento de Spec 11.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 08 — Reporte básico completo de extremo a extremo

**Cambio:** `registro-reporte-ciudadano` · **Fase C:** Registro ciudadano completo.

**Módulos/superficies:** Reportes; Flutter; API; PostgreSQL.

**Trazabilidad principal:** RF06–RF07; RF09–RF10 inicial; RF31. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–07 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Formulario con categoría, descripción, Ahora/Antes, ubicación consentida o distrito declarado/pendiente. Persistir envío, clave de idempotencia y ReporteRegistrado en una transacción; responder 201 después de commit. Añadir lista propia mínima y detalle de recepción. Crear outbox recuperable sin consumidores institucionales todavía.

**Fuera de alcance y límites:** En esta entrega aún faltan evaluación SAMU, fotos y atención: probar con datos ficticios y no habilitar un piloto real de emergencias. Fotos opcionales no son un requisito para enviar.

**Decisiones a revisar en explore:** Mantener las invariantes y ampliar esquemas/migraciones junto al formulario; no declarar resueltos los contratos omitidos por el ejemplo técnico.

**Pruebas de aceptación:** Reporte válido, autor desde sesión, autor ajeno, fechas inválidas, GPS denegado, sin distrito, doble toque, misma clave con contenido distinto, corte de red después del commit y rollback reporte/evento.

**Condición de salida:** Un ciudadano de prueba registra y consulta solo su envío real en BD; reintento no duplica y el evento sobrevive al reinicio. La recepción no se etiqueta como atención.

**1. Explore**

```text
$openspec-explore
Explora registro-reporte-ciudadano para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Formulario con categoría, descripción, Ahora/Antes, ubicación consentida o distrito declarado/pendiente. Persistir envío, clave de idempotencia y ReporteRegistrado en una transacción; responder 201 después de commit. Añadir lista propia mínima y detalle de recepción. Crear outbox recuperable sin consumidores institucionales todavía.
Antes de planificar, resuelve esto: Mantener las invariantes y ampliar esquemas/migraciones junto al formulario; no declarar resueltos los contratos omitidos por el ejemplo técnico.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio registro-reporte-ciudadano usando las decisiones acordadas en explore y el código disponible. Cubre RF06–RF07; RF09–RF10 inicial; RF31. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: En esta entrega aún faltan evaluación SAMU, fotos y atención: probar con datos ficticios y no habilitar un piloto real de emergencias. Fotos opcionales no son un requisito para enviar.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza registro-reporte-ciudadano con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Reporte válido, autor desde sesión, autor ajeno, fechas inválidas, GPS denegado, sin distrito, doble toque, misma clave con contenido distinto, corte de red después del commit y rollback reporte/evento.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa registro-reporte-ciudadano según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Reporte válido, autor desde sesión, autor ajeno, fechas inválidas, GPS denegado, sin distrito, doble toque, misma clave con contenido distinto, corte de red después del commit y rollback reporte/evento.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva registro-reporte-ciudadano únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Un ciudadano de prueba registra y consulta solo su envío real en BD; reintento no duplica y el evento sobrevive al reinicio. La recepción no se etiqueta como atención.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 09 — Evaluación rápida con botones

**Cambio:** `evaluacion-rapida-samu` · **Fase C:** Registro ciudadano completo.

**Módulos/superficies:** Reportes; Operaciones; Flutter; permisos sanitarios.

**Trazabilidad principal:** RF41–RF44; captura de RF57. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–08 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Preguntas Sí/No/No sé de heridos y necesidad médica en accidentes; cantidades rápidas y +/− sin teclado; fichas opcionales por persona para signos de vida observados, conciencia y sangrado. Guardar origen, fecha, versión y completitud; admitir envío pendiente y aclaraciones autorizadas. Preparar el contrato para incorporar SAMU después.

**Fuera de alcance y límites:** Sin diagnóstico, puntaje clínico, normalidad preseleccionada ni ficha obligatoria de todos los heridos. No mostrar detalles sanitarios a cualquier operador.

**Decisiones a revisar en explore:** El detalle de fichas nunca se copia al evento, log, mapa o notificación; distinguir datos originales de aclaraciones operativas.

**Pruebas de aceptación:** Cantidad desconocida no equivale a cero; emergencia médica sin heridos; varias personas con datos distintos; información parcial; cambio de condición; autor ajeno y operador no SAMU rechazados.

**Condición de salida:** Formulario y API conservan desconocidos y versiones; autor ve sus propios datos. La consulta del operador requiere asignación/competencia: mientras aún no exista ese flujo, los tests usan fixtures y se deniega acceso por defecto.

**1. Explore**

```text
$openspec-explore
Explora evaluacion-rapida-samu para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Preguntas Sí/No/No sé de heridos y necesidad médica en accidentes; cantidades rápidas y +/− sin teclado; fichas opcionales por persona para signos de vida observados, conciencia y sangrado. Guardar origen, fecha, versión y completitud; admitir envío pendiente y aclaraciones autorizadas. Preparar el contrato para incorporar SAMU después.
Antes de planificar, resuelve esto: El detalle de fichas nunca se copia al evento, log, mapa o notificación; distinguir datos originales de aclaraciones operativas.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio evaluacion-rapida-samu usando las decisiones acordadas en explore y el código disponible. Cubre RF41–RF44; captura de RF57. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Sin diagnóstico, puntaje clínico, normalidad preseleccionada ni ficha obligatoria de todos los heridos. No mostrar detalles sanitarios a cualquier operador.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza evaluacion-rapida-samu con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Cantidad desconocida no equivale a cero; emergencia médica sin heridos; varias personas con datos distintos; información parcial; cambio de condición; autor ajeno y operador no SAMU rechazados.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa evaluacion-rapida-samu según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Cantidad desconocida no equivale a cero; emergencia médica sin heridos; varias personas con datos distintos; información parcial; cambio de condición; autor ajeno y operador no SAMU rechazados.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva evaluacion-rapida-samu únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Formulario y API conservan desconocidos y versiones; autor ve sus propios datos. La consulta del operador requiere asignación/competencia: mientras aún no exista ese flujo, los tests usan fixtures y se deniega acceso por defecto.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 10 — Fotografías privadas y limpieza inicial

**Cambio:** `fotografias-privadas` · **Fase C:** Registro ciudadano completo.

**Módulos/superficies:** Reportes; Storage; Flutter.

**Trazabilidad principal:** RF08; RF52; parte de RF53. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–09 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Seleccionar/validar almacenamiento privado, cámara/galería, hasta tres fotos de 5 MB JPEG/PNG/WebP, normalización y retiro EXIF, cargas autorizadas, metadatos y acceso temporal. Limpiar huérfanos de 24 h con tarea persistente y rechazo de acceso vencido.

**Fuera de alcance y límites:** Cloudinary es candidato, no un requisito irrevocable. Sin proveedor que proteja originales/derivados/caducidad, no usar fotos reales ni declarar cumplida la seguridad.

**Decisiones a revisar en explore:** Verificar capacidades del plan real y límites de cuota. No sustituir privacidad por URLs públicas ni considerar una firma de carga equivalente a entrega privada.

**Pruebas de aceptación:** Tres fotos y cuarta rechazada; archivo renombrado, tamaño excesivo, evidencia ajena, URL sin firma/caducada, derivados privados, EXIF retirado, carga interrumpida y envío sin fotos.

**Condición de salida:** Una foto de prueba se consulta solo por un usuario autorizado y una URL vence realmente; huérfanos y fallos se recuperan sin bloquear reporte sin adjuntos.

**1. Explore**

```text
$openspec-explore
Explora fotografias-privadas para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Seleccionar/validar almacenamiento privado, cámara/galería, hasta tres fotos de 5 MB JPEG/PNG/WebP, normalización y retiro EXIF, cargas autorizadas, metadatos y acceso temporal. Limpiar huérfanos de 24 h con tarea persistente y rechazo de acceso vencido.
Antes de planificar, resuelve esto: Verificar capacidades del plan real y límites de cuota. No sustituir privacidad por URLs públicas ni considerar una firma de carga equivalente a entrega privada.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio fotografias-privadas usando las decisiones acordadas en explore y el código disponible. Cubre RF08; RF52; parte de RF53. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Cloudinary es candidato, no un requisito irrevocable. Sin proveedor que proteja originales/derivados/caducidad, no usar fotos reales ni declarar cumplida la seguridad.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza fotografias-privadas con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Tres fotos y cuarta rechazada; archivo renombrado, tamaño excesivo, evidencia ajena, URL sin firma/caducada, derivados privados, EXIF retirado, carga interrumpida y envío sin fotos.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa fotografias-privadas según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Tres fotos y cuarta rechazada; archivo renombrado, tamaño excesivo, evidencia ajena, URL sin firma/caducada, derivados privados, EXIF retirado, carga interrumpida y envío sin fotos.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva fotografias-privadas únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Una foto de prueba se consulta solo por un usuario autorizado y una URL vence realmente; huérfanos y fallos se recuperan sin bloquear reporte sin adjuntos.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 11 — Enrutamiento y avisos persistentes

**Cambio:** `enrutamiento-bandejas-institucionales` · **Fase D:** Atención institucional y seguimiento.

**Módulos/superficies:** Operaciones; Alertas; Identidad; Consultas; React.

**Trazabilidad principal:** RF26; RF32–RF35; RF55; RF57. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–10 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Consumir ReporteRegistrado en Operaciones independientemente de Análisis; resolver principal/apoyos por categoría, condiciones, cobertura y sedes activas. Persistir destinatarios y crear avisos por usuario. Panel recibe bandeja/contador y lectura individual mediante polling; administrador designa casos sin sede/distrito.

**Fuera de alcance y límites:** Sin esperar validación pública ni análisis; no interpretar push enviado como recepción institucional. FCM queda para Spec 18.

**Decisiones a revisar en explore:** La excepción administrativa se limita al caso y no inventa distrito ni habilita detalle sanitario para el administrador.

**Pruebas de aceptación:** Accidente con y sin heridos/necesidad médica; desconocidos; Otra emergencia; falta de sede; distritos compartidos; duplicación de evento y de apoyo Serenazgo; reinicio antes de entregar; lectura independiente.

**Condición de salida:** Un reporte ficticio enviado desde Flutter aparece en los paneles de prueba correctos con principal y apoyos; usuarios sin competencia no lo consultan. La entrega recupera pendientes sin duplicar avisos persistidos.

**1. Explore**

```text
$openspec-explore
Explora enrutamiento-bandejas-institucionales para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Consumir ReporteRegistrado en Operaciones independientemente de Análisis; resolver principal/apoyos por categoría, condiciones, cobertura y sedes activas. Persistir destinatarios y crear avisos por usuario. Panel recibe bandeja/contador y lectura individual mediante polling; administrador designa casos sin sede/distrito.
Antes de planificar, resuelve esto: La excepción administrativa se limita al caso y no inventa distrito ni habilita detalle sanitario para el administrador.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio enrutamiento-bandejas-institucionales usando las decisiones acordadas en explore y el código disponible. Cubre RF26; RF32–RF35; RF55; RF57. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Sin esperar validación pública ni análisis; no interpretar push enviado como recepción institucional. FCM queda para Spec 18.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza enrutamiento-bandejas-institucionales con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Accidente con y sin heridos/necesidad médica; desconocidos; Otra emergencia; falta de sede; distritos compartidos; duplicación de evento y de apoyo Serenazgo; reinicio antes de entregar; lectura independiente.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa enrutamiento-bandejas-institucionales según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Accidente con y sin heridos/necesidad médica; desconocidos; Otra emergencia; falta de sede; distritos compartidos; duplicación de evento y de apoyo Serenazgo; reinicio antes de entregar; lectura independiente.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva enrutamiento-bandejas-institucionales únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Un reporte ficticio enviado desde Flutter aparece en los paneles de prueba correctos con principal y apoyos; usuarios sin competencia no lo consultan. La entrega recupera pendientes sin duplicar avisos persistidos.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 12 — Asumir, revisar y validar

**Cambio:** `revision-asignacion-casos` · **Fase D:** Atención institucional y seguimiento.

**Módulos/superficies:** Operaciones; Reportes; Identidad; panel operador.

**Trazabilidad principal:** RF11–RF12; RF14; RF16; RF26; RF45; RF48; RF56. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–11 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Bandeja FIFO con etiquetas manuales Sin evaluar/Normal/Alta/Urgente e icono/texto/color. Asumir caso con un responsable activo por institución, revisión de categoría, validación/descarte con motivo y creación/vinculación inicial de incidente; persistir historial y transferencia de turno.

**Fuera de alcance y límites:** Asumir no cambia automáticamente a EN_ATENCION ni acredita llegada al lugar. Las etiquetas no reordenan silenciosamente.

**Decisiones a revisar en explore:** Resolver traslado de asignación del reporte al incidente y conflicto con responsable ya activo al vincular; no sobrescribir al responsable en silencio.

**Pruebas de aceptación:** Dos operadores asumen al mismo tiempo y solo uno gana; reintento del ganador es idempotente; otra institución tiene su responsable; acceso directo ajeno; descarte motivado; validación repetida sin doble incidente.

**Condición de salida:** Operador asume/revisa un reporte y valida o descarta; las transiciones y permisos están probados con concurrencia real de BD.

**1. Explore**

```text
$openspec-explore
Explora revision-asignacion-casos para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Bandeja FIFO con etiquetas manuales Sin evaluar/Normal/Alta/Urgente e icono/texto/color. Asumir caso con un responsable activo por institución, revisión de categoría, validación/descarte con motivo y creación/vinculación inicial de incidente; persistir historial y transferencia de turno.
Antes de planificar, resuelve esto: Resolver traslado de asignación del reporte al incidente y conflicto con responsable ya activo al vincular; no sobrescribir al responsable en silencio.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio revision-asignacion-casos usando las decisiones acordadas en explore y el código disponible. Cubre RF11–RF12; RF14; RF16; RF26; RF45; RF48; RF56. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Asumir no cambia automáticamente a EN_ATENCION ni acredita llegada al lugar. Las etiquetas no reordenan silenciosamente.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza revision-asignacion-casos con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Dos operadores asumen al mismo tiempo y solo uno gana; reintento del ganador es idempotente; otra institución tiene su responsable; acceso directo ajeno; descarte motivado; validación repetida sin doble incidente.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa revision-asignacion-casos según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Dos operadores asumen al mismo tiempo y solo uno gana; reintento del ganador es idempotente; otra institución tiene su responsable; acceso directo ajeno; descarte motivado; validación repetida sin doble incidente.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva revision-asignacion-casos únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Operador asume/revisa un reporte y valida o descarta; las transiciones y permisos están probados con concurrencia real de BD.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 13 — Atención, coordinación y cierre

**Cambio:** `atencion-multiinstitucional` · **Fase D:** Atención institucional y seguimiento.

**Módulos/superficies:** Operaciones; Alertas; Reportes; React.

**Trazabilidad principal:** RF17; RF33; RF39–RF40; RF46; RF56–RF57. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–12 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Actuaciones por institución, estado PENDIENTE_ATENCION/EN_ATENCION/CERRADO, recepción operativa, apoyo, indisponibilidad PNP y reemplazo por Serenazgo, transferencia, cierre/reapertura con motivo. Cambiar principal a SAMU al aparecer heridos/necesidad médica, recalculando acceso y permisos de cierre.

**Fuera de alcance y límites:** Leer un aviso, derivar o asumir no prueba despacho ni atención física. Solo principal vigente puede cerrar; administrador no toma decisiones clínicas.

**Decisiones a revisar en explore:** Definir transacciones de cambio principal/estado y reevaluación de permisos antes de implementar; conservar participación anterior como apoyo e historial.

**Pruebas de aceptación:** Operador de apoyo no cierra; PNP pierde permiso de cierre al pasar principal a SAMU; carreras entre cierre y cambio de principal; corrección de heridos sin cambiar categoría; suspensión del responsable; reapertura preserva historial.

**Condición de salida:** Un caso de prueba atraviesa revisión y atención multiinstitucional hasta cierre/reapertura sin perder envío original ni actuaciones. Destinatarios nuevos reciben aviso sin esperar completar ficha sanitaria.

**1. Explore**

```text
$openspec-explore
Explora atencion-multiinstitucional para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Actuaciones por institución, estado PENDIENTE_ATENCION/EN_ATENCION/CERRADO, recepción operativa, apoyo, indisponibilidad PNP y reemplazo por Serenazgo, transferencia, cierre/reapertura con motivo. Cambiar principal a SAMU al aparecer heridos/necesidad médica, recalculando acceso y permisos de cierre.
Antes de planificar, resuelve esto: Definir transacciones de cambio principal/estado y reevaluación de permisos antes de implementar; conservar participación anterior como apoyo e historial.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio atencion-multiinstitucional usando las decisiones acordadas en explore y el código disponible. Cubre RF17; RF33; RF39–RF40; RF46; RF56–RF57. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Leer un aviso, derivar o asumir no prueba despacho ni atención física. Solo principal vigente puede cerrar; administrador no toma decisiones clínicas.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza atencion-multiinstitucional con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Operador de apoyo no cierra; PNP pierde permiso de cierre al pasar principal a SAMU; carreras entre cierre y cambio de principal; corrección de heridos sin cambiar categoría; suspensión del responsable; reapertura preserva historial.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa atencion-multiinstitucional según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Operador de apoyo no cierra; PNP pierde permiso de cierre al pasar principal a SAMU; carreras entre cierre y cambio de principal; corrección de heridos sin cambiar categoría; suspensión del responsable; reapertura preserva historial.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva atencion-multiinstitucional únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Un caso de prueba atraviesa revisión y atención multiinstitucional hasta cierre/reapertura sin perder envío original ni actuaciones. Destinatarios nuevos reciben aviso sin esperar completar ficha sanitaria.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 14 — Mis reportes y seguimiento privado

**Cambio:** `seguimiento-ciudadano` · **Fase D:** Atención institucional y seguimiento.

**Módulos/superficies:** Reportes; Consultas; Flutter; Alertas.

**Trazabilidad principal:** RF10; RF19 en bandeja; RF47. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–13 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Lista propia filtrable y detalle con recepción, estados, institución responsable y resúmenes para el autor, motivos de descarte/cierre y evaluación propia retenida. Incluir avisos internos de cambios de estado, sin requerir aún push remoto.

**Fuera de alcance y límites:** No exponer operador, notas internas, información de otros reportantes ni historias sanitarias ajenas. Información privada del autor no es publicación en mapa.

**Decisiones a revisar en explore:** Mantener coherencia entre el estado de revisión del reporte y el estado operativo del incidente, con DTO específico del seguimiento.

**Pruebas de aceptación:** Autor A intenta consultar B; reporte descartado; caso cerrado; envío vinculado a varios reportes; responsable interno oculto; falta temporal de red y datos sanitarios ya vencidos.

**Condición de salida:** El mismo ciudadano que reportó ve cambios reales hechos desde el panel y recibe su aviso en bandeja. El mapa público sigue separado.

**1. Explore**

```text
$openspec-explore
Explora seguimiento-ciudadano para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Lista propia filtrable y detalle con recepción, estados, institución responsable y resúmenes para el autor, motivos de descarte/cierre y evaluación propia retenida. Incluir avisos internos de cambios de estado, sin requerir aún push remoto.
Antes de planificar, resuelve esto: Mantener coherencia entre el estado de revisión del reporte y el estado operativo del incidente, con DTO específico del seguimiento.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio seguimiento-ciudadano usando las decisiones acordadas en explore y el código disponible. Cubre RF10; RF19 en bandeja; RF47. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No exponer operador, notas internas, información de otros reportantes ni historias sanitarias ajenas. Información privada del autor no es publicación en mapa.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza seguimiento-ciudadano con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Autor A intenta consultar B; reporte descartado; caso cerrado; envío vinculado a varios reportes; responsable interno oculto; falta temporal de red y datos sanitarios ya vencidos.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa seguimiento-ciudadano según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Autor A intenta consultar B; reporte descartado; caso cerrado; envío vinculado a varios reportes; responsable interno oculto; falta temporal de red y datos sanitarios ya vencidos.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva seguimiento-ciudadano únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: El mismo ciudadano que reportó ve cambios reales hechos desde el panel y recibe su aviso en bandeja. El mapa público sigue separado.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 15 — Publicación autorizada y mapas

**Cambio:** `publicacion-mapas` · **Fase E:** Prevención y consultas.

**Módulos/superficies:** Operaciones; Consultas; Flutter; React; MapLibre.

**Trazabilidad principal:** RF20; RF31; RF49. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–14 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Publicación expresa de incidentes validados, MapLibre/OpenFreeMap en móvil y panel, límites/filtros distritales y DTO público mínimo. Reservar categorías/casos sensibles; zonas aproximadas 300 m, retiro al cierre y vigencia máxima según política. Panel conserva vista operativa autorizada distinta de la pública.

**Fuera de alcance y límites:** No publicar descripción original, fotos, identidades, teléfono ni datos SAMU. No calcular distrito real desde la posición generalizada.

**Decisiones a revisar en explore:** Resolver criterios exactos de generalización y supresión de grupos pequeños antes de hacer consultas públicas reales.

**Pruebas de aceptación:** Validado no publicado; reservado; cierre/expiración; coordenadas generalizadas respetan distrito; mapa falla pero la app conserva listas/formulario; manipular filtros no amplía permisos.

**Condición de salida:** Móvil y web muestran el mismo catálogo/resultado de filtros y el endpoint público no filtra campos restringidos. Probar visualmente atribución, límites y legibilidad.

**1. Explore**

```text
$openspec-explore
Explora publicacion-mapas para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Publicación expresa de incidentes validados, MapLibre/OpenFreeMap en móvil y panel, límites/filtros distritales y DTO público mínimo. Reservar categorías/casos sensibles; zonas aproximadas 300 m, retiro al cierre y vigencia máxima según política. Panel conserva vista operativa autorizada distinta de la pública.
Antes de planificar, resuelve esto: Resolver criterios exactos de generalización y supresión de grupos pequeños antes de hacer consultas públicas reales.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio publicacion-mapas usando las decisiones acordadas en explore y el código disponible. Cubre RF20; RF31; RF49. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No publicar descripción original, fotos, identidades, teléfono ni datos SAMU. No calcular distrito real desde la posición generalizada.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza publicacion-mapas con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Validado no publicado; reservado; cierre/expiración; coordenadas generalizadas respetan distrito; mapa falla pero la app conserva listas/formulario; manipular filtros no amplía permisos.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa publicacion-mapas según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Validado no publicado; reservado; cierre/expiración; coordenadas generalizadas respetan distrito; mapa falla pero la app conserva listas/formulario; manipular filtros no amplía permisos.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva publicacion-mapas únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Móvil y web muestran el mismo catálogo/resultado de filtros y el endpoint público no filtra campos restringidos. Probar visualmente atribución, límites y legibilidad.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 16 — Posibles duplicados y consolidación

**Cambio:** `correlacion-consolidacion` · **Fase E:** Prevención y consultas.

**Módulos/superficies:** Análisis; Operaciones; Reportes; panel.

**Trazabilidad principal:** RF13; RF15; RF40; RF56. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–15 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Definir parámetros configurables de categoría/distancia/ventana temporal; consumidor de correlación entrega candidatos para confirmación humana. Consolidar mantiene autoría, evidencia, actuaciones y seguimiento de cada reporte; resolver principal y responsables ya existentes.

**Fuera de alcance y límites:** Sin clasificación externa, borrado del reporte duplicado ni consolidación automática. No calcular distancia exacta sin coordenadas.

**Decisiones a revisar en explore:** Cerrar distancias y ventanas con ejemplos durante explore; no inventar valores normativos como si estuvieran acordados.

**Pruebas de aceptación:** Cercanos pero categorías distintas; fuera de ventana; sin punto; repetir evento; candidatos en ámbitos ajenos no revelan datos; consolidar casos con dos responsables de una institución deja uno vigente y audita resolución.

**Condición de salida:** Operador confirma una relación y ambos autores siguen su propio envío hacia el mismo incidente; avisos/asignaciones no se duplican y el historial queda consultable.

**1. Explore**

```text
$openspec-explore
Explora correlacion-consolidacion para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Definir parámetros configurables de categoría/distancia/ventana temporal; consumidor de correlación entrega candidatos para confirmación humana. Consolidar mantiene autoría, evidencia, actuaciones y seguimiento de cada reporte; resolver principal y responsables ya existentes.
Antes de planificar, resuelve esto: Cerrar distancias y ventanas con ejemplos durante explore; no inventar valores normativos como si estuvieran acordados.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio correlacion-consolidacion usando las decisiones acordadas en explore y el código disponible. Cubre RF13; RF15; RF40; RF56. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: Sin clasificación externa, borrado del reporte duplicado ni consolidación automática. No calcular distancia exacta sin coordenadas.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza correlacion-consolidacion con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Cercanos pero categorías distintas; fuera de ventana; sin punto; repetir evento; candidatos en ámbitos ajenos no revelan datos; consolidar casos con dos responsables de una institución deja uno vigente y audita resolución.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa correlacion-consolidacion según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Cercanos pero categorías distintas; fuera de ventana; sin punto; repetir evento; candidatos en ámbitos ajenos no revelan datos; consolidar casos con dos responsables de una institución deja uno vigente y audita resolución.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva correlacion-consolidacion únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Operador confirma una relación y ambos autores siguen su propio envío hacia el mismo incidente; avisos/asignaciones no se duplican y el historial queda consultable.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 17 — Preferencias y alertas preventivas

**Cambio:** `preferencias-alertas-preventivas` · **Fase E:** Prevención y consultas.

**Módulos/superficies:** Alertas; Consultas; Identidad; Flutter.

**Trazabilidad principal:** RF18; RF24; RF50. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–16 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Elegir distritos, categorías y cercanía; activar ambas o desactivar preventivas. Ubicación voluntaria con vigencia 24 h y radio inicial 1 km, sin rastreo implícito. Al publicar un caso elegible, crear aviso único; verificar antigüedad, cierre, privacidad y preferencias al entregar.

**Fuera de alcance y límites:** No alertar a ciudadanos por reportes sin publicar; desactivar preventivas no elimina seguimiento propio ni impide reportar. No añadir permiso de GPS al registro de cuenta.

**Decisiones a revisar en explore:** Distinguir elegibilidad del ciudadano, cobertura del operador y ubicación del incidente. No usar una como sustituto de las otras.

**Pruebas de aceptación:** Coinciden distrito/cercanía y sale un aviso; ubicación caduca o borrada; permiso denegado; categoría excluida; caso cerrado durante cola; reinicio después de caducar; suscripción distrital sigue sin GPS.

**Condición de salida:** Un ciudadano de prueba recibe en su bandeja solo avisos elegibles y puede controlar todas las preferencias; las reglas y caducidad se prueban con reloj controlado.

**1. Explore**

```text
$openspec-explore
Explora preferencias-alertas-preventivas para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Elegir distritos, categorías y cercanía; activar ambas o desactivar preventivas. Ubicación voluntaria con vigencia 24 h y radio inicial 1 km, sin rastreo implícito. Al publicar un caso elegible, crear aviso único; verificar antigüedad, cierre, privacidad y preferencias al entregar.
Antes de planificar, resuelve esto: Distinguir elegibilidad del ciudadano, cobertura del operador y ubicación del incidente. No usar una como sustituto de las otras.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio preferencias-alertas-preventivas usando las decisiones acordadas en explore y el código disponible. Cubre RF18; RF24; RF50. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No alertar a ciudadanos por reportes sin publicar; desactivar preventivas no elimina seguimiento propio ni impide reportar. No añadir permiso de GPS al registro de cuenta.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza preferencias-alertas-preventivas con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Coinciden distrito/cercanía y sale un aviso; ubicación caduca o borrada; permiso denegado; categoría excluida; caso cerrado durante cola; reinicio después de caducar; suscripción distrital sigue sin GPS.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa preferencias-alertas-preventivas según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Coinciden distrito/cercanía y sale un aviso; ubicación caduca o borrada; permiso denegado; categoría excluida; caso cerrado durante cola; reinicio después de caducar; suscripción distrital sigue sin GPS.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva preferencias-alertas-preventivas únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Un ciudadano de prueba recibe en su bandeja solo avisos elegibles y puede controlar todas las preferencias; las reglas y caducidad se prueban con reloj controlado.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 18 — Entrega push y ciclo de tokens

**Cambio:** `push-movil-fcm` · **Fase E:** Prevención y consultas.

**Módulos/superficies:** Alertas; Flutter; adaptador FCM.

**Trazabilidad principal:** Canal móvil de RF18–RF19. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–17 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Configurar FCM para Android, consentimiento contextual, registro/rotación/revocación de tokens, entrega desde outbox con reintentos y payload mínimo con identificador. Abrir el detalle protegido al tocar un aviso y recuperar bandeja al reconectar.

**Fuera de alcance y límites:** La bandeja sigue siendo fuente persistente; aceptación del proveedor no equivale a lectura ni atención. iOS no se declara probado en esta entrega.

**Decisiones a revisar en explore:** Verificar credenciales, errores reales del proveedor y vinculación token/cuenta; no enviar a una cuenta anterior después de logout.

**Pruebas de aceptación:** Permiso denegado; token inválido; logout compartido en dispositivo; respuesta incierta y reenvío deduplicado cuando sea posible; usuario sin sesión al abrir aviso; sin datos sanitarios en payload/log/pantalla bloqueada.

**Condición de salida:** Un dispositivo Android de prueba recibe y abre un aviso real autorizado; la app funciona con push desactivado. Registrar evidencia sin exponer credenciales.

**1. Explore**

```text
$openspec-explore
Explora push-movil-fcm para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Configurar FCM para Android, consentimiento contextual, registro/rotación/revocación de tokens, entrega desde outbox con reintentos y payload mínimo con identificador. Abrir el detalle protegido al tocar un aviso y recuperar bandeja al reconectar.
Antes de planificar, resuelve esto: Verificar credenciales, errores reales del proveedor y vinculación token/cuenta; no enviar a una cuenta anterior después de logout.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio push-movil-fcm usando las decisiones acordadas en explore y el código disponible. Cubre Canal móvil de RF18–RF19. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: La bandeja sigue siendo fuente persistente; aceptación del proveedor no equivale a lectura ni atención. iOS no se declara probado en esta entrega.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza push-movil-fcm con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Permiso denegado; token inválido; logout compartido en dispositivo; respuesta incierta y reenvío deduplicado cuando sea posible; usuario sin sesión al abrir aviso; sin datos sanitarios en payload/log/pantalla bloqueada.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa push-movil-fcm según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Permiso denegado; token inválido; logout compartido en dispositivo; respuesta incierta y reenvío deduplicado cuando sea posible; usuario sin sesión al abrir aviso; sin datos sanitarios en payload/log/pantalla bloqueada.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva push-movil-fcm únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Un dispositivo Android de prueba recibe y abre un aviso real autorizado; la app funciona con push desactivado. Registrar evidencia sin exponer credenciales.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 19 — Indicadores operativos y agregados

**Cambio:** `indicadores-por-ambito` · **Fase E:** Prevención y consultas.

**Módulos/superficies:** Consultas; React; proyecciones.

**Trazabilidad principal:** RF21; RF27. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–18 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Indicadores por distrito/categoría/período/franja horaria con filtro de ámbito, estados y reglas explícitas de conteo. Distinguir número de reportes de número de incidentes; mantener resultados consistentes tras consolidaciones y retiro de datos.

**Fuera de alcance y límites:** No incluir fichas sanitarias ni grupos identificables en vistas públicas. Redis no se introduce sin evidencia de necesidad.

**Decisiones a revisar en explore:** Elegir zona horaria de presentación America/Lima y almacenar instantes de forma consistente; no mezclar hora del hecho con recepción.

**Pruebas de aceptación:** Dos reportes de un incidente no duplican incidentes; consolidación corrige proyección; operador no consulta otros ámbitos; sin datos y errores; agrupación sensible menor de cinco suprimida; compatibilidad con anonimización posterior.

**Condición de salida:** El panel ofrece indicadores reproducibles contra un conjunto conocido, con definición visible de cada conteo y cobertura autorizada.

**1. Explore**

```text
$openspec-explore
Explora indicadores-por-ambito para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Indicadores por distrito/categoría/período/franja horaria con filtro de ámbito, estados y reglas explícitas de conteo. Distinguir número de reportes de número de incidentes; mantener resultados consistentes tras consolidaciones y retiro de datos.
Antes de planificar, resuelve esto: Elegir zona horaria de presentación America/Lima y almacenar instantes de forma consistente; no mezclar hora del hecho con recepción.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio indicadores-por-ambito usando las decisiones acordadas en explore y el código disponible. Cubre RF21; RF27. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No incluir fichas sanitarias ni grupos identificables en vistas públicas. Redis no se introduce sin evidencia de necesidad.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza indicadores-por-ambito con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Dos reportes de un incidente no duplican incidentes; consolidación corrige proyección; operador no consulta otros ámbitos; sin datos y errores; agrupación sensible menor de cinco suprimida; compatibilidad con anonimización posterior.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa indicadores-por-ambito según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Dos reportes de un incidente no duplican incidentes; consolidación corrige proyección; operador no consulta otros ámbitos; sin datos y errores; agrupación sensible menor de cinco suprimida; compatibilidad con anonimización posterior.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva indicadores-por-ambito únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: El panel ofrece indicadores reproducibles contra un conjunto conocido, con definición visible de cada conteo y cobertura autorizada.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 20 — Contenido informativo administrable

**Cambio:** `contenido-contactos-admin` · **Fase E:** Prevención y consultas.

**Módulos/superficies:** Consultas; React administrador; Flutter y web pública.

**Trazabilidad principal:** RF25; RF36–RF38. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–19 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Reemplazar el contenido mínimo versionado de Spec 03/04 por administración de información sobre app/desarrolladores, privacidad y contactos con fuente, cobertura y fecha de verificación. Publicación/versionado y consumo en ambos clientes; abrir marcador sin llamada automática.

**Fuera de alcance y límites:** No inventar teléfonos locales ni publicar contenido privado. La falta de un dato aprobado produce un estado explícito, no un teléfono de ejemplo.

**Decisiones a revisar en explore:** Verificar fuentes oficiales vigentes antes de publicar números reales; actualizar documentos afectados si un contacto cambia cobertura o función.

**Pruebas de aceptación:** Usuario no administrador intenta editar; fuente/fecha obligatorias; contacto deshabilitado; cambios visibles móvil/web; lector de pantalla y apertura de marcador; contenidos sin sesión no exponen panel.

**Condición de salida:** Administrador publica un contacto/contenido de prueba y ambos clientes lo muestran; existe historial de cambios y forma de retirar una versión errónea.

**1. Explore**

```text
$openspec-explore
Explora contenido-contactos-admin para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Reemplazar el contenido mínimo versionado de Spec 03/04 por administración de información sobre app/desarrolladores, privacidad y contactos con fuente, cobertura y fecha de verificación. Publicación/versionado y consumo en ambos clientes; abrir marcador sin llamada automática.
Antes de planificar, resuelve esto: Verificar fuentes oficiales vigentes antes de publicar números reales; actualizar documentos afectados si un contacto cambia cobertura o función.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio contenido-contactos-admin usando las decisiones acordadas en explore y el código disponible. Cubre RF25; RF36–RF38. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No inventar teléfonos locales ni publicar contenido privado. La falta de un dato aprobado produce un estado explícito, no un teléfono de ejemplo.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza contenido-contactos-admin con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Usuario no administrador intenta editar; fuente/fecha obligatorias; contacto deshabilitado; cambios visibles móvil/web; lector de pantalla y apertura de marcador; contenidos sin sesión no exponen panel.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa contenido-contactos-admin según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Usuario no administrador intenta editar; fuente/fecha obligatorias; contacto deshabilitado; cambios visibles móvil/web; lector de pantalla y apertura de marcador; contenidos sin sesión no exponen panel.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva contenido-contactos-admin únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Administrador publica un contacto/contenido de prueba y ambos clientes lo muestran; existe historial de cambios y forma de retirar una versión errónea.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 21 — Conservación, borrado y restauración

**Cambio:** `conservacion-eliminacion` · **Fase F:** Conservación, despliegue y cierre.

**Módulos/superficies:** Todos los módulos mediante contratos; infraestructura.

**Trazabilidad principal:** RF53; privacidad transversal. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–20 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Implementar plazos del documento 11: expediente 12 meses, fotos 90 días y datos SAMU 30 días tras cierre; descartes/huérfanos/avisos/auditoría según política. Bloquear acceso vencido, purgar proveedor/derivados, excepciones justificadas, revisión de casos abiertos y backups con rotación/tombstones.

**Fuera de alcance y límites:** No borrar tablas de otros módulos directamente, restaurar datos eliminados, asumir que un plan gratuito incluye backups o habilitar datos reales sin capacidad de cumplimiento.

**Decisiones a revisar en explore:** Validar que los plazos caben en infraestructura elegida y los requisitos institucionales reales; si una obligación documentada difiere, actualizar la política y el cambio antes de implementar.

**Pruebas de aceptación:** Reloj adelantado; API suspendida al vencer y acceso rechazado al volver; fallo proveedor y reintento; cerrar/reabrir no resucita fotos; consolidar no reinicia plazos; excepción vencida; restauración aplica eliminaciones antes de permitir lecturas.

**Condición de salida:** Se demuestra con datos sintéticos eliminación efectiva en BD/Storage y restauración controlada sin reaparición de contenido vencido. Cifrado/ubicación de backup y responsables documentados.

**1. Explore**

```text
$openspec-explore
Explora conservacion-eliminacion para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Implementar plazos del documento 11: expediente 12 meses, fotos 90 días y datos SAMU 30 días tras cierre; descartes/huérfanos/avisos/auditoría según política. Bloquear acceso vencido, purgar proveedor/derivados, excepciones justificadas, revisión de casos abiertos y backups con rotación/tombstones.
Antes de planificar, resuelve esto: Validar que los plazos caben en infraestructura elegida y los requisitos institucionales reales; si una obligación documentada difiere, actualizar la política y el cambio antes de implementar.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio conservacion-eliminacion usando las decisiones acordadas en explore y el código disponible. Cubre RF53; privacidad transversal. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No borrar tablas de otros módulos directamente, restaurar datos eliminados, asumir que un plan gratuito incluye backups o habilitar datos reales sin capacidad de cumplimiento.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza conservacion-eliminacion con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Reloj adelantado; API suspendida al vencer y acceso rechazado al volver; fallo proveedor y reintento; cerrar/reabrir no resucita fotos; consolidar no reinicia plazos; excepción vencida; restauración aplica eliminaciones antes de permitir lecturas.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa conservacion-eliminacion según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Reloj adelantado; API suspendida al vencer y acceso rechazado al volver; fallo proveedor y reintento; cerrar/reabrir no resucita fotos; consolidar no reinicia plazos; excepción vencida; restauración aplica eliminaciones antes de permitir lecturas.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva conservacion-eliminacion únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Se demuestra con datos sintéticos eliminación efectiva en BD/Storage y restauración controlada sin reaparición de contenido vencido. Cifrado/ubicación de backup y responsables documentados.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 22 — Despliegue y aceptación Android

**Cambio:** `despliegue-validacion-piloto` · **Fase F:** Conservación, despliegue y cierre.

**Módulos/superficies:** Infraestructura; API; web; Flutter; observabilidad.

**Trazabilidad principal:** RC04; AC01–AC08; EQ aplicables al MVP. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–21 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Preparar configuraciones y despliegue candidato Vercel/Render/Neon/Storage, migraciones seguras, secretos, HTTPS, logs mínimos, salud, CI y procedimientos de rollback. Ensayar suspensión/reanudación del outbox, cuotas, restauración y matriz completa de aceptación Android. Las pruebas empiezan en Spec 01 y su automatización CI en Spec 04; no se posponen hasta esta entrega.

**Fuera de alcance y límites:** No prometer alta disponibilidad, usar pings para eludir suspensión, habilitar facturación automática o convertir sedes candidatas en integraciones reales. No ejecutar publicación externa sin la autorización aplicable; preparar artefactos y procedimiento primero.

**Decisiones a revisar en explore:** Revalidar límites actuales de proveedores y capacidad de borrado/backups. No habilitar pacientes/datos reales si persisten bloqueos de privacidad, cobertura o participación.

**Pruebas de aceptación:** Recorrido ciudadano→sede→asignación→atención→seguimiento→publicación→alerta→cierre; permisos/cruces; fallos de red/proveedor; reintentos; logs sin secretos; rendimiento activo y arranque frío medidos por separado; escenarios EQ del MVP.

**Condición de salida:** Entorno de piloto Android reproducible con resultados registrados, condiciones gratuitas verificadas, recuperación probada y manual operativo. Distinguir demo con datos ficticios de piloto institucional autorizado.

**1. Explore**

```text
$openspec-explore
Explora despliegue-validacion-piloto para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Preparar configuraciones y despliegue candidato Vercel/Render/Neon/Storage, migraciones seguras, secretos, HTTPS, logs mínimos, salud, CI y procedimientos de rollback. Ensayar suspensión/reanudación del outbox, cuotas, restauración y matriz completa de aceptación Android. Las pruebas empiezan en Spec 01 y su automatización CI en Spec 04; no se posponen hasta esta entrega.
Antes de planificar, resuelve esto: Revalidar límites actuales de proveedores y capacidad de borrado/backups. No habilitar pacientes/datos reales si persisten bloqueos de privacidad, cobertura o participación.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio despliegue-validacion-piloto usando las decisiones acordadas en explore y el código disponible. Cubre RC04; AC01–AC08; EQ aplicables al MVP. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No prometer alta disponibilidad, usar pings para eludir suspensión, habilitar facturación automática o convertir sedes candidatas en integraciones reales. No ejecutar publicación externa sin la autorización aplicable; preparar artefactos y procedimiento primero.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza despliegue-validacion-piloto con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Recorrido ciudadano→sede→asignación→atención→seguimiento→publicación→alerta→cierre; permisos/cruces; fallos de red/proveedor; reintentos; logs sin secretos; rendimiento activo y arranque frío medidos por separado; escenarios EQ del MVP.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa despliegue-validacion-piloto según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Recorrido ciudadano→sede→asignación→atención→seguimiento→publicación→alerta→cierre; permisos/cruces; fallos de red/proveedor; reintentos; logs sin secretos; rendimiento activo y arranque frío medidos por separado; escenarios EQ del MVP.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva despliegue-validacion-piloto únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Entorno de piloto Android reproducible con resultados registrados, condiciones gratuitas verificadas, recuperación probada y manual operativo. Distinguir demo con datos ficticios de piloto institucional autorizado.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

### Spec 23 — Versión para iPhone

**Cambio:** `compatibilidad-validacion-ios` · **Fase G:** Entrega iPhone.

**Módulos/superficies:** Flutter; APNs/FCM; permisos; distribución.

**Trazabilidad principal:** RC01; RC10; paridad funcional móvil. Esta cobertura puede ser parcial hasta sus dependencias posteriores; no marcar un RF global como resuelto por implementar solo un canal.

**Dependencias:** Specs 01–22 aceptadas según el orden recomendado; reutilizar sus capacidades y contratos.

**Qué se resolverá:** Preparar macOS/Xcode, firma, identificador iOS, almacenamiento seguro, cámara/galería, ubicación, notificaciones/APNs y apertura de enlaces de cuenta. Probar paridad de los flujos ciudadanos y accesibilidad en iPhone real; planificar distribución según recursos disponibles.

**Fuera de alcance y límites:** No dar por validado iOS porque compile Android o por usar Flutter. Hosting de USD 0 no implica publicación en App Store sin coste.

**Decisiones a revisar en explore:** Confirmar medios de compilación, firma y canal de distribución antes de apply; no comprar suscripciones ni publicar sin autorización.

**Pruebas de aceptación:** Registro/login/recuperación; permiso denegado/permanente; HEIC convertible o error comprensible; reportar y seguir; sesión y logout; push con app cerrada; texto ampliado y lector; pérdida de conectividad.

**Condición de salida:** Paridad iPhone demostrada con evidencia y artefactos firmados. Si no hay hardware/cuenta/presupuesto, esta spec queda pendiente explícitamente y el producto se presenta solo como Android validado.

**1. Explore**

```text
$openspec-explore
Explora compatibilidad-validacion-ios para AyniSafe. Lee docs/, la guía UI y las specs/código existentes. Alcance: Preparar macOS/Xcode, firma, identificador iOS, almacenamiento seguro, cámara/galería, ubicación, notificaciones/APNs y apertura de enlaces de cuenta. Probar paridad de los flujos ciudadanos y accesibilidad en iPhone real; planificar distribución según recursos disponibles.
Antes de planificar, resuelve esto: Confirmar medios de compilación, firma y canal de distribución antes de apply; no comprar suscripciones ni publicar sin autorización.
Identifica dependencias, contrato, permisos, UI y escenarios de aceptación de esta entrega. No implementes ni escribas artefactos todavía.
```

**2. Propose**

```text
$openspec-propose
Propón el cambio compatibilidad-validacion-ios usando las decisiones acordadas en explore y el código disponible. Cubre RC01; RC10; paridad funcional móvil. Incluye escenarios verificables, UI/errores, permisos, diseño técnico, contratos/migraciones y tareas con pruebas. Respeta: No dar por validado iOS porque compile Android o por usar Flutter. Hosting de USD 0 no implica publicación en App Store sin coste.
No implementes.
```

**3. Update, solo si hay correcciones**

```text
$openspec-update-change
Actualiza compatibilidad-validacion-ios con este ajuste: [AJUSTE]. Revisa proposal, specs, design y tasks para mantenerlos coherentes y conservar su trazabilidad. Incorpora casos faltantes de: Registro/login/recuperación; permiso denegado/permanente; HEIC convertible o error comprensible; reportar y seguir; sesión y logout; push con app cerrada; texto ampliado y lector; pérdida de conectividad.
Si contradice un acuerdo del producto, señala el conflicto antes de modificarlo. No escribas código.
```

**4. Apply y aceptación**

```text
$openspec-apply-change
Implementa compatibilidad-validacion-ios según sus artefactos vigentes y la guía UI. Completa las tareas y ejecuta las pruebas relevantes. Verifica especialmente: Registro/login/recuperación; permiso denegado/permanente; HEIC convertible o error comprensible; reportar y seguir; sesión y logout; push con app cerrada; texto ampliado y lector; pérdida de conectividad.
No reduzcas el alcance para marcar tareas hechas. Si falta una decisión o dependencia, informa el bloqueo. Entrega cómo ejecutar la entrega, resultados reales y pendientes; no despliegues servicios externos por este pedido.
```

**5. Archive, después de revisar la evidencia**

```text
$openspec-archive-change
Archiva compatibilidad-validacion-ios únicamente si sus tareas requeridas y aceptación están completas. Criterio de salida: Paridad iPhone demostrada con evidencia y artefactos firmados. Si no hay hardware/cuenta/presupuesto, esta spec queda pendiente explícitamente y el producto se presenta solo como Android validado.
Sincroniza los deltas con las specs principales y verifica su coherencia antes de mover el cambio. Si hay comportamiento requerido sin implementar o pruebas pendientes, no archives: informa qué falta. No despliegues ni hagas commit automáticamente.
```

## 6. Hitos para probar progresivamente

| Al terminar | Demostración posible | Lo que todavía no debes afirmar |
|---|---|---|
| Spec 01 | Registro/login/sesión Android con API y BD reales de pruebas. | Recuperación, panel o reporte implementados. |
| Spec 04 | Cuenta/perfil/recuperación y portada/login institucional. | Organización y atención operativa disponibles. |
| Spec 07 | Sedes/operadores/coberturas y tabla de reglas probada. | Sedes reales participantes solo por tener datos en catálogo. |
| Spec 10 | Reporte completo de prueba con ubicación, evaluación SAMU y fotos privadas. | Que alguien recibió o atiende el caso. |
| Spec 14 | Recorrido ciudadano → panel → responsable → atención → seguimiento. | Prevención pública, push y conservación completamente resueltos. |
| Spec 20 | Mapas, publicación, prevención, push, indicadores y contenido administrable. | Piloto real seguro si todavía falta borrado/restauración y validación integral. |
| Spec 22 | MVP Android integrado y validado para el tipo de piloto autorizado. | Soporte iPhone probado o atención institucional/continua garantizada. |
| Spec 23 | Paridad iPhone comprobada y distribución preparada/autorizada. | Que Android validó por sí solo permisos y comportamiento iOS. |

Prueba con datos ficticios hasta cerrar seguridad, privacidad, retención y recuperación. Las protecciones no se posponen íntegramente: permisos, validación, logs seguros y pruebas aparecen en cada spec; Spec 21/22 completan y verifican su funcionamiento global.

## 7. Cobertura de los 57 requisitos

| Requisitos | Specs donde se resuelven o completan |
|---|---|
| RF01–RF02 | 01 ciudadano; 04 acceso institucional; 06 altas controladas. |
| RF03 | 02; consumo institucional en 06. |
| RF04 | 03. |
| RF05 | 01, 04, 06 y pruebas de autorización en cada recurso posterior. |
| RF06–RF07 | 05, 07, 08. |
| RF08–RF09 | 08 registro; 10 archivos. |
| RF10 | Lista inicial 08, seguimiento completo 14. |
| RF11–RF12 | 12; recálculo/efectos institucionales en 13. |
| RF13 | 16. |
| RF14–RF16 | 12 revisión/descarte; 16 consolidación. |
| RF17 | 13. |
| RF18–RF19 | 14 seguimiento interno, 17 preventivas, 18 canal push. |
| RF20 | 15. |
| RF21 | 19. |
| RF22 | 04 bootstrap/control de acceso y 06 gestión de cuentas. |
| RF23–RF24 | 07 catálogos/reglas, 17 reglas preventivas. |
| RF25 | 20. |
| RF26–RF27 | 11/12 bandeja y 19 indicadores. |
| RF28–RF30 | 06. |
| RF31 | 05 resolución, 08 captura y 15 mapas. |
| RF32–RF35 | 07 reglas, 11 avisos/enrutamiento y 13 cambios de atención. |
| RF36–RF38 | 03 contenido móvil mínimo, 04 portada y 20 administración. |
| RF39–RF40 | 13 cambios/actuaciones y 16 consolidación. |
| RF41–RF44 | 09 evaluación; 11/13 autorización por caso y actualizaciones. |
| RF45–RF46 | 12 revisión y 13 atención. |
| RF47–RF48 | 14 seguimiento y 12 FIFO/etiquetas. |
| RF49 | 15 y compatibilidad con 17/19. |
| RF50–RF51 | 17 preferencias; 01/03 cuenta/teléfono y permisos en uso institucional. |
| RF52–RF53 | 10 fotos/huérfanos y 21 conservación/restauración; validación integral 22. |
| RF54–RF55 | 05/06 catálogo y 07/11 Otra emergencia/pendientes. |
| RF56–RF57 | 12/13 asignación; 07/09/11/13 condiciones médicas y principal. |

Las pruebas de calidad EQ se asignan en el cambio correspondiente, no solo en Spec 22. EQ de varias réplicas pertenece a evolución con presupuesto y no bloquea por sí solo aceptar un MVP de una instancia cuya recuperación esté probada.

## 8. Qué hacer cuando una entrega falla o cambia

1. Si falta un comportamiento de la spec actual, continúa apply sobre ese mismo cambio; no abras otro para ocultar tareas pendientes.
2. Si el diseño de ese cambio está equivocado, explica el hallazgo y pide update-change; después vuelve a apply. No reduzcas escenarios para conseguir aprobación.
3. Si el cambio ya está archivado y aparece una mejora o corrección, crea un cambio nuevo que modifique esa capacidad; no reescribas el archivo histórico como si el problema nunca hubiera existido.
4. Si un proveedor, permiso institucional, geometría o recurso iOS no está disponible, mantén el punto bloqueado y las partes simuladas identificadas. No atribuyas operación real a un doble de pruebas.
5. Antes de archive compara la spec con comportamiento real y no únicamente con las casillas. Para compartir resultados registra comandos, entorno, evidencia y limitaciones.

## 9. Primer pedido recomendado ahora

Como registro-login-ciudadano ya está propuesto, no vuelvas a generar Spec 01. Empieza con:

```text
Revisa la coherencia del cambio registro-login-ciudadano, la guía UI
y los requisitos vigentes. No implementes todavía. Confirma dependencias,
decisiones resueltas y pendientes, y señala si hace falta update-change.
No crees una propuesta duplicada ni cambies sus decisiones confirmadas.
```

Una vez revisado, pide apply del mismo cambio. Completa las demás specs una por una; los nombres 02–23 de esta guía no necesitan existir todos desde el inicio. La guía es una hoja de ruta de implementación, no un backlog marcado como terminado.
