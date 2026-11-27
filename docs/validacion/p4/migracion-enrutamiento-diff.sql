-- Prisma migrate diff: snapshots introspectados de la misma BD antes y después de P4.2.
-- Solo evidencia; no aplicar. No incluye CHECK ni triggers.
-- CreateTable
CREATE TABLE "enrutamientos_incidente" (
    "incidente_id" UUID NOT NULL,
    "evento_id" UUID NOT NULL,
    "version_regla" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "distrito_id" TEXT,
    "resultado" TEXT NOT NULL,
    "revision_medica_pendiente" BOOLEAN NOT NULL,
    "faltantes" JSONB NOT NULL DEFAULT '[]',
    "registrado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrutamientos_incidente_pkey" PRIMARY KEY ("incidente_id")
);

-- CreateTable
CREATE TABLE "participaciones_incidente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incidente_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "institucion" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "designado_por" UUID,
    "motivo" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participaciones_incidente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrutamientos_incidente_evento_id_key" ON "enrutamientos_incidente"("evento_id");

-- CreateIndex
CREATE INDEX "enrutamientos_pendientes_fifo" ON "enrutamientos_incidente"("registrado_en", "incidente_id") WHERE (resultado = 'ENRUTAMIENTO_PENDIENTE'::text);

-- CreateIndex
CREATE INDEX "participaciones_sede_incidente" ON "participaciones_incidente"("sede_id", "incidente_id");

-- CreateIndex
CREATE UNIQUE INDEX "participaciones_una_por_sede" ON "participaciones_incidente"("incidente_id", "sede_id");

-- AddForeignKey
ALTER TABLE "enrutamientos_incidente" ADD CONSTRAINT "enrutamientos_incidente_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrutamientos_incidente" ADD CONSTRAINT "enrutamientos_incidente_distrito_id_fkey" FOREIGN KEY ("distrito_id") REFERENCES "distritos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrutamientos_incidente" ADD CONSTRAINT "enrutamientos_incidente_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "incidentes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "participaciones_incidente" ADD CONSTRAINT "participaciones_incidente_designado_por_fkey" FOREIGN KEY ("designado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "participaciones_incidente" ADD CONSTRAINT "participaciones_incidente_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "enrutamientos_incidente"("incidente_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "participaciones_incidente" ADD CONSTRAINT "participaciones_incidente_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

