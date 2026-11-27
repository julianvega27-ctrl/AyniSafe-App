# Tasks

Estado: implementación y validación local completadas el 26/11/2026 en `feat/p4-enrutamiento`, sobre `e0f6694` (`main`, con P4.1 fusionada en el PR #5 y archivada en el PR #6). Árbol local sin commit; PR, CI y archivado pendientes del workflow posterior.

- `proposal.md` y las specs definen el alcance; `design.md` documenta las decisiones técnicas.
- La evidencia va en `docs/validacion/p4-enrutamiento.md`. Se crea en 1.1 y se completa en cada grupo.
- Una casilla se marca solo cuando existen el código y la evidencia ejecutada. Las pruebas que consuman demasiado tiempo o intentos quedan para verificación manual del responsable, indicándolo en la evidencia.

## 1. Procedencia y límites

- [x] 1.1 Crear `docs/validacion/p4-enrutamiento.md` con:
  - la base destino;
  - el HEAD del donante `efc1bce` con árbol limpio;
  - los archivos candidatos: `incidents/report.js#newReportRecipients`, `dispatch/suggestions.js` y `admin/src/pages/Incidents.jsx`;
  - qué se adapta: la composición de la tabla de bandeja y el botón «Actualizar»;
  - qué se descarta: SQL MySQL/`ST_Intersects`, `routing_rules`, avisos dentro de la transacción, formulario telefónico, filtros de estado y roles del origen;
  - el límite con P8: avisos por usuario, lectura, contador, campana, polling y recuperación de no leídos.

  Verificar con `git status` que el donante no se modificó.

## 2. Matriz de destinatarios (dominio de Operaciones)

- [x] 2.1 Implementar `modules/operaciones/dominio/matriz.ts` con `MATRIZ_V1` (`matriz-09-v1`) y `resolverDestinatarios(categoria, heridos, atencionMedica)`, que devuelve versión, destinatarios con papel y `revisionMedicaPendiente`, con deduplicación por institución. Verificar con Jest de tabla:
  - las 16 categorías y sus principales;
  - las simultáneas de actividad sospechosa y vandalismo;
  - el accidente con las 16 combinaciones `si/no/no_se/null` de heridos × atención médica;
  - agresión, pelea y violencia con heridos `si/no/no_se/null`;
  - robo con heridos `si` sin SAMU;
  - asalto sin Serenazgo;
  - una categoría desconocida, que lanza un error;
  - que ninguna salida contiene una institución fuera de las cuatro admitidas.
- [x] 2.2 Implementar en el dominio el cálculo de faltantes (`sin_distrito` y `sin_sede_elegible`) y del resultado `ENRUTADO`/`ENRUTAMIENTO_PENDIENTE` a partir de los destinatarios y las sedes encontradas. Verificar con Jest: sin distrito, todos son faltantes; falta solo la principal; falta solo la simultánea; y nada falta.

## 3. Contratos de Identidad y Reportes

- [x] 3.1 Añadir a Identidad `sedesElegibles(institucion, distritoId, categoriaId)` y `sedeDesignable(sedeId, institucion)`, con los requisitos incumplidos, y exportarlos por `index.ts` sin rutas públicas. Verificar con integración PostgreSQL:
  - una sede que cumple aparece;
  - las sedes deshabilitadas, sin competencia, sin cobertura, de una institución inactiva o sin operador activo (pendiente o suspendido) no aparecen;
  - un cambio de cobertura se refleja sin reiniciar;
  - `sedeDesignable` acepta una sede sin cobertura y rechaza otra institución o una sede deshabilitada, listando los requisitos.
- [x] 3.2 Añadir a `LecturaEnvios` de Reportes `datosEnrutamiento(incidenteId)` (categoría, distrito, motivo territorial, heridos y atención médica) y `resumenOperativo(ids)` (descripción, ocurrencia, territorio y respuestas, sin teléfono, coordenadas, autor ni huellas). Verificar con integración la lectura correcta, que un incidente inexistente da null y la enumeración de las claves del resumen.

## 4. Esquema y consumidor de enrutamiento

- [x] 4.1 Crear la migración aditiva de `enrutamientos_incidente` y `participaciones_incidente`, con los CHECK, la UNIQUE y los índices del design, y regenerar el cliente Prisma. Verificar en `esquema.test.ts`:
  - el rechazo de un resultado, papel, origen o institución inválidos;
  - el rechazo de una designación sin motivo ni administrador;
  - la unicidad (incidente, sede);
  - que la migración no altera tablas existentes (`prisma migrate diff`).
- [x] 4.2 Implementar en Operaciones el repositorio Prisma y el consumidor `operaciones.enrutamiento` (decisiones 1 y 4 del design): lecturas por puerto, `INSERT ... ON CONFLICT DO NOTHING`, participaciones y `EnrutamientoResuelto` en la misma transacción. Cablear los puertos en `composicion.ts` y registrar el consumidor en `main.ts` y en el arnés de pruebas. Verificar con integración PostgreSQL:
  - un robo enrutado con su sede;
  - un accidente con heridos, con SAMU principal y PNP simultánea;
  - un accidente sin condición médica, sin SAMU;
  - un accidente desconocido, con revisión pendiente;
  - agresión con heridos;
  - vandalismo con dos sedes de Serenazgo;
  - un incidente sin distrito (pendiente);
  - «Otra emergencia» sin sede de Serenazgo (pendiente);
  - la entrega repetida, sin duplicar el enrutamiento, las participaciones ni el evento;
  - los eventos anteriores al registro del consumidor, enrutados al arrancar;
  - el reinicio antes de procesar (EQ-10 parcial y EQ-14);
  - un incidente inexistente, con la entrega reintentada sin enrutamiento;
  - el estado del incidente, que sigue en REGISTRADO.
- [x] 4.3 Ampliar el verificador de arquitectura y comprobar con `arquitectura:verificar` que no hay importaciones entre módulos fuera de `index.ts` ni ciclos, y que el dominio de la matriz no importa infraestructura.

## 5. Pendientes del administrador

- [x] 5.1 Implementar en Operaciones los casos de uso y las rutas (decisiones 5 y 7):
  - `GET /admin/enrutamientos-pendientes` (FIFO con cursor);
  - `POST .../{incidenteId}/designaciones` (motivo de 10 a 500 caracteres, `FOR UPDATE` y 409 `FALTANTE_INEXISTENTE`/`SEDE_NO_DESIGNABLE`);
  - `POST .../{incidenteId}/reevaluar`.

  Las tres rutas usan `autenticarInstitucional` + `exigirRol('administrador')`. Verificar con integración HTTP:
  - el orden FIFO y la paginación sin repeticiones;
  - los campos de la fila, sin descripción, teléfono, coordenadas ni respuestas;
  - un operador o un ciudadano reciben 403;
  - una designación correcta pasa el caso a ENRUTADO, con su auditoría y su evento;
  - una sede de otra institución, deshabilitada o sin operadores da 409;
  - dos designaciones concurrentes dejan una sola participación y un 409;
  - una designación sin faltante da 409;
  - la reevaluación tras añadir cobertura resuelve el caso, y sin cambios sigue pendiente sin duplicar;
  - el motivo no aparece en los logs.

## 6. Bandeja del operador y seguimiento (Consultas)

- [x] 6.1 Implementar en Operaciones `bandeja(ambito, cursor, limite)` y `participacionDe(ambito, incidenteId)` con el SQL de la decisión 6, y en Consultas las rutas `GET /operador/incidentes` y `GET /operador/incidentes/{id}` con vistas de campos cerrados y la prioridad «Sin evaluar». Verificar con integración HTTP:
  - el orden FIFO con un empate de instante;
  - la paginación de más de 50 filas;
  - la bandeja vacía;
  - la enumeración de las claves de la fila y del resumen;
  - las respuestas marcadas como informadas por el ciudadano.
- [x] 6.2 Probar EQ-09 sobre incidentes con el conjunto de accesos indebidos:
  - un PNP pide por URL directa un caso de Bomberos (404 idéntico al inexistente y al malformado);
  - un cursor alterado;
  - una cobertura retirada (el caso desaparece y el resumen da 404);
  - una participación designada fuera de cobertura (visible);
  - un pendiente sin participación en su distrito (no visible);
  - un operador suspendido o de sede deshabilitada (401/403);
  - un administrador o un ciudadano (403).

  Registrar en la evidencia cada caso con su resultado y sin datos sensibles. El cambio de ámbito tras una reclasificación queda para P6.
- [x] 6.3 Ampliar el seguimiento (decisión 8) con el puerto `responsables(ids)` y el DTO `{estado:'asignada', institucion}` en el detalle del autor y en la vista del invitado. Verificar con integración:
  - sin enrutamiento, queda pendiente;
  - con la principal participando, aparece su tipo y nombre;
  - con la principal faltante y apoyos presentes, queda pendiente;
  - la enumeración de las claves del invitado no incluye la sede, los operadores ni la descripción.

## 7. Contrato OpenAPI

- [x] 7.1 Documentar en `openapi.yaml`:
  - las cinco rutas nuevas, con sus 200, 201/204, 400, 401, 403, 404, 409 y 503;
  - el esquema de faltantes;
  - el DTO de institución responsable ampliado.

  Verificar con `contrato.test.ts` (cada estado contra el OpenAPI desreferenciado) y `validar-contrato`.

## 8. Panel web

- [x] 8.1 Marcar como disponibles `incidentes` (operador) e `inicio` (administrador) en `paneles.ts` y actualizar las pruebas del shell. Verificar que el panel del administrador muestra Inicio con solo el bloque de pendientes y el del operador muestra Incidentes operativa, y que el resto de secciones siguen no disponibles.
- [x] 8.2 Implementar la sección «Incidentes» del operador (bandeja, «Cargar más», «Actualizar» y resumen en `/panel/incidentes/:id`). Reproducir la tabla y el `page-intro` de `Incidents.jsx` con los componentes y tokens existentes, sin el formulario telefónico ni los filtros. Verificar con las pruebas web:
  - el orden recibido sin reordenar;
  - las etiquetas con texto e icono;
  - los estados vacío, carga, error con «Reintentar», 401 y 403;
  - un 404 en el resumen, mostrado como «Incidente no disponible»;
  - la ausencia de consultas periódicas.
- [x] 8.3 Implementar el bloque «Enrutamiento pendiente» en el Inicio del administrador: lista, diálogo de designación con selector de sede habilitada de la institución faltante y motivo, y acción «Reevaluar». Verificar con las pruebas web el envío único, el 409 explicado sin éxito simulado, el estado sin pendientes y el resto de Inicio como no disponible.
- [x] 8.4 Verificar la UI renderizada con la API local:
  - capturas de escritorio y de pantalla estrecha de la bandeja, el resumen y los pendientes;
  - recorrido con teclado y foco visible;
  - texto al 200 % sin desplazamiento horizontal;
  - comparación de la composición con la captura del origen.

  Guardar las capturas en `docs/validacion/p4/` y declarar en la evidencia qué se verificó.

## 9. Seguimiento móvil

- [x] 9.1 Mostrar en el detalle de Mis reportes y en la vista del invitado de Flutter la institución responsable recibida, con texto e icono, o «Pendiente de asignación». Tratar un estado desconocido como pendiente. Verificar con `flutter test`: pendiente, asignada, estado desconocido y que no se presenta como recibido.

## 10. Documentación y validación integrada

- [x] 10.1 Actualizar `docs/05-diseno-ui/guia-ui.md` con la bandeja del operador, el resumen y el bloque de pendientes del administrador, y con lo que sigue pendiente para P6 y P8. Verificar que no contradice DESIGN.md ni el documento 09.
- [x] 10.2 Ejecutar la validación local completa y registrar los resultados con su ambiente en la evidencia: Jest con cobertura de la API, el verificador de arquitectura, el contrato, las pruebas web, `flutter test` y `flutter analyze`.
- [x] 10.3 Recorrido integrado: con la API, la BD y la web locales, registrar desde Flutter (o con la API) un accidente con heridos. Comprobar que aparece en la bandeja del operador SAMU como principal y del de PNP como simultánea, que el seguimiento muestra SAMU y que un incidente sin sede aparece en los pendientes y se resuelve designando. Registrar los pasos y su resultado.
- [x] 10.4 Completar en la evidencia la matriz spec/escenario → RF32/33/35/47/48/55/57 → HU07/20/21/26 → EQ-09 y EQ-19 (completos) y EQ-10 y EQ-21 (parciales) → prueba → resultado. Indicar lo pendiente: avisos por usuario y polling (P8), la actualización positiva de la condición médica (P5/P6), la reclasificación, la sede coordinadora y la sustitución de PNP por Serenazgo (P6) y la administración de reglas y del apoyo local.

## Workflow follow-up

- Abrir el PR de `feat/p4-enrutamiento` cuando el responsable lo pida, y registrar el CI en la evidencia.
- Sincronizar las specs y archivar el cambio tras la fusión, en un PR de documentación aparte, como en P4.1.
