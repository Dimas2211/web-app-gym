-- ─────────────────────────────────────────────────────────────────
-- MH20 (Fase 8) — M4 mh20_mh_test_run_profiles (uso: SOLO Control Plane).
--
-- SOLO ADITIVA: 1 tabla nueva 1:1 con platform_dte_mh_test_runs + índices
-- + FK + CHECK. No altera tablas ni filas existentes (las lecturas actuales
-- de platform_dte_mh_test_runs no dependen de columnas nuevas).
--
-- Guarda el perfil normativo de cada corrida MH TEST (estable aunque el
-- emisor cambie después), el snapshot saneado del emisor (códigos AT y
-- territorio; sin secretos) y el segmento de cadena (límite de 200 ítems).
-- El UNIQUE (organization_id, chain_id, chain_index) impide crear dos veces
-- el mismo segmento. Las corridas históricas (sin fila) siguen siendo MH_1_2.
--
-- Al ser un schema común, la tabla también existirá (vacía) en las bases
-- runtime; solo el Control Plane la escribe (DTE_MH_TEST_RUNS_M4_APPLIED).
-- Sin backfill. Sin seeds. Rollback: tabla vacía; DROP solo con decisión
-- explícita y si no hay filas.
-- ─────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "platform_dte_mh_test_run_profiles" (
    "run_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mh_spec_profile" TEXT NOT NULL,
    "chain_id" TEXT,
    "chain_index" INTEGER,
    "chain_total" INTEGER,
    "issuer_snapshot" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_dte_mh_test_run_profiles_pkey" PRIMARY KEY ("run_id")
);

-- CreateIndex
CREATE INDEX "platform_dte_mh_test_run_profiles_organization_id_mh_spec_p_idx" ON "platform_dte_mh_test_run_profiles"("organization_id", "mh_spec_profile");

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_mh_test_run_profiles_organization_id_chain_id__key" ON "platform_dte_mh_test_run_profiles"("organization_id", "chain_id", "chain_index");

-- AddForeignKey
ALTER TABLE "platform_dte_mh_test_run_profiles" ADD CONSTRAINT "platform_dte_mh_test_run_profiles_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "platform_dte_mh_test_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK (no modelados por Prisma)
ALTER TABLE "platform_dte_mh_test_run_profiles"
  ADD CONSTRAINT "platform_dte_mh_test_run_profiles_profile_chk"
  CHECK ("mh_spec_profile" IN ('MH_1_2', 'MH_2_0'));

ALTER TABLE "platform_dte_mh_test_run_profiles"
  ADD CONSTRAINT "platform_dte_mh_test_run_profiles_chain_chk"
  CHECK (
    ("chain_id" IS NULL AND "chain_index" IS NULL AND "chain_total" IS NULL)
    OR ("chain_id" IS NOT NULL AND "chain_index" IS NOT NULL AND "chain_total" IS NOT NULL
        AND "chain_total" BETWEEN 1 AND 50 AND "chain_index" BETWEEN 1 AND "chain_total")
  );
