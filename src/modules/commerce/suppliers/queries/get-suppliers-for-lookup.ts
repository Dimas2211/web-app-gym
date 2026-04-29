// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — get-suppliers-for-lookup.ts
//
// Búsqueda rápida de proveedores para selección en el flujo de compras.
// Solo activos por defecto; incluye campos fiscales para que purchases
// pueda aplicar reglas de retención sin un join adicional.
//
// Proyección mínima: id, supplier_code, name, taxpayer_type, nit, nrc, status.
// Límite fijo de 50 resultados — adecuado para selección en formulario.
//
// Busca por código (supplier_code) o nombre en un solo filtro de texto.
// Si ambos campos coinciden, se devuelven todos los matches (OR).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { SupplierForPurchaseLookup } from "../types/supplier.types";

const LOOKUP_LIMIT = 50;

// ── Select reutilizable ───────────────────────────────────────────

const SUPPLIER_LOOKUP_SELECT = {
  id:            true,
  supplier_code: true,
  name:          true,
  taxpayer_type: true,
  nit:           true,
  nrc:           true,
  status:        true,
} as const;

// ── Query principal ───────────────────────────────────────────────

/**
 * Busca proveedores activos de un tenant para selección en compras.
 *
 * @param tenantId    - Extraído de session.tenantId. Nunca del body.
 * @param search      - Texto libre: busca en supplier_code y name (OR).
 * @param activeOnly  - true por defecto; pasa false para incluir inactivos.
 */
export async function getSuppliersForLookup(
  tenantId: string,
  search?: string,
  activeOnly = true,
): Promise<SupplierForPurchaseLookup[]> {
  const term = search?.trim();

  const rows = await prisma.supplier.findMany({
    where: {
      tenant_id: tenantId,
      ...(activeOnly && { status: "active" }),
      ...(term && {
        OR: [
          { supplier_code: { contains: term, mode: "insensitive" } },
          { name:          { contains: term, mode: "insensitive" } },
          { nrc:           { contains: term, mode: "insensitive" } },
        ],
      }),
    },
    select: SUPPLIER_LOOKUP_SELECT,
    orderBy: { name: "asc" },
    take: LOOKUP_LIMIT,
  });

  return rows.map((row) => ({
    id:            row.id,
    supplier_code: row.supplier_code,
    name:          row.name,
    taxpayer_type: row.taxpayer_type as SupplierForPurchaseLookup["taxpayer_type"],
    nit:           row.nit,
    nrc:           row.nrc,
    status:        row.status as SupplierForPurchaseLookup["status"],
  }));
}
