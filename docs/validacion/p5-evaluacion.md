# P5.1 — Evaluación rápida para SAMU

- **Fecha de inicio:** 27/11/2026.
- **Cambio:** `evaluacion-rapida-samu`, en la rama `feat/p5-evaluacion`.
- **Base destino:** `24a33f6`. Es `main` con P4.1 y P4.2 fusionadas y archivadas, más la corrección del informe de P4.2 (PR #10).

Este informe se completa por grupo de tareas. Lo que no figura aquí como ejecutado no está validado.

## Procedencia

El donante se leyó sin modificarlo:
- **Ruta:** `../Proyecto_incidencias_400par`.
- **HEAD:** `efc1bce8c29b3c88487e36e10a324c71ae9c2029`.
- **Estado:** `git status --porcelain` vacío el 27/11/2026.

| Archivo del donante | SHA-256 |
|---|---|
| `apps/api/migrations/012_medical_triage.sql` | `8fe4ffd1325aed2f0baa3c87382ef3b4a983c2821046c1254f6b9719c4d03841` |
| `apps/mobile/lib/screens/report.dart` (`triageBlock`) | `a16021b97e6292fd4181bea220d3f80a71a4e173bd13b77d624b2acf90ba8c0a` |
| `apps/admin/src/IncidentTriage.jsx` | `3a7a56b98df3becc471874d3bbdc3a8cb1ca5ed355f86f59f2cf4fcb6f3424ef` |

**Se adapta:**
- La tarjeta del bloque móvil, con título y subtítulo que indican que es opcional y que se responde lo que se sepa, y la nota sobre la persona principal.
- La composición clave–valor (`kv`) de `IncidentTriage.jsx` para mostrar la evaluación en el panel.

**Se descarta**, por contradecir reglas de AyniSafe:
- Los tres booleanos con «No sé» representado como null. AyniSafe distingue `no_se` de sin respuesta (RF41, documento 09).
- «¿Está respirando?» como pregunta. Se reemplaza por signos de vida observados/no observados/no sé, que describe una observación y no una constatación clínica (documento 09).
- El desplegable de «Personas afectadas» con «3 o más» y el campo numérico con teclado. RF44 exige botones de cantidad y controles +/−, sin teclado.
- El subtipo de categoría: no existe en el catálogo cerrado de 16 categorías.
- Las columnas sanitarias en la tabla del incidente, sin versiones ni permisos. AyniSafe versiona la evaluación y restringe su lectura a SAMU y al autor (RF43).

## Decisiones registradas para revisión

- **Propiedad de los datos sanitarios (design, decisión 1).** El documento 09 dice que «Reportes conserva la evaluación ciudadana; Operaciones conserva aclaraciones del operador SAMU mediante contratos públicos». Se implementa así: Operaciones autoriza la aclaración del operador y conserva su efecto operativo (recálculo del enrutamiento y su auditoría, sin datos sanitarios). Todas las versiones, incluido el motivo del operador, se guardan en Reportes mediante su contrato. Motivo: una sola secuencia de versiones y un único lugar para la eliminación a 30 días del cierre (P9). Revertirlo supondría mover las versiones de origen operador, sin cambiar los contratos HTTP. Queda pendiente de revisión del responsable.
- **Heridos en Emergencia médica (decisión del responsable, 26/11/2026).** «¿Hay heridos?» se pregunta también en Emergencia médica, conforme al documento 09. No cambia el enrutamiento: SAMU ya es la principal.

## Grupo 2 — Dominio de la evaluación

- **`modules/reportes/dominio/evaluacion.ts`:** tipos cerrados, `samuRequerido`, `validarEvaluacionEnvio`, `validarAclaracion` y `aplicarCambios`. `test/unidad/evaluacion.test.ts` cubre:
  - la persona principal parcial;
  - el rechazo de una ficha adicional o de un nombre;
  - heridos `si` sin cantidad, que queda `no_se`;
  - el rechazo de una cantidad con heridos `no`, `no_se` o sin respuesta;
  - los límites de la cantidad (0, 1, 999, 1000, decimal y texto);
  - el rechazo de las observaciones en un accidente sin condición médica;
  - la emergencia médica con heridos `no` y observaciones;
  - el cambio a heridos `no`, que elimina la cantidad y la lista como modificada;
  - el rechazo de observaciones de un operador que no es SAMU;
  - la aclaración idéntica, sin cambios;
  - las observaciones admitidas tras una corrección negativa cuando SAMU ya intervenía.
- **Tabla cruzada con la matriz:** `samuRequerido` coincide con `resolverDestinatarios` (`matriz-09-v1`) en las 16 categorías × 4 × 4 respuestas (256 casos).
- **`dominio/envio.ts`:**
  - emergencia médica admite heridos;
  - el campo `evaluacion` se valida;
  - el contenido canónico de un envío sin evaluación es idéntico al de P4 (la prueba fija el texto literal);
  - dos evaluaciones distintas dan huellas distintas.
- **Resultado (27/11/2026):** `npm run test:unidad`, 25 suites y 708 pruebas aprobadas; `typecheck` y `test:tipos` sin errores.

## Grupo 3 — Esquema

- **Migración `20261128100000_evaluacion_rapida`:**
  - crea `evaluaciones_incidente`, `versiones_evaluacion` y `accesos_evaluacion` (Reportes) y `cambios_enrutamiento` (Operaciones);
  - amplía el CHECK de `origen` de las participaciones con `condicion_medica` y añade su `actualizado_en`;
  - amplía el CHECK de heridos de `envios_incidente` con `emergencia-medica`;
  - incluye una carga inicial idempotente.
- **`test/integracion/esquema-evaluacion.test.ts` (19 aprobadas):**
  - rechazos con 23514 de valores fuera de catálogo, cantidades 0 y 1000 o sin heridos `si`, versiones de operador sin institución o sin motivo, versiones ciudadanas con motivo, instituciones no admitidas, campos modificados desconocidos y motivos cortos;
  - 23505 en una versión duplicada y 23503 en una evaluación sin envío;
  - la carga inicial ejecutada dos veces crea exactamente 5 versiones 1 (las cinco categorías y no el robo), con `samu_requerido` según la regla.
- **Errores encontrados y corregidos por estas pruebas:**
  - la restricción admitía un motivo en una versión ciudadana;
  - la carga inicial dejaba `samu_requerido` nulo cuando faltaban respuestas, por la lógica de NULL en SQL. Se corrigió con `COALESCE`.
- **`scripts/verificar-migracion-evaluacion.mjs`:**
  - aplica las migraciones anteriores en un esquema temporal de la BD `*_test`, inserta datos de P4 (un accidente con heridos y un robo) y aplica la migración;
  - comprueba que la carga creó una sola versión;
  - compara las introspecciones: solo se crean las cuatro tablas nuevas, la única tabla previa alterada es `participaciones_incidente` (`actualizado_en`) y no hay DROP.

  El diff queda en [p5/migracion-evaluacion-diff.sql](p5/migracion-evaluacion-diff.sql). Los CHECK no aparecen en la introspección de Prisma; se prueban en la suite anterior.
- **`prisma migrate deploy` desde cero:** lo ejecuta el `globalSetup` de cada corrida de integración sobre un esquema vacío.

## Grupo 4 — Registro con evaluación y aclaración del autor (Reportes)

- **Versión 1 en el registro.** `RegistrarIncidenteUseCase` crea la cabecera y la versión 1 en la misma transacción que el incidente, para las cinco categorías.
  - `test/unidad/registrar-incidente.test.ts`: orden `insertarEnvio → crearEvaluacion → publicarEvento`; el robo no crea evaluación; el invitado queda sin actor; un fallo al crear la evaluación revierte el incidente, la clave, el envío y el evento.
  - `test/integracion/evaluacion-registro.test.ts` (9 aprobadas): agresión con heridos sin evaluación (versión 1 con cantidad desconocida); emergencia médica con observaciones; pelea con cantidad 4; robo sin evaluación; comprobante sin datos de la evaluación; 400 por evaluación no aplicable o incoherente; 409 al repetir la clave con otra evaluación; 200 al repetir un envío sin evaluación.
  - **Fallo inyectado:** un trigger temporal en `versiones_evaluacion` hace fallar el insert. Resultado: 503, sin incidente, clave, evaluación ni evento; tras quitar el trigger, el reintento con la misma clave da 201.
- **`AclararEvaluacion`.** `test/integracion/aclarar-evaluacion.test.ts` (6 aprobadas), con PostgreSQL real y un doble del puerto de condición médica:
  - versiones 1, 2 y 3 con origen, institución, campos modificados y motivo;
  - una aclaración idéntica no crea versión, evento ni recálculo;
  - dos aclaraciones concurrentes sobre campos distintos dan versiones 2 y 3 y la vigente conserva ambos cambios;
  - la carga de `EvaluacionActualizada` tiene exactamente `incidenteId`, `origen` y `version`;
  - un fallo del recálculo revierte la versión y el evento;
  - errores sin evaluación, inexistente, cerrado y cuerpo inválido.
- **Ruta del autor.** `POST /ciudadano/incidentes/{referencia}/evaluacion`. `test/integracion/evaluacion-http.test.ts`, bloque 4.3 (5 aprobadas):
  - 200 con las respuestas propias, `no-store` y claves exactas;
  - 404 idéntico para un incidente ajeno, sin evaluación, de invitado, inexistente o malformado;
  - 409 `EVALUACION_CERRADA`;
  - 401 sin sesión y 403 con cookie institucional;
  - 400 por campo;
  - los logs no contienen respuestas.

## Grupo 5 — Enrutamiento con la condición vigente (Operaciones)

- **Dominio.** `planificarCondicionMedica`, función pura. `test/unidad/matriz-enrutamiento.test.ts` cubre: el accidente que pasa a SAMU; la agresión con SAMU condicionada; un objetivo sin SAMU que no cambia nada aunque SAMU participe; SAMU ya presente; SAMU que nunca baja de rango.
- **`test/integracion/condicion-medica.test.ts` (9 aprobadas):**
  - **5.1, condición vigente:** una aclaración confirmada antes de la entrega produce SAMU principal y PNP simultánea, sin auditoría ni segundo enrutamiento; una entrega repetida no duplica nada; el robo se enruta igual que en P4.
  - **Accidente con revisión pendiente:** la precisión PNP de heridos `si` pasa a SAMU principal (`origen = condicion_medica`) y PNP simultánea, con la revisión resuelta y una sola principal. La auditoría tiene antes y después sin respuestas ni motivo, y hay un evento `EnrutamientoResuelto{origen: condicion_medica}`.
  - **Agresión aclarada por el autor:** SAMU condicionada, PNP sigue principal y la auditoría registra el actor ciudadano.
  - **Sin sede SAMU elegible:** `ENRUTAMIENTO_PENDIENTE` con el faltante de SAMU principal y PNP conservada como simultánea.
  - **Sin distrito:** faltantes `sin_distrito` de PNP (simultánea) y de SAMU (principal).
  - **Corrección negativa con SAMU principal:** no cambia nada y no se audita.
  - **`no`/`no` sobre una revisión pendiente:** la cierra sin SAMU, con auditoría.
  - **Recálculo sin efecto:** observaciones SAMU en una emergencia médica, sin auditoría ni `EnrutamientoResuelto` y con un `EvaluacionActualizada`.
- **5.3, concurrencia.** `test/integracion/concurrencia-evaluacion.test.ts` (2 casos × 5 rondas, tres ejecuciones seguidas aprobadas), con un límite de 15 s por ronda para detectar un bloqueo mutuo:
  - dos aclaraciones y la entrega de enrutamiento a la vez dan un solo enrutamiento coherente con la última versión y versiones sin huecos;
  - una designación del administrador y una aclaración a la vez dejan el caso `ENRUTADO` con una sola principal SAMU y dos versiones.

  El primer intento falló por un `TRUNCATE` de limpieza que coincidió con el procesador de la ronda anterior (40P01 en el *fixture*, no en el producto). Se corrigió esperando el reposo de los procesadores antes de limpiar.
- **5.4, ruta del operador.** `POST /operador/incidentes/{id}/evaluacion`. `evaluacion-http.test.ts`, bloque 5.4 (4 aprobadas):
  - PNP precisa heridos `si`: 200 con `samuIncorporado` verdadero y solo el resumen de heridos;
  - después, SAMU registra observaciones y la respuesta no las incluye;
  - 400 por observaciones de PNP, por motivo corto o por un campo extra;
  - 404 idéntico para otra institución sin participación, un inexistente, un malformado y una cobertura retirada;
  - 403 para el administrador, el ciudadano y una solicitud sin origen web; 401 sin sesión;
  - 409 si el incidente está cerrado;
  - un reintento idéntico no crea otra versión;
  - el motivo no aparece en los logs.

  Operaciones no importa Reportes: la composición traduce sus errores a un resultado discriminado.
- **5.5, arquitectura.** `npm run arquitectura:verificar`: 123 archivos, 0 infracciones (importaciones entre módulos, capas y ciclos).

## Grupo 6 — Lecturas sanitarias (Consultas)

- **6.1, resumen del operador.** `GET /operador/incidentes/{id}` añade `condicionMedica` (resumen de heridos con revisión pendiente, versión, origen, institución, instante y si hay observaciones) y `accesoSanitario`. La participación expone ahora la institución de la sede. `test/integracion/lecturas-sanitarias.test.ts`:
  - **PNP:** recibe la condición vigente (versión 3, origen operador SAMU), la respuesta original `no_se` conservada, `accesoSanitario` falso y papel `simultanea`, sin observaciones ni motivos;
  - **SAMU:** recibe `accesoSanitario` verdadero;
  - **fila de la bandeja:** tras la precisión, pasa de `principal` con condición por confirmar a `simultanea` sin ella, con las mismas claves;
  - **robo:** `condicionMedica` nula.

  `bandeja.test.ts` se actualizó para enumerar las dos claves nuevas.
- **6.2, detalle sanitario.** `GET /operador/incidentes/{id}/evaluacion` (Consultas autoriza; Reportes lee y registra el acceso en `accesos_evaluacion`):
  - el operador SAMU recibe la vigente y el historial (versiones 1 a 3 con origen, institución, campos y motivo), primero con la evaluación marcada como pendiente;
  - se registran dos accesos con usuario y versión, sin contenido;
  - el PNP participante, un SAMU fuera de ámbito, un id inexistente y uno malformado reciben el mismo 404 y no generan registro;
  - el administrador y el ciudadano reciben 403;
  - SAMU participante en un robo (sin evaluación) recibe 404.
- **6.3, evaluación del autor.** `GET /ciudadano/incidentes/{referencia}` añade `evaluacion`:
  - con SAMU incorporado por PNP, pide completar, muestra la versión ciudadana 1 sin la precisión ni el motivo, y SAMU aparece como responsable;
  - en un incidente cerrado, `puedeAclarar` y `solicitudCompletar` son falsos;
  - la vista del invitado con código de una pelea con evaluación no contiene claves de evaluación.

  Resultado: 9 aprobadas.
- **6.4, EQ-04 (parte sanitaria) y EQ-13.** `test/integracion/eq-sanitario.test.ts` (3 aprobadas). Escenario: pelea de invitado con varios heridos de cantidad desconocida y observaciones parciales de una persona principal; SAMU añade sangrado con un motivo centinela.
  - **EQ-13:** se conservan la cantidad desconocida y las observaciones parciales (versión 2).
  - **EQ-04:** **10/10 intentos rechazados (100 %)**:

    | Intento | Estado |
    |---|---|
    | PNP participante lee el detalle | 404 |
    | SAMU sin participación lee el detalle | 404 |
    | Administrador lee el detalle | 403 |
    | Ciudadano lee el detalle | 403 |
    | Sin sesión lee el detalle | 401 |
    | PNP envía observaciones | 400 |
    | SAMU sin participación aclara | 404 |
    | Administrador aclara | 403 |
    | Otro ciudadano aclara (incidente de invitado) | 404 |
    | Invitado con código intenta aclarar | 401 |

    No cambió ninguna versión ni se registró ningún acceso, y ninguna respuesta contiene datos sanitarios.
  - **Exclusiones:** la bandeja, el resumen PNP, la consulta del invitado, los pendientes del administrador, las cargas de los eventos, la auditoría de enrutamiento y los logs capturados no contienen observaciones ni el motivo centinela.

## Grupo 7 — Contrato OpenAPI

- **`openapi.yaml`:**
  - `EvaluacionEnvio` y heridos en emergencia médica en `POST /incidentes`;
  - `condicionMedica` y `accesoSanitario` en el resumen del operador;
  - `evaluacion` en el detalle del autor;
  - `POST /ciudadano/incidentes/{referencia}/evaluacion` y `GET`/`POST /operador/incidentes/{id}/evaluacion`;
  - los códigos `EVALUACION_CERRADA` y `SIN_AMBITO`.
- **`npm run contrato:validar`:** contrato válido (OpenAPI 3.1.0).
- **`contrato.test.ts`:** nuevo caso «evaluación rápida (P5.1)». Ejercita cada estado documentado de las tres rutas (200/400/401/403/404/409, 415 en la del operador y 503 mediante triggers temporales que hacen fallar las escrituras) y valida cada respuesta contra el esquema desreferenciado. La comprobación global de estados ejercitados y documentados también pasa. Resultado: 24 aprobadas junto con `bandeja.test.ts`.

## Grupo 8 — App móvil

- **Modelo.** `lib/datos/evaluacion.dart` contiene `samuInterviene`, `CantidadHeridos`, `SignosVida`, `RespuestasEvaluacion` y `EvaluacionPropia`. Se ubica en `datos` porque el repositorio lo lee y `aplicacion` depende de `datos`, nunca al revés. El enum `Respuesta` se movió aquí y el controlador lo reexporta.
- **8.1, componentes.** `PreguntaSeleccion<T>` (extraída de `_Pregunta`) y `BloqueEvaluacion` con `SelectorCantidad`. `test/evaluacion_test.dart` (25 aprobadas):
  - `samuInterviene` con una tabla independiente para las 16 categorías × 4 × 4, la misma regla que en la API;
  - el cuerpo del envío, los cambios de una aclaración y la lectura del JSON;
  - ninguna opción preseleccionada y «No sé» distinto de «No»;
  - «Otra cantidad» empieza en 6, − deshabilitado en 6, + suma hasta 8 y se deshabilita en 999, sin `TextField` ni teclado visible;
  - volver a pulsar la opción marcada la desmarca;
  - semántica: cantidad anunciada («6 personas heridas»), botones con nombre y objetivo de al menos 48.
- **Hallazgo de accesibilidad corregido.** La tarjeta (`Card`) fusionaba todo su contenido en un único nodo semántico marcado como encabezado, por lo que el lector de pantalla leía el bloque entero como un título. Se puso `semanticContainer: false` en la tarjeta nueva y en la de preguntas de P4, que tenía el mismo defecto. Una prueba comprueba que el encabezado solo contiene el título.
- **8.2, formulario.** Nuevo grupo en `test/reporte_pantalla_test.dart`, «evaluación rápida para SAMU» (6 aprobadas):
  - una pelea con heridos Sí muestra el bloque sin marcar;
  - No lo oculta y Sí lo recupera con la cantidad y la conciencia; al enviar con heridos No no viaja la evaluación;
  - el cuerpo enviado es `{cantidadHeridos: 7, personaPrincipal: {signosVida: no_observados}}`;
  - en una emergencia médica aparece «¿Hay heridos?» sin atención médica y se envía sin responder;
  - en un accidente con atención Sí aparece el bloque sin la cantidad;
  - un resultado incierto conserva la evaluación y la misma clave.

  Las 20 pruebas previas del formulario siguen aprobadas.
- **8.3, Mis reportes.** `DetalleIncidente.evaluacion`, `aclararEvaluacion` en el repositorio, `SeccionEvaluacionPropia` y `AclararEvaluacionPantalla`. `test/evaluacion_mis_reportes_test.dart` (8 aprobadas):
  - solicitud de completar con texto, icono y acción;
  - «Informado el» y «Sin respuesta»;
  - una sola solicitud `{heridos: si, cantidadHeridos: 2}` y el detalle recargado;
  - sin cambios no se envía nada;
  - un error de red conserva lo marcado;
  - 404 con su mensaje y sesión vencida con la política vigente;
  - incidente cerrado sin acción;
  - sin evaluación no se muestra la sección.
- **Resultado (27/11/2026):** `flutter analyze` sin problemas; `flutter test` con **334 pruebas aprobadas**.
- **Corrección de proceso.** Un `dart format lib` reformateó seis archivos ajenos al cambio. Se restauraron con `git checkout` (el árbol estaba limpio al empezar) y desde entonces solo se formatean los archivos editados.
- **8.4, pendiente: verificación manual del responsable.** Hay un emulador (`Medium_Phone_API_37.0`) pero estaba apagado. Arrancarlo, compilar y recorrer con TalkBack consume demasiado tiempo e intentos para este turno. Falta verificar en el emulador con la API local: el envío de una pelea con heridos y una evaluación parcial, la aclaración desde Mis reportes, las capturas al 100 % y al 200 % y el recorrido con TalkBack.

## Grupo 9 — Panel web

- **9.1, componente y bloque.** Componente compartido `GrupoOpciones` (`fieldset` + leyenda + radios con la composición `.choice-list` del origen, sin estilos nuevos). Bloque «Condición médica» y diálogo «Precisar condición médica» (`src/paginas/incidentes/Evaluacion.tsx`). `test/evaluacion.test.tsx`:
  - la respuesta original y la condición vigente se ven por separado, con «Operador PNP» y «versión 2»;
  - un motivo corto no envía la solicitud;
  - se envía una sola solicitud `{heridos: si, cantidadHeridos: 2, motivo}`, se informa «SAMU fue incorporado» y se recarga el resumen (papel `Simultánea`);
  - «Otra cantidad» empieza en 6, con − deshabilitado, y + envía 7;
  - el 409 y el 404 se explican sin simular éxito;
  - teclado: Tab entra en el grupo, las flechas marcan y la opción marcada es consultable;
  - un robo no ofrece precisar.
- **9.2, sección SAMU.** «Evaluación rápida», visible solo con `accesoSanitario`:
  - SAMU ve la vigente con «Sin respuesta», el historial como `<ol>` de tres versiones con motivo y la acción;
  - la aclaración SAMU envía `{personaPrincipal: {sangrado: si}, motivo}`;
  - PNP no ve la sección ni hace la solicitud;
  - un 503 muestra «Evaluación no disponible» sin ocultar el resumen.
- **Resultado:** 171 pruebas web aprobadas (12 archivos; 11 nuevas de P5.1); `npm run lint`, `typecheck` y `build` sin errores.
- **9.3, UI renderizada con la API local.** `node e2e/evaluacion-local.mjs` (API real con `main.ts`, PostgreSQL local `*_test`, Vite y Chrome, datos sintéticos): **38 comprobaciones aprobadas** y [11 capturas](p5/capturas-api-local/), con [ficha del recorrido](p5/recorrido-api-local.json):
  - resumen PNP antes y después y resumen SAMU a 1440 y 360 px y con texto al 200 %;
  - diálogo de precisión a 1440 y 360 px;
  - diálogo de aclaración SAMU.

  En cada captura: sin desplazamiento horizontal de la página y axe sin infracciones. Teclado: Espacio marca la opción enfocada y Shift+Tab conserva el foco dentro del diálogo. A 360 px el diálogo se desplaza internamente (`overflow-y: auto`, alto máximo de la ventana) para alcanzar el motivo y «Guardar».
  - **Revisión visual:** se inspeccionaron las capturas SAMU de escritorio y el diálogo a 360 px.
  - **Comparación con el origen:** la sección SAMU usa la misma composición clave–valor (`.kv`) de `IncidentTriage.jsx`, con título y lista. **No se renderizó `IncidentTriage.jsx` del donante** para una comparación visual lado a lado; la comparación es de estructura y clases, no de capturas.
  - Esto no constituye aprobación visual del responsable ni prueba con lector de pantalla.

## Grupo 10 — Documentación y validación integrada

- **10.1.** `docs/05-diseno-ui/guia-ui.md` incorpora la sección 2.12: formulario, Mis reportes, condición médica y evaluación SAMU. Se retiraron de los pendientes de 2.11 la evaluación y la actualización positiva. Es coherente con DESIGN.md (que ya menciona la «evaluación de una persona principal») y con el documento 09.
- **10.3, recorrido integrado (parcial).** El mismo `e2e/evaluacion-local.mjs` recorre los pasos 2 a 8 con la API real y el navegador:
  - un accidente con heridos «No sé» llega a PNP como principal con la condición por confirmar;
  - PNP precisa heridos Sí y 2 con motivo desde la web, con teclado en el diálogo;
  - queda persistido SAMU principal y PNP simultánea, y SAMU lo ve como principal en su bandeja;
  - el autor ve SAMU como responsable y la solicitud de completar, sin la precisión ni el motivo;
  - el autor completa la evaluación;
  - SAMU ve tres versiones y registra una aclaración (versión 4);
  - PNP sigue sin ver observaciones ni motivos;
  - versiones persistidas: `1:ciudadano, 2:operador pnp, 3:ciudadano, 4:operador samu`.

  **Pendiente: el paso 1 desde Flutter.** El registro se hizo por la API con una cuenta ciudadana sintética, no desde la app en el emulador. Por eso la tarea 10.3 queda abierta, junto con 8.4, para la verificación manual del responsable.

- **10.2, validación local completa (27/11/2026, Windows 11, Node 24, PostgreSQL local `*_test`):**
  - API: `typecheck`, `test:tipos`, `arquitectura:verificar` (123 archivos, 0 infracciones) y `contrato:validar` (OpenAPI 3.1.0 válido).
  - API, `npm run test:cobertura`: **65 suites y 1228 pruebas aprobadas**. Cobertura: sentencias 87,44 %, ramas 91,33 %, funciones 93,32 % y líneas 87,44 %.
  - La primera corrida falló en una prueba de `unidad/seguimiento.test.ts` que enumera las claves del detalle del autor y no incluía `evaluacion`. Se actualizó y la segunda corrida quedó en verde.
  - Web: 171 pruebas aprobadas; `lint`, `typecheck` y `build` sin errores.
  - Flutter: `flutter analyze` sin problemas y `flutter test` con 334 pruebas aprobadas.
  - Escaneo de secretos: correcto sobre los archivos versionados. Los archivos nuevos, todavía sin commit, los cubrirá el escaneo del CI.

## Matriz de trazabilidad (10.4)

| Spec y escenario | RF | HU | EQ | Prueba | Resultado |
|---|---|---|---|---|---|
| `reportes/evaluacion-rapida`: campos, coherencia, aplicación a SAMU, versiones, aclaración sin cambios, autor, operador, evento y propiedad | RF41, RF42, RF43, RF44 | HU23, HU24 | EQ-13 | `unidad/evaluacion.test.ts` (299, con la tabla de 256 casos), `integracion/aclarar-evaluacion.test.ts` (6), `evaluacion-http.test.ts` (9), `esquema-evaluacion.test.ts` (19) | Aprobado |
| `reportes/registro-incidentes` (delta): heridos en emergencia médica, idempotencia compatible y versión 1 en la transacción | RF41, RF42, RF57 | HU02, HU23 | EQ-13 | `unidad/envio-incidente.test.ts`, `unidad/registrar-incidente.test.ts`, `integracion/evaluacion-registro.test.ts` (9, con fallo inyectado) | Aprobado |
| `operaciones/enrutamiento` (delta): condición vigente, actualización positiva, sin retiro, auditoría y evento `condicion_medica` | RF40, RF57, RF33 | HU20, HU23 | EQ-21 (cambio de principal), EQ-10 parcial | `unidad/matriz-enrutamiento.test.ts`, `integracion/condicion-medica.test.ts` (9), `concurrencia-evaluacion.test.ts` (2 × 5 rondas) | Aprobado. Los permisos de cierre de EQ-21 dependen de P6. |
| `consultas/detalle-sanitario`: detalle SAMU, rechazo uniforme, resumen de heridos, registro de accesos y exclusiones | RF43 | HU24 | EQ-04 (parte sanitaria), EQ-13 | `integracion/lecturas-sanitarias.test.ts` (9), `eq-sanitario.test.ts` (10/10 rechazos) | Aprobado |
| `consultas/bandeja-institucional` (delta): fila actualizada y resumen con condición vigente | RF43, RF48 | HU24, HU26 | EQ-04 | `lecturas-sanitarias.test.ts`, `bandeja.test.ts` | Aprobado |
| `consultas/seguimiento-ciudadano` (delta): evaluación propia, solicitud de completar, invitado sin datos y principal cambiada | RF42, RF43, RF47 | HU04, HU23 | EQ-04, EQ-21 | `lecturas-sanitarias.test.ts` (6.3) | Aprobado |
| Contrato OpenAPI de las tres rutas nuevas y las ampliaciones | — | — | — | `contrato.test.ts` (estados ejercitados y documentados), `contrato:validar` | Aprobado |
| `movil/reporte-incidente` (delta): bloque de evaluación y cantidad sin teclado | RF41, RF42, RF44 | HU23 | EQ-13 (botones de un toque, sin teclado) | `evaluacion_test.dart` (25), `reporte_pantalla_test.dart` (6 nuevas) | Aprobado en pruebas. El recorrido en Android y TalkBack queda pendiente (8.4). |
| `movil/seguimiento-incidentes` (delta): evaluación propia y aclaración | RF42, RF43 | HU04, HU23 | — | `evaluacion_mis_reportes_test.dart` (8) | Aprobado en pruebas. Emulador pendiente (8.4). |
| `web/bandeja-incidentes` (delta): condición médica, precisión, evaluación SAMU y accesibilidad | RF40, RF43 | HU24, HU20 | EQ-04, EQ-21 | `web/test/evaluacion.test.tsx` (11), `e2e/evaluacion-local.mjs` (38 comprobaciones, 11 capturas, axe) | Aprobado. No es aprobación visual del responsable. |

**Pendiente, fuera de P5.1:**
- evidencias fotográficas (P5.2);
- retirar o rebajar a SAMU, incorporarlo por reclasificación en otras categorías, permisos de cierre de la principal, «Asumir caso» y sustitución de PNP por Serenazgo (P6);
- avisos por usuario y consumidores de `EvaluacionActualizada` (P8);
- eliminación de datos sanitarios a los 30 días del cierre (P9);
- validación clínica de las preguntas con profesionales SAMU (documento 09).

**Pendiente dentro de P5.1, para verificación manual del responsable:**
- **8.4:** recorrido en el emulador Android con TalkBack y capturas;
- **10.3:** el paso 1 (registro desde Flutter) del recorrido integrado.

**Revisión del responsable:** la interpretación de propiedad de los datos sanitarios descrita al inicio de este informe.

## Ajuste de presentación web (27/11/2026)

Durante la verificación manual el responsable pidió mejorar la legibilidad de «Condición médica» y «Evaluación rápida». Ante el acuerdo de DESIGN.md (sin mejoras gráficas durante la integración), eligió mejorar **dentro del sistema actual**:
- **Componentes reutilizados:** mini-tarjetas por pregunta (`.cards`/`.mini-card`), valores como insignias con texto e icono (`.pill`, `.pill.warn` y `.priority-badge--unknown`), y `Mensaje` de aviso para la evaluación pendiente.
- **Historial:** línea de tiempo de la versión más reciente a la más antigua, con los campos modificados como insignias y el motivo destacado.
- **Defectos corregidos:** subtítulos más grandes que el título de la tarjeta, secciones sin espacio entre sí y el punto doble en «a. m..».
- **CSS nuevo:** solo de disposición, en `referencia-institucional.css`, con tokens existentes; sin colores ni tipografías nuevas.
- **Verificación:**
  - 171 pruebas web aprobadas (las dos que comprobaban la estructura anterior se actualizaron);
  - `lint` y `build` sin errores;
  - `node e2e/evaluacion-local.mjs` con 38 comprobaciones aprobadas y las 11 capturas regeneradas.

  La primera ejecución detectó un desborde a 1280 px con el texto al 200 %: las insignias no admitían salto de línea. Se permitió el ajuste solo en estos contenedores.
- **Fuera de este ajuste:** la presentación equivalente en Flutter (Mis reportes) no se modificó.

## Verificación manual del responsable (27/11/2026)

El responsable recorrió y dio por verificadas las tareas **8.4** (app en el emulador Android con la API local) y **10.3** (recorrido integrado con el registro desde Flutter). El dispositivo, las capturas y el resultado de TalkBack no constan en este informe.

Durante esa verificación se encontró que la base de desarrollo `ayni_safe_dev` no tenía aplicada la migración `20261128100000_evaluacion_rapida`: solo se había aplicado en `*_test`. Por eso el registro respondía 503 y la app mostraba «Reintentar envío». Se aplicó con `prisma migrate deploy` y se reencolaron 9 entregas de enrutamiento fallidas desde el 26/11 (anteriores a P5) con `eventos:reintentar`. Al cambiar a una rama con migraciones nuevas hay que ejecutar `npm run db:migrar` en `apps/api`.
