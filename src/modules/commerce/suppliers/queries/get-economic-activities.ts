// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — get-economic-activities.ts
//
// Catálogo CAT-019 — Actividades económicas MH El Salvador.
// Usadas en la pestaña Giro del proveedor.
//
// La selección de una fila llena activity_code + activity_name
// en la ficha del proveedor. La API del selector llama esta query
// con el texto que el usuario tipea en el buscador del catálogo.
//
// Filtros:
//   search   → contains insensible en name y code (OR)
//   section  → igualdad exacta en el campo section
//   limit    → por defecto 100, máximo 300
//
// Solo se devuelven registros con status=active.
// Sin tenant_id — catálogo de sistema global.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  EconomicActivityItem,
  EconomicActivitySearchParams,
} from "../types/supplier-catalogs.types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 300;

/**
 * Busca actividades económicas del catálogo CAT-019.
 *
 * @param params - Filtros opcionales: search, section, limit.
 */
export async function getEconomicActivities(
  params: EconomicActivitySearchParams = {},
): Promise<EconomicActivityItem[]> {
  const { search, section, limit } = params;
  const term  = search?.trim();
  const take  = Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT));

  const rows = await prisma.economicActivity.findMany({
    where: {
      status: "active",
      ...(section && { section }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { code: { contains: term, mode: "insensitive" } },
        ],
      }),
    },
    select:  { code: true, name: true, section: true },
    orderBy: { name: "asc" },
    take,
  });

  return rows.map((row) => ({
    code:    row.code,
    name:    row.name,
    section: row.section,
  }));
}
