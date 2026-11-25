# Spec Delta

## MODIFIED Requirements

### Requirement: Accesibilidad y diseño de la portada
La portada MUST seguir la referencia y tipografía web elegidas en DESIGN.md, con fuentes locales, foco visible, estados con texto e icono, jerarquía de encabezados y texto ampliable al 200 % sin pérdida de contenido. MUST conservar texto base de 16 px y acciones de al menos 48 px de alto. Las combinaciones usadas MUST cumplir WCAG AA; una diferencia necesaria respecto del origen MUST registrarse antes de aceptar fidelidad.

#### Scenario: Texto ampliado
- **WHEN** se amplía el texto al 200 % en un ancho de móvil
- **THEN** todo el contenido y las acciones siguen siendo operables sin desplazamiento horizontal

#### Scenario: Contraste
- **WHEN** se ejecutan las comprobaciones de contraste de los pares de color usados
- **THEN** cada par cumple 4,5:1 para texto normal

#### Scenario: Lector de pantalla
- **WHEN** se navega con un lector de pantalla
- **THEN** los encabezados, regiones y estados de carga o error se anuncian con nombres comprensibles

#### Scenario: Apariencia y fuentes de referencia
- **WHEN** se carga la portada con sus recursos y contenido publicado
- **THEN** se reproduce la composición de la portada origen con las familias elegidas cargadas localmente y las secciones reales de AyniSafe, sin copiar afirmaciones operativas del donante
