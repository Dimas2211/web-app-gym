/**
 * seed.dte-catalog-items-mh20.ts
 *
 * MH20 (IMP20-009, Fase 5.1A) — seed ADITIVO e idempotente de los
 * catálogos MH 2.0 (version "2.0").
 *
 * Garantías:
 *   - Upsert por (catalog_code, item_code, version="2.0").
 *   - Nunca crea, actualiza ni elimina filas version "1" (V1.2).
 *   - Nunca elimina filas (tampoco 2.0): retirar un código 2.0 requiere
 *     una tarea explícita.
 *   - Las consultas de catálogo filtran por versión
 *     (src/modules/commerce/dte/spec/dte-catalog-version.ts), por lo que
 *     estas filas solo se ven con el perfil MH_2_0.
 *   - NO forma parte del seed por defecto ni del onboarding: se ejecuta
 *     explícitamente según 05-1-activation-runbook.md.
 *
 * CLI (NO ejecutar sin instrucción explícita; exige confirmación):
 *   MH20_CATALOG_SEED_CONFIRM=<nombre de la base destino> npx tsx prisma/seeds/seed.dte-catalog-items-mh20.ts
 */

import { PrismaClient } from "@prisma/client";
import { DTE_CATALOG_ITEMS_MH20, DTE_CATALOG_VERSION_MH20 } from "./data/dte-catalog-items-mh20.data";

/** Subconjunto mínimo de PrismaClient usado (facilita pruebas). */
export interface DteCatalogMh20SeedClient {
  dteCatalogItem: Pick<PrismaClient["dteCatalogItem"], "findUnique" | "upsert">;
}

export interface DteCatalogMh20SeedResult {
  created: number;
  updated: number;
  unchanged: number;
  total: number;
}

export async function seedDteCatalogItemsMh20(client: DteCatalogMh20SeedClient): Promise<DteCatalogMh20SeedResult> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of DTE_CATALOG_ITEMS_MH20) {
    if (row.version !== DTE_CATALOG_VERSION_MH20) {
      throw new Error(`[seed MH20] fila ${row.catalog_code}|${row.item_code} sin version 2.0 — abortado.`);
    }
    const where = {
      catalog_code_item_code_version: {
        catalog_code: row.catalog_code,
        item_code:    row.item_code,
        version:      DTE_CATALOG_VERSION_MH20,
      },
    };
    const existing = await client.dteCatalogItem.findUnique({
      where,
      select: { item_label: true, description: true, applies_to: true, sort_order: true, is_active: true },
    });
    const data = {
      item_label:  row.item_label,
      description: row.description ?? null,
      applies_to:  row.applies_to  ?? null,
      sort_order:  row.sort_order  ?? null,
      is_active:   true,
    };
    if (
      existing &&
      existing.item_label === data.item_label &&
      existing.description === data.description &&
      existing.applies_to === data.applies_to &&
      existing.sort_order === data.sort_order &&
      existing.is_active === true
    ) {
      unchanged++;
      continue;
    }
    await client.dteCatalogItem.upsert({
      where,
      update: data,
      create: {
        catalog_code: row.catalog_code,
        item_code:    row.item_code,
        version:      DTE_CATALOG_VERSION_MH20,
        ...data,
      },
    });
    if (existing) updated++;
    else created++;
  }

  return { created, updated, unchanged, total: DTE_CATALOG_ITEMS_MH20.length };
}

// Ejecución directa: exige confirmación con el nombre exacto de la base destino.
if (require.main === module) {
  const url = process.env.DATABASE_URL ?? "";
  let dbName = "";
  try {
    dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    dbName = "";
  }
  const confirm = process.env.MH20_CATALOG_SEED_CONFIRM ?? "";
  if (!dbName || confirm !== dbName) {
    console.error(
      "[seed MH20] Abortado: defina MH20_CATALOG_SEED_CONFIRM con el nombre exacto de la base destino de DATABASE_URL.",
    );
    process.exit(2);
  }
  const prisma = new PrismaClient();
  seedDteCatalogItemsMh20(prisma)
    .then((r) => {
      console.log(`[seed MH20] ${dbName}: creadas ${r.created}, actualizadas ${r.updated}, sin cambios ${r.unchanged} (total ${r.total}).`);
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error(err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
