-- SHARED-PILOT-4A / Gap G — email deja de ser único global; pasa a ser
-- único por tenant (tenant_id, email). La constraint global existente
-- implica trivialmente la nueva (más estricta -> menos estricta), así
-- que no hay riesgo de colisión con datos existentes.

-- DropIndex
DROP INDEX "users_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");
