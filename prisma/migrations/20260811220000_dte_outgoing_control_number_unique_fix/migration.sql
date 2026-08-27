-- F3-C24 — Corrección del unique agregado en 20260811210000.
--
-- El unique anterior era (tenant_id, control_number). Eso es incorrecto:
-- el numeroControl NO codifica el ambiente (mismo formato en TEST y
-- PRODUCTION), así que un tenant que emitió DTE-11-M001P001-...9 en TEST
-- quedaría bloqueado para emitir el mismo numeroControl en PRODUCTION —
-- una colisión legítima entre ambientes distintos, no un duplicado real.
--
-- Esta migración ya se aplicó localmente con el constraint viejo (no
-- estaba comiteada a git todavía), así que se corrige con una migración
-- correctiva en vez de editar el archivo ya aplicado, para no romper el
-- checksum registrado en _prisma_migrations.

DROP INDEX "dte_outgoing_documents_tenant_id_control_number_key";

CREATE UNIQUE INDEX "dte_outgoing_documents_tenant_id_environment_control_numb_key"
  ON "dte_outgoing_documents"("tenant_id", "environment", "control_number");
