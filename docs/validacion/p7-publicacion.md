# P7 — Publicación y mapas

- **Fecha:** 27/11/2026.
- **Cambio:** `publicacion-mapas`, en la rama `feat/p7-publicacion`.
- **Base:** `main` en `2dbdddb`, con P6 fusionada (PR #15) y archivada (PR #16).
- **Ambiente local:** Windows 11, Node 24.21.0, PostgreSQL 18.1 (base aislada `*_test`), Flutter 3.47.7.

Este informe registra lo ejecutado. Lo que no figura como ejecutado no está validado.

## Decisiones del responsable (27/11/2026)

Registradas en el documento 11 §5, RF49 y ADR-009 antes de implementar:

1. **Teselas:** OSM estándar, configurable con `VITE_TILE_URL`/`TILE_URL`, con atribución visible, Referer o User-Agent identificable y sin precarga masiva. Su cuota no es contractual y no se midió.
2. **Generalización:** se aplica el documento 11 tal cual:
   - cuadrícula fija de 300 m, de la que se publica el centro de la celda;
   - Acoso, Violencia, Agresión y Emergencia médica nunca aparecen como punto;
   - conteos por distrito y mes, solo con al menos cinco casos.
3. **Publicación y retiro:**
   - publica el responsable de la principal;
   - retira, con motivo, cualquier operador de la principal;
   - el cierre, la corrección a NO_VERIFICADO y la vinculación retiran automáticamente;
   - el administrador no publica.
4. **Consultas:** mapa público en la app; el operador tiene un mapa operativo con puntos exactos en el panel, limitado a su ámbito.

## Implementado

| Grupo | Alcance |
|---|---|
| A. Núcleo | Detalle en las filas siguientes. |
| A · API | <ul><li>Migración `20261201100000_publicacion`.</li><li>`ServicioPublicacion` en Operaciones: publicar, retirar y retiro automático en la misma transacción que el cierre, la verificación o el vínculo.</li><li>Instantánea con solo categoría, distrito real, centro de celda, ocurrencia y vencimiento.</li><li>`GET /publico/mapa` con filtros y caché de 30 s.</li></ul> |
| A · Panel | Bloque «Publicación» en el control del caso: estado, vista previa sin datos privados, publicar y retirar. |
| A · App | Pantalla Mapa con `flutter_map`: zonas de 150 m de radio, límites, filtros de distrito, categoría y período, lista accesible, y avisos de fallo de teselas y de la API. |
| B. Mapa operativo | <ul><li>`GET /operador/mapa` con puntos exactos solo de la sede, filtros y tope de 500.</li><li>Sección «Mapa» del panel con Leaflet cargado de forma diferida, dentro de un límite de error, con lista equivalente.</li><li>La CSP solo amplía `img-src` con `https://tile.openstreetmap.org`.</li><li>Las teselas usan `referrerPolicy` `strict-origin-when-cross-origin`.</li></ul> |
| C. Reserva | <ul><li>`POST /operador/incidentes/{id}/publicacion/reserva` y reserva al publicar, con historial.</li><li>Conteos de casos sensibles y reservados por distrito y mes, con un mínimo de cinco y sin los retirados por decisión o por NO_VERIFICADO.</li><li>Acciones en el panel y texto en la app.</li></ul> |

## Verificación ejecutada (una vez, al final)

| Comprobación | Comando | Resultado |
|---|---|---|
| API Jest con cobertura | `npm run test:cobertura` (apps/api) | **83 suites, 1492 pruebas, 0 fallos.** Total: líneas 89,23 %, ramas 90,90 %, funciones 92,48 %. |
| Cobertura de P7 (líneas / ramas) | mismo informe | Ver el desglose a continuación. |
| OpenAPI | `npm run contrato:validar` | Válido (OpenAPI 3.1.0), versión 0.9.0, 63 operaciones. |
| Contrato y respuesta real | `contrato.test.ts` | Se ejercita cada estado documentado de las 5 rutas nuevas, incluido el 503. |
| Arquitectura | `npm run arquitectura:verificar` | 143 archivos, 0 infracciones. |
| Tipos | `npm run typecheck`, `npm run test:tipos` | Sin errores. |
| Web | `npx vitest run`, `npm run lint`, `npm run build`, `npm run verificar:dist` | 16 archivos y 199 pruebas aprobadas. Lint, build y dist correctos. Leaflet queda en un fragmento aparte (157 kB). |
| Flutter | `flutter test`, `flutter analyze` | 370 pruebas aprobadas; análisis sin problemas. |
| BD de desarrollo | `npm run db:migrar` (apps/api) | Migración aplicada en `ayni_safe_dev`. |

Desglose de cobertura de P7 (líneas / ramas):

- `dominio/publicacion.ts`: 100 / 100.
- `aplicacion/publicacion.ts`: 100 / 88,7.
- `prisma-publicacion.adapter.ts`: 100 / 95,2.
- `mapa.use-case.ts`: 100 / 97,6.
- `mapa.routes.ts`: 100 / 80.

**CI del PR #17:** la ejecución `46091664771` aprobó los 4 jobs: API (tipos, arquitectura, contrato y Jest con cobertura), Web, Flutter y escaneo de secretos. Revisión `9b58cf2`.

## Escenarios de calidad

| EQ | Prueba | Resultado |
|---|---|---|
| EQ-04/09 Privacidad | `publicacion.test.ts`: lista cerrada de campos públicos. La respuesta no incluye el identificador del incidente, la referencia, el código, la descripción, el teléfono, la institución ni el punto exacto. Las categorías sensibles y los casos reservados no aparecen como punto. El mapa operativo no incluye descripción, teléfono ni código. | Aprobado (BD real) |
| EQ-05 Trazabilidad | `publicacion.test.ts`: <ul><li>Publicar, retirar y reservar quedan en el historial.</li><li>Si falla el historial del retiro automático, se revierte la corrección de la verificación y la publicación sigue vigente.</li></ul> | Aprobado (BD real) |
| Vigencia | Con el reloj adelantado 7 días, la publicación desaparece sin tarea programada y no se puede volver a publicar. | Aprobado |
| Degradación | <ul><li>Web: si el mapa falla, siguen la lista y los filtros (`mapa.test.tsx`).</li><li>App: sin teselas se ven los límites y la lista; si la API falla, se ofrece reintentar (`mapa_publico_test.dart`).</li></ul> | Aprobado (dobles) |

## Ajustes a pruebas anteriores

- `esquema.test.ts`: la lista cerrada de tablas incluye `publicaciones_incidente`.
- Paneles (API y web) y navegación móvil: Mapa pasa de destino pendiente a operativo. Alertas sigue pendiente.
- `estatico.test.ts`: la CSP admite como único origen externo `https://tile.openstreetmap.org`, solo en `img-src`. Sigue prohibiendo otros orígenes, `unsafe-*` y comodines.

## Grupo E: publicación al verificar (decisión del 27/11/2026, tras la primera revisión)

El responsable pidió que los ciudadanos pudieran ver los incidentes reportados. Se le presentó el conflicto con el documento 11 §5 y RF49 y eligió **publicar al verificar**: la verificación autoriza la publicación. Los incidentes sin verificar siguen sin mostrarse.

La decisión se registró antes del código en el documento 11 §5, RF49 y las specs del cambio.

**Comportamiento:**
- **Al verificar:** marcar VERIFICADO (desde SIN_VERIFICAR o NO_VERIFICADO) publica en la misma transacción si el incidente es publicable. Si no lo es (más de 7 días o distrito pendiente), se verifica sin publicar.
- **Historial:** registra `publicar` con el valor `VERIFICACION`.
- **Repetir:** repetir VERIFICADO no republica un retiro por decisión. «Publicar» queda para republicar.
- **Al corregir:** NO_VERIFICADO retira la publicación, y volver a VERIFICADO republica.

**Cambios:**
- Textos del panel (control y diálogo de verificación, bloque «Publicación»), de la app y del OpenAPI.
- Pruebas ajustadas y una nueva prueba web del aviso al verificar.

**UI:** los filtros del mapa operativo usan el `CampoSeleccion` compartido, con la etiqueta arriba y la misma altura y foco que los demás campos del panel. Antes eran selects nativos sin estilo.

**Verificación tras el grupo E:**
- **API:** 83 suites y 1493 pruebas Jest, con 89,26 % de líneas y 90,88 % de ramas. OpenAPI válido con 63 operaciones y 0 infracciones de arquitectura.
- **Web:** 16 archivos y 200 pruebas.
- **Flutter:** la prueba del mapa aprobada y el análisis sin problemas.

## Grupo F: ubicación exacta y «Mi ubicación» (decisión del 27/11/2026, segunda revisión)

El responsable eligió, con el conflicto y el riesgo a la vista, lo siguiente:
1. **Ubicación exacta:** se muestra el punto del reporte en lugar de la zona de 300 m.
2. **Todas las categorías verificadas,** incluidas Acoso, Violencia, Agresión y Emergencia médica. Solo los casos reservados quedan fuera y cuentan en los totales.
3. **Se mantienen** la vigencia de 7 días y el filtro de período.
4. **Botón «Mi ubicación»** en la app: pide el permiso solo al pulsarlo, muestra la posición, indica la distancia a cada incidente y ordena la lista por cercanía. La distancia se calcula en el teléfono; la posición no se envía ni se guarda.

Los cambios de reglas se registraron antes de implementar en el documento 11 §5, RF49, la guía UI y las specs y el diseño del cambio (decisión 12). **Riesgo aceptado:** el punto exacto puede revelar el domicilio o la ubicación de la víctima. La mitigación es la reserva por caso; el diálogo de verificación lo recuerda.

**Cambios:**
- **Migración:** `20261201110000_publicacion_ubicacion_exacta` renombra `celda_lat/celda_lon` a `latitud/longitud`. Las filas publicadas antes conservan el centro de celda hasta que se republiquen.
- **API:** `ubicacion: {lat, lon}` sustituye a `zona` y a `radioZonaM`. Se quitan la cuadrícula y la lista de sensibles. Los conteos agregados son solo de reservados.
- **Panel:** la vista previa y los textos indican la ubicación exacta; se quita el campo `sensible`.
- **App:** marcadores en el punto, botón «Mi ubicación», distancia («a 30 m», «a 1,1 km») y orden por cercanía.

**Verificación tras el grupo F:**
- **API:** 83 suites y 1487 pruebas Jest, con 89,24 % de líneas y 90,89 % de ramas. Bajó de 1493 a 1487 porque se retiraron las pruebas de la cuadrícula. OpenAPI válido con 63 operaciones y 0 infracciones de arquitectura.
- **Web:** 200 pruebas, lint y build correctos.
- **Flutter:** 373 pruebas y análisis sin problemas. Las pruebas comprueban que al abrir no se pide la ubicación y que ninguna solicitud lleva la posición.
- **Base de desarrollo:** se migró `ayni_safe_dev`.
- **Teléfono:** `RFCW60MHE2E` conectado, con `adb reverse tcp:3000 tcp:3000` activo.

## Grupo G: detalle al tocar en el mapa móvil (27/11/2026)

Pedido del responsable: los marcadores no permitían saber qué reporte era. Se reprodujo el mapa del origen (`map_view.dart`):
- **Marcadores:** círculo del color principal con el icono de la categoría. Los incidentes del mismo punto se agrupan en un marcador con su número; al tocarlo se elige cuál ver.
- **Detalle breve:** al tocar un marcador o un elemento de la lista se abre una hoja inferior con categoría, estado, distrito, fecha y antigüedad de la ocurrencia, y la distancia si se usó «Mi ubicación».
- **Sin descripción:** el detalle no muestra la descripción del reporte, las fotos ni datos de quien reportó, porque la API pública no los expone (documento 11 §5). La hoja lo indica.

**Verificación:** Flutter con 376 pruebas aprobadas, 3 de ellas nuevas (tocar un marcador, grupo en el mismo punto y detalle desde la lista con distancia). Análisis sin problemas. Solo cambió la app.

## No verificado, sin presentarlo como hecho

- **Revisión visual renderizada:** queda para la prueba manual del responsable, en escritorio y en pantalla estrecha:
  - el Leaflet real con teselas;
  - los marcadores;
  - el bloque «Publicación»;
  - la pantalla Mapa en Android.

  En las pruebas, el lienzo Leaflet se sustituyó por un doble.
- **Proveedor de teselas:** no se midieron cuotas ni disponibilidad de OSM; su política no garantiza servicio para uso institucional.
- **Prueba en Android real:** la permanencia de la posición, el permiso de ubicación y el centrado del mapa quedan para la prueba manual.
- **Fuera de alcance:**
  - alertas preventivas (P8);
  - mapa público en la portada web;
  - edición de la cuadrícula o de las categorías sensibles;
  - medición de consultas bajo carga (P9).
