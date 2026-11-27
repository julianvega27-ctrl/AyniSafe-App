# Tasks

Base de planificación: `main` `24a33f6` (26/11/2026), con P4.1 y P4.2 archivados.

- `proposal.md` y las specs definen el alcance; `design.md` documenta las decisiones técnicas.
- La evidencia va en `docs/validacion/p5-evaluacion.md`. Se crea en 1.1 y se completa en cada grupo.
- Una casilla se marca solo cuando existen el código y la evidencia ejecutada. Las pruebas que consuman demasiado tiempo o intentos quedan para verificación manual del responsable, indicándolo en la evidencia.

## 1. Procedencia y límites

- [x] 1.1 Crear `docs/validacion/p5-evaluacion.md` con:
  - la base destino;
  - el HEAD del donante `efc1bce` con árbol limpio;
  - los archivos candidatos: `apps/api/migrations/012_medical_triage.sql`, `apps/mobile/lib/screens/report.dart#triageBlock` y `apps/admin/src/IncidentTriage.jsx`;
  - qué se adapta: la tarjeta y el subtítulo del bloque móvil, y la composición `kv` del panel;
  - qué se descarta: los booleanos con «No sé» como null, el desplegable y el campo numérico de afectados, el subtipo y las columnas en la tabla del incidente;
  - la interpretación de propiedad de la decisión 1 del design, para revisión del responsable;
  - la decisión del 26/11/2026 sobre heridos en emergencia médica.

  Verificar con `git status` que el donante no se modificó.
- [x] 1.2 Anotar en el documento 09 (evaluación rápida) la decisión del 26/11/2026: «¿Hay heridos?» se pregunta también en Emergencia médica sin cambiar su principal. Verificar que el texto no contradice RF41–RF44 ni la matriz §4.

## 2. Dominio de la evaluación (Reportes)

- [x] 2.1 Implementar `modules/reportes/dominio/evaluacion.ts` (decisión 3 del design): tipos cerrados, `samuRequerido`, `validarEvaluacionEnvio` y `aplicarCambios` con la semántica parcial, la coherencia de la cantidad, los campos por institución y el resultado «sin cambios». Verificar con Jest de tabla:
  - la persona principal parcial;
  - una ficha adicional o un campo de nombre (rechazados);
  - heridos `si` sin cantidad, que queda `no_se`;
  - una cantidad con heridos `no`, `no_se` o null (rechazada);
  - los límites 0, 1, 999 y 1000;
  - las observaciones no aplicables (accidente sin condición médica);
  - la emergencia médica con heridos `no` y observaciones;
  - el cambio a heridos `no`, que elimina la cantidad y la lista como modificada;
  - un operador no SAMU con observaciones (rechazado);
  - la aclaración idéntica, que no produce cambios;
  - las observaciones admitidas tras una corrección negativa cuando `samu_requerido` ya era verdadero.
- [x] 2.2 Añadir una prueba de tabla que compare `samuRequerido` con `resolverDestinatarios` de la matriz para las 16 categorías × respuestas `si/no/no_se/null`. Verificar que coinciden en todos los casos en que SAMU participa.
- [x] 2.3 Ampliar `dominio/envio.ts`:
  - `emergencia-medica` admite heridos;
  - el campo `evaluacion` se valida con 2.1;
  - `contenidoCanonico` añade la evaluación solo si viene en el cuerpo.

  Verificar con Jest:
  - emergencia médica con heridos y con atención médica (esta última rechazada);
  - la huella de un envío sin evaluación, idéntica a la fijada en una prueba con el valor de P4;
  - dos evaluaciones distintas que producen huellas distintas.

## 3. Esquema

- [x] 3.1 Crear la migración `20261128100000_evaluacion_rapida` (decisión 2): `evaluaciones_incidente`, `versiones_evaluacion`, `accesos_evaluacion`, `cambios_enrutamiento`, el CHECK ampliado de `origen`, `actualizado_en` en las participaciones y la carga inicial idempotente. Regenerar el cliente Prisma. Verificar en `esquema-evaluacion.test.ts`:
  - el rechazo de valores fuera de catálogo, una cantidad fuera de 1–999 o sin heridos `si`, una versión de operador sin institución o sin motivo y una versión duplicada;
  - la carga inicial con versiones 1 solo para las cinco categorías y `samu_requerido` según la regla;
  - que ejecutar la carga dos veces no duplica nada;
  - `prisma migrate deploy` desde cero y desde el esquema de P4;
  - `prisma migrate diff`, que confirma que no se alteran otras tablas.

