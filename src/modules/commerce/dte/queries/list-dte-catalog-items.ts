// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-catalog-items.ts
//
// Catálogos DTE son datos de sistema (no tenant-scoped).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { DteCatalogItem } from "../types/dte-catalog.types";

export interface ListDteCatalogItemsInput {
  catalog_code: string;
  is_active?:   boolean;
}

export async function listDteCatalogItems(
  input: ListDteCatalogItemsInput,
): Promise<DteCatalogItem[]> {
  const rows = await prisma.dteCatalogItem.findMany({
    where: {
      catalog_code: input.catalog_code,
      is_active:    input.is_active ?? true,
    },
    orderBy: [
      { sort_order: "asc" },
      { item_code:  "asc" },
    ],
    select: {
      id:           true,
      catalog_code: true,
      item_code:    true,
      item_label:   true,
      description:  true,
      applies_to:   true,
      version:      true,
      sort_order:   true,
      metadata:     true,
      is_active:    true,
      created_at:   true,
      updated_at:   true,
    },
  });

  return rows.map((r) => ({
    ...r,
    metadata: r.metadata as Record<string, unknown> | null,
  }));
}
