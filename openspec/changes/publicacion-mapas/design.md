# Design

## Context

- Operaciones ya es dueño del ciclo del incidente: `ServicioAtencion` bloquea la fila del incidente, cambia estado o verificación y escribe `historial_incidente` en la misma transacción (EQ-05). Su CHECK de `accion` admite hoy siete valores.
- Las coordenadas, la categoría, el distrito y el instante de ocurrencia están en `envios_incidente`, que pertenece a Reportes. Operaciones solo los lee mediante un puerto que cablea `composicion.ts`, como en el enrutamiento (`DatosEnrutamientoPort`).
- La bandeja del operador no expone coordenadas: `territorioVista` informa solo el distrito.
- La app ya usa `flutter_map` en el selector de punto, con `TILE_URL`, `userAgentPackageName` y límites dibujados si fallan las teselas. La web no tiene Leaflet.
- La CSP de `vercel.json` es `img-src 'self' data:` y `Referrer-Policy: no-referrer`.
- Consultas compone las lecturas (bandeja y seguimiento) con puertos hacia los demás módulos, sin SQL entre módulos. El verificador de arquitectura lo exige.

## Goals / Non-Goals

**Goals:**
- Una sola fuente de verdad de la publicación, escrita solo por Operaciones y retirada atómicamente con el cierre, la corrección o la vinculación.
- Lectura pública que no pueda filtrar campos restringidos aunque cambie el código del cliente: la instantánea no los contiene.
- Mapas que degradan a lista y filtros cuando falla el mapa base.

**Non-Goals:**
- Caché compartida (Redis) o CDN propio para el mapa.
- Clustering avanzado o mapas de calor.
- Cartografía propia de teselas.

## Decisions

### 1. Tabla `publicaciones_incidente` con una fila por incidente
La tabla tiene clave `incidente_id` y estos campos:
- `id_publico` (uuid aleatorio, estable entre republicaciones);
- `estado` VIGENTE o RETIRADA;
- `reservada`;
- `categoria_id` y `distrito_id`;
- `celda_lat` y `celda_lon`;
- `ocurrido_en` y `vence_en`;
- `publicada_en`, `retirada_en` y `causa_retiro` (DECISION, CIERRE, NO_VERIFICADO o DUPLICADO).

Un CHECK asegura la coherencia de estado y causa. Republicar actualiza la misma fila y conserva `vence_en`, que vale `ocurrido_en + 7 días`. El historial vive en `historial_incidente` con las acciones nuevas `publicar`, `retirar` y `reservar`; el CHECK se amplía en la migración.

*Alternativa:* una fila por publicación (histórica). Se descarta porque duplica el historial y complica la unicidad de la publicación vigente.

### 2. Instantánea en lugar de proyección al leer
Al publicar, Operaciones lee mediante `DatosPublicacionPort` la categoría, el distrito, las coordenadas y la ocurrencia, y guarda solo el centro de la celda. La lectura pública consulta únicamente esta tabla y `incidentes.estado`, sin unir `envios_incidente`. Así, un error en la lectura no puede filtrar la descripción ni el punto exacto.

*Alternativa:* generalizar al leer. Se descarta porque obliga a la lectura pública a tocar coordenadas exactas en cada solicitud.

### 3. Cuadrícula fija de 300 m
La regla es pura y vive en el dominio de Operaciones (`celdaDe`):
- `dLat = 300 / 111320`;
- `dLon = 300 / (111320 · cos(13,16°))`, con la latitud de referencia de Ayacucho fija;
- se aplica `floor` sobre el origen (0, 0) y se devuelve el centro de la celda.

Es determinista, de modo que no hay ruido aleatorio que se pueda promediar entre publicaciones. A la latitud del piloto, el error de forma por usar un coseno fijo es despreciable.

### 4. Retiro automático dentro de `ServicioAtencion`
`ServicioAtencion` recibe una dependencia opcional `publicacion.retirarSiVigente(tx, incidenteId, causa)`. La llama en `transicion` al cerrar, en `verificar` al pasar a NO_VERIFICADO y en `vincular` sobre el duplicado. Comparte transacción y bloqueo del incidente, y registra el historial con el actor de la acción.

`ServicioPublicacion` reutiliza la misma autorización que la atención: responsable activo de la principal y estado esperado. Además añade sus propios códigos de conflicto: `NO_VERIFICADO`, `FUERA_DE_VIGENCIA`, `DISTRITO_PENDIENTE` y `NO_PUBLICABLE`.

### 5. Vigencia sin tarea programada
Las lecturas filtran `estado = 'VIGENTE' AND vence_en > now()`. El vencimiento no cambia la fila, de modo que la causa CADUCADA se deduce al leer. Así se evita un *job*, que en Render suspendido no tendría hora garantizada.

### 6. Categorías sensibles y conteos
`CATEGORIAS_SENSIBLES = {acoso, violencia, agresion, emergencia-medica}` es una constante versionada del dominio de Operaciones, igual que `prioridad-categoria-v1`.