## 4. Registro con evaluación y aclaración del autor (Reportes)

- [x] 4.1 Implementar el repositorio Prisma de evaluación y escribir la versión 1 en la transacción de `RegistrarIncidenteUseCase`. Verificar con integración:
  - una agresión con heridos `si` sin evaluación, que queda en versión 1 con cantidad `no_se`;
  - una emergencia médica con observaciones;
  - un robo, sin evaluación;
  - un fallo inyectado al escribir la versión, que no deja incidente ni consume la clave (503);
  - un reintento con la misma clave y otra evaluación (409);
  - un reintento sin evaluación de un envío previo (200, mismo comprobante);
  - el comprobante, sin datos de la evaluación.
- [x] 4.2 Implementar `AclararEvaluacion` (decisión 5): bloqueo de la cabecera, versión, cabecera vigente, `EvaluacionActualizada` y llamada a `CondicionMedicaPort` en la misma transacción. Exponerlo por `index.ts`. Verificar con integración (con un doble del puerto solo en este paso; la integración real se prueba en 5.3):
  - el historial de versiones 1, 2 y 3 con origen, institución y campos modificados;
  - la aclaración idéntica, sin versión ni evento;
  - dos aclaraciones concurrentes sobre campos distintos, que crean versiones consecutivas y conservan ambos cambios;
  - la carga del evento, que solo contiene incidente, versión y origen;
  - un fallo del puerto, que revierte la versión.
- [x] 4.3 Añadir la ruta `POST /ciudadano/incidentes/{referencia}/evaluacion` (sesión de cuenta, no-store, logs sin cuerpo). Verificar con integración HTTP:
  - el autor completa la evaluación (200 con sus respuestas);
  - un incidente ajeno, de invitado o inexistente da el mismo 404;
  - un incidente sin evaluación da 404;
  - un incidente cerrado (preparado en la BD de prueba) da 409;
  - un invitado o una cookie institucional no tienen acceso;
  - el cuerpo inválido da 400 por campo;
  - el motivo y las respuestas no aparecen en los logs.

## 5. Enrutamiento con la condición vigente (Operaciones)

- [x] 5.1 Hacer que el consumidor lea la condición con `condicionBloqueada(tx, id)` y replanifique si cambió (decisión 5). Verificar con integración:
  - una aclaración confirmada antes de la entrega da un enrutamiento con SAMU principal;
  - una entrega repetida no duplica nada;
  - un incidente sin evaluación (robo) se enruta igual que en P4;
  - las pruebas de `enrutamiento.test.ts` de P4.2 siguen aprobadas.
- [x] 5.2 Implementar `aplicarCondicionMedica` (decisión 4), con su auditoría en `cambios_enrutamiento` y `EnrutamientoResuelto{origen: condicion_medica}`. Cablear `CondicionMedicaPort` en `composicion.ts`. Verificar con integración:
  - un accidente con revisión pendiente y heridos `si` pasa a SAMU principal y PNP simultánea, con la revisión resuelta;
  - una agresión con heridos `si` añade SAMU como condicionada;
  - sin sede SAMU elegible, queda `ENRUTAMIENTO_PENDIENTE` con el faltante y PNP conservado;
  - un incidente sin distrito queda con faltante `sin_distrito`;
  - una corrección negativa con SAMU principal no retira ni rebaja a nadie;
  - `no`/`no` sobre una revisión pendiente la cierra sin SAMU;
  - un recálculo sin efecto no escribe auditoría ni evento;
  - hay una sola principal tras cada caso;
  - la auditoría no contiene respuestas ni motivos.
- [x] 5.3 Prueba de concurrencia: aclaraciones simultáneas con la entrega de enrutamiento pendiente y con una designación del administrador en curso. Verificar que no hay bloqueo mutuo (tiempo límite de la prueba), que el resultado final es coherente con la última versión y que la secuencia de versiones no tiene huecos. Si la prueba consume demasiado tiempo o intentos, dejar la verificación manual indicada en la evidencia.
- [x] 5.4 Añadir `POST /operador/incidentes/{id}/evaluacion` en Operaciones (decisión 6): ámbito, participación con institución, motivo, campos por institución y CSRF por origen. Verificar con integración HTTP:
  - un operador PNP precisa heridos `si` (200 con `samuIncorporado` verdadero);
  - un operador SAMU registra observaciones;
  - un PNP que envía observaciones recibe 400;
  - un motivo corto o un campo extra dan 400;
  - un operador sin participación o fuera de ámbito recibe 404 uniforme;
  - un administrador o un ciudadano reciben 403;
  - sin origen web, 403;
  - un incidente cerrado da 409;
  - un reintento idéntico no crea otra versión.
