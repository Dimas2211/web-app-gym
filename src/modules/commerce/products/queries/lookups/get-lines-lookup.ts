// ─────────────────────────────────────────────────────────────────
// commerce/products — get-lines-lookup.ts
//
// LOOKUP TEMPORAL — Etapa 11 (primer corte)
// Mover a commerce/catalog cuando ese módulo exista.
//
// PREREQUISITO: Requiere modelo ProductLine en schema.prisma.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface LineLookupItem {
  id: string;
  code: string;
  name: string;
  category_id: string;
}

/**
 * Devuelve las líneas activas de una categoría específica.
 * Se invoca después de seleccionar categoría en el formulario para
 * poblar el select de línea con datos coherentes.
 *
 * Siempre filtra por category_id para evitar mostrar líneas de
 * otra categoría que rompería la coherencia relacional.
 *
 * @param tenantId    - Extraído de session.tenantId.
 * @param categoryId  - ID de la categoría ya seleccionada.
 */
export async function getLinesLookup(
  tenantId: string,
  categoryId: string
): Promise<LineLookupItem[]> {
  return prisma.productLine.findMany({
    where: {
      tenant_id: tenantId,
      category_id: categoryId,
      status: "active",
    },
    select: {
      id: true,
      code: true,
      name: true,
      category_id: true,
    },
    orderBy: { name: "asc" },
  });
}
