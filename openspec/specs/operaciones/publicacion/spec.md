# operaciones/publicacion Specification

## Purpose

Publicación expresa y retiro de incidentes verificados con una instantánea pública mínima y generalizada (documento 11 §5, RF49), base del mapa ciudadano y de las alertas preventivas.

## Requirements

### Requirement: Publicación expresa por el responsable de la principal
Solo el responsable activo de la institución principal MUST poder publicar, al verificar el incidente o con una solicitud expresa que indique el estado esperado. El incidente MUST estar VERIFICADO, en EN_REVISION o EN_ATENCION, no vinculado como duplicado, con distrito resuelto y ocurrido hace menos de 7 días. Cualquier otro caso MUST rechazarse sin publicar. Publicar MUST NOT cambiar estado, verificación ni prioridad.

#### Scenario: Publicar un verificado
- **WHEN** el responsable de la principal publica un incidente VERIFICADO EN_ATENCION de su distrito ocurrido hace 2 horas
- **THEN** la publicación queda vigente y consta en el historial con actor, institución e instante

#### Scenario: Sin verificar
- **WHEN** se intenta publicar un incidente SIN_VERIFICAR o NO_VERIFICADO
- **THEN** la API responde 409 `NO_VERIFICADO` y no se publica

#### Scenario: Apoyo o no responsable
- **WHEN** un operador de una institución de apoyo, o de la principal sin ser responsable, intenta publicar
- **THEN** la API responde 403 y no se publica

#### Scenario: Fuera de vigencia o sin distrito
- **WHEN** el incidente ocurrió hace más de 7 días o su distrito está pendiente
- **THEN** la API responde 409 `FUERA_DE_VIGENCIA` o `DISTRITO_PENDIENTE` y no se publica

#### Scenario: Duplicado o cerrado
- **WHEN** el incidente está vinculado como duplicado o CERRADO
- **THEN** la API responde 409 y no se publica

#### Scenario: Repetir la publicación
- **WHEN** el responsable publica un incidente que ya tiene publicación vigente
- **THEN** la API devuelve la publicación vigente sin duplicarla ni registrar otra entrada

### Requirement: Publicación al verificar
Marcar un incidente VERIFICADO, desde SIN_VERIFICAR o NO_VERIFICADO, MUST publicarlo en la misma transacción si cumple las condiciones de publicación y no tiene publicación vigente. Si no las cumple, MUST verificarse sin publicar. La publicación MUST registrarse en el historial como consecuencia de la verificación. Repetir VERIFICADO sobre un incidente ya verificado MUST NOT republicar una publicación retirada por decisión.

#### Scenario: Verificar publica
- **WHEN** el responsable marca VERIFICADO un robo EN_REVISION de su distrito ocurrido hace 2 horas
- **THEN** queda publicado en la misma respuesta y el historial registra la verificación y la publicación

#### Scenario: Verificar fuera de plazo
- **WHEN** el incidente verificado ocurrió hace más de 7 días
- **THEN** la verificación se registra y no se crea publicación

#### Scenario: Corrección a verificado
- **WHEN** un incidente pasa de NO_VERIFICADO a VERIFICADO
- **THEN** vuelve a publicarse conservando el vencimiento original

### Requirement: Instantánea pública mínima con ubicación exacta
Al publicar MUST guardarse solo categoría, distrito real del envío, punto exacto informado, instante de ocurrencia y vencimiento; el estado publicable (En revisión o En atención) se lee vigente. MUST NOT guardarse ni exponerse descripción, fotos, identidad, teléfono, código, institución ni datos sanitarios (decisión del 27/11/2026: ubicación exacta en lugar de zona de 300 m).

#### Scenario: Punto exacto
- **WHEN** se publica un incidente
- **THEN** la instantánea contiene el mismo punto del envío y su distrito real

#### Scenario: Sin datos restringidos
- **WHEN** se revisa la instantánea guardada
- **THEN** no contiene descripción, teléfono, código, autor ni datos sanitarios

### Requirement: Vigencia de siete días desde la ocurrencia
Cada publicación MUST vencer a los 7 días desde la ocurrencia, sin renovarse por republicar, por vincular otros reportes ni por cambios de estado. Una publicación vencida MUST dejar de ser pública sin depender de una tarea programada.

#### Scenario: Vencimiento
- **WHEN** pasa el instante de vencimiento de una publicación vigente
- **THEN** deja de aparecer en las lecturas públicas aunque no se haya ejecutado ninguna limpieza

#### Scenario: Republicar no renueva
- **WHEN** se republica un incidente retirado
- **THEN** su vencimiento sigue siendo 7 días desde la ocurrencia original

### Requirement: Retiro por decisión
Cualquier operador activo de una sede de la institución principal que participe en el incidente MUST poder retirar la publicación vigente de inmediato, con motivo de 10 a 500 caracteres. El retiro MUST registrarse en el historial. Republicar después MUST exigir una nueva autorización del responsable.

#### Scenario: Retiro inmediato
- **WHEN** un operador de la principal retira una publicación con motivo
- **THEN** deja de ser pública en la misma respuesta y el historial registra motivo, actor e institución

#### Scenario: Retiro sin motivo
- **WHEN** se intenta retirar sin motivo válido
- **THEN** la API responde 400 y la publicación sigue vigente

#### Scenario: Apoyo intenta retirar
- **WHEN** un operador de una institución de apoyo intenta retirar
- **THEN** la API responde 403

### Requirement: Retiro automático
La publicación vigente MUST retirarse en la misma transacción cuando el incidente se cierra, cuando su verificación pasa a NO_VERIFICADO o cuando se vincula como duplicado. El retiro automático MUST registrarse con su causa y actor.

#### Scenario: Cierre retira
- **WHEN** el responsable cierra como atendido un incidente publicado
- **THEN** la publicación queda retirada por cierre en la misma transacción

#### Scenario: Corrección de verificación
- **WHEN** el responsable corrige un incidente publicado a NO_VERIFICADO
- **THEN** la publicación queda retirada y solo reaparece si se vuelve a verificar

### Requirement: Todas las categorías verificadas
Todas las categorías, incluidas Acoso, Violencia, Agresión y Emergencia médica, MUST mostrarse como punto cuando están publicadas y no reservadas (decisión del 27/11/2026). La reserva por caso es la mitigación para no exponer a la víctima.

#### Scenario: Publicar una agresión
- **WHEN** se verifica y publica un incidente de Agresión no reservado
- **THEN** aparece como punto en la lectura pública

### Requirement: Caso reservado
El responsable de la principal MUST poder marcar como reservado, con motivo, un incidente publicado o al publicarlo, y quitar la reserva con motivo. Un caso reservado MUST NOT mostrarse como punto y solo MAY contarse en los conteos agregados. Cada cambio MUST registrarse en el historial.

#### Scenario: Reservar un caso publicado
- **WHEN** el responsable marca reservado un robo publicado
- **THEN** deja de aparecer como punto y el historial registra la reserva con motivo

### Requirement: Estado de publicación para el operador
El resumen del operador MUST informar si el incidente está publicado, retirado o nunca publicado, con vencimiento, reserva y la causa del último retiro, y qué acciones de publicación puede ejecutar. MUST NOT exponer a otras instituciones el motivo de retiro escrito por la principal.

#### Scenario: Resumen de un publicado
- **WHEN** el responsable abre un incidente publicado
- **THEN** ve publicación vigente, vencimiento y las acciones «Retirar» y «Reservar»
