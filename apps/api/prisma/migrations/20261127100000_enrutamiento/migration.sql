-- P4.2: enrutamiento del incidente y participaciones por sede (modulo Operaciones). Migracion aditiva.
-- Ver openspec/changes/enrutamiento-bandeja-inicial/design.md, decision 3. Los avisos por usuario
-- pertenecen a P8 y no se crean aqui.

-- Un enrutamiento por incidente. Guarda la regla aplicada y sus condiciones (categoria y distrito),
-- no una segunda fuente del estado operativo.
CREATE TABLE enrutamientos_incidente (
  incidente_id UUID PRIMARY KEY REFERENCES incidentes(id) ON DELETE RESTRICT,
  evento_id UUID NOT NULL UNIQUE,
  version_regla TEXT NOT NULL CHECK (version_regla ~ '^[a-z0-9-]{1,40}$'),
  categoria_id TEXT NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  distrito_id TEXT REFERENCES distritos(id) ON DELETE RESTRICT,
  resultado TEXT NOT NULL CHECK (resultado IN ('ENRUTADO', 'ENRUTAMIENTO_PENDIENTE')),
  revision_medica_pendiente BOOLEAN NOT NULL,
  -- Lista de {institucion, papel, motivo}; validada por el dominio. Vacia si ENRUTADO.
  faltantes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(faltantes) = 'array'),
  -- Copia del instante de registro del incidente para el orden FIFO.
  registrado_en TIMESTAMPTZ(3) NOT NULL,
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT enrutamientos_resultado_faltantes CHECK (
    (resultado = 'ENRUTADO') = (jsonb_array_length(faltantes) = 0))
);
CREATE INDEX enrutamientos_pendientes_fifo
  ON enrutamientos_incidente (registrado_en, incidente_id)
  WHERE resultado = 'ENRUTAMIENTO_PENDIENTE';

-- Participacion de una sede en un incidente. Nunca se borra: conserva el historial.
CREATE TABLE participaciones_incidente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id UUID NOT NULL REFERENCES enrutamientos_incidente(incidente_id) ON DELETE RESTRICT,
  sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
  institucion TEXT NOT NULL CHECK (institucion IN ('pnp', 'bomberos', 'samu', 'serenazgo')),
  papel TEXT NOT NULL CHECK (papel IN ('principal', 'simultanea', 'condicionada')),
  origen TEXT NOT NULL CHECK (origen IN ('regla', 'designacion', 'reevaluacion')),
  designado_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  motivo TEXT CHECK (motivo IS NULL OR char_length(btrim(motivo)) BETWEEN 10 AND 500),
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT participaciones_una_por_sede UNIQUE (incidente_id, sede_id),
  CONSTRAINT participaciones_designacion_auditada CHECK (
    (origen = 'designacion') = (designado_por IS NOT NULL AND motivo IS NOT NULL))
);
CREATE INDEX participaciones_sede_incidente ON participaciones_incidente (sede_id, incidente_id);
