-- P3.2: catalogo de categorias (modulo Reportes) y organizacion institucional (modulo Identidad).
-- Migracion aditiva: no modifica ni borra datos existentes. Ver openspec/changes/organizacion-institucional/design.md.

-- Catalogo cerrado de las 16 categorias del documento 09. Identificadores estables; sin edicion libre.
CREATE TABLE categorias (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z]+(-[a-z]+)*$'),
  nombre TEXT NOT NULL UNIQUE CHECK (char_length(nombre) BETWEEN 1 AND 80),
  orden SMALLINT NOT NULL UNIQUE CHECK (orden BETWEEN 1 AND 16),
  activa BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO categorias (id, nombre, orden) VALUES
  ('accidente-transito', 'Accidente de tránsito', 1),
  ('acoso', 'Acoso', 2),
  ('actividad-sospechosa', 'Actividad sospechosa', 3),
  ('agresion', 'Agresión', 4),
  ('asalto', 'Asalto', 5),
  ('danos-sismo', 'Daños por sismo', 6),
  ('deslizamiento', 'Deslizamiento', 7),
  ('emergencia-medica', 'Emergencia médica', 8),
  ('incendio', 'Incendio', 9),
  ('inundacion', 'Inundación', 10),
  ('otra-emergencia', 'Otra emergencia', 11),
  ('otro-incidente-seguridad', 'Otro incidente de seguridad', 12),
  ('pelea', 'Pelea', 13),
  ('robo', 'Robo', 14),
  ('vandalismo', 'Vandalismo', 15),
  ('violencia', 'Violencia', 16);

-- Catalogo institucional cerrado: exactamente PNP, Bomberos, SAMU y Serenazgo (una fila por tipo).
CREATE TABLE instituciones (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL UNIQUE CHECK (tipo IN ('pnp', 'bomberos', 'samu', 'serenazgo')),
  nombre TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 120),
  contacto TEXT CHECK (contacto IS NULL OR char_length(btrim(contacto)) BETWEEN 1 AND 40),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT instituciones_id_es_tipo CHECK (id = tipo)
);
INSERT INTO instituciones (id, tipo, nombre) VALUES
  ('pnp', 'pnp', 'PNP'),
  ('bomberos', 'bomberos', 'Bomberos'),
  ('samu', 'samu', 'SAMU'),
  ('serenazgo', 'serenazgo', 'Serenazgo');

-- Sede: verificacion documental separada de la habilitacion para atencion. Nace deshabilitada.
CREATE TABLE sedes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id TEXT NOT NULL REFERENCES instituciones(id) ON DELETE RESTRICT,
  nombre TEXT NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 150),
  nombre_normalizado TEXT NOT NULL CHECK (char_length(nombre_normalizado) BETWEEN 1 AND 150),
  distrito_ubicacion_id TEXT REFERENCES distritos(id) ON DELETE RESTRICT,
  direccion TEXT CHECK (direccion IS NULL OR char_length(direccion) BETWEEN 1 AND 200),
  contacto TEXT CHECK (contacto IS NULL OR char_length(contacto) BETWEEN 1 AND 40),
  verificacion TEXT NOT NULL DEFAULT 'sin_verificar' CHECK (verificacion IN ('sin_verificar', 'verificada')),
  fuente_verificacion TEXT CHECK (fuente_verificacion IS NULL OR char_length(fuente_verificacion) BETWEEN 1 AND 300),
  verificada_en DATE,
  habilitada_atencion BOOLEAN NOT NULL DEFAULT FALSE,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  es_demostracion BOOLEAN NOT NULL DEFAULT FALSE,
  creado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sedes_nombre_por_institucion UNIQUE (institucion_id, nombre_normalizado),
  -- Verificada si y solo si tiene fuente y fecha de contraste.
  CONSTRAINT sedes_verificacion_con_fuente CHECK (
    (verificacion = 'verificada') = (fuente_verificacion IS NOT NULL AND verificada_en IS NOT NULL)),
  -- Solo una sede activa y verificada puede estar habilitada para atencion.
  CONSTRAINT sedes_habilitada_requiere_activa_verificada CHECK (
    NOT habilitada_atencion OR (activa AND verificacion = 'verificada'))
);

-- Pertenencia: cada operador pertenece a exactamente una sede.
CREATE TABLE pertenencias_operador (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
  sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
  es_demostracion BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX pertenencias_operador_sede_id_idx ON pertenencias_operador (sede_id);

-- Solo cuentas de rol operador pueden pertenecer a una sede.
CREATE FUNCTION comprobar_pertenencia_operador() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT rol FROM usuarios WHERE id = NEW.usuario_id) IS DISTINCT FROM 'operador' THEN
    RAISE EXCEPTION 'Solo una cuenta operador puede pertenecer a una sede' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pertenencia_solo_operador BEFORE INSERT OR UPDATE ON pertenencias_operador
FOR EACH ROW EXECUTE FUNCTION comprobar_pertenencia_operador();

-- Cobertura por distrito y competencias por categoria: relaciones explicitas muchos a muchos.
CREATE TABLE coberturas_sede (
  sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
  distrito_id TEXT NOT NULL REFERENCES distritos(id) ON DELETE RESTRICT,
  PRIMARY KEY (sede_id, distrito_id)
);
CREATE INDEX coberturas_sede_distrito_id_idx ON coberturas_sede (distrito_id);

CREATE TABLE competencias_sede (
  sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
  categoria_id TEXT NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  PRIMARY KEY (sede_id, categoria_id)
);
CREATE INDEX competencias_sede_categoria_id_idx ON competencias_sede (categoria_id);

-- Suspender un operador que aun no activo su cuenta revoca su invitacion (decision del 25/11/2026).
-- Antes: hash nulo si y solo si pendiente. Ahora: pendiente => sin hash; activo => con hash;
-- suspendido admite ambos. La activacion sigue exigiendo estado pendiente, de modo que un enlace
-- anterior no reactiva una cuenta suspendida, y el acceso exige estado activo.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_hash_estado_chk;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_hash_estado_chk CHECK (
  (estado <> 'pendiente_activacion' OR password_hash IS NULL)
  AND (estado <> 'activo' OR password_hash IS NOT NULL));
