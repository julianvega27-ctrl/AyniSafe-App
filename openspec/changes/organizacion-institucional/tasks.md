# Tasks

Estado: planificación creada el 25/11/2026 sobre `0f2366a`. Implementación y validación local completadas el 25/11/2026 sobre b2a15f4; CI remoto pendiente de publicación. Proposal y specs definen alcance; design documenta decisiones técnicas. Evidencia en `docs/validacion/p3-organizacion.md`, que se crea en 1.1 y se completa en cada grupo. Las casillas se marcan solo con código y evidencia ejecutada.

## 1. Procedencia y catálogo de categorías (Reportes)

- [x] 1.1 Registrar en `docs/validacion/p3-organizacion.md` la base destino, el HEAD del donante `efc1bce8`, su árbol limpio y los archivos candidatos (`institutions/*`, `Organization.jsx`), con lo que se adapta y lo que se descarta (roles extra, contraseña, polígonos, recursos). Verificar que el donante no se modificó.
- [x] 1.2 Crear el módulo `reportes` con dominio (16 categorías e IDs estables del spec), aplicación, puerto de catálogo, adaptador Prisma, router `GET/HEAD /publico/categorias` con 405/Allow y fachada `index.ts`. Verificar con Jest unitario (catálogo exacto, IDs, orden) y con `arquitectura:verificar` sin infracciones.
- [x] 1.3 Añadir la tabla `categorias` y su semilla a la migración, y el endpoint a OpenAPI. Verificar con integración PostgreSQL (16 filas tras migrar una base vacía), contrato con cuerpo idéntico para anónimo y los tres roles, y `contrato:validar`.

## 2. Modelo de organización y migración

- [x] 2.1 Ampliar la migración aditiva con `instituciones` (4 semillas, CHECK de tipo), `sedes`, `pertenencias_operador` (trigger de rol operador), `coberturas_sede` y `competencias_sede`, con FK sin cascada, UNIQUE, CHECK de verificación e índices del design. Verificar en `esquema.test.ts` (tablas, índices, rechazo de tipo municipalidad, pertenencia de ciudadano rechazada, borrado de categoría referenciada rechazado) y la regresión de Identidad/territorio.
- [x] 2.2 Definir el dominio de organización (institución, sede, estado de verificación, requisitos de habilitación, ámbito y errores) y la validación estricta de entradas. Verificar con Jest unitario: campos desconocidos, longitudes, correo normalizado, cálculo de requisitos faltantes y ámbito vacío.

## 3. Casos de uso y persistencia transaccional

- [x] 3.1 Implementar los puertos `OrganizacionPort`, `CatalogoDistritosPort` y `CatalogoCategoriasPort`, y el caso de uso `CrearSedeConOperador` que invoca `InvitarCuentaUseCase` dentro de la transacción y despierta el gestor tras el commit. Verificar con Jest y dobles: orden de pasos, no despertar si se revierte, y traducción de `SedeExistente`/`CorreoEnUso`.
- [x] 3.2 Implementar `PrismaOrganizacionAdapter` para el alta atómica. Verificar en PostgreSQL aislado: alta correcta (sede deshabilitada, cuenta pendiente y un envío); fallo inyectado por trigger temporal en pertenencia y en envío sin filas residuales (EQ-12); reintento → 409 sin duplicados; dos altas concurrentes con el mismo nombre/correo → una 201 y una 409.
- [x] 3.3 Implementar edición de institución, datos y verificación de sede, coberturas y competencias por reemplazo, y habilitar/deshabilitar con bloqueo de sede. Verificar en PostgreSQL: distrito o categoría inexistente → 400 sin cambios; requisitos faltantes listados; vaciar cobertura de una sede habilitada → 409; carrera entre habilitar y suspender al último operador sin dejar una sede habilitada sin operador activo.
- [x] 3.4 Implementar operadores adicionales, suspensión/reactivación con `revocarTodasDe` y reenvío de invitación. Verificar en PostgreSQL: sesión revocada → 401; último operador de sede habilitada → 409; reactivar conserva la contraseña; reenvío a pendiente → 202 sin duplicar el envío activo; reenvío a activo → 409.
- [x] 3.5 Implementar `ConsultarAmbitoOperador` y exportarlo por la fachada de Identidad. Verificar con integración: ámbito propio exacto, vacío para operador suspendido o sede suspendida, y cambio de cobertura reflejado en la siguiente lectura. Ejecutar `arquitectura:verificar` (Identidad no importa internos de Consultas ni Reportes) y documentar la composición en `main.ts`.