- [x] 5.5 Comprobar con `arquitectura:verificar` que no hay importaciones entre módulos fuera de `index.ts`, ni ciclos, y que los dominios de evaluación y matriz no importan infraestructura.

## 6. Lecturas sanitarias (Consultas)

- [x] 6.1 Ampliar el resumen del operador con `condicionMedica` y `accesoSanitario`, y `participacionDe` con la institución. Verificar con integración:
  - la enumeración de claves del resumen para PNP y para SAMU, sin observaciones ni motivos;
  - la respuesta original conservada junto a la condición precisada con su origen e institución;
  - la fila de bandeja sin la revisión pendiente y con el papel actualizado tras el recálculo.
- [x] 6.2 Implementar `GET /operador/incidentes/{id}/evaluacion` y `detalleSanitario` en Reportes, con su registro en `accesos_evaluacion`. Verificar con integración HTTP:
  - un operador SAMU participante recibe la vigente y el historial, con la evaluación pendiente marcada cuando corresponde;
  - el acceso queda registrado sin contenido;
  - un PNP participante, un SAMU sin participación o fuera de ámbito, un inexistente, un malformado y un incidente sin evaluación reciben el mismo 404 y no generan registro;
  - un administrador o un ciudadano reciben 403.
- [x] 6.3 Ampliar el detalle del autor con `evaluacion` (respuestas propias, `informadaEn`, `puedeAclarar` y `solicitudCompletar`). Verificar con integración:
  - SAMU incorporado por un operador pide completar sin mostrar la precisión ni el motivo;
  - un incidente cerrado no permite aclarar;
  - la vista del invitado con código no contiene claves de evaluación;
  - el seguimiento muestra SAMU como responsable tras el cambio de principal.
- [x] 6.4 EQ-04 (parte sanitaria) y EQ-13: ejecutar el conjunto de accesos indebidos y de exclusiones (bandeja, invitado, pendientes del administrador, eventos y logs capturados) sobre un incidente con varios heridos y observaciones parciales. Registrar en la evidencia cada caso con su resultado y el porcentaje de rechazos, sin datos sensibles.

## 7. Contrato OpenAPI

- [x] 7.1 Documentar en `openapi.yaml`:
  - el objeto `evaluacion` y los heridos de emergencia médica en `POST /incidentes`;
  - las ampliaciones de `GET /ciudadano/incidentes/{referencia}` y `GET /operador/incidentes/{id}`;
  - las tres rutas nuevas con sus estados 200/400/401/403/404/409/503 y la cabecera no-store.

  Verificar con `contrato.test.ts` (cada estado contra el OpenAPI desreferenciado) y `validar-contrato`.

## 8. App móvil

- [x] 8.1 Extraer `_Pregunta` a un componente compartido y crear `bloque_evaluacion.dart` (decisión 7), con el selector de cantidad sin teclado. Verificar con `flutter test`:
  - ninguna opción preseleccionada;
  - «No sé» distinto de «No»;
  - «Otra cantidad» empieza en 6, con − deshabilitado en 6 y + hasta 999;
  - no se abre el teclado;
  - semántica de los botones para el lector de pantalla.
- [x] 8.2 Integrar el bloque en el formulario y el controlador: emergencia médica con heridos, `samuInterviene` con la misma tabla que 2.2 y el estado conservado al ocultar el bloque. Verificar con `flutter test`:
  - una pelea con heridos Sí muestra el bloque;
  - cambiar a No lo oculta sin enviarlo y volver a Sí lo recupera;
  - una emergencia médica sin responder se envía sin bloquearse;
  - el cuerpo enviado incluye solo los campos aplicables;
  - el reintento con resultado incierto conserva la evaluación y la misma clave.
