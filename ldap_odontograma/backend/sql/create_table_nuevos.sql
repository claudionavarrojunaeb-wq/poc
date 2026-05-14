-- DDL para crear la tabla donde almacenar los registros de docs/csv/nuevos.csv
-- Ejecutar manualmente en la base de datos de desarrollo si se desea importar desde backend.

CREATE TABLE IF NOT EXISTS nuevos_csv (
  id SERIAL PRIMARY KEY,
  bcodmin TEXT,
  brutest TEXT,
  brutdv TEXT,
  bnomest TEXT,
  bapepat TEXT,
  bapemat TEXT
);

-- Índice opcional para búsquedas por bcodmin
CREATE INDEX IF NOT EXISTS idx_nuevos_bcodmin ON nuevos_csv (bcodmin);
