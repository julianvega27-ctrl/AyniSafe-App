-- P6 (grupo D): asignacion automatica al operador unico de la sede principal (decision del 27/11/2026,
-- documento 11 §2). La asignacion y su historial registran al actor «sistema», sin usuario.
ALTER TABLE asignaciones_incidente DROP CONSTRAINT asignaciones_incidente_origen_check;
ALTER TABLE asignaciones_incidente ADD CONSTRAINT asignaciones_incidente_origen_check
  CHECK (origen IN ('asumida', 'reasignada', 'automatica'));

ALTER TABLE historial_incidente DROP CONSTRAINT historial_incidente_actor_tipo_check;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_incidente_actor_tipo_check
  CHECK (actor_tipo IN ('operador', 'administrador', 'sistema'));
ALTER TABLE historial_incidente ALTER COLUMN actor_usuario_id DROP NOT NULL;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_actor_sistema
  CHECK ((actor_tipo = 'sistema') = (actor_usuario_id IS NULL));
