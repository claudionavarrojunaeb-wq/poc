-- Migración: argon2_pwd_tables
-- Documenta los cambios aplicados manualmente en la BD el 2026-05-07:
--
--   1. Ampliar userpwd a VARCHAR(255) para alojar hashes argon2id (~97 chars).
--      El cambio manual lo dejó en VARCHAR(100); esta migración lo sube a 255.
--   2. Crear tabla password_history para historial de contraseñas (últimas 5).
--   3. Crear tabla password_reset_tokens para tokens de recuperación.
--
-- Todas las sentencias usan IF NOT EXISTS / IF EXISTS para ser idempotentes:
-- si ya se aplicaron manualmente, no fallan.

-- 1. Ampliar columna userpwd (los hashes argon2id PHC tienen ~97 chars; 255 es el estándar)
ALTER TABLE "users" ALTER COLUMN "userpwd" TYPE VARCHAR(255);

-- 2. Historial de contraseñas
CREATE TABLE IF NOT EXISTS "password_history" (
    "id"         SERIAL PRIMARY KEY,
    "userid"     INTEGER NOT NULL,
    "password"   TEXT NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tokens de recuperación de contraseña (código enviado por correo, expira en 15 min)
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"         SERIAL PRIMARY KEY,
    "userid"     INTEGER,
    "username"   VARCHAR(100),
    "useremail"  VARCHAR(100),
    "code"       VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ,
    "used"       BOOLEAN DEFAULT false
);
