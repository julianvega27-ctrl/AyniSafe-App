# operaciones/prioridad Specification

## Purpose

Proponer la prioridad inicial de cada incidente desde la tabla aprobada `prioridad-categoria-v1`, distinguirla de la revisión humana y conservar su historial, sin que ninguna etiqueta altere el orden FIFO de la bandeja.

## Requirements

### Requirement: Configuración versionada de la tabla
El sistema MUST contener la tabla `prioridad-categoria-v1` del documento 11 como configuración ejecutable versionada con las 16 categorías. MUST NOT ofrecer edición de la tabla desde el panel. Una configuración ausente, incompleta o con valores fuera de NORMAL, ALTA y URGENTE MUST considerarse inválida.

#### Scenario: Valores aprobados
- **WHEN** se lee la configuración
- **THEN** Emergencia médica e Incendio son URGENTE; Actividad sospechosa, Otra emergencia, Otro incidente de seguridad y Vandalismo son NORMAL; las diez restantes son ALTA

### Requirement: Propuesta inicial al enrutar
Al enrutar un incidente, el sistema MUST guardar la prioridad propuesta por su categoría con origen `propuesta` y la versión de configuración. Si la configuración es inválida o no contiene la categoría, MUST quedar SIN_EVALUAR, nunca NORMAL.

#### Scenario: Incendio
- **WHEN** se enruta un incidente de Incendio
- **THEN** su prioridad es URGENTE con origen propuesta y versión prioridad-categoria-v1

#### Scenario: Configuración inválida
- **WHEN** la configuración no es válida al enrutar
- **THEN** la prioridad queda SIN_EVALUAR

### Requirement: Revisión humana con motivo
El responsable activo de la principal MUST poder confirmar, elevar o reducir la prioridad de un incidente abierto entre NORMAL, ALTA y URGENTE, con motivo de 10 a 500 caracteres. Cada revisión MUST registrar valor anterior y nuevo, actor, instante y motivo y cambiar el origen a `revisada`. MUST NOT modificar la tabla.

#### Scenario: Reducir
- **WHEN** el responsable reduce un URGENTE a ALTA con motivo
- **THEN** la prioridad vigente es ALTA con origen revisada y el historial conserva URGENTE como valor anterior

### Requirement: FIFO independiente de la prioridad
La bandeja MUST seguir ordenada por instante de registro e identificador cualquiera sea la prioridad. Cada etiqueta MUST mostrarse con texto, icono y color: Sin evaluar (gris, reloj), Normal (azul, información), Alta (ámbar, alerta) y Urgente (rojo, alarma).

#### Scenario: Elevar no reordena
- **WHEN** se eleva a URGENTE el incidente más reciente de la bandeja
- **THEN** la siguiente consulta conserva el mismo orden de filas
