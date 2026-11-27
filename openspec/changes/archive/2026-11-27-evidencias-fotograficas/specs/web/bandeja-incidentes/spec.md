# Spec Delta

## ADDED Requirements

### Requirement: Fotografías en el resumen del incidente
Cuando el resumen informa fotos disponibles, el panel MUST mostrar la sección «Fotografías» con cada imagen obtenida mediante la sesión institucional y su instante. MUST permitir ampliarlas. MUST NOT guardar las imágenes en almacenamiento del navegador ni exponer URLs del proveedor. Sin fotos, la sección MUST indicar que el ciudadano no adjuntó fotografías.

#### Scenario: Incidente con fotos
- **WHEN** un operador participante abre un incidente con dos fotos
- **THEN** ve la sección «Fotografías» con las dos imágenes y su instante

#### Scenario: Sin fotos
- **WHEN** el incidente no tiene fotos disponibles
- **THEN** la sección indica que no se adjuntaron fotografías

#### Scenario: Foto no disponible
- **WHEN** la obtención de una foto responde 404 o 503
- **THEN** su lugar indica que no está disponible, sin ocultar el resto del resumen

### Requirement: Accesibilidad de las fotografías en el panel
Cada imagen MUST tener un texto alternativo «Fotografía N enviada por el ciudadano», ampliarse y cerrarse con teclado, con el foco devuelto al origen, y MUST reutilizar los componentes y tokens de DESIGN.md sin estilos locales nuevos.

#### Scenario: Ampliar con teclado
- **WHEN** el operador amplía una foto con Enter y la cierra con Escape
- **THEN** la vista ampliada se anuncia con su nombre y el foco vuelve a la miniatura
