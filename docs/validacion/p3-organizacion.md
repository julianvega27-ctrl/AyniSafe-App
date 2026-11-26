# P3.2 — Organización institucional

Fecha: 25/11/2026. Cambio `organizacion-institucional`, rama `feat/p3-organizacion`, base destino `0f2366a11c9a028435932e14115335ae418b1d39` (PR #2 fusionado, CI aprobado). La especificación se registró antes de implementar en `b2a15f4`. Este informe se completa por grupo de tareas; lo que no figura aquí como ejecutado no está validado.

## Procedencia

Donante leído sin modificaciones: `../Proyecto_incidencias_400par`, HEAD `efc1bce8c29b3c88487e36e10a324c71ae9c2029`, `git status --porcelain` vacío el 25/11/2026. Huellas SHA-256 de los archivos consultados:

| Archivo del donante | SHA-256 |
|---|---|
| `apps/api/src/institutions/router.js` | `769a4dba02c99b89bd627dd468afc16a0c80d76c2463545f061f1130c1c0cf4d` |
| `apps/api/src/institutions/sites.js` | `d91078cd770865c4d9a6c13be0e6dfd9822f9a00fc7fe459330fdae36b475166` |
| `apps/api/src/institutions/users.js` | `8ce7978c6fed3fbf628bff332f139f88eb4f0482b565f45880cb8b72b6026442` |
| `apps/api/src/institutions/coverage.js` | `388d791d0d6faae26264e058a04051e4692000fc281f034319084fde6f6909ac` |
| `apps/admin/src/pages/Organization.jsx` | `893caf0e1d8acca3b7439ebb0597c3458913b975b6fed6c7029b5a17ca71a2c5` |

Se adapta:
- validación estricta de entradas de institución y sede (`institutionInput`, `siteInput`);
- alta de sede dentro de una transacción con bloqueo compartido de la institución (`FOR SHARE`);
- desactivación lógica en lugar de borrado;
- composición visual de la página Organización (intro, panel por institución, tarjetas de sede, formulario compacto).

Se descarta, por contradecir reglas de AyniSafe:
- roles `SuperAdministrador` y `AdministradorInstitucional` (solo existen tres roles);
- tipos `municipalidad` y `otra` (catálogo cerrado de cuatro instituciones);
- contraseña en el formulario de alta (se usa invitación de un solo uso);
- cobertura por polígonos (`site_coverage_zones`; la cobertura es por distrito);
- personal y unidades (`resources/*`), fuera del alcance de RF28–30;
- SQL MySQL dentro de routers (la persistencia va en adaptadores Prisma/PostgreSQL).

No se ejecutó la suite del donante ni se copiaron migraciones MySQL.

## Alcance y límites

Cubre RF28, RF29 y RF30, y el componente de sedes de RF54 (HU14/HU15). Valida EQ-12 completo y EQ-09 solo en su parte organizativa.

No acredita:
- EQ-09 sobre incidentes (P4/P6);
- reasignación de operador entre sedes;
- historial de auditoría consultable (P8);
- entrega real de correo con el proveedor del piloto;
- gestión o desactivación de categorías desde el panel;
- reglas de enrutamiento ni prioridades.

No se precargaron las 13 sedes candidatas del documento 10. Las sedes y operadores de las pruebas y mediciones son datos sintéticos o de demostración.

## Implementación

- **Módulo Reportes (nuevo, solo catálogo):** las 16 categorías con identificadores estables, en la tabla `categorias` sembrada por la migración. Lectura pública en `GET /publico/categorias`, con 405 y `Allow` para escrituras.
- **Identidad:** dominio `organizacion.ts` y `validacion-organizacion.ts`; casos de uso en `organizacion.use-case.ts`; puertos `OrganizacionPort` y `CatalogoIdsPort`; adaptador `PrismaOrganizacionAdapter`; rutas en `organizacion.routes.ts`.
- **Composición:** `main.ts` inyecta los catálogos de Consultas (`idsDistritosPiloto`) y Reportes (`categorias.idsActivos`) como puertos. Identidad no importa internos de otros módulos. La fachada de Identidad exporta `consultarAmbitoOperador` para P4/P6.
- **Migración aditiva `20261126100000_organizacion_institucional`:**
  - tablas `categorias`, `instituciones` (4 filas, CHECK de tipo), `sedes`, `pertenencias_operador` (trigger de rol operador), `coberturas_sede` y `competencias_sede`;
  - FK sin cascada: borrar una fila referenciada se rechaza con `23001` en PostgreSQL 18 (local) y `23503` en PostgreSQL 17 (CI);
  - CHECK de verificación con fuente y de habilitación solo de sedes activas y verificadas.
- **Decisión del 25/11/2026 tomada al implementar:** suspender un operador pendiente revoca su invitación. Para permitirlo, `usuarios_hash_estado_chk` pasa de «pendiente ⇔ sin contraseña» a «pendiente ⇒ sin contraseña; activo ⇒ con contraseña». La activación sigue exigiendo estado pendiente.
- **Alta atómica:** bloqueo compartido de la institución, `INSERT … ON CONFLICT DO NOTHING` de sede y cuenta (así PostgreSQL no registra el correo en su log), pertenencia e `InvitarCuentaUseCase` en la misma transacción. El gestor de correo se despierta después del commit.
- **Invariantes de habilitación:** se bloquea la sede (`FOR UPDATE`) y los conteos se hacen en una sentencia posterior. Así, en READ COMMITTED, la carrera entre habilitar y suspender ve lo confirmado por la otra transacción.
- **Código de error ajustado:** el correo repetido usa `EMAIL_IN_USE` (el código existente del contrato, con su propio mensaje) en lugar del `CORREO_EN_USO` planificado. Los artefactos del cambio se actualizaron.
- **Web:** secciones «Instituciones y sedes», «Operadores» y «Coberturas» en `apps/web/src/paginas/organizacion/Organizacion.tsx`. Reproducen la composición de `Organization.jsx`: intro de página, un panel por institución con la acción de edición en el encabezado, tarjetas de sede y alta en un panel con formulario compacto. Las clases del `style.css` del origen se añadieron a `referencia-institucional.css` y las adaptaciones AyniSafe van marcadas ahí. El formulario no tiene campo de contraseña y el botón «Usuarios con acceso» se reproduce como enlace «Operadores de la sede».

## Validación ejecutada

Entorno: Windows x64, Node 24.21.0, PostgreSQL 18.1 en un clúster aislado (`.cache/p3-postgres`, loopback 55433, base `ayni_p32_test`), Prisma 7.10.1 y Chrome headless local. Estado local sin commit sobre `b2a15f4`.

| Comprobación | Resultado |
|---|---|
| API `typecheck`, `test:tipos`, `build` | Aprobados |
| `arquitectura:verificar` | 86 archivos, 0 infracciones, 0 destinos para revisión manual |
| `contrato:validar` | OpenAPI 3.1 válido, versión 0.6.0, 34 operaciones |
| API `test:cobertura` | 37 suites, **540/540**, 162,6 s |
| Cobertura de líneas y sentencias | **85,19 %** (6.583/7.727) |
| Cobertura de ramas y funciones | **90,88 %** (1.974/2.172) y **93,10 %** (432/464) |
| Cobertura de los archivos nuevos (líneas) | Dominio y Reportes 100 %; caso de uso 99,2 %; adaptador 98,6 %; rutas 100 %; validación 95,3 %. El script de medición no lo ejecuta Jest (0 %). |
| Web `lint`, `typecheck`, `build`, `verificar:dist` | Aprobados |
| Web Vitest | 10 archivos, **140/140** (13 nuevas de organización y 2 del cliente) |
| `e2e/organizacion-visual.mjs` (origen 5175 y destino 5174) | 21 comprobaciones, 12 capturas |
| `openspec validate organizacion-institucional --strict` | Válido |
| `git diff --check` y escaneo de secretos (597 archivos, incluidos los nuevos) | Sin errores; 0 hallazgos |

Resumen procesable de la cobertura: [p3/cobertura-organizacion-summary.json](p3/cobertura-organizacion-summary.json). Log local no versionado: `.cache/p32-cobertura-final.log`.

**Resultados negativos encontrados y corregidos:**
1. La primera suite completa dio 4 fallos en `alcance`, `institucional`, `esquema` y `usuario-institucional`. Eran aserciones de la regla anterior («ninguna ruta crea operadores», «ninguna sección disponible», lista exacta de tablas). Se actualizaron conforme a los requisitos MODIFIED, conservando sus demás comprobaciones.
2. Suspender un operador pendiente fallaba con 503 por el CHECK de `usuarios`. Se resolvió con la decisión descrita arriba.
3. La primera versión web usaba estilos en línea; `estatico.test.ts` lo detectó porque la CSP los bloquea, y se pasaron a clases.
4. La primera captura mostraba una composición distinta de la referencia (todo en un panel y etiquetas que desalineaban el formulario). Se reestructuró para reproducir la página del origen.
5. La primera CI del PR falló en `esquema.test.ts`: la prueba exigía el código `23001`, propio de PostgreSQL 18, y la CI usa PostgreSQL 17, que devuelve `23503` para la misma violación de `RESTRICT`. Ahora acepta ambos códigos y además comprueba que las filas siguen existiendo.

## Pruebas por grupo

- **Unitarias** (`categorias.test.ts`, `organizacion.test.ts`, 19 pruebas): catálogo exacto; validación estricta (campos desconocidos como rol o contraseña, tipos, longitudes en puntos de código, fechas inválidas, conjuntos repetidos o en exceso); requisitos de habilitación; orden de pasos dentro de la transacción y despertar del correo solo tras el commit, con dobles.
- **Integración PostgreSQL** (`organizacion.test.ts`, 15 pruebas):
  - alta correcta con un único correo;
  - **fallo real inyectado por trigger temporal** en `pertenencias_operador` y en `envios_correo`, sin filas residuales, y reintento sin duplicados (EQ-12);
  - `SEDE_EXISTENTE` también con mayúsculas y espacios;
  - altas concurrentes con el mismo nombre o el mismo correo: una 201 y una 409;
  - requisitos de habilitación;
  - carrera entre habilitar y suspender al único operador (6 iteraciones), sin quedar nunca una sede habilitada sin operador activo;
  - suspensión que revoca la sesión abierta, y reactivación;
  - revocación de la invitación de un pendiente;
  - reenvío que invalida el enlace anterior;
  - ámbito exacto, que refleja el cambio de cobertura y queda vacío con la sede suspendida;
  - el operador recibe 403 en las 13 rutas de organización, también de su propia sede; sin sesión o con Bearer ciudadano, 401; sin `Origin`, `FORBIDDEN_ORIGIN`; los conteos no cambian.
- **Esquema:** 6 pruebas nuevas (semillas, CHECK de tipo, trigger de rol, unicidad, verificación y habilitación, FK y RESTRICT).
- **Contrato:** cada estado documentado de las 15 operaciones nuevas se ejercita contra el OpenAPI real, incluidos 413, 415, 500 y 503. La comprobación final de «todos ejercitados y ninguno sin documentar» pasa.

## Medición de lectura y caché

`npm run organizacion:medir`, con 4 instituciones, 13 sedes, 30 operadores, 36 coberturas y 31 competencias de demostración, que el script elimina al terminar. 30 muestras seriales por operación con el adaptador Prisma real:

| Operación | p50 | p95 | Máximo |
|---|---|---|---|
| Listado de sedes (con cobertura y competencias) | 1,27 ms | 2,00 ms | 2,65 ms |
| Ámbito de un operador | 1,38 ms | 1,97 ms | 9,84 ms |

La primera lectura tardó 225,6 ms, incluida la apertura del pool. `EXPLAIN (ANALYZE, BUFFERS)` sobre SQL equivalente al del adaptador da 0,35 ms, 0,24 ms y 0,04 ms. Con este volumen el planificador elige lecturas secuenciales en todas las tablas, también en `usuarios`: no se afirma uso de índices. Los índices `coberturas_sede_distrito_id_idx` y `pertenencias_operador_sede_id_idx` existen para el enrutamiento de P4 y se medirán con el volumen de esa entrega.

**Decisión:** sin caché de aplicación. Las respuestas son `no-store` y el ámbito se lee en cada consulta, para que un cambio de cobertura o una suspensión se apliquen de inmediato. Estas cifras no son HTTP bajo carga ni parte del perfil de 2.000 VU. Artefacto: [p3/medicion-organizacion.json](p3/medicion-organizacion.json).

## Verificación visual y recorrido manual

`e2e/organizacion-visual.mjs` usa la API interceptada con datos de demostración. Comprueba en 1440, 900 y 360 px:
- que no hay desbordamiento horizontal en las tres secciones;
- axe-core en navegador real, sin reglas desactivadas: 0 violaciones;
- el alta de sede completada solo con Tab, con foco visible en cada control;
- que no hay peticiones a otros orígenes.

La referencia del origen se capturó con `Organization.jsx` real servida desde la copia aislada `.cache/p2-referencia`. Allí se añadió una ruta de arnés `/organizacion` que reutiliza su `Shell`; el donante no se modificó. Capturas en `p3/capturas/organizacion-*`; fichas en [p3/fichas-organizacion.json](p3/fichas-organizacion.json).

**Diferencias que se mantienen a propósito:**
- textos y reglas de AyniSafe: invitación sin contraseña, sin coordenadas ni distrito obligatorio, sin «Agregar institución» porque el catálogo es cerrado;
- campos con etiqueta de 16 px y controles de 48 px, como el `Campo` de P2;
- estados con texto e icono;
- secciones separadas para Operadores y Coberturas.

La comparación es visual, sin diferencia automática de píxeles.

**Recorrido manual con la API real** (`node dist/main.js`, BD aislada, correo en un archivo temporal que se borró al terminar), en 14 pasos, todos con el estado esperado:
1. administrador creado con `admin:bootstrap` y activado con el enlace del correo;
2. alta de sede y reintento con 409;
3. activación del operador por correo;
4. verificación, cobertura, competencias y habilitación;
5. login del operador y lectura de su ámbito;
6. 403 del operador en organización;
7. categorías públicas.

`admin:bootstrap --emitir-enlace` se negó a ejecutarse fuera de una terminal (`SIN_TERMINAL`), así que se usó la invitación encolada. Constancia sin tokens en [p3/recorrido-organizacion.json](p3/recorrido-organizacion.json).

## Trazabilidad

| Spec / escenario | RF / HU / EQ | Prueba o evidencia |
|---|---|---|
| Catálogo institucional cerrado | RF28; HU14 | Esquema (CHECK y tipos), integración (4 instituciones, 405, edición sin cambiar el tipo), contrato |
| Alta atómica con operador inicial | RF29; HU14; **EQ-12** | Integración con fallo inyectado en pertenencia y envío, unitarias de orden y commit, recorrido manual |
| Reintento sin duplicación y concurrencia | RF29; EQ-12 | Integración (reintento, mayúsculas, carreras de nombre y de correo) |
| Verificación separada y habilitación | RF54; HU14/HU15 | Integración (faltantes, verificar sin habilitar), esquema (CHECK), web (faltantes con texto) |
| Coberturas y competencias | RF30; HU15 | Integración (400 por catálogo, reemplazo, 409 con sede habilitada), web (guardado reflejado) |
| Operadores, suspensión e invitación | RF29/RF30; HU14 | Integración (revocación de sesión y de invitación, reactivación, reenvío) |
| Administración exclusiva | RF28/RF30; **EQ-09 organizativo** | Integración (13 rutas × operador, anónimo y Bearer), contrato, alcance |
| Ámbito del operador | RF30; EQ-09 organizativo | Integración (exacto, refleja cambios, vacío con sede suspendida), recorrido manual |
| Catálogo de categorías | RF30 (competencias) | Unitarias, esquema y contrato (cuerpo idéntico para anónimo y los tres roles) |
| Panel web | HU14/HU15 | Vitest (13), axe, capturas a 360/900/1440 px, teclado |

## Pendientes

- CI remoto de esta revisión: pendiente hasta que el responsable publique la rama. No se afirma aprobación remota.
- Proveedor de correo real y validación con instituciones: no se tocan.
- Sincronizar y archivar `organizacion-institucional` y `territorio-versionado` (CI de P3.1 aprobado en el PR #2): solo cuando el responsable lo pida.
