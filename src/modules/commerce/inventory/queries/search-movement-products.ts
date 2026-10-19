// ─────────────────────────────────────────────────────────────────
// commerce/inventory — search-movement-products.ts
//
// Selector de producto de la consulta "Movimientos por producto".
// Devuelve solo productos del tenant efectivo que tienen registro de
// inventario (product_location) en la sucursal consultada — son los
// únicos que pueden tener movimientos allí.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";

export interface MovementProductOption {
  id: string;
  product_code: string;
  name: string;
}

const MAX_RESULTS = 20;

export async function searchMovementProducts(
  tenantId: string,
  locationId: string,
  query: string,
  client: PrismaClient,
): Promise<MovementProductOption[]> {
  const q = query.trim().slice(0, 120);
  return client.product.findMany({
    where: {
      tenant_id: tenantId,
      product_locations: { some: { tenant_id: tenantId, location_id: locationId } },
      ...(q && {
        OR: [
          { product_code: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    },
    select: { id: true, product_code: true, name: true },
    orderBy: [{ product_code: "asc" }, { id: "asc" }],
    take: MAX_RESULTS,
  });
}
