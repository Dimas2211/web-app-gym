-- AUTORIZACIÓN OPERATIVA: configuración de seguridad tenant-level (Clave de
-- Supervisor, solo hash bcrypt). Aditiva: no modifica tablas existentes.
-- Debe aplicarse en CADA base runtime de cliente (y en la base local).

-- CreateTable
CREATE TABLE "tenant_security_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supervisor_pin_hash" TEXT,
    "supervisor_pin_updated_at" TIMESTAMP(3),
    "supervisor_pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "supervisor_pin_locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "tenant_security_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_security_configs_tenant_id_key" ON "tenant_security_configs"("tenant_id");