- [x] 8.3 Implementar en Mis reportes la evaluación propia, el aviso «Completar evaluación» y `AclararEvaluacionPantalla`, que envía solo los cambios. Verificar con `flutter test`:
  - solicitud de completar;
  - respuestas con «Informado el» y «Sin respuesta»;
  - envío único con los campos cambiados y el detalle recargado;
  - error de red que conserva lo marcado;
  - 404 y sesión vencida con la política vigente;
  - incidente cerrado sin la acción;
  - consulta con código sin evaluación.
- [x] 8.4 Verificar en el emulador Android con la API local:
  - el envío de una pelea con heridos y una evaluación parcial;
  - la aclaración desde Mis reportes;
  - capturas del formulario y del detalle al 100 % y al 200 % de texto;
  - el recorrido con TalkBack o, si no es posible en el emulador, su indicación para verificación manual.

  Guardar las capturas en `docs/validacion/p5/`.

## 9. Panel web

- [x] 9.1 Crear o reutilizar el grupo de opciones compartido con los tokens de DESIGN.md e implementar en el resumen el bloque «Condición médica» y el diálogo «Precisar condición médica». Verificar con las pruebas web:
  - la respuesta original y la condición vigente se ven por separado;
  - el motivo se valida antes de enviar;
  - se envía una sola solicitud con los campos cambiados;
  - se informa «SAMU fue incorporado»;
  - el 409 y el 404 se explican sin simular un éxito;
  - la operación con teclado y la opción marcada anunciada.
- [x] 9.2 Implementar la sección «Evaluación rápida» del operador SAMU (vigente, historial como `<ol>` y «Registrar aclaración»), condicionada a `accesoSanitario`. Verificar con las pruebas web:
  - el operador SAMU ve la sección y la acción;
  - el PNP no ve la sección ni hace la solicitud;
  - un fallo o un 404 de la evaluación muestra «no disponible» sin ocultar el resumen;
  - las respuestas sin respuesta se muestran como tales.
- [x] 9.3 Verificar la UI renderizada con la API local:
  - capturas de escritorio y de pantalla estrecha del resumen PNP, del resumen SAMU y del diálogo;
  - teclado y foco visible;
  - texto al 200 % sin desplazamiento horizontal;
  - comparación de la composición con `IncidentTriage.jsx` del origen.

  Guardar las capturas en `docs/validacion/p5/` y declarar qué se verificó.

## 10. Documentación y validación integrada

- [x] 10.1 Actualizar `docs/05-diseno-ui/guia-ui.md` con el bloque de evaluación móvil, la aclaración en Mis reportes, la precisión de la condición y la vista SAMU, y retirar de «Pendiente para P5/P6» lo implementado. Verificar que no contradice DESIGN.md ni el documento 09.
- [x] 10.2 Ejecutar la validación local completa y registrar los resultados con su ambiente en la evidencia: Jest con cobertura de la API, el verificador de arquitectura, el contrato, las pruebas web, `flutter test` y `flutter analyze`.
- [x] 10.3 Recorrido integrado con la API, la BD, la web y el emulador locales:
  1. Registrar desde Flutter un accidente con heridos «No sé».
  2. Comprobar que llega a PNP con la revisión pendiente.
  3. El operador PNP precisa heridos Sí con un motivo.
  4. Comprobar que SAMU aparece como principal en su bandeja y PNP como simultánea.
  5. El autor ve SAMU como responsable y la solicitud de completar.
  6. El autor completa la evaluación.
  7. El operador SAMU ve las tres versiones y registra una aclaración.
  8. El operador PNP sigue sin ver las observaciones.

  Registrar los pasos y su resultado.
- [x] 10.4 Completar en la evidencia la matriz spec/escenario → RF40–RF44/RF57 → HU23/HU24 → EQ-13 (completo), EQ-04 (parte sanitaria) y EQ-21 (cambio de principal; permisos de cierre en P6) → prueba → resultado. Indicar lo pendiente:
  - evidencias (P5.2);
  - retirar o rebajar a SAMU, incorporarlo por reclasificación, permisos de cierre y «Asumir caso» (P6);
  - avisos (P8);
  - conservación a 30 días (P9);
  - validación clínica de las preguntas.

## Workflow follow-up

- Abrir el PR de implementación desde una rama `feat/p5-evaluacion` y registrar su CI en la evidencia.
- Tras la aceptación del responsable, sincronizar las specs y archivar el cambio en una rama documental, como en P4.