## 4. REST, OpenAPI y paneles

- [x] 4.1 Añadir las rutas `/administrador/organizacion/*` y `GET /operador/ambito` según el design, con autenticación institucional, rol, origen web en mutaciones y `no-store`, y documentarlas en OpenAPI en el mismo incremento. Verificar en `contrato.test.ts` cada estado documentado (200/201/202/400/401/403/404/409/503) contra el OpenAPI desreferenciado; operador → 403 en todas las rutas de organización; token ciudadano → 401; mutación sin origen → rechazo vigente.
- [x] 4.2 Marcar disponibles `instituciones-sedes`, `operadores` y `coberturas` en `paneles.ts`. Verificar las pruebas del panel con el escenario MODIFIED y que ninguna ruta pública ni de otro rol crea operadores o administradores (inspección del contrato publicado).
- [x] 4.3 Medir con datos representativos (4 instituciones, 13 sedes de demostración, 30 operadores) la consulta de ámbito y el listado de sedes: EXPLAIN (ANALYZE, BUFFERS), latencia p50/p95 serial y entorno, en `docs/validacion/p3/`. Documentar la decisión sin caché y sus límites, sin atribuirlo a carga 2.000 VU.

## 5. Panel web del administrador

- [x] 5.1 Añadir al cliente API funciones tipadas de organización, categorías y distritos con traducción de errores. Verificar con `cliente.test.ts`: 401 → acceso, 403, 409 con `faltantes` y resultado incierto ante fallo de red.
- [x] 5.2 Implementar «Instituciones y sedes» con el alta de sede y el operador inicial, reproduciendo `Organization.jsx` con los componentes y tokens de P2, sin campo de contraseña. Verificar con Vitest/Testing Library: estado vacío, alta correcta, 409 conservando datos y estados con texto; y a11y con axe.
- [x] 5.3 Implementar «Operadores» (listado por sede, agregar, reenviar, suspender, reactivar) y «Coberturas» (distritos, categorías, habilitación con faltantes). Verificar con Vitest: suspensión rechazada visible, reenvío sin mostrar token y guardado reflejado tras la respuesta.
- [x] 5.4 Ejecutar en la web lint, tipos, build, Vitest y la captura `e2e/panel-visual.mjs` en escritorio y 360 px contra la referencia del donante. Registrar en el informe teclado, foco, ausencia de desbordamiento y diferencias visuales observadas, sin declarar fidelidad no comprobada.

## 6. Aceptación integrada

- [x] 6.1 Ejecutar en la API typecheck, `test:tipos`, build, `arquitectura:verificar`, `contrato:validar` y `test:cobertura` sobre una BD aislada `_test`. Guardar el resumen de cobertura en `docs/validacion/p3/` y registrar comandos, versiones, resultados y fallos encontrados, sin reutilizar resultados de P3.1.
- [x] 6.2 Completar en el informe la matriz spec/escenario → RF28/29/30/54 → HU14/HU15 → EQ-12/EQ-09 organizativo → prueba → resultado. Indicar que EQ-09 sobre incidentes, la reasignación entre sedes, la auditoría consultable y la entrega real de correo quedan pendientes.
- [x] 6.3 Ejecutar `openspec validate organizacion-institucional --strict`, `git diff --check` y el escaneo de secretos. Recorrer manualmente el alta → activación del operador por el enlace del adaptador de archivo → login del operador → `GET /operador/ambito`, y registrar el resultado. Si el responsable publica la revisión, enlazar el CI; si no, dejarlo como pendiente.

## Workflow follow-up

- Antes de aplicar, registrar en commit esta especificación (`docs(openspec): especificar organizacion-institucional`), separada de la implementación.
- Registrar en `territorio-versionado` (tarea 5.4 e informe P3.1) el CI aprobado del PR #2 sobre `0f2366a`, y archivarlo solo cuando el responsable lo pida.
- Tras aceptar esta capacidad, sincronizar y archivar solo por solicitud explícita. Después continúa P4 (registro de incidentes), que consume el catálogo de categorías, el territorio y el ámbito del operador.
