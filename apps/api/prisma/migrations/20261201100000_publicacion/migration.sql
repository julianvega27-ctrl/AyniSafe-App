-- P7 (grupo A/C): publicacion controlada de incidentes verificados (modulo Operaciones). Migracion aditiva.
-- Ver openspec/changes/publicacion-mapas/design.md, decisiones 1-6, y documento 11 §5. Una fila por
-- incidente con una instantanea publica minima: nunca coordenadas exactas, descripcion ni datos sanitarios.
CREATE TABLE publicaciones_incidente (
  incidente_id UUID PRIMARY KEY REFERENCES incidentes(id) ON DELETE RESTRICT,
  id_publico UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  estado TEXT NOT NULL CHECK (estado IN ('VIGENTE', 'RETIRADA')),
  reservada BOOLEAN NOT NULL DEFAULT false,
  institucion TEXT NOT NULL,
  categoria_id TEXT NOT NULL,
  distrito_id TEXT NOT NULL,
  celda_lat DOUBLE PRECISION NOT NULL CHECK (celda_lat BETWEEN -90 AND 90),
  celda_lon DOUBLE PRECISION NOT NULL CHECK (celda_lon BETWEEN -180 AND 180),
  ocurrido_en TIMESTAMPTZ(3) NOT NULL,
  vence_en TIMESTAMPTZ(3) NOT NULL,
  publicada_en TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  retirada_en TIMESTAMPTZ(3),
  causa_retiro TEXT CHECK (causa_retiro IN ('DECISION', 'CIERRE', 'NO_VERIFICADO', 'DUPLICADO')),
  CONSTRAINT publicaciones_retiro_coherente CHECK (
    (estado = 'VIGENTE') = (retirada_en IS NULL AND causa_retiro IS NULL)),
  CONSTRAINT publicaciones_vencimiento CHECK (vence_en = ocurrido_en + INTERVAL '7 days')
);
-- Lectura publica: solo vigentes, por vencimiento.
CREATE INDEX publicaciones_vigentes ON publicaciones_incidente (vence_en) WHERE estado = 'VIGENTE';
-- Conteos agregados por distrito y ocurrencia.
CREATE INDEX publicaciones_distrito_ocurrencia ON publicaciones_incidente (distrito_id, ocurrido_en);

ALTER TABLE historial_incidente DROP CONSTRAINT historial_incidente_accion_check;
ALTER TABLE historial_incidente ADD CONSTRAINT historial_incidente_accion_check
  CHECK (accion IN ('asumir', 'transicion', 'verificacion', 'liberar', 'reasignar', 'vincular', 'prioridad',
                    'publicar', 'retirar', 'reservar'));
-- El retiro por decision y la reserva exigen motivo; el retiro automatico registra su causa en valor_nuevo.
ALTER TABLE historial_incidente ADD CONSTRAINT historial_publicacion CHECK (
  (accion <> 'retirar' OR (valor_nuevo IN ('DECISION', 'CIERRE', 'NO_VERIFICADO', 'DUPLICADO')
                           AND (valor_nuevo <> 'DECISION' OR motivo IS NOT NULL)))
  AND (accion <> 'reservar' OR (motivo IS NOT NULL AND valor_nuevo IN ('true', 'false'))));
