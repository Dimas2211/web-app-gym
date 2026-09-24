/**
 * prisma/scripts/retire-cat022-code-00.ts
 *
 * SHARED-PILOT-4C-C1 (addendum) — retira el código "00 — Consumidor final"
 * del catálogo CAT-022 persistido. "00" no existe en CAT-022 oficial
 * (Catálogo - Sistema de Transmisión v1.2): "Consumidor final" es
 * taxpayer_type, no tipo de documento. Los seeds ya no lo crean, pero
 * al ser upsert no eliminan la fila existente.
 *
 * Filas afectadas (solo estas dos):
 *   identification_types  WHERE code = '00'
 *   dte_catalog_items     WHERE catalog_code = 'CAT-022' AND item_code = '00'
 *
 * Guardas (se re-verifican dentro de la transacción; si alguna falla,
 * no se escribe nada):
 *   customers.id_type_code = '00'  → debe ser 0 (activos e inactivos)
 *   suppliers.id_type_code = '00'  → debe ser 0 (activos e inactivos)
 *
 * No hay FK formal hacia identification_types ni hacia dte_catalog_items
 * desde customers/suppliers (validado en schema.prisma).
 *
 * Conexión EXPLÍCITA — nunca usa DATABASE_URL implícito para no escribir
 * en la base equivocada. Ejecutar una vez por base física:
 *
 *   # dry-run (default, solo lectura)
 *   CAT022_TARGET_DATABASE_URL="postgres://..." npx tsx prisma/scripts/retire-cat022-code-00.ts
 *
 *   # aplicar
 *   CAT022_TARGET_DATABASE_URL="postgres://..." npx tsx prisma/scripts/retire-cat022-code-00.ts --apply
 *
 * Idempotente: re-ejecutar tras aplicar informa 0 filas a retirar.
 */

import { PrismaClient } from "@prisma/client";

const url = process.env.CAT022_TARGET_DATABASE_URL;
const APPLY = process.argv.includes("--apply");

if (!url) {
  console.error("✗ Falta CAT022_TARGET_DATABASE_URL (conexión explícita a la base objetivo).");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

type Db = Pick<PrismaClient, "customer" | "supplier" | "identificationType" | "dteCatalogItem">;

async function snapshot(db: Db) {
  const [customers, suppliers, idTypes, catalogItems] = await Promise.all([
    db.customer.count({ where: { id_type_code: "00" } }),
    db.supplier.count({ where: { id_type_code: "00" } }),
    db.identificationType.count({ where: { code: "00" } }),
    db.dteCatalogItem.count({ where: { catalog_code: "CAT-022", item_code: "00" } }),
  ]);
  return { customers, suppliers, idTypes, catalogItems };
}

async function main() {
  console.log(`── Retiro CAT-022 "00" (${APPLY ? "APPLY" : "DRY-RUN"}) ──────────────`);
  console.log(`  Host: ${new URL(url!).host}`);

  const before = await snapshot(prisma);
  console.log(`  Customer.id_type_code=00:        ${before.customers}`);
  console.log(`  Supplier.id_type_code=00:        ${before.suppliers}`);
  console.log(`  IdentificationType code=00:      ${before.idTypes}`);
  console.log(`  DteCatalogItem CAT-022/00:       ${before.catalogItems}`);

  if (before.customers > 0 || before.suppliers > 0) {
    console.error("  ✗ Hay customers/suppliers con id_type_code=00. Corregirlos antes (→ null). Abortado.");
    process.exit(2);
  }

  if (before.idTypes === 0 && before.catalogItems === 0) {
    console.log("  ✅ Nada que retirar.");
    return;
  }

  if (!APPLY) {
    console.log("  ℹ Dry-run: sin escrituras. Re-ejecutar con --apply para retirar.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const check = await snapshot(tx);
    if (check.customers > 0 || check.suppliers > 0) {
      throw new Error("Referencias a id_type_code=00 aparecieron durante la transacción.");
    }
    const idTypes = await tx.identificationType.deleteMany({ where: { code: "00" } });
    const catalogItems = await tx.dteCatalogItem.deleteMany({
      where: { catalog_code: "CAT-022", item_code: "00" },
    });
    return { idTypes: idTypes.count, catalogItems: catalogItems.count };
  });

  console.log(`  Eliminados: identification_types=${result.idTypes} | dte_catalog_items=${result.catalogItems}`);

  const after = await snapshot(prisma);
  console.log(`  Después: IdentificationType 00=${after.idTypes} | CAT-022/00=${after.catalogItems}`);
  console.log("  ✅ Retiro aplicado.");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
