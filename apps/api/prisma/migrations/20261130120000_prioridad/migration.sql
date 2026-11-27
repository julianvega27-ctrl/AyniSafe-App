-- P6 (grupo C): prioridad versionada del incidente (modulo Operaciones). Migracion aditiva.
-- Ver openspec/changes/atencion-vinculacion/design.md, decision 8 y documento 11 §4. La tabla
-- prioridad-categoria-v1 vive en el codigo, sin edicion desde el panel; la prioridad no ordena la bandeja.
ALTER TABLE incidentes
  ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'SIN_EVALUAR'
    CHECK (prioridad IN ('SIN_EVALUAR', 'NORMAL', 'ALTA', 'URGENTE')),
  ADD COLUMN prioridad_origen TEXT CHECK (prioridad_origen IN ('propuesta', 'revisada')),
  ADD COLUMN prioridad_version TEXT CHECK (prioridad_version IS NULL OR prioridad_version ~ '^[a-z0-9-]{1,40}$'),
  ADD CONSTRAINT incidentes_prioridad_coherente CHECK (
    (prioridad = 'SIN_EVALUAR') = (prioridad_origen IS NULL)
    AND (prioridad_origen IS DISTINCT FROM 'propuesta' OR prioridad_version IS NOT NULL));

ALTER TABLE historial_incidente DROP CONSTRAINT historial_incidente_accion_check;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_incidente_accion_check
  CHECK (accion IN ('asumir', 'transicion', 'verificacion', 'liberar', 'reasignar', 'vincular', 'prioridad'));
ALTER TABLE historial_incidente DROP CONSTRAINT historial_motivo;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_motivo CHECK (
  accion NOT IN ('verificacion', 'liberar', 'reasignar', 'vincular', 'prioridad') OR motivo IS NOT NULL);
ALTER TABLE historial_incidente DROP CONSTRAINT historial_valores;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_valores CHECK (
  accion NOT IN ('transicion', 'verificacion', 'prioridad') OR (valor_anterior IS NOT NULL AND valor_nuevo IS NOT NULL));
