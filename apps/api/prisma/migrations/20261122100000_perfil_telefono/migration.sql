-- Perfil ciudadano: telefono opcional y autorizacion (con fecha) para compartirlo.
-- Aditiva: las cuentas existentes quedan sin telefono y sin autorizacion.
-- Rollback: ALTER TABLE usuarios DROP COLUMN telefono_compartir_consentido_at, DROP COLUMN telefono;
-- (pierde los telefonos y las autorizaciones guardados).
ALTER TABLE "usuarios"
  ADD COLUMN "telefono" TEXT,
  ADD COLUMN "telefono_compartir_consentido_at" TIMESTAMPTZ(3);

-- Valor normalizado: 7 a 15 digitos con un '+' inicial opcional.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_telefono_formato_chk"
  CHECK ("telefono" IS NULL OR "telefono" ~ '^\+?[0-9]{7,15}$');

-- La autorizacion de compartir exige un telefono registrado.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_telefono_consentimiento_chk"
  CHECK ("telefono_compartir_consentido_at" IS NULL OR "telefono" IS NOT NULL);
