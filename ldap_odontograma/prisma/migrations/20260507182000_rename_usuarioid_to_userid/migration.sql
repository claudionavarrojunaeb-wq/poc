-- Migration: rename column usuario_id to userid in auditoriaaccesos
-- Run this with: psql <connection> -f migration.sql OR use `prisma migrate` tooling

ALTER TABLE "auditoriaaccesos" RENAME COLUMN "usuario_id" TO "userid";
