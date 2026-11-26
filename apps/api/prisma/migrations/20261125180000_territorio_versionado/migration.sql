CREATE TABLE distritos (
  id TEXT PRIMARY KEY CHECK (id IN ('DIS-01','DIS-02','DIS-03','DIS-04','DIS-05')),
  nombre TEXT NOT NULL UNIQUE
);
INSERT INTO distritos(id,nombre) VALUES
('DIS-01','Ayacucho'),('DIS-02','San Juan Bautista'),('DIS-03','Carmen Alto'),
('DIS-04','Jesús Nazareno'),('DIS-05','Andrés Avelino Cáceres Dorregaray');

CREATE TABLE versiones_territoriales (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  metadatos JSONB NOT NULL CHECK (jsonb_typeof(metadatos) = 'object'),
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE geometrias_distritales (
  version_id TEXT NOT NULL REFERENCES versiones_territoriales(id) ON DELETE RESTRICT,
  distrito_id TEXT NOT NULL REFERENCES distritos(id) ON DELETE RESTRICT,
  ubigeo TEXT NOT NULL CHECK (ubigeo ~ '^0501[0-9]{2}$'),
  geometria JSONB NOT NULL CHECK (COALESCE(jsonb_typeof(geometria) = 'object' AND geometria->>'type' IN ('Polygon','MultiPolygon') AND jsonb_typeof(geometria->'coordinates') = 'array', false)),
  bbox DOUBLE PRECISION[] NOT NULL CHECK (
    array_ndims(bbox) = 1 AND array_length(bbox,1) = 4 AND array_position(bbox,NULL) IS NULL
    AND bbox[1] >= -180 AND bbox[3] <= 180 AND bbox[2] >= -90 AND bbox[4] <= 90
    AND bbox[1] < bbox[3] AND bbox[2] < bbox[4]),
  PRIMARY KEY(version_id,distrito_id), UNIQUE(version_id,ubigeo)
);
CREATE TABLE estado_territorial (
  ambito TEXT PRIMARY KEY CHECK (ambito = 'ayacucho-metropolitano'),
  version_id TEXT REFERENCES versiones_territoriales(id) ON DELETE RESTRICT
);
INSERT INTO estado_territorial(ambito) VALUES ('ayacucho-metropolitano');

-- Una versión publicada es completa y sus filas son inmutables.
CREATE FUNCTION proteger_version_territorial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones territoriales son inmutables';
END $$;
CREATE TRIGGER versiones_inmutables BEFORE UPDATE OR DELETE ON versiones_territoriales
FOR EACH ROW EXECUTE FUNCTION proteger_version_territorial();
CREATE TRIGGER geometrias_inmutables BEFORE UPDATE OR DELETE ON geometrias_distritales
FOR EACH ROW EXECUTE FUNCTION proteger_version_territorial();

CREATE FUNCTION comprobar_version_completa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM geometrias_distritales WHERE version_id = NEW.id) <> 5 THEN
    RAISE EXCEPTION 'Una version territorial debe contener cinco distritos';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER version_completa AFTER INSERT ON versiones_territoriales
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION comprobar_version_completa();
