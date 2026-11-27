-- P5.1: evaluacion rapida para SAMU (Reportes) y auditoria del recalculo del enrutamiento
-- (Operaciones). Migracion aditiva. Ver openspec/changes/evaluacion-rapida-samu/design.md, decision 2.
-- Los datos sanitarios viven solo en las tablas de Reportes (evaluaciones y versiones).

-- Emergencia medica pregunta heridos desde P5.1 (decision del 26/11/2026). Solo amplia el CHECK.
ALTER TABLE envios_incidente DROP CONSTRAINT envios_incidente_heridos_chk;
ALTER TABLE envios_incidente ADD CONSTRAINT envios_incidente_heridos_chk CHECK (
  heridos IS NULL OR categoria_id IN ('accidente-transito', 'agresion', 'pelea', 'violencia', 'emergencia-medica'));

-- Evaluacion vigente de un incidente de las cinco categorias con preguntas medicas.
-- Con heridos 'si', cantidad_heridos NULL significa cantidad desconocida (no_se).
CREATE TABLE evaluaciones_incidente (
  incidente_id UUID PRIMARY KEY REFERENCES envios_incidente(incidente_id) ON DELETE RESTRICT,
  version_vigente INTEGER NOT NULL CHECK (version_vigente >= 1),
  heridos TEXT CHECK (heridos IN ('si', 'no', 'no_se')),
  atencion_medica TEXT CHECK (atencion_medica IN ('si', 'no', 'no_se')),
  cantidad_heridos SMALLINT CHECK (cantidad_heridos BETWEEN 1 AND 999),
  signos_vida TEXT CHECK (signos_vida IN ('observados', 'no_observados', 'no_se')),
  consciente TEXT CHECK (consciente IN ('si', 'no', 'no_se')),
  sangrado TEXT CHECK (sangrado IN ('si', 'no', 'no_se')),
  -- Monotono: una vez que SAMU interviene, sigue admitiendo observaciones.
  samu_requerido BOOLEAN NOT NULL,
  actualizada_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT evaluaciones_cantidad_con_heridos CHECK (cantidad_heridos IS NULL OR heridos = 'si')
);

-- Version inmutable con la instantanea completa. Las de origen operador guardan su institucion y
-- motivo (que puede contener informacion clinica; solo lo lee SAMU).
CREATE TABLE versiones_evaluacion (
  incidente_id UUID NOT NULL REFERENCES evaluaciones_incidente(incidente_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  heridos TEXT CHECK (heridos IN ('si', 'no', 'no_se')),
  atencion_medica TEXT CHECK (atencion_medica IN ('si', 'no', 'no_se')),
  cantidad_heridos SMALLINT CHECK (cantidad_heridos BETWEEN 1 AND 999),
  signos_vida TEXT CHECK (signos_vida IN ('observados', 'no_observados', 'no_se')),
  consciente TEXT CHECK (consciente IN ('si', 'no', 'no_se')),
  sangrado TEXT CHECK (sangrado IN ('si', 'no', 'no_se')),
  origen TEXT NOT NULL CHECK (origen IN ('ciudadano', 'operador')),
  actor_usuario_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  institucion TEXT CHECK (institucion IN ('pnp', 'bomberos', 'samu', 'serenazgo')),
  campos_modificados TEXT[] NOT NULL DEFAULT '{}',
  motivo TEXT CHECK (motivo IS NULL OR char_length(btrim(motivo)) BETWEEN 10 AND 500),
  creada_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (incidente_id, version),
  CONSTRAINT versiones_cantidad_con_heridos CHECK (cantidad_heridos IS NULL OR heridos = 'si'),
  CONSTRAINT versiones_origen_coherente CHECK (
    (origen = 'operador' AND institucion IS NOT NULL AND motivo IS NOT NULL AND actor_usuario_id IS NOT NULL)
    OR (origen = 'ciudadano' AND institucion IS NULL AND motivo IS NULL)),
  CONSTRAINT versiones_campos_validos CHECK (
    campos_modificados <@ ARRAY['heridos', 'atencionMedica', 'cantidadHeridos', 'signosVida', 'consciente', 'sangrado']::TEXT[])
);

-- Registro de lecturas autorizadas del detalle sanitario, sin contenido.
CREATE TABLE accesos_evaluacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id UUID NOT NULL REFERENCES evaluaciones_incidente(incidente_id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  accedido_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX accesos_evaluacion_incidente ON accesos_evaluacion (incidente_id, accedido_en);

-- Operaciones: auditoria de cada recalculo con efecto, sin respuestas sanitarias ni motivos.
CREATE TABLE cambios_enrutamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id UUID NOT NULL REFERENCES enrutamientos_incidente(incidente_id) ON DELETE RESTRICT,
  version_evaluacion INTEGER NOT NULL CHECK (version_evaluacion >= 1),
  origen TEXT NOT NULL CHECK (origen IN ('condicion_medica')),
  actor_tipo TEXT NOT NULL CHECK (actor_tipo IN ('ciudadano', 'operador')),
  actor_usuario_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  antes JSONB NOT NULL CHECK (jsonb_typeof(antes) = 'object'),
  despues JSONB NOT NULL CHECK (jsonb_typeof(despues) = 'object'),
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX cambios_enrutamiento_incidente ON cambios_enrutamiento (incidente_id, creado_en);

-- Participaciones: el papel puede cambiar por la condicion medica (auditado en cambios_enrutamiento).
ALTER TABLE participaciones_incidente DROP CONSTRAINT participaciones_incidente_origen_check;
ALTER TABLE participaciones_incidente ADD CONSTRAINT participaciones_incidente_origen_check
  CHECK (origen IN ('regla', 'designacion', 'reevaluacion', 'condicion_medica'));
ALTER TABLE participaciones_incidente
  ADD COLUMN actualizado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Carga inicial: version 1 de los incidentes existentes de las cinco categorias. Idempotente.
INSERT INTO evaluaciones_incidente (incidente_id, version_vigente, heridos, atencion_medica, samu_requerido, actualizada_en)
SELECT e.incidente_id, 1, e.heridos, e.atencion_medica,
       -- Sin respuesta (NULL) cuenta como que SAMU no interviene, igual que en el dominio.
       COALESCE(
         e.categoria_id = 'emergencia-medica'
           OR (e.categoria_id = 'accidente-transito' AND (e.heridos = 'si' OR e.atencion_medica = 'si'))
           OR (e.categoria_id IN ('agresion', 'pelea', 'violencia') AND e.heridos = 'si'),
         FALSE),
       e.recibido_en
FROM envios_incidente e
WHERE e.categoria_id IN ('accidente-transito', 'agresion', 'pelea', 'violencia', 'emergencia-medica')
ON CONFLICT (incidente_id) DO NOTHING;

INSERT INTO versiones_evaluacion (incidente_id, version, heridos, atencion_medica, origen, actor_usuario_id, creada_en)
SELECT e.incidente_id, 1, e.heridos, e.atencion_medica, 'ciudadano', e.autor_usuario_id, e.recibido_en
FROM envios_incidente e
WHERE e.categoria_id IN ('accidente-transito', 'agresion', 'pelea', 'violencia', 'emergencia-medica')
ON CONFLICT (incidente_id, version) DO NOTHING;
