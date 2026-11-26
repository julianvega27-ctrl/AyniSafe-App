# Design

## Context

Ver proposal.md para motivación y límites P3.1/P3.2. Base destino: `dbacb27797ef16958734f2f0f0bf3d762834dccb`, árbol limpio antes de esta planificación. Solo existen Identidad y Consultas; `consultas/index.ts` compone el router de contenido estático; `main.ts` crea Prisma desde infraestructura de Identidad. El esquema actual contiene usuarios, sesiones, tokens, intentos y cola de correo; no hay tablas territoriales. La API dispone de Jest, PostgreSQL aislado, comprobación de arquitectura y contrato OpenAPI.

Donante inspeccionado sin modificar: `Proyecto_incidencias_400par`, HEAD `efc1bce8c29b3c88487e36e10a324c71ae9c2029`, árbol limpio. Archivos relevantes: `apps/api/src/territory/router.js`, `scripts/extract-metropolitan-territory.js`, `scripts/load-metropolitan-territory.js`, `data/ayacucho-metropolitan.geojson`, `migrations/014_metropolitan_territory.sql` y `test/metropolitan-territory.test.js`. Su resolver depende de SQL espacial MySQL dentro del router; no es reutilizable como núcleo de AyniSafe. No se ejecutó su suite.

El GeoJSON declara INEI, `https://ide.inei.gob.pe/files/Distrito.rar`, portal 2023, obtención 2026-11-17, actualización fuente 2026-03-06 y `referenceOnly: true`. Declara UBIGEO 050101/050104/050110/050115/050116 y huellas del archivo fuente/GeoPackage. Son metadatos observados, aún sin contraste independiente en esta entrega. Documento 10 mantiene UBIGEO/polígonos pendientes: se actualizará solo al obtener evidencia. Crear este plan no verifica licencia, vigencia ni jurisdicción.

## Goals / Non-Goals

**Goals:** lectura consistente, identidad estable de distritos y versiones, importación reproducible y algoritmo puro comprobable, con dependencia de persistencia por puerto. Preparar contratos para consumir territorio desde P3.2/P4.

**Non-Goals:** alterar el contenido público existente o implementar sus consumidores gráficos. Clasificación territorial no equivale a cobertura institucional; P3.2 sigue siendo una entrega propia. El contrato de dominio no acepta un distrito declarado por el cliente como distrito calculado.

## Decisions

### 1. Propiedad en Consultas y composición

Consultas será propietario del catálogo territorial. Añadir dominio (punto/geometría/resultado), aplicación (listar, leer snapshot y resolver), puertos, presentación e infraestructura Prisma. Su fachada exportará el contrato de consulta y creación de módulo, sin exponer Prisma ni Express a capas internas. `main.ts` inyectará el cliente ya construido y los adaptadores; no se moverá el cliente de Identidad por este cambio ni se importarán internos desde Consultas. Conservar `crearModuloConsultas` y la inyección de contenido usadas por pruebas, incorporando dependencias territoriales explícitas compatibles.

Alternativas: resolver en cada cliente duplica criterios; portar routers MySQL viola capas; crear un séptimo módulo contradice la arquitectura. Los futuros escritores de incidentes guardarán la versión devuelta mediante sus contratos; P3.1 no escribe en Reportes/Operaciones.

### 2. Persistencia de snapshots inmutables en PostgreSQL

Modelos previstos:

| Modelo | Responsabilidad y restricciones |
|---|---|
| Distrito | ID documental estable DIS-01…05 y nombre canónico. No usar UBIGEO como clave primaria. |
| VersionTerritorial | ID derivado de SHA-256 de contenido normalizado, fuente y metadatos originales, fecha de importación, condición de referencia y constancia de contraste. |
| GeometriaDistrital | FK de distrito/versión, UBIGEO contrastado para esa versión, geometría JSONB y bbox calculada. Unicidad distrito/versión y UBIGEO/versión. |
| EstadoTerritorial | Fila única del ámbito piloto con FK nullable a versión activa. Bloqueo de fila para serializar activaciones. |

