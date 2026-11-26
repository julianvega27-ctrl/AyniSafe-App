# Spec Delta

## Purpose

Ofrecer un catálogo territorial común y trazable para los cinco distritos del piloto y resolver puntos de incidentes sin inventar jurisdicciones ni confundir ubicación con permisos de atención.

## ADDED Requirements

### Requirement: Catálogo distrital estable del piloto
El sistema MUST mantener los identificadores DIS-01 Ayacucho, DIS-02 San Juan Bautista, DIS-03 Carmen Alto, DIS-04 Jesús Nazareno y DIS-05 Andrés Avelino Cáceres Dorregaray. MUST distinguir identificador interno de UBIGEO y no publicar un UBIGEO como verificado sin respaldo de la fuente. El catálogo MUST ser público, independiente de sesión y no incluir sedes, cuentas ni incidentes.

#### Scenario: Catálogo antes de cargar cartografía
- **WHEN** se consulta el catálogo sin versión geométrica activa
- **THEN** se reciben los cinco distritos, versión nula y estado territorial pendiente, sin polígonos ni códigos inventados

#### Scenario: Lectura independiente de identidad
- **WHEN** se consulta con o sin sesión
- **THEN** se obtiene el mismo catálogo sin información privada ni ampliación de permisos

### Requirement: Procedencia y publicación de límites
Cada versión territorial MUST identificar fuente, fecha de obtención, versión declarada por el proveedor, huellas de archivos y condición de referencia. MUST distinguir cartografía referencial de delimitación legal. Una versión activa MUST contener exactamente los cinco distritos con códigos contrastados. MUST NOT sustituir límites por puntos municipales o teselas ni activar paquetes incompletos, códigos duplicados o procedencia no contrastada.

#### Scenario: Lectura de límites activos
- **WHEN** se solicita la cartografía con una versión activa
- **THEN** se recibe una FeatureCollection con cinco distritos, identificadores, códigos, geometrías, cajas envolventes y metadatos de esa única versión

#### Scenario: Paquete inválido o sin procedencia comprobada
- **WHEN** se intenta activar un paquete incompleto, inválido o no contrastado
- **THEN** se rechaza la activación y permanece disponible la versión anterior

#### Scenario: Cartografía no disponible
- **WHEN** se solicitan límites sin versión activa
- **THEN** se informa indisponibilidad territorial sin devolver geometrías simuladas como reales

### Requirement: Geometrías válidas
Las geometrías MUST ser Polygon o MultiPolygon en WGS84 con coordenadas longitud/latitud, anillos cerrados y cajas envolventes coherentes. La activación MUST rechazar geometrías degeneradas o inválidas, incluyendo auto-intersecciones y huecos no contenidos.

#### Scenario: Geometría inválida
- **WHEN** se carga un anillo abierto, auto-intersectado, de área nula o con un hueco fuera de su exterior
- **THEN** se rechaza el paquete sin alterar la versión activa

### Requirement: Resolución determinista de punto del incidente
El backend MUST validar latitud/longitud finitas en rangos [-90,90]/[-180,180]. MUST resolver solo interiores inequívocos, respetar huecos/componentes y devolver distrito y versión evaluada. Frontera, solapamiento o ausencia de interior MUST conservar distrito pendiente con motivo. MUST NOT elegir por orden, sede más cercana o ubicación del reportante. Ambos clientes y el contrato interno MUST obtener igual clasificación para el mismo punto y versión.

#### Scenario: Interior inequívoco
- **WHEN** el punto cae en el interior de un único distrito sin tocar ningún borde
- **THEN** se devuelve estado resuelto, ese distrito y la versión territorial evaluada

#### Scenario: Frontera o superposición
- **WHEN** el punto toca un borde o pertenece al interior de más de un distrito
- **THEN** el distrito queda nulo con motivo frontera o solapamiento respectivamente y versión evaluada, sin decisión por orden del catálogo

#### Scenario: Hueco o punto exterior
- **WHEN** el punto está dentro de un hueco sin pertenecer a otro distrito o fuera de los cinco distritos
- **THEN** se devuelve distrito nulo, estado pendiente, motivo fuera de área y versión evaluada

#### Scenario: Coordenadas ausentes o inválidas
- **WHEN** falta una coordenada o se envía texto, nulo, un arreglo, un valor no finito o fuera de rango
- **THEN** se rechaza la solicitud por validación sin calcular ni guardar un punto sustituto

#### Scenario: Resolución sin cartografía activa
- **WHEN** se intenta resolver un punto válido sin versión activa
- **THEN** se informa indisponibilidad territorial, diferenciada de un punto fuera del área

### Requirement: Cambio atómico y conservación de versiones
La carga MUST ofrecer simulación sin escrituras, repetición idempotente del contenido normalizado y activación transaccional completa. Cada lectura/resolución MUST usar un único snapshot sin mezclar límites/metadatos. Versiones previas MUST permanecer consultables por ID; una versión inexistente MUST informarse sin sustituirla por la activa. MUST poder restaurarse una versión anterior sin borrar historial.

#### Scenario: Repetición y simulación
- **WHEN** se simula un paquete o se vuelve a cargar el mismo contenido normalizado
- **THEN** la simulación no escribe y la repetición no crea otra versión ni duplica distritos

#### Scenario: Fallo durante carga o activación
- **WHEN** falla una operación antes del commit
- **THEN** no queda un paquete parcial ni cambia la versión activa

#### Scenario: Activación concurrente con lectura
- **WHEN** se activa otra versión mientras se leen límites o se resuelve un punto
- **THEN** cada respuesta corresponde por completo a una sola versión identificada

#### Scenario: Reproducción y restauración
- **WHEN** se consulta una versión anterior o se restaura como activa
- **THEN** sus límites y resultados conservan su identidad sin modificar las versiones existentes

### Requirement: Consulta geográfica sin efectos privados
Las consultas territoriales MUST NOT registrar incidentes, crear identidades, asignar sedes ni conceder competencias. La resolución MUST recibir las coordenadas en el cuerpo y MUST NOT incluirlas en URL, logs o cachés públicas. El acceso público MUST tener límites de tamaño e intentos documentados y respuestas de error sin detalles de infraestructura. Los endpoints MUST documentar entradas, salidas, errores y versiones en OpenAPI.

#### Scenario: Privacidad de una resolución pública
- **WHEN** una persona resuelve un punto sin sesión
- **THEN** recibe únicamente el resultado territorial con caché deshabilitada, sin persistir el punto ni obtener acceso a incidentes del distrito

#### Scenario: Exceso de tamaño o frecuencia
- **WHEN** una solicitud excede los límites documentados
- **THEN** se rechaza con el error correspondiente sin ejecutar la clasificación ni revelar datos privados
