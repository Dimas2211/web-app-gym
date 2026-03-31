/**
 * apply-local-migration.ts
 *
 * Aplica la migración add_gym_contact_fields directamente a la base local (DATABASE_URL).
 * Necesario porque prisma migrate dev aplica migraciones via DIRECT_URL (Supabase),
 * mientras que el app runtime usa DATABASE_URL (localhost).
 *
 * Uso: npx tsx prisma/apply-local-migration.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const MIGRATION_NAME = "20260331042058_add_gym_contact_fields";

async function main() {
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:.*@/, ":***@")}`);

  // Verificar si la migración ya está aplicada
  const already = await p.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE migration_name = ${MIGRATION_NAME}
    LIMIT 1;
  `;

  if (already.length > 0) {
    console.log(`\n✅ La migración '${MIGRATION_NAME}' ya está registrada. Nada que hacer.`);
    return;
  }

  console.log(`\nAplicando migración: ${MIGRATION_NAME}...`);

  // Aplicar el ALTER TABLE (idempotente con IF NOT EXISTS)
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "address" TEXT`;
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "phone"   TEXT`;
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "email"   TEXT`;
  await p.$executeRaw`ALTER TABLE "gyms" ADD COLUMN IF NOT EXISTS "website" TEXT`;

  console.log("  ✅ Columnas agregadas a la tabla gyms");

  // Registrar en _prisma_migrations para mantener el historial sincronizado
  const existing = await p.$queryRaw<{ id: string }[]>`
    SELECT id FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} LIMIT 1;
  `;
  if (existing.length === 0) {
    await p.$executeRaw`
      INSERT INTO "_prisma_migrations" (
        id, checksum, finished_at, migration_name, logs, rolled_back_at,
        started_at, applied_steps_count
      ) VALUES (
        gen_random_uuid(),
        'local-apply',
        NOW(),
        ${MIGRATION_NAME},
        NULL, NULL,
        NOW(),
        1
      );
    `;
  }

  console.log("  ✅ Migración registrada en _prisma_migrations");

  // Verificar resultado
  const cols = await p.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gyms'
    ORDER BY ordinal_position;
  `;
  console.log(`\nColumnas actuales en gyms: ${cols.map(c => c.column_name).join(", ")}`);
  console.log("\n✅ Listo. Reinicia el servidor de desarrollo.");
}

main()
  .catch(e => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
