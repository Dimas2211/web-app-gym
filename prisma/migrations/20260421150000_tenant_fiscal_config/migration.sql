-- ─────────────────────────────────────────────────────────────────
-- Mueve la configuración fiscal del tenant desde gyms
-- hacia una tabla reusable tenant_fiscal_config.
--
-- Orden seguro:
--   1. Crear la nueva tabla
--   2. Migrar los datos existentes que tengan is_retention_agent=true
--   3. Eliminar las columnas de gyms
-- ─────────────────────────────────────────────────────────────────

-- 1. Crear tabla reusable
CREATE TABLE "tenant_fiscal_config" (
  "id"                          TEXT          NOT NULL,
  "tenant_id"                   TEXT          NOT NULL,
  "is_retention_agent"          BOOLEAN       NOT NULL DEFAULT false,
  "retention_threshold_amount"  DECIMAL(10,2),
  "created_at"                  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_fiscal_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_fiscal_config_tenant_id_key"
  ON "tenant_fiscal_config"("tenant_id");

-- 2. Migrar filas de gyms que tenían is_retention_agent=true
--    (los demás no necesitan fila — el service asume false por ausencia de fila)
INSERT INTO "tenant_fiscal_config" (
  "id", "tenant_id", "is_retention_agent", "retention_threshold_amount",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  "id",
  "is_retention_agent",
  "retention_threshold_amount",
  NOW(),
  NOW()
FROM "gyms"
WHERE "is_retention_agent" = true;

-- 3. Eliminar columnas de gyms
ALTER TABLE "gyms"
  DROP COLUMN IF EXISTS "is_retention_agent",
  DROP COLUMN IF EXISTS "retention_threshold_amount";
