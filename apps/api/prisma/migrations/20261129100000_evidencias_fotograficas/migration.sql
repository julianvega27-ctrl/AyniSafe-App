-- P5.2: evidencias fotograficas (Reportes). Migracion aditiva: solo crea tablas.
-- Ver openspec/changes/evidencias-fotograficas/design.md, decision 2.
-- El public_id se registra ANTES de subir al proveedor; solo se borra por public_id registrado.

CREATE TABLE evidencias_incidente (
  id UUID PRIMARY KEY,
  incidente_id UUID NOT NULL REFERENCES envios_incidente(incidente_id) ON DELETE RESTRICT,
  ranura SMALLINT NOT NULL CHECK (ranura BETWEEN 1 AND 3),
  -- Aislamiento en la cuenta compartida: prefijo aynisafe/ y uuid v4 en minusculas.
  public_id TEXT NOT NULL UNIQUE
    CHECK (public_id ~ '^aynisafe/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  proveedor TEXT NOT NULL CHECK (proveedor IN ('cloudinary', 'memoria')),
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'disponible', 'eliminacion_pendiente', 'eliminada')),
  tipo_medio TEXT NOT NULL CHECK (tipo_medio IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  -- Metadatos de la copia normalizada; se borran al eliminar (queda solo la marca).
  ancho INTEGER CHECK (ancho BETWEEN 1 AND 10000),
  alto INTEGER CHECK (alto BETWEEN 1 AND 10000),
  sha256 TEXT CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- Huella del archivo recibido, para la idempotencia por foto.
  huella_carga TEXT NOT NULL CHECK (huella_carga ~ '^[0-9a-f]{64}$'),
  clave_idempotencia UUID NOT NULL,
  modalidad TEXT NOT NULL CHECK (modalidad IN ('invitado', 'cuenta')),
  autor_usuario_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  creada_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmada_en TIMESTAMPTZ(3),
  eliminada_en TIMESTAMPTZ(3),
  motivo_eliminacion TEXT CHECK (motivo_eliminacion IN ('fallo_carga', 'huerfana', 'plazo')),
  intentos_eliminacion INTEGER NOT NULL DEFAULT 0 CHECK (intentos_eliminacion >= 0),
  proximo_intento_en TIMESTAMPTZ(3),
  CONSTRAINT evidencias_modalidad_coherente CHECK (
    (modalidad = 'cuenta' AND autor_usuario_id IS NOT NULL) OR (modalidad = 'invitado' AND autor_usuario_id IS NULL)),
  CONSTRAINT evidencias_disponible_completa CHECK (
    estado <> 'disponible' OR (confirmada_en IS NOT NULL AND sha256 IS NOT NULL AND ancho IS NOT NULL AND alto IS NOT NULL)),
  CONSTRAINT evidencias_eliminacion_con_motivo CHECK (
    estado NOT IN ('eliminacion_pendiente', 'eliminada') OR motivo_eliminacion IS NOT NULL),
  CONSTRAINT evidencias_eliminada_sin_contenido CHECK (
    estado <> 'eliminada' OR (eliminada_en IS NOT NULL AND sha256 IS NULL AND ancho IS NULL AND alto IS NULL))
);

-- Maximo 3 fotos no eliminadas por incidente, garantizado ante concurrencia.
CREATE UNIQUE INDEX evidencias_ranura_activa ON evidencias_incidente (incidente_id, ranura) WHERE estado <> 'eliminada';
-- Idempotencia por foto entre las vigentes: tras un fallo, el reintento con la misma clave crea otra evidencia.
CREATE UNIQUE INDEX evidencias_clave_incidente ON evidencias_incidente (incidente_id, clave_idempotencia)
  WHERE estado IN ('pendiente', 'disponible');
-- Tareas de la limpieza persistente.
CREATE INDEX evidencias_tareas ON evidencias_incidente (proximo_intento_en)
  WHERE estado IN ('pendiente', 'eliminacion_pendiente');

-- Permiso de carga del invitado: solo la huella HMAC; se reemplaza en cada reemision.
CREATE TABLE permisos_evidencia (
  incidente_id UUID PRIMARY KEY REFERENCES envios_incidente(incidente_id) ON DELETE RESTRICT,
  permiso_huella TEXT NOT NULL CHECK (permiso_huella ~ '^[0-9a-f]{64}$'),
  emitido_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vence_en TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT permisos_evidencia_vence_despues CHECK (vence_en > emitido_en)
);

-- Lecturas autorizadas del contenido, sin imagen ni metadatos.
CREATE TABLE accesos_evidencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidencia_id UUID NOT NULL REFERENCES evidencias_incidente(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  rol TEXT NOT NULL CHECK (rol IN ('operador', 'ciudadano')),
  accedido_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX accesos_evidencia_evidencia ON accesos_evidencia (evidencia_id, accedido_en);