Migración incluye los cinco nombres acordados sin inventar UBIGEO; estado inicial sin cartografía activa. CHECK para ámbito, rangos/bbox y códigos; validación geométrica completa en el cargador. No cargar archivos grandes desde migraciones ni habilitar redes durante `prisma migrate deploy`. FKs y restricciones evitan referencias huérfanas; cada versión publicada contiene cinco geometrías validadas. Versiones no se editan ni eliminan en P3.1. JSONB evita introducir PostGIS para cinco distritos; perderíamos consultas espaciales generales, innecesarias ahora.

Leer estado activo y geometrías en una sola consulta SQL o transacción REPEATABLE READ; seleccionar primero un ID y leer sus filas inmutables también conserva snapshot. Resolver y respuesta llevan ese ID. La lectura por ID explícito no sustituye una versión ausente. Sin caché de aplicación inicial; respuestas HTTP `no-store` para evitar incoherencia de activación. Medir antes de optimizar.

Detalle de implementación observado al validar el paquete real: la serialización ORM de `Float[]` redondeó algunas latitudes de bbox en unos pocos ulps. La bbox persistida es auxiliar; al leer y comprobar identidad se deriva de la geometría JSONB exacta. No se relaja la comparación de versiones ni se cambia la tolerancia de fronteras. Se añadió regresión PostgreSQL con decimales geográficos.

### 3. Validación y clasificación

WGS84 `[longitud, latitud]`; DTO `{latitud, longitud}` para evitar intercambio accidental. Núcleo puro: descarte por bbox, detección de segmento y punto-en-anillo; exterior menos huecos; unión de componentes sin escoger por orden. Primero bordes en todos los candidatos, luego conteo de distritos interiores: borde → pendiente/frontera; más de un distrito → pendiente/solapamiento; uno → resuelto; cero → pendiente/fuera_area. No sumar varios componentes de un mismo distrito como distintos distritos.

Usar tolerancia numérica documentada de `1e-10` grados solo en pruebas de punto sobre segmento y bbox expandida coherentemente; no representa precisión GPS ni un corredor de jurisdicción. Probar ambos lados del umbral. Validar números finitos/rangos sin coerción, anillos cerrados de al menos cuatro posiciones, área no nula, auto-intersecciones, huecos contenidos y componentes válidos. Solapamientos entre distritos se informan en carga y siguen resolviéndose como ambiguos; no se corrigen desplazando límites. La elección de una biblioteca de validación, si es necesaria, se verificará contra documentación primaria antes de incorporarla; el contrato no depende de ella.

### 4. Contrato HTTP adicional

Prefijo común `/api/v1`; respuestas de error siguen `{error:{code,message,requestId}}`.

| Ruta | Comportamiento |
|---|---|
| `GET /publico/territorio/distritos` | 200 con distritos y `version` activa o null; `estado` disponible/pendiente. Códigos no contrastados siguen null. |
| `GET /publico/territorio/limites?version=…` | 200 FeatureCollection con versión/metadatos; sin parámetro usa activa; 404 versión explícita ausente; 503 sin activa. |
| `POST /publico/territorio/resolver` | JSON `{latitud,longitud,version?}`; 200 `{estado,distrito,motivo,version}`; 400 JSON mal formado; 422 valores o campos inválidos; 404 versión ausente; 503 cartografía no disponible. |

`resuelto` lleva distrito y motivo null; `pendiente` lleva distrito null y motivo `frontera`, `solapamiento` o `fuera_area`. Metadatos públicos no incluyen rutas locales. Fallo de BD → 503 genérico. Métodos no admitidos → 405 con Allow; GET admite HEAD. El resolver no admite GET. Validación rechaza claves desconocidas; no acepta selección institucional o coordenadas en query.

JSON limitado a 4 KiB (413); resolución limitada a 60 peticiones por IP/minuto por instancia (429 y Retry-After). Adaptador en memoria con reloj inyectable, claves HMAC, caducidad y máximo 10.000 claves; al saturarse rechaza nuevas claves hasta liberar ventanas. No altera limitadores de acceso ni representa límite distribuido. IP procede de la configuración existente de proxy. No guardar cuerpos/coordenadas, no query con ubicación; `Cache-Control: no-store`. Esta ruta no crea cuenta de invitado, permisos ni registros de incidentes.

### 5. Importación, procedencia y restauración

