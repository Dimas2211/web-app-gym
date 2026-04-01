-- AlterTable: Add identity fields to users
ALTER TABLE "users"
  ADD COLUMN "operational_code" TEXT,
  ADD COLUMN "avatar_url" TEXT,
  ADD COLUMN "qr_token" TEXT;

-- AlterTable: Add identity fields to clients
ALTER TABLE "clients"
  ADD COLUMN "operational_code" TEXT,
  ADD COLUMN "avatar_url" TEXT,
  ADD COLUMN "qr_token" TEXT;

-- Backfill qr_token for existing users (stable, never changes)
UPDATE "users" SET "qr_token" = gen_random_uuid()::text WHERE "qr_token" IS NULL;

-- Backfill qr_token for existing clients
UPDATE "clients" SET "qr_token" = gen_random_uuid()::text WHERE "qr_token" IS NULL;

-- CreateTable: GymSettings
CREATE TABLE "gym_settings" (
  "id" TEXT NOT NULL,
  "gym_id" TEXT NOT NULL,
  "staff_code_prefix" TEXT NOT NULL DEFAULT 'A',
  "staff_code_digits" INTEGER NOT NULL DEFAULT 4,
  "staff_code_start" INTEGER NOT NULL DEFAULT 1010,
  "client_code_prefix" TEXT NOT NULL DEFAULT 'C',
  "client_code_digits" INTEGER NOT NULL DEFAULT 4,
  "client_code_start" INTEGER NOT NULL DEFAULT 1010,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "gym_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique gym_id in gym_settings
CREATE UNIQUE INDEX "gym_settings_gym_id_key" ON "gym_settings"("gym_id");

-- CreateIndex: unique qr_token on users
CREATE UNIQUE INDEX "users_qr_token_key" ON "users"("qr_token");

-- CreateIndex: compound unique (gym_id, operational_code) on users
-- NULL values are not considered equal in PostgreSQL unique constraints, so multiple NULLs are allowed
CREATE UNIQUE INDEX "users_gym_id_operational_code_key" ON "users"("gym_id", "operational_code");

-- CreateIndex: unique qr_token on clients
CREATE UNIQUE INDEX "clients_qr_token_key" ON "clients"("qr_token");

-- CreateIndex: compound unique (gym_id, operational_code) on clients
CREATE UNIQUE INDEX "clients_gym_id_operational_code_key" ON "clients"("gym_id", "operational_code");

-- AddForeignKey: gym_settings -> gyms
ALTER TABLE "gym_settings" ADD CONSTRAINT "gym_settings_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
