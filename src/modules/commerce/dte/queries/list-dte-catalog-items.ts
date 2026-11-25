// ─────────────────────────────────────────────────────────────────
// commerce/dte — list-dte-catalog-items.ts
//
// Catálogos DTE son datos de sistema (no tenant-scoped).
//
// MH20 (Fase 5.1A): la consulta SIEMPRE filtra por versión de catálogo
// según el perfil normativo (default MH_1_2 → version "1"). Así las filas
// 2.0 (version "2.0") nunca aparecen en flujos 1.2 aunque estén sembradas.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { DteCatalogItem } from "../types/dte-catalog.types";
import { dteCatalogWhere } from "../spec/dte-catalog-version";
import type { DteSpecProfile } from "../spec/dte-spec-profile";

export interface ListDteCatalogItemsInput {
  catalog_code: string;
  is_active?: boolean;
  /** Perfil normativo del flujo consumidor. Omitido → MH_1_2. */
  spec_profile?: DteSpecProfile;
}

export async function listDteCatalogItems(
  input: ListDteCatalogItemsInput,
  client: PrismaClient = prisma
): Promise<DteCatalogItem[]> {
  const rows = await client.dteCatalogItem.findMany({
    where: {
      ...dteCatalogWhere(input.catalog_code, input.spec_profile),
      is_active: input.is_active ?? true,
    },
    orderBy: [{ sort_order: "asc" }, { item_code: "asc" }],
    select: {
      id: true,
      catalog_code: true,
      item_code: true,
      item_label: true,
      description: true,
      applies_to: true,
      version: true,
      sort_order: true,
      metadata: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
  });

  return rows.map((r) => ({
    ...r,
    metadata: r.metadata as Record<string, unknown> | null,
  }));
}
