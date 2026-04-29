-- ─────────────────────────────────────────────────────────────────
-- Campos documentales de compra + retención IVA 1% + tenant/supplier fiscal
-- ─────────────────────────────────────────────────────────────────

-- Gym: configuración fiscal del tenant como agente retenedor
ALTER TABLE "gyms"
  ADD COLUMN "is_retention_agent"          BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN "retention_threshold_amount"  DECIMAL(10,2);

-- Supplier: flag explícito de sujeto a retención IVA 1%
ALTER TABLE "suppliers"
  ADD COLUMN "is_subject_to_1pct_retention"  BOOLEAN  NOT NULL DEFAULT false;

-- Purchase: campos documentales base + retención + DTE stub
ALTER TABLE "purchases"
  ADD COLUMN "document_type"           TEXT,
  ADD COLUMN "document_series"         TEXT,
  ADD COLUMN "document_number"         TEXT,
  ADD COLUMN "payment_condition"       TEXT,
  ADD COLUMN "cancellation_type"       TEXT,
  ADD COLUMN "retention_1pct_applies"  BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN "retention_1pct_amount"   DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "generation_code"         TEXT,
  ADD COLUMN "control_number"          TEXT,
  ADD COLUMN "reception_stamp"         TEXT;
