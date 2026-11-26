-- P4.1: incidente unico (modulo Operaciones). Migracion aditiva.
-- Operaciones es el unico dueno del estado operativo; los originales del envio viven en Reportes.
-- Ver openspec/changes/registro-incidentes/design.md, secciones 1 y 2.
CREATE TABLE incidentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Referencia publica no secuencial: INC- y 10 simbolos Crockford en dos grupos.
  referencia TEXT NOT NULL UNIQUE CHECK (referencia ~ '^INC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$'),
  -- Los cuatro estados confirmados el 23/11/2026; P4.1 solo crea REGISTRADO.
  estado TEXT NOT NULL DEFAULT 'REGISTRADO'
    CHECK (estado IN ('REGISTRADO', 'EN_REVISION', 'EN_ATENCION', 'CERRADO')),
  registrado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
