# P3.1 — Territorio versionado

Fecha: 25/11/2026. Cambio `territorio-versionado`, base destino `dbacb27797ef16958734f2f0f0bf3d762834dccb`. Antes de aplicar solo había artefactos locales no versionados de este cambio; no se eliminan ni se presentan como commit. Implementación y validación local completadas; CI remoto pendiente de publicación. No se hizo commit, despliegue, sincronización ni archivo de este cambio.

## Procedencia

Donante leído sin modificaciones: `../Proyecto_incidencias_400par`, HEAD `efc1bce8c29b3c88487e36e10a324c71ae9c2029`, árbol limpio comprobado el 25/11/2026. Candidatos: `apps/api/data/ayacucho-metropolitan.geojson`, `scripts/extract-metropolitan-territory.js`, `scripts/load-metropolitan-territory.js`, `src/territory/router.js`, `test/metropolitan-territory.test.js`. Se adapta comportamiento; no se ejecutan migraciones MySQL ni se adopta su runner como Jest.

El manifiesto `p3/recursos.json` separa huellas leídas de metadatos declarados por el donante. Se descargó [Distrito.rar del INEI](https://ide.inei.gob.pe/files/Distrito.rar), se extrajo `DISTRITO.gpkg` con tar y se contrastaron los cinco features con el extractor leído del donante (sin ejecutar su entrada de escritura). RAR y GeoPackage coinciden con sus hashes declarados; los cinco features coinciden exactamente. El GeoPackage declara MULTIPOLYGON EPSG:4326. Evidencia: `p3/contraste-inei.json`.

El [portal INEI](https://ide.inei.gob.pe/) permite descarga vectorial y describe acceso gratuito; no se encontró una licencia específica en esa página. Se conserva atribución y uso referencial, sin atribuir vigencia jurídica. Portal declara actualización 2023; `gpkg_contents.last_change` declara 2026-03-06; descarga del donante 2026-11-17 y nuevo contraste 2026-11-25 son fechas distintas. El RAR/GPKG grande queda en `.cache/p3-fuente` y no se versiona. El GeoJSON de cinco distritos conserva los bytes del donante.

`apps/api/data/.gitattributes` desactiva la conversión de fin de línea para GeoJSON: la huella de bytes contrastados debe mantenerse también al clonar en Windows con autocrlf. Se comprobó el atributo `text: unset` y la huella local contra la constancia.

## Alcance y límites

RF31 y componente territorial RF54, HU03/HU05/HU15, EQ-11 solo backend. RF07 aún requiere formulario/GPS y registro en P4; mapas web/móvil corresponden a P7. P3.2 conserva RF28/29/30, EQ-09/12 y creación atómica de sede/operador. No hay sedes activadas, atención institucional, reporte ciudadano, carga 2.000 VU ni resultados de CI por esta aplicación local.

## Núcleo y comandos

`npm run test:unidad -- --runTestsByPath test/unidad/territorio.test.ts`: 28/28 aprobadas; paquete real, fixtures sintéticos, validación topológica, interior/borde/hueco/multipolígono, tolerancia, orden y solapamientos, errores y sustitución de repositorio. `npm run test:tipos` aprobado. `npm run arquitectura:verificar`: 75 archivos, cero infracciones/destinos computados en esta revisión parcial.

Contrato interno exportado por fachada de Consultas: `ConsultarTerritorio`, `TerritorioRepositorio`, `SnapshotTerritorial`, `ResultadoTerritorial`, `Distrito`. DTO punto `{latitud,longitud,version?}` sin coerción; geometría WGS84 `[longitud,latitud]`. La tolerancia de borde `1e-10` grados es numérica, no precisión GPS. Cada resultado fija versión; ausencia de activa y versión inexistente se distinguen de `fuera_area`.

CLI y procedencia: `apps/api/data/README.md`. La primera ejecución de tsx en el sandbox falló en `os.userInfo` de Windows (ENOMEM); se reintentó fuera de ese aislamiento. La validación Jest del paquete real tardó unos 61 s: no es una medición de latencia de resolución HTTP. No hay PostGIS ni nuevo proveedor cartográfico.

CLI `validar` e `importar --dry-run` aprobados, sin escrituras, cinco distritos contrastados y sin solapamientos de interiores detectados. Versión semántica: `5cb61fbee9a0e8b24fc33c3ddc346864479b9b01d685901c36dafca130fe8067`. Pruebas unitarias de CLI y limitador: 2/2, incluyendo fixture no importable, opciones inválidas, saturación y vencimiento. Digest estable ante orden/fecha de obtención; el adaptador vuelve a comprobar identidad semántica antes de escribir.

## Persistencia y REST

Clúster aislado creado para este incremento en `.cache/p3-postgres`, PostgreSQL 18, loopback puerto 55433, base `ayni_p3_test`. No se reutilizó ni modificó `.pgdata` anterior. Todas las migraciones aplicadas desde base vacía; cada suite integrada recrea únicamente el esquema de la base con sufijo `_test`, conforme al arnés existente.

`test/integracion/territorio.test.ts`: inicialmente 5/5 aprobadas, ampliadas a 7/7 en la revisión final. Comprueba carga repetida/concurrente, restauración y versiones previas, activación/lectura concurrente, restricciones/inmutabilidad, decimales y rollback real con trigger temporal antes de commit. Los triggers de fallo solo existen durante esa prueba en la BD aislada. Usa fixtures sintéticos; la importación del catálogo real se registra abajo por separado.

`test/integracion/contrato.test.ts`: 8/8 aprobadas. Se amplió la matriz existente sin retirar sus aserciones: todos los estados documentados se ejercitan y se validan contra OpenAPI desreferenciado real. Nuevas rutas `/publico/territorio/distritos`, `/limites`, `/resolver`; estados 200/400/404/413/415/422/429/503, HEAD y 405/Allow comprobados, cuerpos iguales para anónimo y los tres roles autenticados. Cuota mediante IP de proxy confiable, cuerpo de 4 KiB y `no-store`; consulta no cambia cuentas/sesiones ni persiste puntos. Fallo de repositorio conserva error genérico. Validación `contrato:validar` aprobada: OpenAPI 3.1, versión de API 0.5.0.

Sin caché de aplicación. El estado activo apunta a versiones inmutables; cada respuesta selecciona ID y lee las geometrías de ese ID sin mezclar versiones. Las versiones son aditivas y no se borran al restaurar; no se modifica el contrato de sesiones ni contenido público (que conserva su caché breve).

## Regresión y trazabilidad

La primera suite completa con cobertura dio 496 aprobadas y un fallo entre 497 pruebas: `esquema.test.ts` enumeraba exclusivamente las cinco tablas anteriores. Se amplió su aserción exacta a las nueve tablas y se añadieron los índices territoriales esperados; se conservaron sus comprobaciones de roles, DNI, teléfono, integridad y restricciones de Identidad. Se añadió también una prueba de CHECK de geometría/bbox que completa las cinco filas de una versión: sin esa restricción la transacción pasaría, por lo que el fallo no puede atribuirse solo a la completitud diferida.

La validación del paquete en Jest pasó de unos 61 s a unos 4,2 s tras capturar referencias nativas de Math fuera de los bucles: las búsquedas globales repetidas en la VM dominaban ese ensayo. No se cambiaron algoritmo, tolerancia ni aserciones, y se repitieron las 28 pruebas. Estos tiempos de prueba no son métricas de la API.

| Spec / escenario | RF / HU / EQ | Prueba o evidencia |
|---|---|---|
| Catálogo estable, sin activa, público | RF31/54; HU03/05/15 | `territorio.test.ts` unitario e integración; catálogo de cinco IDs con UBIGEO nulo antes de activar |
| Procedencia y límites | RF31/54; HU15 | `p3/contraste-inei.json`, `p3/recursos.json`, prueba del paquete real y CLI `validar`/`--dry-run` |
| Geometrías válidas | RF31; EQ-11 backend | Unitarias de topología y paquete; CHECK y completitud en PostgreSQL |
| Interior, hueco, frontera, solapamiento, exterior, entrada inválida | RF07/31 parcial; HU03; EQ-11 backend | Núcleo puro y contrato REST; cartografía real se registra en medición separada |
| Repetición, rollback, activación concurrente y restauración | RF31; integridad de versiones | Integración PostgreSQL con fixtures, incluyendo fallo real antes del commit |
| Privacidad, versiones/errores y cuota | RF31; HU03/05/15 | Contrato HTTP real/OpenAPI; cuerpo y cuota; mismos DTO públicos con los tres roles |

La integración no acredita el formulario GPS/manual, mapas, asignación territorial de operadores ni atención real. P3.2 debe implementar las asociaciones/coberturas de RF28/29/30 y validar EQ-09/12; territorio no sustituye esos permisos. CI de este diff local pendiente; no se publicó ni se archivó el cambio.

## Paquete real y medición local

Después de una suite de 498/498 aprobadas, la repetición de importación real detectó una diferencia de unos pocos ulps en latitudes de la bbox leída como Float[] por el ORM. Los fixtures iniciales usaban enteros. La geometría JSONB se conservaba exactamente: se corrigió la lectura/comparación para derivar de ella la bbox, sin tolerancias nuevas ni relajación de identidad. Se añadió una prueba PostgreSQL con decimales de la fuente; la suite territorial resultante pasó 7/7 y la suite completa final 499/499. El fallo de repetición real se conserva aquí como resultado negativo detectado y corregido.

`npm run territorio -- importar --activar` se ejecutó dos veces contra `ayni_p3_test`: primero `existente:false`, después `existente:true`, ambas con la misma versión y `activa:true`. No se importó en la base de desarrollo anterior ni en un alojamiento compartido. Estos ensayos se realizaron entre ejecuciones de la suite; la suite recrea la base aislada y puede eliminar esa activación de prueba.

`npm run territorio:medir -- ../../docs/validacion/p3/medicion-local.json` aprobado, cinco puntos comprobados. El archivo conserva coordenadas de referencia, resultado esperado/obtenido, fuente y oráculo. Se seleccionaron puntos contra los contornos INEI usando `point <@ polygon` nativo de PostgreSQL, independiente del algoritmo TS evaluado. Es el mismo contorno de fuente, no una comprobación topográfica ni una fuente jurídica adicional.

Entorno: Windows x64, Node 24.21.0, PostgreSQL 18.1, Prisma 7.10.1, Intel i7-14650HX, loopback, concurrencia 1. Volumen: cinco geometrías, 85.096 bytes almacenados según `pg_column_size`. Primera lectura 166,38 ms (incluye apertura del pool, no arranque del servicio). Después, 30 muestras seriales por operación:

| Operación | p50 | p95 | Máximo |
|---|---|---|---|
| Snapshot con lectura de BD | 4,61 ms | 9,75 ms | 9,92 ms |
| Resolución incluyendo lectura de BD | 4,53 ms | 6,52 ms | 9,42 ms |

No comparar esos pequeños conjuntos como mejora entre operaciones. Páginas calientes, sin caché de aplicación; no son cifras de incidentes, HTTP bajo carga ni 2.000 VU. Se mantienen `no-store` y lectura directa para este catálogo pequeño; las mediciones no justifican añadir caché compartida ahora ni demuestran capacidad con mayor volumen. El artefacto incluye consultas y EXPLAIN (ANALYZE, BUFFERS) después de ANALYZE, con planes reales, buffers e índices elegidos; no se fuerza el uso de un índice por su existencia.

Los EXPLAIN corresponden a tres consultas SQL representativas de puntero, versión y geometrías/distritos, emitidas por el script, no a una captura del SQL generado por Prisma. El optimizador eligió Seq Scan para las tablas de una fila; para las cinco geometrías, ordenación sobre join con lecturas secuenciales (0,083 ms de ejecución del plan observado). Las latencias de la tabla anterior sí ejecutan el adaptador Prisma real completo, incluyendo deserialización y cálculo de bbox. No se afirma uso de índices ni mejora antes/después por estas mediciones.

## Validación final de la revisión local

| Comprobación | Resultado ejecutado |
|---|---|
| `npm run typecheck`, `test:tipos`, `build` | Aprobados |
| Tipos de `scripts/territorio.ts` y `scripts/medir-territorio.ts` con tsc estricto | Aprobados |
| `npm run arquitectura:verificar` | 75 archivos, cero infracciones y destinos computados |
| `npm run contrato:validar` | OpenAPI 3.1 válido, 19 operaciones documentadas |
| `TEST_DATABASE_URL=…/ayni_p3_test npm run test:cobertura` | 34 suites, **499/499**, 124,945 s |
| Cobertura de líneas / sentencias | **85,42 %**, 5.047/5.908 |
| Cobertura de ramas / funciones | **90,35 %** (1.536/1.700) / **92,50 %** (321/347) |
| OpenSpec `validate territorio-versionado --strict` | Válido |
| `git diff --check` y comprobación de nuevos archivos | Sin errores de espacios; se respeta normalización CRLF de Git en Windows |
| Escaneo de secretos, incluidos archivos nuevos | Cero hallazgos; no se imprimen valores |

Resumen procesable conservado en [p3/cobertura-summary.json](p3/cobertura-summary.json). HTML/LCOV local en `apps/api/coverage/`; log completo no versionado en `.cache/p3-cobertura-final.log`. CI existente conserva cobertura al publicar, pero no se ejecutó remotamente para esta revisión. La suite final incluye la corrección de bbox y la ampliación de restricciones. No se reutilizaron resultados P1/P2 como si fueran ejecuciones nuevas.

Para reproducir en este entorno Windows, iniciar el clúster temporal con `pg_ctl -D .cache/p3-postgres -o "-p 55433 -c listen_addresses=127.0.0.1" -l .cache/p3-postgres/servidor.log start` desde la raíz. En `apps/api`, configurar `TEST_DATABASE_URL` a la base aislada `ayni_p3_test`; la suite rechaza nombres sin sufijo `_test`. Configurar `DATABASE_URL` a esa misma base solo para la CLI/medición, importar el paquete contrastado y usar los comandos de `data/README.md`. No sobrescribir el `.env` existente. El ejemplo de asignación de variable mostrado arriba es notación de entorno, no sintaxis PowerShell; en PowerShell usar `$env:TEST_DATABASE_URL = '<URL-local-de-pruebas>'`.

No se modificaron clientes ni se repitieron Flutter/web como evidencia de esta capacidad de backend. Siguiente incremento: P3.2, con instituciones/sedes/coberturas, alta atómica del operador inicial e invitación, autorización por ámbito y sus pruebas. La dirección visual P2 y los tres roles se conservan.

El clúster temporal se detuvo limpiamente al terminar. Sus archivos permanecen en `.cache` para reproducibilidad local; no se cambió la configuración ni se migró la base anterior de desarrollo.
