/*
  Warnings:

  - Added the required column `fecha_sistema` to the `auditoriaaccesos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- 1. Crear columna permitiendo NULL temporalmente
ALTER TABLE "auditoriaaccesos"
ADD COLUMN "fecha_sistema" TIMESTAMP;

-- 2. Poblar datos existentes
UPDATE "auditoriaaccesos"
SET "fecha_sistema" = NOW()
WHERE "fecha_sistema" IS NULL;

-- 3. Definir default para futuros inserts
ALTER TABLE "auditoriaaccesos"
ALTER COLUMN "fecha_sistema" SET DEFAULT NOW();

-- 4. Ahora sí, forzar NOT NULL
ALTER TABLE "auditoriaaccesos"
ALTER COLUMN "fecha_sistema" SET NOT NULL;
