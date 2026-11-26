-- P4.1: datos originales del envio ciudadano y claves de idempotencia (modulo Reportes).
-- Migracion aditiva. Reportes no guarda el estado operativo (Operaciones). Ver design §1-§3.

-- Originales del envio: uno por incidente, sin columnas de estado operativo.
CREATE TABLE envios_incidente (
  incidente_id UUID PRIMARY KEY REFERENCES incidentes(id) ON DELETE RESTRICT,
  modalidad TEXT NOT NULL CHECK (modalidad IN ('invitado', 'cuenta')),
  autor_usuario_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  -- Solo invitado. Normalizado como el telefono de perfil; nunca se publica ni se copia del perfil.
  telefono_contacto TEXT CHECK (telefono_contacto IS NULL OR telefono_contacto ~ '^\+?[0-9]{7,15}$'),
  -- Solo invitado: huella HMAC del codigo secreto (nunca el codigo) e instante de su emision.
  codigo_huella TEXT CHECK (codigo_huella IS NULL OR codigo_huella ~ '^[0-9a-f]{64}$'),
  codigo_emitido_en TIMESTAMPTZ(3),
  categoria_id TEXT NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  descripcion TEXT NOT NULL CHECK (char_length(descripcion) BETWEEN 5 AND 1000 AND descripcion = btrim(descripcion)),
  ocurrencia_modo TEXT NOT NULL CHECK (ocurrencia_modo IN ('ahora', 'antes')),
  ocurrido_en TIMESTAMPTZ(3) NOT NULL,
  latitud DOUBLE PRECISION NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud DOUBLE PRECISION NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  origen_punto TEXT NOT NULL CHECK (origen_punto IN ('gps', 'manual')),
  precision_m DOUBLE PRECISION CHECK (precision_m IS NULL OR precision_m BETWEEN 0 AND 100000),
  -- Clasificacion territorial calculada por el backend al registrar, con la version evaluada.
  distrito_id TEXT REFERENCES distritos(id) ON DELETE RESTRICT,
  estado_territorial TEXT NOT NULL CHECK (estado_territorial IN ('resuelto', 'pendiente')),
  motivo_territorial TEXT CHECK (motivo_territorial IS NULL OR motivo_territorial IN ('frontera', 'solapamiento', 'fuera_area', 'sin_cartografia')),
  version_territorial TEXT CHECK (version_territorial IS NULL OR version_territorial ~ '^[a-f0-9]{64}$'),
  -- Respuestas para la intervencion de SAMU (RF57). NULL = sin respuesta, distinto de 'no'.
  heridos TEXT CHECK (heridos IS NULL OR heridos IN ('si', 'no', 'no_se')),
  atencion_medica TEXT CHECK (atencion_medica IS NULL OR atencion_medica IN ('si', 'no', 'no_se')),
  recibido_en TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT envios_incidente_modalidad_chk CHECK (
    (modalidad = 'cuenta' AND autor_usuario_id IS NOT NULL AND telefono_contacto IS NULL
      AND codigo_huella IS NULL AND codigo_emitido_en IS NULL)
    OR (modalidad = 'invitado' AND autor_usuario_id IS NULL AND telefono_contacto IS NOT NULL
      AND codigo_huella IS NOT NULL AND codigo_emitido_en IS NOT NULL)
  ),
  CONSTRAINT envios_incidente_territorio_chk CHECK (
    (estado_territorial = 'resuelto' AND distrito_id IS NOT NULL AND motivo_territorial IS NULL AND version_territorial IS NOT NULL)
    OR (estado_territorial = 'pendiente' AND distrito_id IS NULL AND motivo_territorial IS NOT NULL
      AND (motivo_territorial = 'sin_cartografia') = (version_territorial IS NULL))
  ),
  CONSTRAINT envios_incidente_heridos_chk CHECK (
    heridos IS NULL OR categoria_id IN ('accidente-transito', 'agresion', 'pelea', 'violencia')
  ),
  CONSTRAINT envios_incidente_atencion_chk CHECK (atencion_medica IS NULL OR categoria_id = 'accidente-transito')
);
-- Historial privado del autor: mas reciente primero, desempate por identificador.
CREATE INDEX envios_incidente_autor_idx ON envios_incidente (autor_usuario_id, recibido_en DESC, incidente_id DESC)
  WHERE autor_usuario_id IS NOT NULL;

-- Idempotencia: una clave por ambito (cuenta:<uuid> o invitado) con la huella HMAC del contenido.
CREATE TABLE solicitudes_envio (
  ambito TEXT NOT NULL CHECK (ambito = 'invitado' OR ambito ~ '^cuenta:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  clave UUID NOT NULL,
  huella_contenido TEXT NOT NULL CHECK (huella_contenido ~ '^[0-9a-f]{64}$'),
  incidente_id UUID NOT NULL UNIQUE REFERENCES incidentes(id) ON DELETE RESTRICT,
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ambito, clave)
);
