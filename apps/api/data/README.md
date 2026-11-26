# Catálogo territorial P3.1

`ayacucho-metropolitano.geojson` reproduce los bytes del recurso de `Proyecto_incidencias_400par` en `efc1bce8c29b3c88487e36e10a324c71ae9c2029`. Fuente INEI, portal versión 2023; cartografía referencial, sin valor de delimitación legal ni de cobertura institucional. Ver `docs/validacion/p3/contraste-inei.json` y `recursos.json` desde la raíz del repositorio. No es una lista de instituciones operativas.

Desde `apps/api`:

```sh
npm run territorio -- validar
npm run territorio -- importar --dry-run
npm run territorio -- importar --activar
npm run territorio -- activar <sha256-de-version-previa>
```

Las dos primeras acciones no conectan a BD ni escriben. `importar` sin `--activar` conserva un snapshot sin cambiar el activo. Las escrituras usan `DATABASE_URL` de la configuración existente y no ejecutan migraciones automáticamente. Aplicar primero `npm run db:migrar` contra la base prevista. No usar bases compartidas para ensayos destructivos.

Solo los bytes del paquete contrastado se admiten para importación por la CLI. Otro archivo válido permite simulación; requiere un nuevo contraste documentado y una actualización de la constancia antes de importarlo. No se aceptan banderas para declarar un paquete verificado por cuenta propia. La huella semántica ordena distritos y excluye fecha/huella de la descarga local, conservando los originales en metadatos. Repetir no duplica versión. Activar/restaurar solo cambia el puntero, no borra historia.

Las geometrías sintéticas viven en `test/fixtures/territorio.ts`, se identifican como fixtures y se cargan exclusivamente en la base aislada de tests. Nunca representan límites reales.

Para reproducir el contraste: descargar `https://ide.inei.gob.pe/files/Distrito.rar`, extraer `DISTRITO.gpkg`, verificar SHA-256 contra el manifiesto, leer `gpkg_geometry_columns.srs_id` (4326) y extraer los cinco UBIGEO de `DISTRITO`. El extractor candidato y su procedencia constan en el informe. El portal ofrece descarga gratuita; no se identificó una licencia específica en su página. Se conserva atribución, advertencia referencial y fechas de fuente/descarga por separado.
