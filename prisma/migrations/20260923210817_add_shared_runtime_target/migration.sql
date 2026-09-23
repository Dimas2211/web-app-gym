-- AlterTable
ALTER TABLE "platform_organizations" ADD COLUMN     "shared_runtime_target_id" TEXT;

-- CreateTable
CREATE TABLE "platform_shared_runtime_targets" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "environment" "PlatformDatabaseProfileEnvironment" NOT NULL DEFAULT 'LOCAL',
    "provider" "PlatformDatabaseProvider" NOT NULL DEFAULT 'POSTGRESQL',
    "db_host" TEXT NOT NULL,
    "db_port" INTEGER,
    "db_name" TEXT NOT NULL,
    "db_user" TEXT NOT NULL,
    "encrypted_password" TEXT NOT NULL,
    "ssl_mode" "PlatformDatabaseSslMode" NOT NULL DEFAULT 'PREFER',
    "connection_options" JSONB,
    "last_tested_at" TIMESTAMP(3),
    "last_test_status" "PlatformDatabaseConnectionTestStatus" NOT NULL DEFAULT 'UNTESTED',
    "last_test_message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "platform_shared_runtime_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_shared_runtime_targets_label_key" ON "platform_shared_runtime_targets"("label");

-- CreateIndex
CREATE INDEX "platform_shared_runtime_targets_is_active_idx" ON "platform_shared_runtime_targets"("is_active");

-- CreateIndex
CREATE INDEX "platform_shared_runtime_targets_environment_idx" ON "platform_shared_runtime_targets"("environment");

-- CreateIndex
CREATE INDEX "platform_organizations_shared_runtime_target_id_idx" ON "platform_organizations"("shared_runtime_target_id");

-- AddForeignKey
ALTER TABLE "platform_organizations" ADD CONSTRAINT "platform_organizations_shared_runtime_target_id_fkey" FOREIGN KEY ("shared_runtime_target_id") REFERENCES "platform_shared_runtime_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
