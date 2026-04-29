/**
 * prisma/importers/import-catalog.ts
 *
 * CLI para importar el catálogo base de productos desde un archivo Excel.
 *
 * Uso:
 *   npm run db:import:catalog -- <tenant_id> <ruta_excel>
 *
 * Ejemplos:
 *   npm run db:import:catalog -- "abc123" "./catalogo.xlsx"
 *   npm run db:import:catalog -- "abc123" "C:/datos/catalogo-gym.xlsx"
 *
 * El Excel debe tener las hojas:
 *   Unidades | Categorias | Lineas | Sublineas | Impuestos | Proveedores
 *
 * La importación es idempotente: filas ya existentes se omiten sin error.
 * Los errores por fila individual se reportan pero no abortan el proceso.
 */

import "dotenv/config";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { importCatalog } from "../../src/modules/commerce/products/import/catalog-import.service";
import type { ImportSheetResult } from "../../src/modules/commerce/products/import/catalog-import.types";

// ── Parseo de argumentos ──────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Error: se requieren dos argumentos.");
  console.error("Uso:  npm run db:import:catalog -- <tenant_id> <ruta_excel>");
  console.error("Ej:   npm run db:import:catalog -- abc123 ./catalogo.xlsx");
  process.exit(1);
}

const [tenantId, rawFilePath] = args;
const filePath = path.resolve(rawFilePath);

// ── Validar que el tenant exista ──────────────────────────────────

const prisma = new PrismaClient();

async function validateTenant(): Promise<void> {
  // Busca cualquier tipo de entidad "raíz" del tenant.
  // El modelo canónico de tenant en este proyecto es Organization.
  const tenant = await (prisma as PrismaClient & {
    organization?: { findUnique: (args: unknown) => Promise<unknown> };
  }).organization?.findUnique?.({
    where: { id: tenantId },
    select: { id: true },
  }) ?? null;

  if (!tenant) {
    // Si el modelo Organization no existe aún o el query falla,
    // advertir pero continuar: puede que el tenant esté en otra tabla.
    console.warn(
      `⚠️  No se pudo verificar el tenant "${tenantId}" en la tabla organizations.`,
    );
    console.warn("   Continuando de todas formas — verifica el tenant_id manualmente.");
  }
}

// ── Runner principal ──────────────────────────────────────────────

function printSheetResult(r: ImportSheetResult): void {
  const status = r.errors.length > 0 ? "⚠️ " : "✓ ";
  console.log(
    `  ${status} ${r.sheet.padEnd(12)} → creados: ${r.created}, omitidos: ${r.skipped}, errores: ${r.errors.length}`,
  );
  for (const err of r.errors) {
    console.log(`      • ${err}`);
  }
}

async function run(): Promise<void> {
  console.log("─────────────────────────────────────────────────");
  console.log("  Importador de catálogo base — commerce/products");
  console.log("─────────────────────────────────────────────────");
  console.log(`  Tenant:  ${tenantId}`);
  console.log(`  Archivo: ${filePath}`);
  console.log("");

  await validateTenant();

  const result = await importCatalog(tenantId, filePath, prisma);

  console.log("Resultados por hoja:");
  for (const sheet of result.sheets) {
    printSheetResult(sheet);
  }

  console.log("");
  console.log("─────────────────────────────────────────────────");
  console.log(`  Total creados:  ${result.totalCreated}`);
  console.log(`  Total omitidos: ${result.totalSkipped}`);
  console.log(`  Total errores:  ${result.totalErrors}`);
  console.log("─────────────────────────────────────────────────");

  if (result.totalErrors > 0) {
    console.log("\n⚠️  La importación finalizó con errores en algunas filas.");
    console.log("   Revisa los mensajes anteriores y corrige el Excel.");
    process.exit(1);
  } else {
    console.log("\n✓ Importación completada sin errores.");
  }
}

run()
  .catch((err: unknown) => {
    console.error("\n✗ Error fatal durante la importación:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