- **Puntos:** la lectura pública los excluye en SQL, junto con los reservados.
- **Conteos:** se agrupan por distrito y mes de ocurrencia en hora de Perú, para el mes actual y el anterior. Solo cuentan publicaciones sensibles o reservadas cuyo `causa_retiro` no sea DECISION ni NO_VERIFICADO. Se aplica `HAVING count(*) >= 5`.

### 7. Rutas
| Ruta | Uso | Grupo |
|---|---|---|
| `POST /operador/incidentes/{id}/publicacion` | Publicar, con `{estadoEsperado, reservada?, motivoReserva?}`. Responde 201 si es nueva y 200 si ya estaba vigente. | A |
| `POST /operador/incidentes/{id}/publicacion/retiro` | Retirar, con `{motivo}`. | A |
| `POST /operador/incidentes/{id}/publicacion/reserva` | Reservar o quitar la reserva, con `{reservada, motivo}`. | C |
| `GET /publico/mapa?distrito&categoria&periodo` | Lectura pública. `Cache-Control: public, max-age=30`. | A |
| `GET /operador/mapa?distrito&categoria&periodo` | Mapa operativo. `no-store`. | B |

Las rutas del operador aplican la misma CSRF, el mismo `sinCache` y el mismo 404 uniforme que la atención. El resumen del operador añade `publicacion: {estado, vence, reservada, causaRetiro, accionesPermitidas}`.

### 8. Mapa operativo en Consultas
`MapaOperativo` reutiliza el ámbito de la bandeja (`AmbitoBandejaPort`) y un método nuevo del puerto de participaciones con filtros y límite de 501. Pide a Reportes los `puntos(ids)` exactos y une la publicación vigente. Solo se exponen coordenadas en esta ruta autorizada, y nunca en la bandeja.

### 9. Web: Leaflet aislado
Se añaden `leaflet@1.9.4` y `react-leaflet@5.0.0`, las versiones del origen.

- **Carga:** el mapa se carga con `React.lazy` dentro de un límite de error. Si el módulo o las teselas fallan, la página conserva filtros, resumen y lista.
- **Teselas:** se configuran con `VITE_TILE_URL` y `VITE_TILE_ATTRIBUTION`. La capa usa `referrerPolicy: 'strict-origin-when-cross-origin'`, porque la política de OSM exige un Referer válido y la página envía `no-referrer`.
- **CSP:** se amplía solo `img-src` con `https://tile.openstreetmap.org`.
- **Marcadores:** `divIcon` sin atributos `style` en línea.

### 10. Móvil
`MapaPublicoPantalla` reutiliza el patrón del selector de punto:
- `TileLayer` con `errorTileCallback`, que activa un aviso;
- `PolygonLayer` de límites;
- `CircleLayer` con radio de 150 m en metros para cada celda;
- filtros con `SegmentedButton` y `DropdownMenu` del tema;
- lista debajo del mapa.

Las capas usan los componentes y tokens existentes, sin colores locales nuevos.

### 11. Proveedor de teselas
Se adopta OSM estándar como valor por defecto configurable, cumpliendo su política: atribución visible, User-Agent o Referer identificable, sin precarga masiva y respetando la caché HTTP. Se registra en ADR-009. Su cuota no es contractual: para uso institucional real se cambia la URL sin tocar código.

## Risks / Trade-offs

- **Bloqueo de la política de OSM:** OSM puede bloquear o limitar el uso. → La URL es configurable y el mapa degrada a límites y lista. La evidencia registra que no se midieron cuotas.
- **Reidentificación por la celda:** una celda de 300 m en una zona poco poblada puede reidentificar. → Las categorías sensibles nunca son puntos y existe la reserva por caso. Es el valor inicial aprobado en el documento 11.
- **Caché del navegador:** con `max-age=30`, un retiro puede seguir visible hasta 30 s en un navegador que ya tenía la respuesta. → Es aceptable y está declarado. La API nunca sirve un retirado.
- **Desfase de la ocurrencia:** la ocurrencia la declara el ciudadano y puede estar mal. → El operador decide publicar. La vigencia se calcula con la ocurrencia, como exige el documento 11.
- **Conteos de cero en el piloto:** con pocos datos, los conteos casi siempre se suprimen. → Es el comportamiento correcto y se muestra como ausencia, no como cero.

## Migration Plan

1. Migración aditiva `20261201100000_publicacion`: crea la tabla, sus índices y CHECK, y amplía el CHECK de `historial_incidente.accion`.
2. Antes de la prueba manual, aplicar la migración en `ayni_safe_dev` con `npm run db:migrar`. El despliegue debe migrar antes de arrancar esta versión.
3. Reversión: la tabla nueva puede borrarse sin afectar a otras. El CHECK del historial vuelve al de P6 solo si no existen filas con las acciones nuevas.
