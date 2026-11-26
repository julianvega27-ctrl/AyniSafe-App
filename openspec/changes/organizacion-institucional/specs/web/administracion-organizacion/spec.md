# Spec Delta

## Purpose

Permitir que el administrador gestione desde el panel web instituciones, sedes, operadores, coberturas y competencias, reproduciendo la página de organización de la referencia visual sin conceder permisos que la API no otorga.

## ADDED Requirements

### Requirement: Instituciones y sedes en el panel
La sección «Instituciones y sedes» MUST listar las cuatro instituciones con sus sedes, mostrando verificación, habilitación para atención, estado y marca de demostración con texto e icono. MUST permitir editar nombre y contacto de una institución.

#### Scenario: Listado inicial
- **WHEN** el administrador abre la sección sin sedes creadas
- **THEN** ve las cuatro instituciones y un estado vacío por institución, sin sedes de ejemplo

#### Scenario: Estados visibles sin depender del color
- **WHEN** una sede está verificada y deshabilitada para atención
- **THEN** ambos estados se leen como texto y tienen nombre accesible

### Requirement: Formulario de alta de sede con operador inicial
El formulario de nueva sede MUST pedir institución, nombre, distrito de ubicación opcional y nombre y correo del operador inicial, sin campo de contraseña. MUST deshabilitar el envío mientras está en curso y conservar los datos ante errores.

#### Scenario: Alta correcta
- **WHEN** el administrador envía datos válidos
- **THEN** la sede aparece en su institución, se informa que se envió la invitación al operador y la sede figura deshabilitada para atención

#### Scenario: Correo en uso o sede existente
- **WHEN** la API responde 409 EMAIL_IN_USE o SEDE_EXISTENTE
- **THEN** el formulario conserva los datos, señala el campo afectado y no crea duplicados

#### Scenario: Fallo de conexión
- **WHEN** la red falla durante el envío
- **THEN** se informa que el resultado es incierto y se ofrece recargar la lista antes de reintentar

### Requirement: Gestión de operadores de la sede
La sección «Operadores» MUST listar los operadores por sede con su estado (pendiente de activación, activo o suspendido) y permitir agregar operador, reenviar invitación a pendientes, suspender y reactivar.

#### Scenario: Suspensión rechazada
- **WHEN** la API rechaza suspender al último operador activo de una sede habilitada
- **THEN** se muestra el motivo devuelto y el operador sigue activo en la lista

#### Scenario: Reenvío de invitación
- **WHEN** el administrador reenvía la invitación de un pendiente
- **THEN** se confirma el reenvío sin mostrar el enlace ni el token

### Requirement: Coberturas y competencias de la sede
La sección «Coberturas» MUST permitir elegir, por sede, distritos del catálogo territorial y categorías del catálogo de categorías mediante controles de selección múltiple, y habilitar o deshabilitar la atención mostrando los requisitos faltantes devueltos por la API.

#### Scenario: Guardar cobertura
- **WHEN** el administrador marca dos distritos y guarda
- **THEN** la sede muestra exactamente esos distritos tras la respuesta de la API

#### Scenario: Habilitación con requisitos faltantes
- **WHEN** la API responde 409 REQUISITOS_HABILITACION
- **THEN** se lista cada requisito faltante con texto y la sede sigue mostrada como deshabilitada

### Requirement: Accesibilidad y fidelidad de la referencia
Las secciones MUST usar los componentes y tokens del marco de P2 según DESIGN.md, ser operables con teclado, mostrar foco visible, asociar etiquetas y errores a cada campo y funcionar en pantallas estrechas sin desplazamiento horizontal de la página.

#### Scenario: Recorrido con teclado
- **WHEN** se completa el alta de sede solo con teclado
- **THEN** todos los controles son alcanzables en orden lógico y los errores se anuncian

#### Scenario: Pantalla estrecha
- **WHEN** se abre la sección en un viewport de 360 px
- **THEN** listas y formularios se reorganizan en una columna sin desbordar

### Requirement: Autorización decidida por la API
La web MUST mostrar datos de organización solo a partir de respuestas autorizadas de la API. Un 401 MUST llevar a `/acceso` y un 403 MUST mostrar «No tienes permiso» sin datos.

#### Scenario: Sesión vencida durante la gestión
- **WHEN** una acción recibe 401
- **THEN** la web descarta los datos mostrados y dirige a `/acceso`
