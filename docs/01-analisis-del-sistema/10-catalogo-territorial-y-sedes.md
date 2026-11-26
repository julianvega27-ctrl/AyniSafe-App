# 10. Catálogo territorial y sedes del piloto

Fecha: 19 de noviembre de 2026. Catálogo documental aportado por el usuario y contrastado parcialmente con fuentes oficiales. **No es una lista de sedes operativas integradas en AyniSafe.** Crear registros no acredita participación, disponibilidad ni jurisdicción.

## 1. Cinco distritos acordados

| ID interno | Distrito | Municipalidad de referencia |
|---|---|---|
| DIS-01 | Ayacucho | Municipalidad Provincial de Huamanga. |
| DIS-02 | San Juan Bautista | Municipalidad Distrital de San Juan Bautista. |
| DIS-03 | Carmen Alto | Municipalidad Distrital de Carmen Alto. |
| DIS-04 | Jesús Nazareno | Municipalidad Distrital de Jesús Nazareno. |
| DIS-05 | Andrés Avelino Cáceres Dorregaray | Municipalidad Distrital de Andrés Avelino Cáceres Dorregaray. |

La municipalidad es una entidad administrativa; no es el nombre de un distrito. Huamanga identifica la provincia y su municipalidad provincial; para este filtro se utiliza el distrito **Ayacucho**. Se normaliza el nombre completo de Andrés Avelino Cáceres Dorregaray. El [directorio territorial del MEF](https://www.mef.gob.pe/es/?Itemid=102844&id=8342&lang=es-ES&language=es-ES&option=com_content&view=article) recoge esas denominaciones en Huamanga. La selección de los cinco distritos procede de la decisión del usuario, no de esa fuente cartográfica.

Los ID internos no son códigos UBIGEO. El 25/11/2026 se contrastó el paquete distrital del portal INEI: DIS-01 = 050101, DIS-02 = 050110, DIS-03 = 050104, DIS-04 = 050115 y DIS-05 = 050116. Los cinco MultiPolygon del donante coinciden con el GeoPackage descargado, EPSG:4326. Es cartografía de referencia, no delimitación legal ni cobertura institucional. Fuente, huellas y condiciones observadas: [contraste P3.1](../validacion/p3/contraste-inei.json). Su importación/activación y pruebas se registran por separado en el [informe P3.1](../validacion/p3-territorio.md). No dibujar fronteras inventadas ni usar la ubicación de una municipalidad como límite distrital.

## 2. Referencia municipal, sin quinta institución

**REF-MUN-01 — Municipalidad Provincial de Huamanga, Sede Central**, distrito Ayacucho; dirección referida: Portal Constitución n.º 44. El [portal municipal](https://www.gob.pe/munihuamanga/?p=5679204) respalda esa referencia en su resultado indexado. El enlace original aportado con el parámetro `p=5686212` no pudo recuperarse directamente en esta revisión.

Es un registro de referencia administrativa, **no una sede receptora de emergencias por sí misma**. La base de Serenazgo de Huamanga se verifica por separado. Municipios pueden figurar como entidad de adscripción de una sede de Serenazgo; el tipo institucional del operador sigue siendo Serenazgo. Solo existen PNP, Bomberos, SAMU y Serenazgo como instituciones de atención.

## 3. Trece sedes candidatas de atención

Se conservan los números originales de la tabla del usuario para trazabilidad, sin inventar las filas 12 y 13 omitidas. Todas las sedes comienzan deshabilitadas para atención real, aunque exista respaldo documental de su nombre. Distrito de ubicación y distritos de cobertura son campos distintos.

| ID | N.º original | Institución | Nombre para el catálogo | Distrito de ubicación | Respaldo y pendientes |
|---|---|---|---|---|---|
| SED-01 | 2 | Serenazgo | Base de Serenazgo de Huamanga | Ayacucho, propuesto | Confirmar denominación, local, dirección, contacto y cobertura. No asumir que funciona en la sede central municipal. |
| SED-02 | 3 | Serenazgo | Base de Serenazgo de San Juan Bautista | San Juan Bautista, propuesto | Confirmar local operativo, dirección, contacto y cobertura. |
| SED-03 | 4 | Serenazgo | Base de Serenazgo de Carmen Alto | Carmen Alto, propuesto | Confirmar local operativo, dirección, contacto y cobertura. |
| SED-04 | 5 | Serenazgo | Base de Serenazgo de Jesús Nazareno | Jesús Nazareno, propuesto | Confirmar local operativo, dirección, contacto y cobertura. |
| SED-05 | 6 | Serenazgo | Base de Serenazgo de Andrés Avelino Cáceres Dorregaray | Andrés Avelino Cáceres Dorregaray, propuesto | Confirmar local operativo, dirección, contacto y cobertura. |
| SED-06 | 7 | PNP | Comisaría PNP Ayacucho «A» | Ayacucho, declarado | Usuario refiere Jr. 28 de Julio n.º 325 en [directorio PNP](https://cdn.www.gob.pe/uploads/document/file/7917060/6664125-prontuario-telefonico-de-las-comisarias-de-la-regpol-ayacucho.pdf). El PDF devolvió 403 en esta revisión; dirección y operación actual no se dan por verificadas aquí. |
| SED-07 | 8 | PNP | Comisaría PNP San Juan Bautista «A» | San Juan Bautista | La [resolución municipal 364-2024](https://www.gob.pe/institucion/munisanjuanbautista-ayacucho/normas-legales/6573936-364-2024-mdsjb-a) refiere la creación de la comisaría tipo A en Ciudad de las Américas, sector II. Falta dirección y funcionamiento actuales. |
| SED-08 | 9 | PNP | Comisaría PNP Carmen Alto «B» | Carmen Alto, declarado | Usuario refiere Av. Los Libertadores s/n en el mismo directorio PNP, no recuperado aquí. Verificar local actual y cobertura. |
| SED-09 | 10 | PNP | Comisaría Jesús Nazareno — denominación propuesta | Pendiente | No asignar distrito, coordenadas ni operación por semejanza del nombre. Falta respaldo de la sede concreta. |
| SED-10 | 11 | PNP | Comisaría PNP Andrés Avelino Cáceres | Andrés Avelino Cáceres Dorregaray, declarado | Una [noticia específica del Mininter](https://www.gob.pe/institucion/mininter/noticias/877997-mininter-y-gobierno-regional-de-ayacucho-firman-convenio-para-mejorar-infraestructura-y-equipamiento-de-bases-policiales) menciona una comisaría de ese nombre en Huamanga; su resultado indexado no verifica el local ni su operación actuales. La página genérica de noticias aportada no identifica por sí sola una sede. |
| SED-11 | 14 | Bomberos | Compañía de Bomberos Ayacucho n.º 63 | Ayacucho, histórico | El [inventario CGBVP de 2009](https://www.bomberosperu.gob.pe/gobierno/pdf/dilog-22.pdf), página 52 del PDF, registra dos predios asociados a Ayacucho n.º 63. No adoptar uno como cuartel actual sin confirmación. |
| SED-12 | 15 | Bomberos | Compañía de Bomberos Salvador San Juan n.º 222 — numeración por confirmar | San Juan Bautista, declarado | El usuario propone n.º 222. El resultado indexado del [acuerdo 048-2018](https://www.gob.pe/institucion/munisanjuanbautista-ayacucho/normas-legales/6267818-048-2018-mdsjb-ayac) menciona «Sub Estación de Bomberos N° 63 - Salvador San Juan», por lo que no basta para verificar el número actual. Confirmar denominación, número, local y operación. |
| SED-13 | 16 | SAMU | SAMU Ayacucho | Ayacucho, declarado | Usuario refiere Av. Independencia n.º 355 desde un [documento sanitario de 2022](https://cdn.www.gob.pe/uploads/document/file/3801163/CS.Vacunacion_regiones_nov22.pdf.pdf). Devolvió 403 aquí; además, un registro de vacunación no acredita por sí solo una base de despacho actual. |

## 4. Alta segura del catálogo

Cada sede conserva nombre propuesto/verificado, fuente y fecha de contraste, dirección/coordenadas verificadas cuando existan, distrito de ubicación, coberturas explícitas, competencias, contacto operativo, estado de participación y operadores habilitados. Separar estados de verificación documental de `activaParaAtencion`.

Para activar atención real: confirmar sede y canal de contacto, autorización de los operadores, distritos/categorías que atiende y disponibilidad operativa configurada. No inferir cobertura a partir del distrito de ubicación. Una sede de Ayacucho puede atender varios distritos solo si se configura y confirma esa cobertura.

Un borrador del catálogo no crea cuentas ni envía invitaciones. Al convertirlo en sede habilitada mediante el flujo del administrador, se crea su operador inicial de forma atómica según RF29. En demostración se permiten datos simulados identificados expresamente; nunca se muestran como participación institucional confirmada.
