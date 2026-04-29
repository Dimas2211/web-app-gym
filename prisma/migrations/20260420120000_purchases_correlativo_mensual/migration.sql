-- ─────────────────────────────────────────────────────────────────
-- Correlativo mensual de compras
--
-- Agrega purchase_year y purchase_month al modelo Purchase para
-- soportar correlativos numéricos reiniciables por mes y location.
--
-- Cambios:
--   1. Nuevas columnas purchase_year e purchase_month (Int, NOT NULL)
--   2. Populadas desde purchase_date en filas existentes
--   3. Elimina unicidad anterior por (tenant_id, purchase_code)
--   4. Agrega unicidad por (location_id, year, month, purchase_code)
--   5. Agrega índice para consulta de próximo correlativo
-- ─────────────────────────────────────────────────────────────────

-- Agregar columnas con DEFAULT temporal para filas existentes
ALTER TABLE "purchases"
  ADD COLUMN "purchase_year"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "purchase_month" INTEGER NOT NULL DEFAULT 0;

-- Poblar desde purchase_date en filas existentes
UPDATE "purchases"
SET
  "purchase_year"  = EXTRACT(YEAR  FROM "purchase_date")::INTEGER,
  "purchase_month" = EXTRACT(MONTH FROM "purchase_date")::INTEGER;

-- Eliminar restricción de unicidad anterior
DROP INDEX IF EXISTS "purchases_tenant_id_purchase_code_key";

-- Agregar nueva restricción de unicidad mensual por location
CREATE UNIQUE INDEX "purchases_location_id_purchase_year_purchase_month_purchase_code_key"
  ON "purchases" ("location_id", "purchase_year", "purchase_month", "purchase_code");

-- Índice para cálculo eficiente del próximo correlativo
CREATE INDEX IF NOT EXISTS "purchases_location_id_purchase_year_purchase_month_idx"
  ON "purchases" ("location_id", "purchase_year", "purchase_month");
