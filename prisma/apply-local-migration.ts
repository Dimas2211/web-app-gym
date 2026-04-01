/**
 * apply-local-migration.ts
 *
 * Aplica migraciones pendientes directamente a la base local (DATABASE_URL).
 * Necesario porque prisma migrate deploy aplica migraciones via DIRECT_URL (Supabase),
 * mientras que el app runtime usa DATABASE_URL (localhost).
 *
 * Uso: npx tsx prisma/apply-local-migration.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function isApplied(name: string) {
  const rows = await p.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE migration_name = ${name}
    LIMIT 1;
  `;
  return rows.length > 0;
}

async function register(name: string) {
  const exists = await p.$queryRaw<{ id: string }[]>`
    SELECT id FROM "_prisma_migrations" WHERE migration_name = ${name} LIMIT 1;
  `;
  if (exists.length === 0) {
    await p.$executeRaw`
      INSERT INTO "_prisma_migrations" (
        id, checksum, finished_at, migration_name, logs, rolled_back_at,
        started_at, applied_steps_count
      ) VALUES (
        gen_random_uuid(), 'local-apply', NOW(), ${name}, NULL, NULL, NOW(), 1
      );
    `;
  }
}

async function apply_20260331042058_add_gym_contact_fields() {
  const name = "20260331042058_add_gym_contact_fields";
  if (await isApplied(name)) {
    console.log(`  ✅ ${name} ya aplicada`);
    return;
  }
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "address" TEXT`;
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "phone"   TEXT`;
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "email"   TEXT`;
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "website" TEXT`;
  await register(name);
  console.log(`  ✅ ${name} aplicada`);
}

async function apply_20260331120000_add_identity_codes_and_gym_settings() {
  const name = "20260331120000_add_identity_codes_and_gym_settings";
  if (await isApplied(name)) {
    console.log(`  ✅ ${name} ya aplicada`);
    return;
  }

  // users
  await p.$executeRaw`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "operational_code" TEXT`;
  await p.$executeRaw`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT`;
  await p.$executeRaw`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "qr_token" TEXT`;

  // clients
  await p.$executeRaw`ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "operational_code" TEXT`;
  await p.$executeRaw`ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT`;
  await p.$executeRaw`ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "qr_token" TEXT`;

  // Backfill qr_token para registros existentes
  await p.$executeRaw`UPDATE "users" SET "qr_token" = gen_random_uuid()::text WHERE "qr_token" IS NULL`;
  await p.$executeRaw`UPDATE "clients" SET "qr_token" = gen_random_uuid()::text WHERE "qr_token" IS NULL`;

  // gym_settings
  await p.$executeRaw`
    CREATE TABLE IF NOT EXISTS "gym_settings" (
      "id" TEXT NOT NULL,
      "gym_id" TEXT NOT NULL,
      "staff_code_prefix" TEXT NOT NULL DEFAULT 'A',
      "staff_code_digits" INTEGER NOT NULL DEFAULT 4,
      "staff_code_start" INTEGER NOT NULL DEFAULT 1010,
      "client_code_prefix" TEXT NOT NULL DEFAULT 'C',
      "client_code_digits" INTEGER NOT NULL DEFAULT 4,
      "client_code_start" INTEGER NOT NULL DEFAULT 1010,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "gym_settings_pkey" PRIMARY KEY ("id")
    )
  `;

  // Indexes (idempotent)
  await p.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "gym_settings_gym_id_key" ON "gym_settings"("gym_id")`;
  await p.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "users_qr_token_key" ON "users"("qr_token")`;
  await p.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "users_gym_id_operational_code_key" ON "users"("gym_id", "operational_code")`;
  await p.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "clients_qr_token_key" ON "clients"("qr_token")`;
  await p.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "clients_gym_id_operational_code_key" ON "clients"("gym_id", "operational_code")`;

  // FK (only if not exists)
  await p.$executeRaw`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gym_settings_gym_id_fkey'
      ) THEN
        ALTER TABLE "gym_settings" ADD CONSTRAINT "gym_settings_gym_id_fkey"
          FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `;

  await register(name);
  console.log(`  ✅ ${name} aplicada`);
}

async function main() {
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:.*@/, ":***@")}\n`);
  console.log("Aplicando migraciones pendientes en base LOCAL...\n");

  await apply_20260331042058_add_gym_contact_fields();
  await apply_20260331120000_add_identity_codes_and_gym_settings();

  const cols_users = await p.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
    ORDER BY ordinal_position;
  `;
  console.log(`\nColumnas en users: ${cols_users.map(c => c.column_name).join(", ")}`);

  const cols_clients = await p.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
    ORDER BY ordinal_position;
  `;
  console.log(`Columnas en clients: ${cols_clients.map(c => c.column_name).join(", ")}`);

  console.log("\n✅ Listo. Reinicia el servidor de desarrollo (npm run dev).");
}

main()
  .catch(e => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
