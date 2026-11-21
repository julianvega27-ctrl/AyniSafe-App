-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ciudadano', 'operador', 'administrador');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('activo', 'suspendido');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "correo_normalizado" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "estado" "EstadoUsuario" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventanas_intentos" (
    "tipo" TEXT NOT NULL,
    "clave_hash" TEXT NOT NULL,
    "ventana_inicio" TIMESTAMPTZ(3) NOT NULL,
    "contador" INTEGER NOT NULL,

    CONSTRAINT "ventanas_intentos_pkey" PRIMARY KEY ("tipo","clave_hash","ventana_inicio")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_normalizado_key" ON "usuarios"("correo_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_expires_at_idx" ON "sesiones"("expires_at");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_idx" ON "sesiones"("usuario_id");

-- CreateIndex
CREATE INDEX "ventanas_intentos_ventana_inicio_idx" ON "ventanas_intentos"("ventana_inicio");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones adicionales (Prisma no las expresa). La validacion de dominio es la primera
-- barrera; estas aseguran la clave de identidad aunque se omita la aplicacion.
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_correo_normalizado_chk"
  CHECK (
    "correo_normalizado" = lower("correo_normalizado")
    AND "correo_normalizado" = btrim("correo_normalizado")
    AND char_length("correo_normalizado") BETWEEN 3 AND 254
  );

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_nombre_chk"
  CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 100);

ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_vigencia_chk"
  CHECK ("expires_at" > "created_at");

ALTER TABLE "ventanas_intentos" ADD CONSTRAINT "ventanas_intentos_contador_chk"
  CHECK ("contador" >= 0);
