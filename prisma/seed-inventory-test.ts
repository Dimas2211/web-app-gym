/**
 * prisma/seed-inventory-test.ts
 *
 * Carga de prueba mínima para validar el módulo commerce/inventory.
 * USO EXCLUSIVO: base local de desarrollo — Etapa 11.
 *
 * Crea registros en product_locations reutilizando productos existentes
 * del catálogo y la sucursal "Sucursal Central" del tenant activo.
 *
 * Escenarios de stock que crea:
 *   OK    → current_stock > min_stock
 *   LOW   → 0 < current_stock <= min_stock
 *   EMPTY → current_stock <= 0
 *   INACT → is_active = false  (para probar filtros)
 *
 * Ejecución:
 *   npx tsx prisma/seed-inventory-test.ts
 *
 * Es idempotente: usa upsert por (tenant_id, location_id, product_id).
 * Operación inversa: npx tsx prisma/seed-inventory-test-cleanup.ts
 * No toca products, auth, UI ni la base remota.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveTestLocation } from "./seed-inventory-test-helpers";

const prisma = new PrismaClient();

// ── Escenarios a crear ────────────────────────────────────────────────────────
// Cada entrada se mapea en orden a los productos encontrados.
// Si hay menos productos que escenarios, los sobrantes se omiten con aviso.

type Scenario = {
  label: string;
  current_stock: number;
  min_stock: number;
  reorder_quantity: number;
  warehouse?: string;
  shelf?: string;
  is_active: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    label: "OK — stock sobre el mínimo",
    current_stock: 50,
    min_stock: 10,
    reorder_quantity: 20,
    warehouse: "Bodega A",
    shelf: "Estante 1",
    is_active: true,
  },
  {
    label: "LOW — stock bajo el mínimo",
    current_stock: 5,
    min_stock: 10,
    reorder_quantity: 20,
    warehouse: "Bodega A",
    shelf: "Estante 2",
    is_active: true,
  },
  {
    label: "EMPTY — sin stock",
    current_stock: 0,
    min_stock: 10,
    reorder_quantity: 20,
    warehouse: "Bodega B",
    shelf: "Estante 1",
    is_active: true,
  },
  {
    label: "INACTIVO — para probar filtros",
    current_stock: 25,
    min_stock: 5,
    reorder_quantity: 10,
    warehouse: "Bodega B",
    shelf: "Estante 3",
    is_active: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log("─────────────────────────────────────────────────────");
  console.log("  Seed de prueba — commerce/inventory — Etapa 11");
  console.log("  Solo base local. No toca la base remota.");
  console.log("─────────────────────────────────────────────────────\n");

  const { tenantId, locationId, locationName } = await resolveTestLocation(prisma);
  return await seedProductLocations(tenantId, locationId, locationName);
}

async function seedProductLocations(
  tenantId: string,
  locationId: string,
  locationName: string,
) {
  // 3. Buscar productos activos del catálogo para este tenant
  const products = await prisma.product.findMany({
    where: {
      tenant_id: tenantId,
      status: "ACTIVE",
    },
    select: { id: true, name: true, product_code: true },
    orderBy: { created_at: "asc" },
    take: SCENARIOS.length,
  });

  if (products.length === 0) {
    console.error("✗ No se encontraron productos activos en el catálogo para este tenant.");
    console.error("  Crea al menos 1 producto en /dashboard/products antes de ejecutar este seed.");
    process.exit(1);
  }

  if (products.length < SCENARIOS.length) {
    console.warn(
      `⚠  Se encontraron ${products.length} producto(s) pero hay ${SCENARIOS.length} escenarios.`,
    );
    console.warn(
      `   Se crearán solo ${products.length} registro(s). Para los ${SCENARIOS.length - products.length} restantes,`,
    );
    console.warn("   agrega más productos en /dashboard/products y vuelve a ejecutar.");
    console.warn("");
  }

  console.log(`\n✓ Productos disponibles: ${products.length}`);
  console.log(`✓ Sucursal destino: ${locationName}\n`);

  // 4. Crear / actualizar product_locations
  let created = 0;
  let updated = 0;

  for (let i = 0; i < products.length; i++) {
    const product  = products[i];
    const scenario = SCENARIOS[i];

    const existing = await prisma.productLocation.findUnique({
      where: {
        tenant_id_location_id_product_id: {
          tenant_id: tenantId,
          location_id: locationId,
          product_id: product.id,
        },
      },
      select: { id: true },
    });

    await prisma.productLocation.upsert({
      where: {
        tenant_id_location_id_product_id: {
          tenant_id: tenantId,
          location_id: locationId,
          product_id: product.id,
        },
      },
      update: {
        current_stock:    scenario.current_stock,
        min_stock:        scenario.min_stock,
        reorder_quantity: scenario.reorder_quantity,
        warehouse:        scenario.warehouse ?? null,
        shelf:            scenario.shelf ?? null,
        is_active:        scenario.is_active,
      },
      create: {
        tenant_id:        tenantId,
        location_id:      locationId,
        product_id:       product.id,
        current_stock:    scenario.current_stock,
        min_stock:        scenario.min_stock,
        reorder_quantity: scenario.reorder_quantity,
        warehouse:        scenario.warehouse ?? null,
        shelf:            scenario.shelf ?? null,
        is_active:        scenario.is_active,
      },
    });

    const action = existing ? "actualizado" : "creado";
    const stockTag = scenario.current_stock <= 0
      ? "EMPTY"
      : scenario.current_stock <= scenario.min_stock
      ? "LOW  "
      : "OK   ";

    console.log(
      `  [${stockTag}] ${action.padEnd(10)} → ${product.product_code ?? "—"} | ${product.name}`,
    );
    console.log(`           escenario: ${scenario.label}`);
    console.log(`           stock: ${scenario.current_stock} / mínimo: ${scenario.min_stock} / activo: ${scenario.is_active}`);
    console.log("");

    if (existing) updated++;
    else created++;
  }

  // 5. Resumen
  console.log("─────────────────────────────────────────────────────");
  console.log(`  Registros creados:     ${created}`);
  console.log(`  Registros actualizados: ${updated}`);
  console.log("");
  console.log("  Ahora en /dashboard/inventory deberías ver:");

  const lines = products.slice(0, SCENARIOS.length);
  for (let i = 0; i < lines.length; i++) {
    const s = SCENARIOS[i];
    const tag = s.current_stock <= 0 ? "EMPTY" : s.current_stock <= s.min_stock ? "LOW" : "OK";
    const active = s.is_active ? "" : " (inactivo — activa el filtro 'Todos' para verlo)";
    console.log(`  • ${lines[i].name} → alerta: ${tag}${active}`);
  }

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
