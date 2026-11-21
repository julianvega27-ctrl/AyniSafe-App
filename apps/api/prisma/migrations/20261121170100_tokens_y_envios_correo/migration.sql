-- CreateEnum
CREATE TYPE "PropositoToken" AS ENUM ('recuperacion', 'activacion');

-- CreateEnum
CREATE TYPE "EstadoEnvio" AS ENUM ('pendiente', 'enviando', 'enviado', 'fallido');

-- AlterTable: el hash es nulo solo en cuentas pendientes de activacion (ver CHECK mas abajo).
ALTER TABLE "usuarios" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tokens_cuenta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "proposito" "PropositoToken" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "invalidado_at" TIMESTAMPTZ(3),

    CONSTRAINT "tokens_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_correo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "PropositoToken" NOT NULL,
    "usuario_id" UUID NOT NULL,
    "estado" "EstadoEnvio" NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximo_intento_at" TIMESTAMPTZ(3) NOT NULL,
    "reclamado_hasta" TIMESTAMPTZ(3),
    "vence_at" TIMESTAMPTZ(3) NOT NULL,
    "ultimo_codigo_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_at" TIMESTAMPTZ(3),

    CONSTRAINT "envios_correo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_cuenta_token_hash_key" ON "tokens_cuenta"("token_hash");
CREATE INDEX "tokens_cuenta_usuario_id_proposito_idx" ON "tokens_cuenta"("usuario_id", "proposito");
CREATE INDEX "tokens_cuenta_expires_at_idx" ON "tokens_cuenta"("expires_at");
CREATE INDEX "envios_correo_estado_proximo_intento_at_idx" ON "envios_correo"("estado", "proximo_intento_at");
CREATE INDEX "envios_correo_usuario_id_idx" ON "envios_correo"("usuario_id");

-- AddForeignKey
ALTER TABLE "tokens_cuenta" ADD CONSTRAINT "tokens_cuenta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "envios_correo" ADD CONSTRAINT "envios_correo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones adicionales (Prisma no las expresa).
-- El hash es nulo si y solo si la cuenta esta pendiente de activacion.
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_hash_estado_chk"
  CHECK (("estado" = 'pendiente_activacion') = ("password_hash" IS NULL));

ALTER TABLE "tokens_cuenta" ADD CONSTRAINT "tokens_cuenta_vigencia_chk"
  CHECK ("expires_at" > "created_at");

ALTER TABLE "envios_correo" ADD CONSTRAINT "envios_correo_intentos_chk"
  CHECK ("intentos" >= 0);

-- A lo sumo un envio activo por usuario y tipo: no se apilan correos iguales.
CREATE UNIQUE INDEX "envios_correo_activo_uk" ON "envios_correo"("usuario_id", "tipo")
  WHERE "estado" IN ('pendiente', 'enviando');
