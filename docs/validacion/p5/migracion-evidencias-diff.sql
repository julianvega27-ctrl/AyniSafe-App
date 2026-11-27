-- Prisma migrate diff: snapshots introspectados de la misma BD antes y después de P5.2.
-- Solo evidencia; no aplicar. No incluye CHECK ni índices parciales.
-- CreateTable
CREATE TABLE "evidencias_incidente" (
    "id" UUID NOT NULL,
    "incidente_id" UUID NOT NULL,
    "ranura" SMALLINT NOT NULL,
    "public_id" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "tipo_medio" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "ancho" INTEGER,
    "alto" INTEGER,
    "sha256" TEXT,
    "huella_carga" TEXT NOT NULL,
    "clave_idempotencia" UUID NOT NULL,
    "modalidad" TEXT NOT NULL,
    "autor_usuario_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmada_en" TIMESTAMPTZ(3),
    "eliminada_en" TIMESTAMPTZ(3),
    "motivo_eliminacion" TEXT,
    "intentos_eliminacion" INTEGER NOT NULL DEFAULT 0,
    "proximo_intento_en" TIMESTAMPTZ(3),

    CONSTRAINT "evidencias_incidente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos_evidencia" (
    "incidente_id" UUID NOT NULL,
    "permiso_huella" TEXT NOT NULL,
    "emitido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permisos_evidencia_pkey" PRIMARY KEY ("incidente_id")
);

-- CreateTable
CREATE TABLE "accesos_evidencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evidencia_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "rol" TEXT NOT NULL,
    "accedido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accesos_evidencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidencias_incidente_public_id_key" ON "evidencias_incidente"("public_id");

-- CreateIndex
CREATE INDEX "evidencias_tareas" ON "evidencias_incidente"("proximo_intento_en") WHERE (estado = ANY (ARRAY['pendiente'::text, 'eliminacion_pendiente'::text]));

-- CreateIndex
CREATE UNIQUE INDEX "evidencias_clave_incidente" ON "evidencias_incidente"("incidente_id", "clave_idempotencia") WHERE (estado = ANY (ARRAY['pendiente'::text, 'disponible'::text]));

-- CreateIndex
CREATE UNIQUE INDEX "evidencias_ranura_activa" ON "evidencias_incidente"("incidente_id", "ranura") WHERE (estado <> 'eliminada'::text);

-- CreateIndex
CREATE INDEX "accesos_evidencia_evidencia" ON "accesos_evidencia"("evidencia_id", "accedido_en");

-- AddForeignKey
ALTER TABLE "evidencias_incidente" ADD CONSTRAINT "evidencias_incidente_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evidencias_incidente" ADD CONSTRAINT "evidencias_incidente_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "envios_incidente"("incidente_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "permisos_evidencia" ADD CONSTRAINT "permisos_evidencia_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "envios_incidente"("incidente_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accesos_evidencia" ADD CONSTRAINT "accesos_evidencia_evidencia_id_fkey" FOREIGN KEY ("evidencia_id") REFERENCES "evidencias_incidente"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accesos_evidencia" ADD CONSTRAINT "accesos_evidencia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

