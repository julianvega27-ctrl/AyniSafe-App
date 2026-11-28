# Tasks

Grupos verticales por prioridad. Durante la implementación solo se ejecutan las suites afectadas. La suite completa con cobertura, OpenAPI y arquitectura se ejecuta una vez, al final (grupo Z). Lo que no se complete de B o C queda como pendiente explícito en `docs/validacion/p7-publicacion.md`.

## 0. Reglas de negocio antes de implementar
- [x] 0.1 Documento 11 §5, RF49 y ADR-009: registrar las decisiones del 27/11/2026:
  - quién publica y quién retira;
  - retiro automático al cerrar, al pasar a NO_VERIFICADO y al vincular;
  - cuadrícula fija de 300 m;
  - conteos sin retirados por decisión;
  - proveedor OSM configurable con su política;
  - mapa operativo con puntos exactos para el operador.

  Actualizar también la guía UI (Mapa en la app y en el panel).

## A. Núcleo obligatorio: publicación controlada

### A1. Persistencia y dominio
- [x] A1.1 Migración `20261201100000_publicacion` (tabla, CHECK, índices, CHECK del historial ampliado) y `schema.prisma`.
- [x] A1.2 Dominio `operaciones/dominio/publicacion.ts`:
  - `celdaDe`, `CATEGORIAS_SENSIBLES`, vencimiento y elegibilidad;
  - acciones de publicación permitidas;
  - validación de cuerpos y errores tipados.
- [x] A1.3 Pruebas unitarias del dominio:
  - celda determinista y en el mismo centro;
  - límites de celda;
  - elegibilidad por cada causa;
  - acciones por papel;
  - validación.

### A2. Casos de uso y adaptador
- [x] A2.1 `ServicioPublicacion` (publicar, retirar, vista para el operador) con los puertos `PublicacionRepositorio` y `DatosPublicacionPort`. Añadir el retiro automático en `ServicioAtencion` (cerrar, NO_VERIFICADO, vincular).
- [x] A2.2 `PrismaPublicacionAdapter`, el puerto de datos en Reportes (`datosPublicacion`) y el cableado en `composicion.ts`.
- [x] A2.3 Pruebas de integración contra PostgreSQL:
  - publicar, repetir sin duplicar y cada 409;
  - 403 para un apoyo o para quien no es responsable;
  - retiro manual con motivo y retiro automático en las tres causas;
  - la republicación conserva el vencimiento;
  - historial atómico y reversión.

### A3. API y contrato
- [x] A3.1 Rutas `POST /operador/incidentes/{id}/publicacion` y `/publicacion/retiro`; bloque `publicacion` en el resumen de la bandeja.
- [x] A3.2 `MapaPublico` en Consultas y `GET /publico/mapa` con filtros, vigencia, exclusión de sensibles y caché de 30 s.
- [x] A3.3 OpenAPI: rutas, esquemas y ejemplos.
- [x] A3.4 Pruebas HTTP y de contrato:
  - 400/401/403/404/409/422/503 y CSRF;
  - lista cerrada de campos públicos;
  - ninguna referencia, coordenada, descripción, teléfono ni dato sanitario en la respuesta pública (EQ-04/09);
  - vencido y retirado fuera.

### A4. Clientes
- [x] A4.1 Web: bloque «Publicación» en el control del caso (estado, vista previa, publicar, retirar con motivo, errores 409).
- [x] A4.2 Pruebas web afectadas.
- [x] A4.3 Flutter: repositorio público del mapa y `MapaPublicoPantalla`:
  - teselas configurables con atribución;
  - límites y zonas de 150 m;
  - filtros de distrito, categoría y período;
  - lista accesible;
  - avisos de fallo de teselas, límites y API.
- [x] A4.4 Flutter: Mapa deja de ser destino pendiente (con y sin sesión). Pruebas de widget: vacío, filtros, fallo de teselas y de la API, semántica.

## B. Si alcanza: mapa operativo web
- [x] B1 API: puerto de participaciones con filtros, `puntos(ids)` en Reportes, `MapaOperativo` y `GET /operador/mapa` con límite de 500 y truncado; OpenAPI; pruebas de ámbito, 403 de otros roles, filtros y truncado.
- [x] B2 Web: dependencias `leaflet`/`react-leaflet`, sección Mapa del operador cargada de forma diferida con límite de error, filtros, resumen, leyenda, lista equivalente y enlace al detalle. CSP `img-src` y `referrerPolicy` de teselas. Sección marcada disponible en el panel del operador.
- [x] B3 Pruebas web: render con datos, filtros, fallo del componente de mapa con la lista disponible, error de la API con reintento.

## C. Si alcanza: reserva y conteos agregados
- [x] C1 Reserva por caso: `POST /operador/incidentes/{id}/publicacion/reserva` y reserva al publicar, con historial; exclusión de puntos públicos.
- [x] C2 Conteos por distrito y mes con mínimo de cinco en `GET /publico/mapa`; pruebas con 4 y 5 elementos y sin los retirados por decisión.
- [x] C3 Clientes: «Reservar/Quitar reserva» en el panel y conteos como texto en la app.

## E. Publicación al verificar (decisión del responsable, 27/11/2026)
- [x] E1 Documento 11 §5, RF49 y specs: la verificación autoriza la publicación.
- [x] E2 API: publicar en la transacción de la verificación (`VERIFICADO`), con historial y sin republicar retiros por decisión; pruebas de integración y contrato.
- [x] E3 Panel: textos de verificación y del bloque «Publicación»; pruebas.
- [x] E4 Filtros del mapa operativo con `CampoSeleccion` (ajuste de UI tras la revisión).

## Z. Cierre
- [x] Z1 Suite completa con cobertura, validación OpenAPI y verificador de arquitectura, una vez.
- [ ] Z2 Migrar `ayni_safe_dev` (`npm run db:migrar`) y comprobar `adb reverse tcp:3000` en el teléfono.
- [x] Z3 Evidencia breve en `docs/validacion/p7-publicacion.md` y estado P7 en `docs/comparacion-proyecto-incidencias.md`.
- [ ] Z4 Recorrido en Android real y en el panel (manual, responsable del proyecto).
- [ ] Z5 Commits por capa, push, PR y CI; tras la fusión, sincronizar specs y archivar.