Preparar manifiesto con rutas donante/destino, SHA-256 del GeoJSON, hashes originales declarados, fuentes y condiciones de uso. Contrastar el archivo con la fuente INEI o un archivo oficial identificable y reproducible, incluyendo CRS y correspondencia de los cinco códigos. Registrar fecha y limitaciones; no llamar verificado al hash que solo declara el donante. Si no se puede contrastar, el comando permite validación/simulación y conserva el estado pendiente; la aceptación con datos reales queda abierta. Datos sintéticos solo en fixtures de tests, sin activar en desarrollo/piloto como cartografía real.

Cargador por CLI administrativa local: validar → normalizar/ordenar → calcular ID → simular o persistir → activar explícitamente. El digest incluye nombres/códigos, geometrías y metadatos de fuente relevantes; excluye fecha de importación local y fecha de descarga para que repetir la descarga no cree otra versión idéntica. Guardar bytes/hash originales aparte del digest semántico. `--dry-run` no escribe; `--activar` usa transacción y fila de estado bloqueada; repetición retorna el ID existente; colisiones de identidad con contenido diferente se rechazan. Concurrencia de dos importadores se resuelve con unicidad y relectura, no con versiones duplicadas. Restaurar selecciona otra versión existente y cambia el puntero atómicamente, dejando evidencia administrativa sin coordenadas de ciudadanos.

### 6. Pruebas y evidencia de salida

Jest unitario: polígonos, multipolígonos, huecos y bordes (incluidos vértices), auto-intersección, bbox, tolerancia, orden del catálogo, entrada inválida y digest. PostgreSQL real: migración reproducible, FK/unicidad, rollback con fallo inyectado, carga repetida/concurrente, snapshot bajo activación y restauración. HTTP real contra la app: contratos 200/400/404/405/413/422/429/503, sin sesión/diferentes roles con misma respuesta pública; confirmar ausencia de persistencia de puntos. El doble de repositorio solo prueba sustitución/errores; no acredita PostgreSQL.

Ejecutar tipos, tipos de tests, build, arquitectura, OpenAPI, Jest/cobertura y regresión de contenido/identidad. Medir planes y latencia de lectura de snapshot con el volumen real de cinco distritos, describiendo entorno y consultas. No afirmar rendimiento de incidentes ni ensayo 2.000 VU. CI conserva cobertura de la revisión publicada cuando el responsable la publique. Informe `docs/validacion/p3-territorio.md` trazará escenarios, comandos, commit/estado local y limitaciones; se crea al implementar.

## Risks / Trade-offs

- [Metadatos del donante sin contraste independiente] → activación real condicionada a evidencia reproducible; conservar pendiente, nunca inventar límites.
- [Cartografía referencial y diferencias entre fechas declaradas] → conservar cada fecha con su significado y `referenceOnly`; no prometer validez jurídica ni operación institucional.
- [Errores de topología y precisión] → validación previa y casos analíticos conocidos, sin usar centroides como única prueba de interior (pueden caer fuera).
- [Cambio simultáneo de versión] → snapshots inmutables y activación transaccional; versión devuelta obligatoria para futuros consumidores.
- [Límite por instancia] → declarar alcance local y medir; un despliegue con varias instancias necesitará otra estrategia antes de afirmar una cuota global.

## Migration Plan

1. Conservar baseline y registrar procedencia; no modificar el donante ni los archivos OpenSpec archivados.
2. Aplicar migración aditiva en PostgreSQL aislado y base vacía; comprobar que identidad/contenido siguen funcionando sin datos geográficos activos.
3. Implementar núcleo/puertos/adaptadores y contrato del mismo incremento; probar con fixtures explícitos.
4. Contrastar paquete territorial, importar en simulación y activar solo el verificado; comprobar cinco distritos y puntos de referencia contrastados.
5. Probar cambio/restauración de snapshot y documentar resultados; no borrar tablas/datos para volver al código anterior. Un rollback funcional desactiva las rutas nuevas o restaura el puntero anterior sin afectar Identidad.
6. Tras validación, P3.2 podrá referenciar IDs estables para cobertura; P4 persistirá punto/versión; P7 dibujará límites. No hay despliegue, commit ni archivo automático por este plan.
