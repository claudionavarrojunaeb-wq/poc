-- CreateTable
CREATE TABLE "auditoriaaccesos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "input_login" VARCHAR(200),
    "fecha_evento" TIMESTAMP(3) NOT NULL,
    "tipo_evento" VARCHAR(100),
    "direccion_ip" VARCHAR(100),
    "user_agent" VARCHAR(300),
    "detalle" TEXT,

    CONSTRAINT "auditoriaaccesos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auditoriaaccesos_id_key" ON "auditoriaaccesos"("id");
