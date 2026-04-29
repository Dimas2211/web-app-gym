/**
 * prisma/seed-inventory-test-cleanup.ts
 *
 * Limpieza de datos de prueba del módulo commerce/inventory.
 * USO EXCLUSIVO: base local de desarrollo — Etapa 11.
 *
 * Operación inversa de seed-inventory-test.ts.
 * Afecta ÚNICAMENTE la sucursal resuelta por resolveTestLocation()
 * (la misma que usa el seed: "Sucursal Central" o primera disponible).
 *
 * Orden de borrado (respeta FK):
 *   1. InventoryMovement  — donde product_location_id pertenece a esa sucursal
 *   2. ProductLocation    — donde tenant_id + location_id coinciden
 *
 * No toca: Product, Gym, Branch, User, schema, base remota.
 *
 * Ejecución:
 *   npx tsx prisma/seed-inventory-test-cleanup.ts
 *
 * Es seguro si no hay datos: informa que no había registros sin fallar.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveTestLocation } from "./seed-inventory-test-helpers";

const prisma = new PrismaClient();

async function run() {
  console.log("─────────────────────────────────────────────────────");
  console.log("  Cleanup de prueba — commerce/inventory — Etapa 11");
  console.log("  Solo base local. No toca la base remota.");
  console.log("─────────────────────────────────────────────────────\n");

  // 1. Resolver la misma sucursal que usa el seed
  const { tenantId, locationId, locationName } = await resolveTestLocation(prisma);

  console.log(`\n  Limpiando datos de: ${locationName}\n`);

  // 2. Obtener los IDs de ProductLocation afectados por esta location
  //    (necesario para borrar sus movimientos asociados primero)
  const productLocations = await prisma.productLocation.findMany({
    where: { tenant_id: tenantId, location_id: locationId },
    select: { id: true },
  });

  const productLocationIds = productLocations.map((pl) => pl.id);

  if (productLocationIds.length === 0) {
    console.log("  No había registros de ProductLocation para esta sucursal.");
    console.log("  No hay nada que limpiar.\n");
    console.log("─────────────────────────────────────────────────────");
    console.log("  Inventory ya estaba vacío para esta sucursal.");
    console.log("─────────────────────────────────────────────────────");
    return;
  }

  // 3. Eliminar InventoryMovement primero (FK → ProductLocation)
  const { count: deletedMovements } = await prisma.inventoryMovement.deleteMany({
    where: { product_location_id: { in: productLocationIds } },
  });

  if (deletedMovements > 0) {
    console.log(`  ✓ InventoryMovement eliminados: ${deletedMovements}`);
  } else {
    console.log("  — InventoryMovement: ninguno (tabla ya estaba vacía para esta sucursal)");
  }

  // 4. Eliminar ProductLocation
  const { count: deletedLocations } = await prisma.productLocation.deleteMany({
    where: { tenant_id: tenantId, location_id: locationId },
  });

  console.log(`  ✓ ProductLocation eliminados:   ${deletedLocations}`);

  // 5. Resumen
  console.log("");
  console.log("─────────────────────────────────────────────────────");
  console.log(`  Sucursal limpiada: ${locationName}`);
  console.log(`  Movimientos eliminados:        ${deletedMovements}`);
  console.log(`  Registros de stock eliminados: ${deletedLocations}`);
  console.log("");
  console.log("  /dashboard/inventory ahora mostrará la grilla vacía.");
  console.log("  Para repoblar: npx tsx prisma/seed-inventory-test.ts");
  console.log("─────────────────────────────────────────────────────");
}

run()
  .catch((err: unknown) => {
    console.error("\n✗ Error fatal:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
