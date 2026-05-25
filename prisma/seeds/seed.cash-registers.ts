/**
 * seed.cash-registers.ts
 *
 * Asegura que cada location activa tenga una CashRegister base "CAJA-01".
 * Idempotente: puede ejecutarse múltiples veces sin duplicar cajas.
 *
 * El módulo commerce/cash opera sobre tenant_id / location_id.
 * La resolución del backing model físico queda encapsulada en
 * resolveCashSeedLocations() y no se filtra al resto del seed.
 */

import { PrismaClient } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// Tipo neutral de location para seeds de cash
// ─────────────────────────────────────────────────────────────

interface CashSeedLocation {
  tenant_id: string;
  location_id: string;
  location_name: string;
}

// ─────────────────────────────────────────────────────────────
// Adaptador: resuelve locations desde el backing model actual
//
// Branch es el modelo físico que representa locations mientras
// no exista un modelo Location formal en el schema. Esta función
// encapsula esa dependencia; el resto del seed no la conoce.
// ─────────────────────────────────────────────────────────────

async function resolveCashSeedLocations(
  prisma: PrismaClient,
): Promise<CashSeedLocation[]> {
  const rows = await prisma.branch.findMany({
    where: { status: "active" },
    select: { id: true, gym_id: true, name: true },
  });

  return rows.map((row) => ({
    tenant_id: row.gym_id,
    location_id: row.id,
    location_name: row.name,
  }));
}

// ─────────────────────────────────────────────────────────────
// Seed principal — opera solo sobre tenant_id / location_id
// ─────────────────────────────────────────────────────────────

export async function seedCashRegisters(prisma: PrismaClient): Promise<void> {
  console.log("\n💰 commerce/cash — CashRegister default por location...");

  const locations = await resolveCashSeedLocations(prisma);

  if (locations.length === 0) {
    console.log("  ⚠️  No se encontraron locations activas. Sin cajas que crear.");
    return;
  }

  let created = 0;
  let existing = 0;

  for (const location of locations) {
    const found = await prisma.cashRegister.findFirst({
      where: {
        tenant_id: location.tenant_id,
        location_id: location.location_id,
        code: "CAJA-01",
      },
      select: { id: true, code: true },
    });

    if (found) {
      existing++;
      console.log(`  ✓  Ya existe: ${location.location_name} → ${found.code}`);
      continue;
    }

    await prisma.cashRegister.create({
      data: {
        tenant_id: location.tenant_id,
        location_id: location.location_id,
        code: "CAJA-01",
        name: "Caja principal",
        is_active: true,
      },
    });
    created++;
    console.log(`  ✅ Creada: ${location.location_name} → CAJA-01 (Caja principal)`);
  }

  console.log(`\n  Resultado: ${created} caja(s) creada(s), ${existing} ya existía(n).`);
}
