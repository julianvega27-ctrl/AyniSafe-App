-- Prisma migrate diff: snapshots introspectados de la misma BD antes y después de P5.1.
-- Solo evidencia; no aplicar. No incluye CHECK ni triggers.
-- AlterTable
ALTER TABLE "participaciones_incidente" ADD COLUMN     "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "cambios_enrutamiento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incidente_id" UUID NOT NULL,
    "version_evaluacion" INTEGER NOT NULL,
    "origen" TEXT NOT NULL,
    "actor_tipo" TEXT NOT NULL,
    "actor_usuario_id" UUID,
    "antes" JSONB NOT NULL,
    "despues" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_enrutamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluaciones_incidente" (
    "incidente_id" UUID NOT NULL,
    "version_vigente" INTEGER NOT NULL,
    "heridos" TEXT,
    "atencion_medica" TEXT,
    "cantidad_heridos" SMALLINT,
    "signos_vida" TEXT,
    "consciente" TEXT,
    "sangrado" TEXT,
    "samu_requerido" BOOLEAN NOT NULL,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluaciones_incidente_pkey" PRIMARY KEY ("incidente_id")
);

-- CreateTable
CREATE TABLE "versiones_evaluacion" (
    "incidente_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "heridos" TEXT,
    "atencion_medica" TEXT,
    "cantidad_heridos" SMALLINT,
    "signos_vida" TEXT,
    "consciente" TEXT,
    "sangrado" TEXT,
    "origen" TEXT NOT NULL,
    "actor_usuario_id" UUID,
    "institucion" TEXT,
    "campos_modificados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "motivo" TEXT,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versiones_evaluacion_pkey" PRIMARY KEY ("incidente_id","version")
);

-- CreateTable
CREATE TABLE "accesos_evaluacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incidente_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "accedido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accesos_evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cambios_enrutamiento_incidente" ON "cambios_enrutamiento"("incidente_id", "creado_en");

-- CreateIndex
CREATE INDEX "accesos_evaluacion_incidente" ON "accesos_evaluacion"("incidente_id", "accedido_en");

-- AddForeignKey
ALTER TABLE "cambios_enrutamiento" ADD CONSTRAINT "cambios_enrutamiento_actor_usuario_id_fkey" FOREIGN KEY ("actor_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cambios_enrutamiento" ADD CONSTRAINT "cambios_enrutamiento_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "enrutamientos_incidente"("incidente_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evaluaciones_incidente" ADD CONSTRAINT "evaluaciones_incidente_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "envios_incidente"("incidente_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "versiones_evaluacion" ADD CONSTRAINT "versiones_evaluacion_actor_usuario_id_fkey" FOREIGN KEY ("actor_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "versiones_evaluacion" ADD CONSTRAINT "versiones_evaluacion_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "evaluaciones_incidente"("incidente_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accesos_evaluacion" ADD CONSTRAINT "accesos_evaluacion_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "evaluaciones_incidente"("incidente_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accesos_evaluacion" ADD CONSTRAINT "accesos_evaluacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

