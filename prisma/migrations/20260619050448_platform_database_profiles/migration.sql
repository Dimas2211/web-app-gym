-- CreateEnum
CREATE TYPE "PlatformDatabaseProfileEnvironment" AS ENUM ('LOCAL', 'SANDBOX', 'TEST', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PlatformDatabaseProvider" AS ENUM ('POSTGRESQL', 'SUPABASE', 'NEON', 'RENDER', 'LOCAL_POSTGRES', 'OTHER');

-- CreateEnum
CREATE TYPE "PlatformDatabaseSslMode" AS ENUM ('DISABLE', 'PREFER', 'REQUIRE');

-- CreateEnum
CREATE TYPE "PlatformDatabaseConnectionTestStatus" AS ENUM ('UNTESTED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "platform_database_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
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

    CONSTRAINT "platform_database_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_database_profiles_organization_id_idx" ON "platform_database_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "platform_database_profiles_environment_idx" ON "platform_database_profiles"("environment");

-- CreateIndex
CREATE INDEX "platform_database_profiles_is_active_idx" ON "platform_database_profiles"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "platform_database_profiles_organization_id_label_key" ON "platform_database_profiles"("organization_id", "label");

-- AddForeignKey
ALTER TABLE "platform_database_profiles" ADD CONSTRAINT "platform_database_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
