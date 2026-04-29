// ─────────────────────────────────────────────────────────────────
// commerce/products — get-categories-lookup.ts
//
// LOOKUP TEMPORAL — Etapa 11 (primer corte)
// Este archivo vive dentro de commerce/products mientras no exista
// un módulo commerce/catalog con CRUD propio de categorías.
// Cuando se implemente ese módulo, mover este lookup a:
//   src/modules/commerce/catalog/queries/get-categories-lookup.ts
// y actualizar los imports aquí.
//
// PREREQUISITO: Requiere modelo ProductCategory en schema.prisma.
// Compilará con errores hasta que se agregue dicho modelo.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface CategoryLookupItem {
  id: string;
  code: string;
  name: string;
}

/**
 * Devuelve las categorías activas del catálogo de un tenant.
 * Ordenadas por nombre para el select del formulario.
 *
 * @param tenantId - Extraído de session.tenantId, nunca del body del cliente.
 */
export async function getCategoriesLookup(
  tenantId: string
): Promise<CategoryLookupItem[]> {
  return prisma.productCategory.findMany({
    where: {
      tenant_id: tenantId,
      status: "active",
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });
}
