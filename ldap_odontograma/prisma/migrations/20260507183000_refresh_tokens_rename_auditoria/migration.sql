-- Migration: 20260507183000_refresh_tokens_rename_auditoria
-- Documenta dos cambios ya aplicados manualmente en la BD:
--
--   1. Crear tabla refresh_tokens (generada por backend/middleware/session.js
--      via ensureRefreshTable() en el primer arranque con sesiones JWT).
--   2. Renombrar columna usuario_id → userid en auditoriaaccesos.
--
-- Usar IF NOT EXISTS / IF EXISTS para que sea idempotente en caso de re-ejecución.

-- 1. Tabla de refresh tokens (ya existe; IF NOT EXISTS la deja pasar silenciosamente)
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id"         SERIAL PRIMARY KEY,
    "userid"     INTEGER NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ,
    "revoked"    BOOLEAN DEFAULT false,
    "user_agent" TEXT,
    "ip"         TEXT
);

-- 2. Renombrar columna (si aún tiene el nombre viejo la renombra; si ya fue renombrada
--    el bloque DO no lanzará error gracias a la guarda en information_schema)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'auditoriaaccesos' AND column_name = 'usuario_id'
    ) THEN
        ALTER TABLE "auditoriaaccesos" RENAME COLUMN "usuario_id" TO "userid";
    END IF;
END $$;
