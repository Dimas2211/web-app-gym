/**
 * seed-preflight-blockers.ts
 *
 * Runner puntual para resolver los DOS bloqueantes GLOBAL BLOCKER del
 * Preflight de Platform Admin / Perfiles de BD:
 *
 *   - "Unidades de medida activas"   → seedUnitsOfMeasure (CAT-014)
 *   - "Catálogos DTE requeridos"     → seedDteCatalogItems (CAT-001/002/016/017/018/022/024 + FEX11)
 *
 * No ejecuta seedCatalogs (Sports/Goals), seedCommerceCatalogs, seedPlatform,
 * seedBase ni seedDemo — a propósito, para no tocar nada fuera de los dos
 * bloqueantes reportados por el Preflight.
 *
 * Ambos catálogos son globales (sin tenant_id) — ver UnitOfMeasure y
 * DteCatalogItem en schema.prisma. Idempotentes: upsert, seguros de
 * re-ejecutar.
 *
 * USO (PowerShell) — con DATABASE_URL / DIRECT_URL ya exportadas en la
 * sesión apuntando a la base Supabase publicada:
 *
 *   npx tsx prisma/scripts/seed-preflight-blockers.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedUnitsOfMeasure } from "../seeds/seed.units-of-measure";
import { seedDteCatalogItems } from "../seeds/seed.dte-catalog-items";

const prisma = new PrismaClient();

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Seed puntual — bloqueantes de Preflight (Platform Admin) ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  await seedUnitsOfMeasure(prisma);
  await seedDteCatalogItems(prisma);

  console.log("\n✅ Listo. Vuelve a correr el Preflight en Platform Admin > Perfiles de BD.");
}

main()
  .catch((e) => {
    console.error("\n❌ Error durante el seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
