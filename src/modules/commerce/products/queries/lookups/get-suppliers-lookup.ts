// ─────────────────────────────────────────────────────────────────
// commerce/products — get-suppliers-lookup.ts
//
// LOOKUP TEMPORAL — Etapa 11 (primer corte)
// Mover a commerce/suppliers cuando ese módulo exista.
//
// PREREQUISITO: Requiere modelo Supplier en schema.prisma.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface SupplierLookupItem {
  id: string;
  name: string;
}

/**
 * Devuelve los proveedores activos de un tenant.
 * Solo nombre e ID: proyección mínima para el select del formulario.
 * El formulario de nuevo producto usa este lookup para asignar un
 * proveedor principal opcional.
 *
 * @param tenantId - Extraído de session.tenantId.
 */
export async function getSuppliersLookup(
  tenantId: string
): Promise<SupplierLookupItem[]> {
  return prisma.supplier.findMany({
    where: {
      tenant_id: tenantId,
      status: "active",
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });
}
