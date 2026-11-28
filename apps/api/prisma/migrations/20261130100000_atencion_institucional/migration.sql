-- P6 (grupo A): atencion institucional (modulo Operaciones). Migracion aditiva.
-- Ver openspec/changes/atencion-vinculacion/design.md, decisiones 1 y 2.

-- Verificacion separada del estado y resultado de cierre.
ALTER TABLE incidentes
  ADD COLUMN verificacion TEXT NOT NULL DEFAULT 'SIN_VERIFICAR'
    CHECK (verificacion IN ('SIN_VERIFICAR', 'VERIFICADO', 'NO_VERIFICADO')),
  ADD COLUMN resultado TEXT CHECK (resultado IN ('ATENDIDO', 'DESCARTADO')),
  ADD COLUMN resumen_ciudadano TEXT CHECK (resumen_ciudadano IS NULL OR char_length(btrim(resumen_ciudadano)) BETWEEN 10 AND 300),
  ADD COLUMN cerrado_en TIMESTAMPTZ(3),
  ADD CONSTRAINT incidentes_cierre_coherente CHECK (
    (estado = 'CERRADO') = (resultado IS NOT NULL)
    AND (estado = 'CERRADO') = (resumen_ciudadano IS NOT NULL)
    AND (estado = 'CERRADO') = (cerrado_en IS NOT NULL));

-- Asignacion de un operador a la participacion de su institucion. Nunca se borra.
CREATE TABLE asignaciones_incidente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id UUID NOT NULL REFERENCES incidentes(id) ON DELETE RESTRICT,
  institucion TEXT NOT NULL CHECK (institucion IN ('pnp', 'bomberos', 'samu', 'serenazgo')),
  operador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
  origen TEXT NOT NULL CHECK (origen IN ('asumida', 'reasignada')),
  activa BOOLEAN NOT NULL DEFAULT true,
  asignada_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  liberada_en TIMESTAMPTZ(3),
  CONSTRAINT asignaciones_liberacion CHECK (activa = (liberada_en IS NULL))
);
-- Una sola asignacion activa por incidente e institucion (EQ-20).
CREATE UNIQUE INDEX asignaciones_una_activa ON asignaciones_incidente (incidente_id, institucion) WHERE activa;
CREATE INDEX asignaciones_activas ON asignaciones_incidente (asignada_en, id) WHERE activa;

-- Historial operativo auditable (EQ-05). Los hitos ciudadanos se derivan de las transiciones.
CREATE TABLE historial_incidente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id UUID NOT NULL REFERENCES incidentes(id) ON DELETE RESTRICT,
  accion TEXT NOT NULL CHECK (accion IN ('asumir', 'transicion', 'verificacion', 'liberar', 'reasignar')),
  actor_tipo TEXT NOT NULL CHECK (actor_tipo IN ('operador', 'administrador')),
  actor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  institucion TEXT NOT NULL CHECK (institucion IN ('pnp', 'bomberos', 'samu', 'serenazgo')),
  valor_anterior TEXT,
  valor_nuevo TEXT,
  motivo TEXT CHECK (motivo IS NULL OR char_length(btrim(motivo)) BETWEEN 10 AND 500),
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT historial_valores CHECK (
    accion NOT IN ('transicion', 'verificacion') OR (valor_anterior IS NOT NULL AND valor_nuevo IS NOT NULL)),
  CONSTRAINT historial_motivo CHECK (
    accion NOT IN ('verificacion', 'liberar', 'reasignar') OR motivo IS NOT NULL)
);
CREATE INDEX historial_incidente_orden ON historial_incidente (incidente_id, creado_en, id);
