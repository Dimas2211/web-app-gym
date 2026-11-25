-- ─────────────────────────────────────────────────────────────────
-- MH20 (Fase 9.2A) — M5 mh20_mh_test_run_profile_org_fk (uso: SOLO Control Plane).
--
-- Cierra el residual de M4: la base no exigía que
-- platform_dte_mh_test_run_profiles.organization_id coincidiera con la
-- organización de su corrida (solo lo garantizaba createRun).
--
-- SOLO ADITIVA:
--   1. UNIQUE (id, organization_id) en platform_dte_mh_test_runs. Trivial
--      porque id ya es PK; no puede fallar con datos existentes. Solo sirve
--      como destino de la FK compuesta.
--   2. FK compuesta (run_id, organization_id) -> runs(id, organization_id),
--      ON DELETE/UPDATE RESTRICT. Un perfil de la organización A no puede
--      apuntar a una corrida de la organización B, ni la corrida puede
--      cambiar de organización mientras tenga perfil.
--
-- Se conservan la FK simple run_id (M4), el UNIQUE de segmentos y los CHECK
-- de perfil y cadena. No altera filas. La FK valida las filas existentes:
-- si alguna fuera incoherente la migración falla y no se aplica (deseado).
-- Remoto: la tabla M4 aún no existe, así que se aplica sobre tabla vacía.
-- Rollback: DROP CONSTRAINT + DROP INDEX (sin pérdida de datos).
-- ─────────────────────────────────────────────────────────────────

-- CreateIndex
CREATE UNIQUE INDEX "platform_dte_mh_test_runs_id_organization_id_key" ON "platform_dte_mh_test_runs"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "platform_dte_mh_test_run_profiles" ADD CONSTRAINT "platform_dte_mh_test_run_profiles_run_id_organization_id_fkey" FOREIGN KEY ("run_id", "organization_id") REFERENCES "platform_dte_mh_test_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
