-- P6 (grupo B): duplicados vinculados a un incidente principal (modulo Operaciones). Migracion aditiva.
-- Ver openspec/changes/atencion-vinculacion/design.md, decision 7. Cada envio conserva su incidente,
-- originales, codigo e historial; el vinculo coordina la atencion y no es descarte.
ALTER TABLE incidentes
  ADD COLUMN principal_id UUID REFERENCES incidentes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT incidentes_no_autovinculo CHECK (principal_id IS NULL OR principal_id <> id);
CREATE INDEX incidentes_duplicados ON incidentes (principal_id) WHERE principal_id IS NOT NULL;

ALTER TABLE historial_incidente DROP CONSTRAINT historial_incidente_accion_check;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_incidente_accion_check
  CHECK (accion IN ('asumir', 'transicion', 'verificacion', 'liberar', 'reasignar', 'vincular'));
ALTER TABLE historial_incidente DROP CONSTRAINT historial_motivo;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_motivo CHECK (
  accion NOT IN ('verificacion', 'liberar', 'reasignar', 'vincular') OR motivo IS NOT NULL);
