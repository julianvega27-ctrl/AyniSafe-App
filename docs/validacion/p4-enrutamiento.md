# P4.2 — Enrutamiento y bandeja inicial

- **Fecha:** 26/11/2026.
- **Cambio:** `enrutamiento-bandeja-inicial`, en la rama `feat/p4-enrutamiento`.
- **Base destino:** `e0f6694`. Es `main` con P4.1 fusionada (PR #5) y archivada (PR #6).

Este informe se completa por grupo de tareas. Lo que no figura aquí como ejecutado no está validado.

## Procedencia

El donante se leyó sin modificarlo:
- **Ruta:** `../Proyecto_incidencias_400par`.
- **HEAD:** `efc1bce8c29b3c88487e36e10a324c71ae9c2029`.
- **Estado:** `git status --porcelain` vacío el 26/11/2026.

| Archivo del donante | SHA-256 |
|---|---|
| `apps/api/src/incidents/report.js` (`newReportRecipients`) | `b8a1f2578e6b2fddf26c6858a1c59ee29823bf346edda93e26f8754824129dfd` |
| `apps/api/src/dispatch/suggestions.js` | `6974dcc814d4aed47957bb878d41de4975fe739e7391607b55a7d4d55f085827` |
| `apps/admin/src/pages/Incidents.jsx` | `8f6244aae98eee8c62bd570b17babde8f30316afdc23fca79f93e495906d6b5e` |

**Se adapta:**
- La idea de resolver los destinatarios por tipo de institución y luego las sedes que cubren el punto, con «excepción» cuando no hay sede (`suggestSites`). En AyniSafe la excepción es `ENRUTAMIENTO_PENDIENTE` con sus faltantes.
- La composición de la bandeja (`IncidentList`): introducción de página, panel con la tabla de reportes y el botón «Actualizar».

**Se descarta**, por contradecir reglas de AyniSafe:
- El SQL MySQL con `ST_Intersects` sobre zonas de cobertura. En AyniSafe la cobertura es por distrito del catálogo versionado (P3) y el distrito ya lo resolvió el registro.
- Las tablas `routing_rules` con subcategorías y prioridades. Se reemplazan por la matriz versionada del documento 09 §4 con las condiciones de RF57.
- Los avisos creados dentro de la transacción del reporte, que corresponden a P8 mediante eventos.
- Los roles `SuperAdministrador`/`AdministradorInstitucional`. AyniSafe tiene tres roles y el administrador no tiene permisos de atención.
- El formulario «Registrar llamada» y los filtros por estado y excepción de la bandeja. No hay recepción telefónica, y los estados operativos llegan en P6.

## Límite con P8

P4.2 implementa los pasos 2, 3 y 5 del documento 09 §5: matriz, sedes y `ENRUTAMIENTO_PENDIENTE`. No implementa:
- el paso 4: avisos persistentes por usuario y su estado de lectura, ni el aviso al administrador por fallos de asignación;
- el paso 6: contador, campana ni polling;
- el paso 7: recuperación de no leídos.

Publica el evento `EnrutamientoResuelto` sin consumidores, para que P8 genere los avisos. La campana del panel sigue «Aún no disponible».

## Alcance y límites

- **Cubre:** RF32, RF33 (sin el apoyo local opcional), RF35, RF47 (institución responsable), RF48 (orden de la bandeja), RF55 (Serenazgo en «Otra emergencia») y RF57 (selección de la principal).
- **No acredita:**
  - los avisos por usuario ni el polling (P8);
  - la actualización posterior de la condición médica (P5/P6);
  - la reclasificación, la sede coordinadora, «Asumir caso» ni la sustitución de PNP por Serenazgo (P6);
  - la administración de reglas ni del apoyo local de Serenazgo, que sigue desactivado.

## Entorno

Windows 11, Node v24, PostgreSQL 18.1 en un clúster local en el puerto 5433 (`scripts/bd-local.sh`), base `ayni_safe_test`.

## Grupo 2 — Matriz de destinatarios

`test/unidad/matriz-enrutamiento.test.ts`: 57 pruebas aprobadas. Cubren:
- las 16 categorías, sin ninguna categoría sin regla ni regla extra;
- las simultáneas de actividad sospechosa y vandalismo;
- las 16 combinaciones de heridos × atención médica del accidente, donde una respuesta desconocida nunca equivale a «no»;
- agresión, pelea y violencia con cuatro respuestas cada una;
- robo con heridos, sin SAMU, y asalto, sin apoyo local;
- una categoría desconocida o `__proto__`, que lanza un error;
- solo las cuatro instituciones admitidas;
- la deduplicación por rango;
- los faltantes (sin distrito, falta la principal, falta la simultánea, nada falta) y la validación de los faltantes persistidos.

## Grupo 3 — Contratos de Identidad y Reportes

`test/integracion/contratos-enrutamiento.test.ts`: 7 pruebas aprobadas con PostgreSQL. Cubren:
- `sedesEnrutamiento.elegibles`:
  - excluye una sede deshabilitada, una inactiva, una sin competencia, una sin cobertura, una con su operador pendiente o suspendido, una de otra institución y las de una institución inactiva;
  - refleja una cobertura nueva sin reiniciar.
- `sedesEnrutamiento.designable`:
  - acepta una sede sin cobertura;
  - lista `misma_institucion`, `sede_habilitada` y `operador_activo`;
  - responde `sede_existente` a una sede inexistente o a un identificador no UUID.
- `LecturaEnvios.datosEnrutamiento`: devuelve exactamente las claves esperadas, o null si el incidente no existe.
- `resumenOperativo`: la enumeración de claves excluye teléfono, coordenadas, autor y huellas.

Además, el `Solicitante` institucional de Identidad ahora incluye `usuarioId` y `rol`, y la fachada expone `origenWebPermitido` para que otros módulos apliquen la protección CSRF.

## Grupo 4 — Esquema y consumidor de enrutamiento

- **Migración `20261127100000_enrutamiento`:** es aditiva. Crea `enrutamientos_incidente` y `participaciones_incidente` con sus CHECK, la unicidad (incidente, sede) y el índice parcial FIFO de pendientes. `test/integracion/esquema-enrutamiento.test.ts` (7 aprobadas) prueba:
  - el rechazo de un resultado, una institución, un papel o un origen inválidos;
  - el rechazo de un resultado incoherente con sus faltantes y de una designación sin administrador o con un motivo corto;
  - la unicidad por incidente, por evento y por sede;
  - las FK de incidente, categoría y sede;
  - que el SQL de la migración solo contiene `CREATE TABLE`/`CREATE INDEX` de las dos tablas nuevas.

  En la continuación del 26/11 se ejecutó `node scripts/verificar-migracion-enrutamiento.mjs`: aplica las migraciones anteriores y luego P4.2 en un esquema temporal de la base local `_test`, introspecta ambos estados y ejecuta `prisma migrate diff --from-schema … --to-schema … --script`. Así conserva las FK reales entre módulos en ambos snapshots, sin comparar contra el modelo deliberadamente parcial del código. Resultado: solo crea `enrutamientos_incidente`, `participaciones_incidente`, sus índices y FK; no altera tablas previas. [SQL obtenido](p4/migracion-enrutamiento-diff.sql). El script elimina su esquema temporal al terminar. CHECK y triggers se verifican con las pruebas PostgreSQL, no con el diff.
- **Consumidor `operaciones.enrutamiento`:** está registrado en `main.ts`. Sus puertos hacia Reportes e Identidad se cablean en `composicion.ts#enrutamientoDe`. `test/integracion/enrutamiento.test.ts` (12 aprobadas) prueba:
  - un robo queda ENRUTADO con su sede PNP, publica `EnrutamientoResuelto` y el incidente sigue en REGISTRADO;
  - un accidente con heridos tiene a SAMU como principal y a PNP como simultánea;
  - un accidente sin condición médica no avisa a SAMU, y uno con condición desconocida marca revisión pendiente;
  - una agresión con heridos añade SAMU como condicionada;
  - en un vandalismo participan dos sedes de Serenazgo y el incidente sigue siendo uno;
  - sin distrito, queda pendiente sin participaciones;
  - si falta la principal SAMU, PNP participa como simultánea y el caso queda pendiente;
  - EQ-19: «Otra emergencia» sin sede de Serenazgo queda pendiente, y con sede llega a Serenazgo;
  - una entrega repetida no duplica el enrutamiento, las participaciones ni el evento;
  - los eventos registrados antes del consumidor se enrutan al arrancar una instancia nueva del procesador (reinicio antes de procesar, EQ-14). Esto incluye un accidente con heridos que llega a SAMU como principal y a PNP como apoyo (EQ-10 parcial);
  - un incidente sin originales lanza un error, y la entrega queda pendiente con 1 intento, su causa y sin enrutamiento.
- **Arquitectura:** el verificador detecta ahora ciclos entre módulos (`ciclo-entre-modulos`), probados con un ejemplo cíclico y otro válido en `test/unidad/arquitectura.test.ts` (19 aprobadas). `npm run arquitectura:verificar` termina con 0 infracciones.

## Grupo 5 — Pendientes del administrador

Las rutas son `GET /admin/enrutamientos-pendientes`, `POST …/{incidenteId}/designaciones` y `POST …/{incidenteId}/reevaluar`, en el router de Operaciones. Exigen sesión institucional de administrador por cookie, y las mutaciones exigen además el origen web (CSRF). `test/integracion/pendientes-admin.test.ts` (10 aprobadas) prueba:
- **Lista:**
  - 53 pendientes paginados de 50 en 50, en orden FIFO (instante e id), sin repetir ni omitir;
  - claves de fila exactas, sin teléfono, descripción, coordenadas ni respuestas;
  - un cursor inválido o un parámetro extra dan 400;
  - un operador recibe 403; una solicitud sin sesión o con Bearer recibe 401.
- **Designación:**
  - designar la principal SAMU faltante pasa el caso a ENRUTADO;
  - la participación queda con `origen=designacion`, el administrador y el motivo;
  - se publican dos eventos (`regla` pendiente y `designacion` enrutado);
  - el motivo no aparece en los logs.
- **Rechazos (409 `SEDE_NO_DESIGNABLE`, con los requisitos):** una sede de otra institución, una deshabilitada, una sin operador activo y una inexistente.
- **Validación:**
  - un motivo corto o un campo extra dan 400;
  - una solicitud sin `Origin` da 403;
  - `text/plain` da 415;
  - un incidente inexistente o malformado da 404.
- **Concurrencia:** dos designaciones simultáneas dan 201 y 409 (`FALTANTE_INEXISTENTE`) y dejan una sola participación SAMU. Designar una institución que no falta da 409.
- **Reevaluación:**
  - sin cambios, el caso sigue pendiente sin duplicar participaciones;
  - tras añadir la sede SAMU con cobertura, el caso queda ENRUTADO con `origen=reevaluacion`;
  - volver a reevaluar da 409 `ENRUTAMIENTO_NO_PENDIENTE`;
  - sin distrito, la reevaluación no resuelve el caso.

## Grupo 6 — Bandeja del operador y seguimiento

Las rutas son `GET /operador/incidentes` y `GET /operador/incidentes/{id}`, en el router de Consultas. Exigen sesión institucional de operador por cookie, y el ámbito vigente de Identidad se resuelve en cada consulta. Operaciones filtra en su propio SQL por sede, distrito y categoría; la excepción es una participación designada.

`test/integracion/bandeja.test.ts` (11 aprobadas):
- **6.1:**
  - 52 incidentes en dos páginas de 50, en orden FIFO;
  - dos incidentes con el mismo instante salen ordenados por id;
  - una bandeja vacía devuelve 200;
  - la fila tiene las claves exactas: prioridad `SIN_EVALUAR` y `condicionMedicaPorConfirmar` cuando el accidente tiene condición desconocida;
  - el resumen tiene las claves exactas, con las respuestas del ciudadano y `otrasInstituciones: ['samu']`, sin teléfono, código, coordenadas ni el id de otra sede.
- **6.2 (EQ-09 sobre incidentes):**

| Acceso indebido | Resultado |
|---|---|
| Operador PNP pide por URL directa un incendio de Bomberos | 404 `Incidente no disponible.`, idéntico al de un id inexistente y al de uno malformado; no aparece en su bandeja |
| Cursor alterado (`@@@`) | 400 |
| Cursor válido fabricado | 200, solo el robo propio, sin ampliar el conjunto |
| Parámetro ajeno (`sedeId`) | 400 |
| Cobertura retirada de la sede | El caso desaparece de la bandeja y su resumen da 404 |
| Designación fuera de cobertura | Visible para la sede designada, con el territorio pendiente `fuera_area` |
| Pendiente en su distrito sin participación de su sede | No visible (bandeja vacía y 404) |
| Sede deshabilitada | 403 sin datos |
| Operador suspendido | 401 |
| Administrador o ciudadano | 403 |
| Sin sesión | 401 |
| Método distinto de GET | 405 |

El cambio de ámbito tras una reclasificación queda para P6.

- **6.3:** `test/integracion/seguimiento-responsable.test.ts` (3 aprobadas):
  - sin enrutamiento, la institución responsable queda `pendiente`;
  - con la principal SAMU participando, el invitado y el autor ven `{estado:'asignada', institucion:{id:'samu', nombre}}`;
  - las claves del invitado son exactas y no incluyen sede, operadores ni descripción;
  - con la principal faltante y PNP de apoyo, la institución responsable sigue `pendiente`.

## Grupo 7 — Contrato OpenAPI

`openapi.yaml` documenta:
- las cinco rutas nuevas, con las etiquetas `Bandeja` y `Enrutamiento`;
- los esquemas `BandejaOperador`, `ResumenIncidenteOperador`, `PendientesEnrutamiento`, `DesignacionSolicitud`, `ResultadoEnrutamientoAdmin` y `Faltante`;
- `InstitucionResponsable`, que puede ser pendiente o asignada;
- los códigos 409 `FALTANTE_INEXISTENTE`, `SEDE_NO_DESIGNABLE` (con `requisitos`) y `ENRUTAMIENTO_NO_PENDIENTE`.

`npm run contrato:validar` lo declara válido (OpenAPI 3.1.0). `test/integracion/contrato.test.ts` (12 aprobadas) ejercita, contra el OpenAPI desreferenciado:
- bandeja: 200, 400, 401, 403 y 503;
- resumen: 200, 400, 401, 403, 404 y 503;
- pendientes: 200, 400, 401, 403 y 503;
- designación: 201, 400, 401, 403, 404, 409, 413, 415 y 503;
- reevaluación: 200, 400, 401, 403, 404, 409 y 503;
- el detalle del autor y la vista del invitado con la institución responsable asignada.

La comprobación final confirma que no hay estados documentados sin ejercitar ni respuestas reales sin documentar.

## Grupo 9 — Seguimiento móvil (continuación del 26/11/2026)

`InstitucionResponsable.desdeJson` conserva el nombre de una asignación reconocida. Un estado desconocido, una institución fuera del catálogo o un nombre ausente/vacío se tratan como pendientes. El detalle propio y la consulta del invitado reutilizan la tarjeta e icono institucional existentes; la asignación no cambia REGISTRADO ni inventa actuaciones.

- `flutter test test/seguimiento_pantallas_test.dart`: **14 aprobadas**, incluidas seis nuevas (pendiente/asignada/desconocida × autor/invitado), con verificación del nombre, icono, estado Registrado y ausencia de confirmación de atención o recepción institucional.
- `flutter test`: **295 aprobadas**.
- `flutter analyze`: **sin observaciones**, tras corregir una llave de control de flujo en la prueba formateada.
- Entorno: Windows 11, SDK Flutter local; pruebas de widgets con respuestas HTTP simuladas. No acreditan una nueva ejecución Android física, TalkBack ni integración móvil con la API. El recorrido con API real se documenta aparte.

## Grupo 8 — Panel web y comparación visual

Las tareas 8.1–8.3 tenían código y casillas completas al retomar, pero faltaba este registro. `apps/web/test/incidentes.test.tsx` cubre bandeja FIFO, paginación, actualización manual sin intervalos, vacío, error/reintento, 401, 403, resumen y 404 uniforme, motivo, envío único y conflictos 409. Las pruebas de panel cubren la disponibilidad por rol. La continuación completó el diálogo exigido en 8.3: modal nativo con Escape, retorno y contención del foco; los errores de designación permanecen dentro del diálogo. También corrigió la insignia de prioridad para usar la forma y el gris de `PriorityBadge` del origen, con los tokens centrales de DESIGN.md, y añadió iconos a las etiquetas de papel y estado.

Las [14 capturas anteriores](p4/capturas-enrutamiento/) y [sus fichas](p4/fichas-enrutamiento.json) usan API interceptada. Se conservan como evidencia histórica; no acreditan la tarea 8.4 con API local ni reflejan las correcciones finales del diálogo y la insignia.

La referencia se renderizó con `node e2e/enrutamiento-referencia.mjs` desde `apps/web`, leyendo el donante y guardando la caché de Vite dentro de AyniSafe. [Capturas del origen](p4/capturas-referencia/) a 1440 y 360 px y [ficha de procedencia](p4/referencia-renderizada.json). `git status --porcelain` vacío antes y después. La API del donante se intercepta solo para dibujar la referencia; DM Sans y Manrope se sirven desde las copias locales con licencia ya existentes.

La inspección renderizada mantiene lateral de 248 px en escritorio y variante estrecha, cabecera, `page-intro`, panel, tabla, enlace de fila y «Actualizar». Las diferencias funcionales requeridas son explícitas: sin «Registrar llamada» ni filtros del donante, con distrito y papel institucional, cuatro estados AyniSafe, condición médica por confirmar y prioridad Sin evaluar. El texto de negocio y los controles de 48 px explican diferencias de altura y densidad. No se afirma igualdad de píxeles, aceptación visual del responsable ni operación real de las instituciones.

**8.4 ejecutada con API local:** `node e2e/enrutamiento-local.mjs` desde `apps/web` (sin otras suites de BD simultáneas). Usa `main.ts`, el procesador de entregas real, PostgreSQL local `_test`, Vite en `http://localhost:5176` y Chrome. Solo el correo queda en memoria; las cuentas, sedes y geometrías son sintéticas. No intercepta respuestas de AyniSafe. El script borra los datos de esa base de pruebas al preparar el recorrido y cierra sus procesos al terminar.

- [Ficha final del recorrido](p4/recorrido-api-local.json): **41 comprobaciones aprobadas** y [12 capturas finales](p4/capturas-api-local/).
- Bandeja a 1440, 900 y 360 px; resumen, pendientes y diálogo a 1440 y 360 px; bandeja, resumen y pendientes con texto al 200 % a 1280 px.
- Sin desplazamiento horizontal de la página en las capturas. Las tablas conservan desplazamiento dentro de su marco para acceder a todas las columnas en pantalla estrecha y con texto ampliado; no se ocultan campos.
- axe sin reglas desactivadas: cero infracciones en las 12 vistas. Esto no equivale a conformidad completa WCAG ni a validación con lector de pantalla.
- Teclado real: Tab alcanza las tres filas con foco visible; Enter abre el resumen y el diálogo; Escape lo cierra y devuelve el foco; Shift+Tab permanece en el diálogo; Tab pasa del selector al motivo; la designación se confirma con teclado.
- Se inspeccionaron las capturas de escritorio, 360 px y texto al 200 % de las tres vistas y el diálogo, junto con las capturas renderizadas del origen. El resultado conserva composición y recursos compartidos con las adaptaciones funcionales descritas arriba.

## Grupo 10 — Documentación y trazabilidad

### Guía UI (10.1)

Se añadió la sección 2.11 a `docs/05-diseno-ui/guia-ui.md` con las rutas efectivas, campos, estados y acciones. Contrastada por lectura con DESIGN.md y documento 09 §4–§6: no crea estilos alternativos, no amplía los permisos administrativos, conserva FIFO y separa P5/P6 de los avisos y polling de P8.

### Validación integrada local (10.2)

Revisión: **árbol local sin commit sobre `e0f6694`**, rama `feat/p4-enrutamiento`, 26/11/2026 (America/Lima). Windows 11; Node **24.21.0**, PostgreSQL **18.1** local en puerto 5433, BD aislada `ayni_safe_test`; Flutter **3.47.7**, Dart **3.13.5**; Chrome **158.0.8127.88**, Vite **7.3.8**. No se publican las cadenas de conexión ni se modifica `.env`.

| Directorio | Comando | Resultado medido |
|---|---|---|
| `apps/api` | `npm.cmd run test:cobertura` | **56 suites, 848 pruebas aprobadas**, 142,268 s; ninguna omitida. |
| `apps/api` | `npm.cmd run test:tipos` y `npm.cmd run typecheck` | Ambos sin errores. |
| `apps/api` | `npm.cmd run arquitectura:verificar` | 116 archivos, 0 infracciones y 0 destinos computados. |
| `apps/api` | `npm.cmd run contrato:validar` | Contrato OpenAPI 3.1.0 válido. La suite Jest incluye sus respuestas reales de contrato. |
| `apps/api` | `node scripts/verificar-migracion-enrutamiento.mjs` | Diff exclusivamente aditivo, sin alterar tablas anteriores. |
| `apps/web` | `npm.cmd test` | **11 archivos, 160 pruebas aprobadas**. |
| `apps/web` | `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` | Sin errores; build Vite generado. |
| `apps/mobile` | `flutter test` | **295 pruebas aprobadas**. |
| `apps/mobile` | `flutter analyze` | Sin observaciones. |
| Raíz | `npx.cmd --no-install @fission-ai/openspec validate enrutamiento-bandeja-inicial --strict` | Cambio válido. |

Cobertura Jest final: sentencias/líneas **87,23 % (10419/11943)**; ramas **91,34 % (3008/3293)**; funciones **93,40 % (694/743)**. Incluye scripts administrativos, incluido el nuevo verificador manual de migraciones, que no corre dentro de Jest. No se excluyeron archivos para mejorar el porcentaje. Artefactos locales: [HTML](../../apps/api/coverage/index.html), [LCOV](../../apps/api/coverage/lcov.info) y [resumen JSON](../../apps/api/coverage/coverage-summary.json); esos reportes están ignorados por Git. Se conserva un [resumen de esta ejecución](p4/resumen-validacion-enrutamiento.json) en documentación.

La primera corrida completa produjo **847 aprobadas y 1 fallida**: `esquema.test.ts` enumeraba las tablas anteriores y no incluía las dos nuevas. Se corrigió la lista esperada; la repetición completa produjo los 848 éxitos anteriores. El primer análisis Flutter detectó una llave faltante de estilo en una prueba formateada; se corrigió y se repitió sin observaciones. La verificación de teclado encontró que Shift+Tab desde el primer control podía pasar al navegador; el diálogo ahora cierra el ciclo entre primer y último control y el recorrido real se repitió.

Estos resultados son locales. No acreditan CI, despliegue, proveedores externos, uso institucional, TalkBack, Android físico en esta continuación, carga de 2.000 VU ni el cumplimiento global de todos los EQ del Sprint 2.

### Recorrido integrado (10.3)

Resultado final de `node e2e/enrutamiento-local.mjs`, 26/11/2026 a las 18:42 de Lima: **41 comprobaciones aprobadas**, con [pasos y capturas](p4/recorrido-api-local.json). Se eligió el registro por API permitido en la tarea; no se declara registro desde Flutter.

1. Preparar cuentas activas y sedes sintéticas SAMU y PNP. Ambas cubren DIS-01; PNP también DIS-02. SAMU no cubre DIS-02. Activar cartografía sintética (no representa Ayacucho).
2. Registrar por HTTP un accidente en DIS-01 con heridos `si`; respuesta **201**. Esperar el enrutamiento del consumidor iniciado por `main.ts`.
3. Iniciar sesión desde el formulario web como operador SAMU y comprobar el incidente como **Principal**; iniciar como PNP y comprobarlo como **Simultánea**. La bandeja también incluye otro accidente con condición desconocida, que muestra revisión pendiente.
4. Consultar el seguimiento del invitado con referencia y código en el cuerpo: responsable **SAMU**. No se guardan códigos, cookies ni contraseñas en los artefactos.
5. Registrar otro accidente en DIS-02: PNP participa, SAMU queda faltante. Abrir Inicio del administrador, designar la sede SAMU fuera de cobertura mediante el diálogo y un motivo; confirmar desde teclado. La web informa el éxito, el resultado persistido es **ENRUTADO** y existe exactamente una participación de designación con administrador y motivo. Tras actualizar, SAMU ve el caso designado.
6. EQ-19: registrar «Otra emergencia» con una descripción concreta y punto fuera de los distritos sintéticos. Queda pendiente por `sin_distrito`. Desde el panel, designar una sede Serenazgo habilitada con operador activo y sin cobertura distrital; el resultado pasa a **ENRUTADO** y su operador ve el caso. Las pruebas HTTP de pendientes verifican por separado que el administrador no recibe descripción, coordenadas, teléfono ni respuestas sanitarias.

### Matriz spec → reglas/historias → calidad → prueba → resultado (10.4)

Rutas de specs relativas a `openspec/changes/archive/2026-11-26-enrutamiento-bandeja-inicial/specs/`; sus contratos vigentes están sincronizados en `openspec/specs/`. Pruebas API relativas a `apps/api/test/`. «Completo en P4.2» califica los escenarios de este cambio, sin ampliar el alcance de una RF/HU ni cerrar entregas futuras.

| Spec y escenarios | RF / HU | EQ y alcance | Evidencia ejecutada | Resultado y límites |
|---|---|---|---|---|
| `operaciones/enrutamiento`: principal, simultáneas, condiciones y versión | RF32/33/57; HU20 (también HU23 en RF57) | EQ-21 parcial | `unidad/matriz-enrutamiento.test.ts` (57); `integracion/enrutamiento.test.ts` (12) | Las 16 categorías, combinaciones médicas, deduplicación y REGISTRADO preservado. Sin avisos por usuario ni actualización médica posterior. |
| `identidad/organizacion-institucional`: elegibles y designables; `operaciones/enrutamiento`: selección de sedes | RF32/35; HU07/20/21 | EQ-09: selección y ámbito de P4.2 | `integracion/contratos-enrutamiento.test.ts` (7), `integracion/bandeja.test.ts` (11) | Cobertura/competencia/actividad/operador vigente; excepción designada limitada al caso. |
| `operaciones/enrutamiento`: pendientes, designación y reevaluación | RF35; HU21 | EQ-19 completo en este flujo; EQ-09 en P4.2 | `integracion/pendientes-admin.test.ts` (10); recorrido API/web real | FIFO, auditoría, carrera 201/409, requisitos, reevaluación y ausencia de datos restringidos en la vista administrativa. Los avisos al administrador pertenecen a P8. |
| `operaciones/enrutamiento`: Otra emergencia con sede, sin sede y sin distrito | RF32/35/55; HU20/21 | EQ-19 completo para enrutamiento/designación | Dos escenarios de `integracion/enrutamiento.test.ts`; recorrido real de Serenazgo sin distrito | Con sede llega a Serenazgo; sin sede queda pendiente; sin distrito se resuelve por designación y queda visible solo para la sede participante. El aviso de usuario sigue en P8. |
| `consultas/bandeja-institucional`: FIFO, campos, ámbito y URL directa | RF48; HU07/26 | EQ-09: conjunto de accesos indebidos de P4.2 completo | `integracion/bandeja.test.ts` (11); tabla de rechazos del grupo 6 | Rechazos uniformes, cursor sin ampliar ámbito y cambios de cobertura efectivos. **EQ-09 global no se cierra**: falta reclasificación de P6. |
| `consultas/seguimiento-ciudadano`, `movil/seguimiento-incidentes`: principal resuelta o pendiente | RF47; HU04/13, vinculada al flujo HU20 | EQ-09 en vistas de P4.2; EQ-21 parcial | `integracion/seguimiento-responsable.test.ts` (3); Flutter seguimiento (14); recorrido API real | Principal con participación, sin sedes/operadores; apoyos solos no inventan responsable; estado desconocido en Flutter queda pendiente. Actuaciones/cierre llegan en P6. |
| `operaciones/enrutamiento`: entrega repetida, eventos previos y reinicio | RF32/33/57; HU20 | EQ-10 parcial (y recuperación EQ-14 parcial) | `integracion/enrutamiento.test.ts` (12); `integracion/eventos.test.ts` | Entregas persistidas, nueva instancia del procesador retoma el evento y no duplica efectos. No acredita caída de proceso físico, tiempo objetivo de recuperación, avisos por usuario, lectura independiente ni polling. |
| `web/bandeja-incidentes`, `web/panel-institucional`: bandeja, resumen, diálogo, errores y rol | RF35/48; HU07/21/26 | EQ-09 en panel; verificación visual local | 160 pruebas web totales, 12 capturas con API real, 41 comprobaciones del recorrido | UI y permisos de este incremento verificados; no es aprobación visual del responsable ni prueba con lector de pantalla. |

Pendientes explícitos: avisos persistentes por usuario, lectura, contador, campana, polling y recuperación de no leídos (P8); actualización positiva de la condición médica (P5/P6); reclasificación, sede coordinadora, asunción/actuaciones/cierre y sustitución auditada de PNP por Serenazgo (P6); administración de reglas y configuración del apoyo local opcional, aún desactivado. RF33, RF47, RF48, RF55 y RF57 tienen componentes posteriores; los éxitos de este incremento no se presentan como implementación total de esas RF.

## Estado de cierre

docs/p4.2-cierre
Las 22 tareas de implementación y validación de P4.2 se completaron localmente y la implementación se fusionó mediante el PR #7 en `main` `08ca417a8c0eaf205ccae46dc41b849d22fa53ab`, con CI aprobado. La evidencia de ese CI se incorporó a `docs/p4.2-cierre` mediante `4142c7a` (cherry-pick del commit `3c3a320`, que había quedado en la rama de implementación después de su fusión).

El 26/11/2026, hora de Lima, se sincronizaron las siete capacidades de este cambio y se archivó localmente en `openspec/changes/archive/2026-11-26-enrutamiento-bandeja-inicial/`. Se preservaron los Purpose y requisitos/escenarios no afectados de las specs existentes. La segunda sincronización no produjo cambios (idempotencia). Validación: 26 specs aprobadas, 0 fallidas, y cambio válido en modo estricto antes del archivo. Se mantienen cuatro advertencias previas de textos mayores de 500 caracteres en requisitos no modificados por este cierre; no se reescribieron para ocultarlas.

Este cierre contiene solo documentación y OpenSpec. Su commit, PR y CI están pendientes; no se declara que el CI de `08ca417` haya evaluado los cambios posteriores de cierre. No se modificó código de producto, no se desplegó y no se eliminaron ramas.

Las tareas de implementación y validación de P4.2 quedan completas localmente. No se creó commit, PR, despliegue ni archivo OpenSpec. CI y revisión del responsable siguen pendientes; el workflow posterior se ejecuta cuando se solicite. Se conservan todos los cambios previos del árbol de trabajo y el donante permanece limpio.
 main

## Validación en GitHub Actions

- PR: `https://github.com/julianvega27-ctrl/AyniSafe-App/pull/7`.
- Ejecución de CI: `https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/45926686150`.
- Fecha: `26/11/2026`.
- Commit evaluado: `08ca417a8c0eaf205ccae46dc41b849d22fa53ab`.

Resultados comprobados:
- API: aprobado.
- Flutter: aprobado.
- Web: aprobado.
- Escaneo de secretos: aprobado.

La ejecución terminó correctamente con los cuatro trabajos aprobados.
La cobertura de la API se conserva en el artefacto de esta ejecución,
 docs/p4.2-cierre
con retención de 14 días.

Contraste del CI por el agente durante el cierre: evento `push` de `main`, iniciado el **26/11/2026 a las 21:09:43 de Lima**, conclusión `success`; API, Flutter, Web y secretos con conclusión `success`. Artefacto disponible al consultar: `api-cobertura-08ca417a8c0eaf205ccae46dc41b849d22fa53ab`, con vencimiento **10/12/2026 a las 21:12:44 de Lima**. Los porcentajes de la sección local no se atribuyen a esta ejecución sin consultar su reporte de cobertura.

con retención de 14 días.
 main
