-- P4.1: eventos persistidos en la transaccion del hecho y entregas por consumidor (ADR-004).
-- Migracion aditiva. Ver openspec/changes/registro-incidentes/design.md, secciones 2 y 6.

-- Evento de negocio. La carga solo admite identificadores y metadatos: nunca telefonos, codigos,
-- descripciones ni coordenadas (lo garantiza el publicador; aqui se limita su tamano).
CREATE TABLE eventos (
  id UUID PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo ~ '^[A-Z][A-Za-z]+$' AND char_length(tipo) <= 60),
  version SMALLINT NOT NULL CHECK (version >= 1),
  agregado_id UUID NOT NULL,
  carga JSONB NOT NULL CHECK (jsonb_typeof(carga) = 'object' AND pg_column_size(carga) <= 2048),
  ocurrido_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX eventos_tipo_ocurrido_en_idx ON eventos (tipo, ocurrido_en);

-- Una entrega por evento y consumidor. Se materializa por el procesador (no en la transaccion del
-- hecho), de modo que un consumidor registrado despues recibe tambien los eventos anteriores.
CREATE TABLE entregas_evento (
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE RESTRICT,
  consumidor TEXT NOT NULL CHECK (consumidor ~ '^[a-z][a-z0-9.-]*$' AND char_length(consumidor) <= 60),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_proceso', 'procesada', 'fallida')),
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  proximo_intento_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bloqueado_hasta TIMESTAMPTZ(3),
  ultimo_error TEXT CHECK (ultimo_error IS NULL OR char_length(ultimo_error) <= 200),
  creada_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  procesada_en TIMESTAMPTZ(3),
  PRIMARY KEY (evento_id, consumidor),
  CONSTRAINT entregas_evento_bloqueo_chk CHECK ((estado = 'en_proceso') = (bloqueado_hasta IS NOT NULL)),
  CONSTRAINT entregas_evento_procesada_chk CHECK ((estado = 'procesada') = (procesada_en IS NOT NULL))
);
CREATE INDEX entregas_evento_pendientes_idx ON entregas_evento (proximo_intento_en)
  WHERE estado IN ('pendiente', 'en_proceso');
