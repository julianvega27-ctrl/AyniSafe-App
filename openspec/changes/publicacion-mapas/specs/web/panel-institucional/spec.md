# Spec Delta

## MODIFIED Requirements

### Requirement: Shell por rol
El panel MUST mostrar las secciones de su rol recibidas de la API según la guía UI: operador con Inicio, Incidentes, Mapa, Indicadores e Historial; administrador con Inicio, Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas, Contenido/contactos e Historial. MUST mostrar cuenta y cierre de sesión en cabecera. Un destino no disponible según la API MUST indicar «Aún no disponible» con texto e icono, sin datos de ejemplo.

#### Scenario: Sección disponible
- **WHEN** la API marca disponible una sección del administrador o del operador
- **THEN** la web abre su contenido operativo en lugar del aviso pendiente

#### Scenario: Panel del administrador
- **WHEN** un administrador entra a su panel
- **THEN** ve «Inicio» con solo el bloque de enrutamiento pendiente, «Instituciones y sedes», «Operadores» y «Coberturas» operativas, el resto de secciones marcadas como no disponibles y su nombre y rol en la cabecera

#### Scenario: Panel del operador
- **WHEN** un operador entra a su panel
- **THEN** ve «Incidentes» operativa con su bandeja, «Mapa» operativa con el mapa operativo y las demás secciones de operación marcadas como no disponibles

#### Scenario: Rol ajeno
- **WHEN** un operador navega a la ruta del panel del administrador
- **THEN** la web no muestra sus secciones y la API devuelve 403 a sus consultas

#### Scenario: Cierre de sesión
- **WHEN** la persona pulsa «Cerrar sesión»
- **THEN** la sesión se revoca, la web vuelve a la portada o a `/acceso` y el botón Atrás no reabre contenido privado

#### Scenario: Sección no operativa
- **WHEN** se selecciona el Inicio del operador, Historial u otro destino sin implementación operativa
- **THEN** se abre su explicación pendiente sin consultar servicios futuros ni presentar ceros como métricas reales

